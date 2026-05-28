import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";

export const runtime = "nodejs";

// Counts the current user's interactions over the last 7 days, grouped by type.
// Powers the "This week" dispatch box in the sidebar.
export async function GET() {
  return withUser(async (userId) => {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabaseAdmin()
      .from("interactions")
      .select("interaction_type")
      .eq("user_id", userId)
      .gte("created_at", since);

    const rows = data ?? [];
    const count = (type: string) =>
      rows.filter((r) => r.interaction_type === type).length;

    return Response.json({
      drafted: count("drafted"),
      sent: count("sent"),
      replied: count("replied"),
    });
  });
}
