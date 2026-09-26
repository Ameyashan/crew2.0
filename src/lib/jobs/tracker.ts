// Company tracker (read side). The user names up to TRACK_LIMIT companies; we
// keep their boards fresh (jobs-fetch cron) and show the open roles whose
// titles fit what the user is after, with the ones first seen in the last 24h
// called out. No LLM anywhere: titles are matched in code (tracker-match.ts)
// and "new" is our own first_seen_at, so a daily check costs nothing.

import { roleTitleTerms } from "@/lib/jobs/roles";
import { loadScanPrefs, matchesLocations, matchesVisaNeed } from "@/lib/jobs/scan";
import { jobLocation } from "@/lib/jobs/serialize";
import { universeBadges, type UniverseBadgeInput } from "@/lib/jobs/universe/classify";
import { TRACK_LIMIT, titleFilterOr, titleMatches, isNewListing } from "@/lib/jobs/tracker-match";
import type { RemoteType, TrackedCompany, TrackerDTO, TrackerJob, VisaConfidence } from "@/lib/jobs/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const DAY_MS = 86_400_000;
// Title-matching rows pulled per company, newest first. The SQL filter is a
// loose superset of the word-boundary check, so leave headroom above what the
// page shows.
const PER_COMPANY_ROWS = 300;
const MAX_OPEN_JOBS = 80;

const JOB_COLS =
  "id, company_id, title, company, location_raw, city, region, country, remote_type, compensation, posted_date, posted_date_approx, first_seen_at, url, visa_confidence";

interface TrackerRow {
  id: string;
  company_id: string;
  title: string;
  company: string;
  location_raw: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  remote_type: RemoteType;
  compensation: string | null;
  posted_date: string | null;
  posted_date_approx: boolean;
  first_seen_at: string;
  url: string;
  visa_confidence: VisaConfidence | null;
}

interface CompanyRow {
  id: string;
  name: string;
  last_fetched_at: string | null;
  company_universe: UniverseBadgeInput | null;
}

const byFirstSeen = (a: TrackerJob, b: TrackerJob) => b.first_seen_at.localeCompare(a.first_seen_at);

// The user's tracked companies, oldest follow first (the order they were added).
export async function loadTrackedCompanyIds(sb: SupabaseClient, uid: string): Promise<string[]> {
  const { data } = await sb
    .from("followed_companies")
    .select("company_id, created_at")
    .eq("user_id", uid)
    .order("created_at", { ascending: true });
  return (data ?? []).map((r) => r.company_id as string);
}

// Everything the tracker page (and the daily email) shows for one user.
// `newSince` (epoch ms) is where "new" starts — the last 24h by default, the
// last digest for the email.
export async function loadTracker(
  sb: SupabaseClient,
  uid: string,
  opts?: { newSince?: number },
): Promise<TrackerDTO> {
  const newSince = opts?.newSince ?? Date.now() - DAY_MS;
  const [ids, { prefs, currentRole }] = await Promise.all([loadTrackedCompanyIds(sb, uid), loadScanPrefs(sb, uid)]);
  const roleTerms = roleTitleTerms(prefs.role_mode, prefs.target_roles, currentRole);
  if (!ids.length) {
    return { companies: [], new_jobs: [], open_jobs: [], role_terms: roleTerms, limit: TRACK_LIMIT };
  }

  const { data: companyData } = await sb
    .from("companies")
    .select("id, name, last_fetched_at, company_universe(in_fortune500, in_top_startups, in_top_h1b, fortune_rank, startup_rank, valuation_busd, h1b_rank)")
    .in("id", ids);
  const companyById = new Map(((companyData ?? []) as unknown as CompanyRow[]).map((c) => [c.id, c]));

  const orFilter = titleFilterOr(roleTerms);
  const perCompany = await Promise.all(
    ids.map(async (id) => {
      let q = sb.from("jobs").select(JOB_COLS).eq("company_id", id).eq("is_active", true);
      if (orFilter) q = q.or(orFilter);
      const [{ data: rows }, { data: first }] = await Promise.all([
        q.order("first_seen_at", { ascending: false }).limit(PER_COMPANY_ROWS),
        // Earliest row we hold for the company (active or not) = its initial
        // import; see isNewListing.
        sb.from("jobs").select("first_seen_at").eq("company_id", id).order("first_seen_at", { ascending: true }).limit(1),
      ]);
      const baseline = (first?.[0]?.first_seen_at as string | undefined) ?? null;
      const jobs: TrackerJob[] = ((rows ?? []) as TrackerRow[])
        .filter(
          (j) =>
            titleMatches(j.title, roleTerms) &&
            matchesLocations(j, prefs.locations) &&
            matchesVisaNeed(j, prefs.visa_required),
        )
        .map((j) => ({
          job_id: j.id,
          title: j.title,
          company: j.company,
          company_id: j.company_id,
          location: jobLocation(j),
          remote_type: j.remote_type,
          compensation: j.compensation,
          posted_date: j.posted_date,
          posted_date_approx: j.posted_date_approx,
          first_seen_at: j.first_seen_at,
          is_new: isNewListing(j.first_seen_at, newSince, baseline),
          url: j.url,
        }));
      return { id, jobs };
    }),
  );

  const companies: TrackedCompany[] = [];
  const all: TrackerJob[] = [];
  for (const { id, jobs } of perCompany) {
    const c = companyById.get(id);
    if (!c) continue; // follow row outlived its company (cascade should prevent this)
    companies.push({
      company_id: id,
      name: c.name,
      badges: universeBadges(c.company_universe, 1),
      open_count: jobs.length,
      new_count: jobs.filter((j) => j.is_new).length,
      last_checked_at: c.last_fetched_at,
    });
    all.push(...jobs);
  }

  all.sort(byFirstSeen);
  return {
    companies,
    new_jobs: all.filter((j) => j.is_new),
    open_jobs: all.filter((j) => !j.is_new).slice(0, MAX_OPEN_JOBS),
    role_terms: roleTerms,
    limit: TRACK_LIMIT,
  };
}
