import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";
import { feedItemFromJoin, type FeedJoinRow } from "@/lib/jobs/serialize";
import type { FeedItem } from "@/lib/jobs/types";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

// GET /api/jobs/feed?limit&offset&filter=new
// The user's ranked feed: job_matches (not dismissed) joined to active jobs,
// ordered by score desc.
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
    let q = sb
      .from("job_matches")
      .select(
        "id, score, reasons, status, jobs!inner(id, title, company, location_raw, city, region, country, remote_type, compensation, posted_date, posted_date_approx, url, visa_confidence, company_size, is_active)",
      )
      .eq("user_id", userId)
      .neq("status", "dismissed")
      .eq("jobs.is_active", true)
      .order("score", { ascending: false })
      .range(offset, offset + limit - 1);
    if (filterNew) q = q.eq("status", "new");

    const { data, error } = await q;
    if (error) return Response.json({ error: error.message }, { status: 500 });

    const rows = (data ?? []) as unknown as FeedJoinRow[];
    const jobs = rows
      .map(feedItemFromJoin)
      .filter((x): x is FeedItem => x !== null);
    const next_offset = rows.length === limit ? offset + limit : null;

    return Response.json({ jobs, next_offset });
  });
}
