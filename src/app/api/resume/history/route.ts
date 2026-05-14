import { supabaseAdmin } from "@/lib/supabase";
import { USER_ID } from "@/lib/utils";

export const runtime = "nodejs";

export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from("resume_generations")
    .select(
      "id, job_url, highlights, regenerate_notes, page_count, target_role, target_company, model, created_at"
    )
    .eq("user_id", USER_ID)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ generations: data ?? [] });
}
