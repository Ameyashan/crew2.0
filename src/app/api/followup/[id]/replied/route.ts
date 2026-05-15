import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { USER_ID } from "@/lib/utils";
import { cancelPendingFollowups } from "@/lib/followups";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data: f, error } = await sb
    .from("followups")
    .update({ status: "cancelled" })
    .eq("id", id)
    .select("person_id, draft_id")
    .single();
  if (error || !f) return Response.json({ error: error?.message ?? "not found" }, { status: 404 });

  await sb.from("interactions").insert({
    user_id: USER_ID,
    person_id: f.person_id,
    agent_type: "reach_out",
    interaction_type: "replied",
    draft_id: f.draft_id,
    meta: { source: "followup_replied", followup_id: id },
  });

  if (f.person_id) await cancelPendingFollowups(f.person_id as string);

  return Response.json({ ok: true });
}
