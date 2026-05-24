import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  return withUser(async (userId) => {
    const { data, error } = await supabaseAdmin()
      .from("resume_generations")
      .select(
        "id, job_url, highlights, regenerate_notes, page_count, target_role, target_company, model, ats_score, created_at"
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
