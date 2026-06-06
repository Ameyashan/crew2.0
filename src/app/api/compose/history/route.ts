import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/compose/history
// Returns metadata for the signed-in user's most recent compose runs (50 max).
// Mirrors /api/resume/history. Joins the linked person so the row can render a
// human title (name · company) without a second fetch.
export async function GET() {
  return withUser(async (userId) => {
    const { data, error } = await supabaseAdmin()
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
