import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";
import { loadFollowedCompanyIds, loadScanPrefs, matchesLocations } from "@/lib/jobs/scan";
import { jobLocation } from "@/lib/jobs/serialize";
import type { FollowedCompanyDTO, FollowingItem } from "@/lib/jobs/types";

export const runtime = "nodejs";

// How far back "new" reaches, how many scored matches we scan before sorting,
// and how many rows the strip ultimately shows. `first_seen_at` (when WE first
// saw the listing) drives recency rather than `posted_date`, which is
// approximate/missing for Greenhouse — first_seen is reliable and monotonic.
const FRESH_MS = 24 * 60 * 60 * 1000;
const SCAN_LIMIT = 150;
const RECENT_LIMIT = 24;
// Same fit bar the ranked feed uses to hide wrong-role-family matches — this is
// how the strip "respects role prefs": a Databricks sales role that scores low
// against a PM's Story is filtered out, not surfaced just because the company
// is followed.
const MIN_SCORE = 50;

interface MatchJoinRow {
  score: number;
  jobs: {
    id: string;
    company_id: string | null;
    title: string;
    company: string;
    location_raw: string | null;
    city: string | null;
    region: string | null;
    country: string | null;
    remote_type: string;
    posted_date: string | null;
    posted_date_approx: boolean;
    first_seen_at: string;
    url: string;
  } | null;
}

// GET /api/jobs/following -> { companies, recent }
// The "New at companies you follow" strip: recent, role- and location-fitting
// openings across the companies the user follows. Recency-first, but still
// filtered to what suits the user's profile — following a company surfaces its
// new roles that fit you, not every req it posts.
export async function GET() {
  return withUser(async (userId) => {
    const sb = supabaseAdmin();
    const followedIds = await loadFollowedCompanyIds(sb, userId);
    if (!followedIds.length) {
      return Response.json({ companies: [], recent: [] });
    }

    const [{ data: companyRows }, { data: matchRows }, { prefs }] = await Promise.all([
      sb.from("companies").select("id, name").in("id", followedIds),
      // Scored matches (role fit) at followed companies, above the fit bar. We
      // pull a score-ordered window, then re-sort by recency in JS so the strip
      // reads newest-first while still honoring the fit filter.
      sb
        .from("job_matches")
        .select(
          "score, jobs!inner(id, company_id, title, company, location_raw, city, region, country, remote_type, posted_date, posted_date_approx, first_seen_at, url)",
        )
        .eq("user_id", userId)
        .neq("status", "dismissed")
        .in("jobs.company_id", followedIds)
        .eq("jobs.is_active", true)
        .gte("score", MIN_SCORE)
        .order("score", { ascending: false })
        .limit(SCAN_LIMIT),
      loadScanPrefs(sb, userId),
    ]);

    const companies: FollowedCompanyDTO[] = (companyRows ?? []).map((c) => ({
      company_id: c.id as string,
      name: c.name as string,
    }));

    const cutoff = Date.now() - FRESH_MS;
    const recent: FollowingItem[] = ((matchRows ?? []) as unknown as MatchJoinRow[])
      .map((r) => r.jobs)
      .filter((j): j is NonNullable<MatchJoinRow["jobs"]> => j !== null)
      // Respect the user's saved location preference — the same regex matcher
      // the feed/scan use. (Company size is a company-level attribute the user
      // already opted into by following, so it isn't re-applied here.)
      .filter((j) => matchesLocations(j, prefs.locations))
      .sort((a, b) => new Date(b.first_seen_at).getTime() - new Date(a.first_seen_at).getTime())
      .slice(0, RECENT_LIMIT)
      .map((j) => ({
        job_id: j.id,
        title: j.title,
        company: j.company,
        company_id: j.company_id,
        location: jobLocation(j),
        posted_date: j.posted_date,
        posted_date_approx: j.posted_date_approx,
        first_seen_at: j.first_seen_at,
        is_fresh: new Date(j.first_seen_at).getTime() >= cutoff,
        url: j.url,
      }));

    return Response.json({ companies, recent });
  });
}
