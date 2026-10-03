// The user's ranked feed, shared by GET /api/jobs/feed and the goal page's
// "N strong matches" count so the two can never disagree: job_matches (not
// dismissed) joined to active jobs, ordered by score, re-checked against the
// user's CURRENT preferences and the locked goal's pay floor. Matches are
// scored once and persist, so preferences saved after a scan would otherwise
// leak through — this is where "what you asked for" is enforced.

import type { SupabaseClient } from "@supabase/supabase-js";
import { feedItemFromJoin, COMPANY_EMBED, type FeedJoinRow } from "@/lib/jobs/serialize";
import {
  loadScanPrefs,
  matchesLocations,
  matchesSize,
  matchesStaffingPref,
  explicitCompanies,
  matchesVisaNeed,
  postedThreshold,
} from "@/lib/jobs/scan";
import { diversifyByCompany, STRONG_SCORE } from "@/lib/jobs/format";
import { compVsFloor, storedComp } from "@/lib/jobs/comp";
import type { FeedItem } from "@/lib/jobs/types";

// How many score-ranked matches we pull before applying preferences. Filtering
// happens here (not in SQL) because location matching is regex-based, so the DB
// window has to be wider than the page we return.
const CANDIDATE_WINDOW = 300;
// Matches below STRONG_SCORE (wrong role family / level) stay hidden so a
// Business Analyst doesn't see Product roles just because they're at a company
// they follow. If fewer than MIN_STRONG clear the bar, the closest below-bar
// matches ride along too (flagged, so the UI can label them) rather than a
// one-card or falsely-empty feed.
const MIN_STRONG = 3;
// Max jobs from a single company before the rest of that company's postings are
// pushed to the tail of the feed — keeps one prolific board from walling it.
const PER_COMPANY_CAP = 4;

export interface RankedFeed {
  // Score-ordered (then company-diversified) items the UI should show.
  items: FeedItem[];
  // How many of `items` clear STRONG_SCORE — the goal page's "strong matches".
  strong: number;
  // True when below-bar matches were included because too few cleared the bar.
  fallback: boolean;
}

export async function loadRankedFeed(
  sb: SupabaseClient,
  userId: string,
  opts: { onlyNew?: boolean } = {},
): Promise<RankedFeed> {
  const SELECT = `id, score, reasons, status, jobs!inner(id, company_id, title, company, location_raw, city, region, country, remote_type, compensation, comp_label, comp_currency, comp_max_usd, posted_date, posted_date_approx, url, visa_confidence, visa_evidence, company_size, is_active, ${COMPANY_EMBED})`;
  let q = sb
    .from("job_matches")
    .select(SELECT)
    .eq("user_id", userId)
    .neq("status", "dismissed")
    .eq("jobs.is_active", true)
    .order("score", { ascending: false })
    .limit(CANDIDATE_WINDOW);
  if (opts.onlyNew) q = q.eq("status", "new");

  const [{ data, error }, { prefs, follows, pins, goal }] = await Promise.all([q, loadScanPrefs(sb, userId)]);
  if (error) throw new Error(error.message);
  const explicit = explicitCompanies(follows, pins);

  const threshold = postedThreshold(prefs.posted_within);
  const floor = goal?.comp_floor_usd ?? null;
  const rows = ((data ?? []) as unknown as FeedJoinRow[]).filter((row) => {
    const j = row.jobs;
    if (!j) return false;
    if (!matchesLocations(j, prefs.locations)) return false;
    if (!matchesSize(j, prefs.company_sizes)) return false;
    // "I need sponsorship" hides explicit-no postings outright.
    if (!matchesVisaNeed(j, prefs.visa_required)) return false;
    // Staffing firms stay hidden unless opted in, followed or pinned.
    if (!matchesStaffingPref(j, prefs.include_staffing, explicit)) return false;
    // posted_within is enforced only here and in the email digest — scan-time
    // selection ignores it so a tight setting can't starve the pipeline. An
    // unknown posted date never hides a job.
    if (threshold && j.posted_date && j.posted_date < threshold) return false;
    // A locked goal's pay floor hides roles whose posted range tops out
    // below it. Unlisted / non-USD pay is never hidden.
    if (floor != null && compVsFloor(storedComp(j), floor, goal?.comp_basis) === "below") return false;
    return true;
  });

  const all = rows.flatMap((row): FeedItem[] => {
    const item = feedItemFromJoin(row);
    if (!item) return [];
    if (floor == null || !row.jobs) return [item];
    return [{ ...item, comp_fit: compVsFloor(storedComp(row.jobs), floor, goal?.comp_basis) }];
  });

  // Prefer matches that clear the bar; when too few do, include the closest
  // below-bar ones (items are score-ordered, so strong stay on top).
  const strong = all.filter((x) => x.score >= STRONG_SCORE);
  const fallback = strong.length < MIN_STRONG && all.length > strong.length;
  const items = diversifyByCompany(fallback ? all : strong, PER_COMPANY_CAP);
  return { items, strong: strong.length, fallback };
}
