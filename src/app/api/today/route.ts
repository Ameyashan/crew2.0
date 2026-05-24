import { loadTodayData } from "@/lib/today";
import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  return withUser(async (userId) => {
    const data = await loadTodayData();
    const { data: digest } = await supabaseAdmin()
      .from("daily_digests")
      .select("generated_at, pending_followups, pending_reviews")
      .eq("user_id", userId)
      .order("generated_at", { ascending: false })
      .limit(1);
    return Response.json({ ...data, last_digest: digest?.[0] ?? null });
  });
}
