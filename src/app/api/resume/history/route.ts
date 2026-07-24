import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";

export const runtime = "nodejs";

// A résumé run is driven by a background continuation (next/server `after()`)
// plus the cron-worker backstop, both refreshing heartbeat_at on every step. So
// a live run always has a recent heartbeat; a run whose heartbeat has gone quiet
// well past any single step AND past the function's maxDuration is genuinely
// dead. Mark those at read time so they don't show "Tailoring…" forever.
// Heartbeat-based (not created_at) so a legitimately long run isn't mislabelled.
const STALE_HEARTBEAT_MS = 6 * 60 * 1000;

export async function GET() {
  return withUser(async (userId) => {
    const sb = supabaseAdmin();

    const staleBefore = new Date(Date.now() - STALE_HEARTBEAT_MS).toISOString();
    await sb
      .from("resume_generations")
      .update({
        status: "error",
        error: "Interrupted — the run never finished.",
        completed_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("status", "in_flight")
      // Both an absent heartbeat and a long-stale one count as dead. Guard the
      // null case on created_at so a row mid-insert is never swept.
      .or(
        `heartbeat_at.lt.${staleBefore},and(heartbeat_at.is.null,created_at.lt.${staleBefore})`
      );

    const { data, error } = await sb
      .from("resume_generations")
      .select(
        "id, job_url, highlights, regenerate_notes, page_count, target_role, target_company, model, ats_score, status, error, created_at, completed_at"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ generations: data ?? [] });
  });
}
