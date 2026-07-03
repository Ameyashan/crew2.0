import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";

export const runtime = "nodejs";

// A run whose serverless function was killed (timeout, deploy) can never
// finalize its own row. 10 minutes is far beyond the route's maxDuration, so
// anything still in_flight past that is dead — mark it at read time rather
// than running a cron.
const STALE_IN_FLIGHT_MS = 10 * 60 * 1000;

export async function GET() {
  return withUser(async (userId) => {
    const sb = supabaseAdmin();

    await sb
      .from("resume_generations")
      .update({
        status: "error",
        error: "Interrupted — the run never finished.",
        completed_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("status", "in_flight")
      .lt("created_at", new Date(Date.now() - STALE_IN_FLIGHT_MS).toISOString());

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
