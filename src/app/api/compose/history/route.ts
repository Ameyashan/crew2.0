import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";

export const runtime = "nodejs";

// A run is driven by a background continuation (next/server `after()`) plus a
// cron worker backstop, both of which refresh heartbeat_at on every step. So a
// live run always has a recent heartbeat; a run whose heartbeat has gone quiet
// for well past any single step AND past the function's maxDuration is genuinely
// dead (its executor died and the worker couldn't revive it). Mark those at read
// time so they don't show "in progress…" forever. Heartbeat-based (not
// created_at) so a legitimately long or queued run is never mislabelled.
const STALE_HEARTBEAT_MS = 6 * 60 * 1000;

// GET /api/compose/history
// Returns metadata for the signed-in user's most recent compose runs (50 max).
// Mirrors /api/resume/history. Joins the linked person so the row can render a
// human title (name · company) without a second fetch.
export async function GET() {
  return withUser(async (userId) => {
    const sb = supabaseAdmin();

    const staleBefore = new Date(Date.now() - STALE_HEARTBEAT_MS).toISOString();
    await sb
      .from("compose_runs")
      .update({
        outcome: "error",
        error: "Interrupted — the run never finished.",
        completed_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("outcome", "in_flight")
      // Both an absent heartbeat and a long-stale one count as dead. Guard the
      // null case on created_at so a row mid-insert is never swept.
      .or(
        `heartbeat_at.lt.${staleBefore},and(heartbeat_at.is.null,created_at.lt.${staleBefore})`
      );

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
