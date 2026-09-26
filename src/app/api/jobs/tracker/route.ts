import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";
import { loadTracker } from "@/lib/jobs/tracker";

export const runtime = "nodejs";

// GET /api/jobs/tracker -> TrackerDTO
// The tracked companies plus their open roles that fit the user's titles, with
// the ones first seen in the last 24h split out. Read-only and LLM-free.
export async function GET() {
  return withUser(async (userId) => {
    try {
      return Response.json(await loadTracker(supabaseAdmin(), userId));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return Response.json({ error: message }, { status: 500 });
    }
  });
}
