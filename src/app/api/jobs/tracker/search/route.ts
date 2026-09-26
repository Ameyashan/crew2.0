import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";
import { searchTrackable } from "@/lib/jobs/tracker-catalog";

export const runtime = "nodejs";

// GET /api/jobs/tracker/search?q=strip -> { results: TrackerCompanyOption[] }
// Setup typeahead over the catalog. A result with company_id null is an
// employer we know but can't track yet (no supported job board).
export async function GET(req: NextRequest) {
  return withUser(async () => {
    const q = req.nextUrl.searchParams.get("q") ?? "";
    const results = await searchTrackable(supabaseAdmin(), q);
    return Response.json({ results });
  });
}
