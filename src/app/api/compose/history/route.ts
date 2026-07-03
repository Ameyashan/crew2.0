import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";

export const runtime = "nodejs";

// A run whose serverless function was killed (timeout, deploy) can never
// finalize its own row and would show "in progress…" forever. 10 minutes is
// far beyond the apply route's maxDuration, so anything still in_flight past
// that is dead — mark it at read time rather than running a cron. (The
// /history/[id] recovery poller stays un-swept: its budget is ~4 minutes.)
const STALE_IN_FLIGHT_MS = 10 * 60 * 1000;

// GET /api/compose/history
// Returns metadata for the signed-in user's most recent compose runs (50 max).
// Mirrors /api/resume/history. Joins the linked person so the row can render a
// human title (name · company) without a second fetch.
export async function GET() {
  return withUser(async (userId) => {
    const sb = supabaseAdmin();

    await sb
      .from("compose_runs")
      .update({
        outcome: "error",
        error: "Interrupted — the run never finished.",
        completed_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("outcome", "in_flight")
      .lt("created_at", new Date(Date.now() - STALE_IN_FLIGHT_MS).toISOString());

    const { data, error } = await sb
      .from("compose_runs")
      .select(
        "id, kind, input, intent, outcome, error, person_id, screenshot_id, resume_generation_id, created_at, completed_at, person:people(id, name, role, company)"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ runs: data ?? [] });
  });
}
