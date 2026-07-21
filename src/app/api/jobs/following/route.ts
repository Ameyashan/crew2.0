import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";
import { loadFollowedCompanyIds } from "@/lib/jobs/scan";
import { jobLocation } from "@/lib/jobs/serialize";
import type { FollowedCompanyDTO, FollowingItem } from "@/lib/jobs/types";

export const runtime = "nodejs";

// How many recent listings the strip pulls across all followed companies, and
// how far back "new" reaches. `first_seen_at` (when WE first saw the listing) is
// used rather than `posted_date`, which is approximate/missing for Greenhouse —
// first_seen is reliable and monotonic, so the freshness badge is honest.
const RECENT_LIMIT = 24;
const FRESH_MS = 24 * 60 * 60 * 1000;

interface JobRow {
  id: string;
  company_id: string | null;
  title: string;
  company: string;
  location_raw: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  posted_date: string | null;
  posted_date_approx: boolean;
  first_seen_at: string;
  url: string;
}

// GET /api/jobs/following -> { companies, recent }
// The "New at companies you follow" strip: the newest active listings across
// every company the user follows, recency-first and independent of fit score.
export async function GET() {
  return withUser(async (userId) => {
    const sb = supabaseAdmin();
    const followedIds = await loadFollowedCompanyIds(sb, userId);
    if (!followedIds.length) {
      return Response.json({ companies: [], recent: [] });
    }

    const [{ data: companyRows }, { data: jobRows }] = await Promise.all([
      sb.from("companies").select("id, name").in("id", followedIds),
      sb
        .from("jobs")
        .select("id, company_id, title, company, location_raw, city, region, country, posted_date, posted_date_approx, first_seen_at, url")
        .in("company_id", followedIds)
        .eq("is_active", true)
        .order("first_seen_at", { ascending: false })
        .limit(RECENT_LIMIT),
    ]);

    const companies: FollowedCompanyDTO[] = (companyRows ?? []).map((c) => ({
      company_id: c.id as string,
      name: c.name as string,
    }));

    const cutoff = Date.now() - FRESH_MS;
    const recent: FollowingItem[] = ((jobRows ?? []) as JobRow[]).map((j) => ({
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
