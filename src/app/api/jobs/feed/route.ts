import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";
import { feedItemFromJoin, type FeedJoinRow } from "@/lib/jobs/serialize";
import { loadScanPrefs, matchesLocations, matchesSize, postedThreshold } from "@/lib/jobs/scan";
import { diversifyByCompany } from "@/lib/jobs/format";
import type { FeedItem } from "@/lib/jobs/types";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
// How many score-ranked matches we pull before applying preferences. Filtering
// happens here (not in SQL) because location matching is regex-based, so the DB
// window has to be wider than the page we return.
const CANDIDATE_WINDOW = 300;
// Hide clearly-weak matches (wrong role family / level) so a Business Analyst
// doesn't see Product roles just because they're at a company they follow. If
// the whole feed is below the cutoff, we fall back to showing the closest
// matches (flagged, so the UI can say so) rather than a falsely-empty list.
const MIN_SCORE = 50;
// Max jobs from a single company before the rest of that company's postings are
// pushed to the tail of the feed — keeps one prolific board from walling it.
const PER_COMPANY_CAP = 4;

// GET /api/jobs/feed?limit&offset&filter=new
// The user's ranked feed: job_matches (not dismissed) joined to active jobs,
// ordered by score desc, re-checked against the user's CURRENT preferences.
// Matches are scored once and persist, so preferences saved after a scan (or a
// scan run before preferences existed) would otherwise leak through — the feed
// is where "what you asked for" is enforced.
export async function GET(req: NextRequest) {
  return withUser(async (userId) => {
    const url = new URL(req.url);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(url.searchParams.get("limit") || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
    );
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);
    const filterNew = url.searchParams.get("filter") === "new";

    const sb = supabaseAdmin();
    const SELECT =
      "id, score, reasons, status, jobs!inner(id, company_id, title, company, location_raw, city, region, country, remote_type, compensation, posted_date, posted_date_approx, url, visa_confidence, company_size, is_active)";
    let q = sb
      .from("job_matches")
      .select(SELECT)
      .eq("user_id", userId)
      .neq("status", "dismissed")
      .eq("jobs.is_active", true)
      .order("score", { ascending: false })
      .limit(CANDIDATE_WINDOW);
    if (filterNew) q = q.eq("status", "new");

    const [{ data, error }, { prefs }] = await Promise.all([q, loadScanPrefs(sb, userId)]);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    const threshold = postedThreshold(prefs.posted_within);
    const rows = ((data ?? []) as unknown as FeedJoinRow[]).filter((row) => {
      const j = row.jobs;
      if (!j) return false;
      if (!matchesLocations(j, prefs.locations)) return false;
      if (!matchesSize(j, prefs.company_sizes)) return false;
      // Same null-passes rule as scan-time selection: an unknown posted date
      // never hides a job.
      if (threshold && j.posted_date && j.posted_date < threshold) return false;
      return true;
    });

    const items = rows.map(feedItemFromJoin).filter((x): x is FeedItem => x !== null);

    // Prefer matches that clear the fit bar; only when NONE do, show the
    // closest ones and tell the UI we did.
    const strong = items.filter((x) => x.score >= MIN_SCORE);
    const fallback = strong.length === 0 && items.length > 0;
    const ranked = diversifyByCompany(fallback ? items : strong, PER_COMPANY_CAP);

    const jobs = ranked.slice(offset, offset + limit);
    const next_offset = offset + limit < ranked.length ? offset + limit : null;

    return Response.json({ jobs, next_offset, fallback });
  });
}
