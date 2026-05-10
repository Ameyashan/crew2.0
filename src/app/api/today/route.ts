import { loadTodayData } from "@/lib/today";
import { supabaseAdmin } from "@/lib/supabase";
import { USER_ID } from "@/lib/utils";

export const runtime = "nodejs";

export async function GET() {
  const data = await loadTodayData();
  const { data: digest } = await supabaseAdmin()
    .from("daily_digests")
    .select("generated_at, pending_followups, pending_reviews")
    .eq("user_id", USER_ID)
    .order("generated_at", { ascending: false })
    .limit(1);
  return Response.json({ ...data, last_digest: digest?.[0] ?? null });
}
