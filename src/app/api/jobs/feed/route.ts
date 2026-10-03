import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";
import { loadRankedFeed } from "@/lib/jobs/feed";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

// GET /api/jobs/feed?limit&offset&filter=new
// One page of the user's ranked feed (see src/lib/jobs/feed.ts for the
// ranking and preference filters — the goal page's "strong matches" count
// reads the same function). `fallback` is true when below-bar matches were
// included because too few cleared the fit bar.
export async function GET(req: NextRequest) {
  return withUser(async (userId) => {
    const url = new URL(req.url);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(url.searchParams.get("limit") || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
    );
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);
    const onlyNew = url.searchParams.get("filter") === "new";

    let ranked;
    try {
      ranked = await loadRankedFeed(supabaseAdmin(), userId, { onlyNew });
    } catch (e) {
      return Response.json({ error: String((e as Error)?.message || e) }, { status: 500 });
    }
    const jobs = ranked.items.slice(offset, offset + limit);
    const next_offset = offset + limit < ranked.items.length ? offset + limit : null;
    return Response.json({ jobs, next_offset, fallback: ranked.fallback });
  });
}
