import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { USER_ID } from "@/lib/utils";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data: f, error } = await sb
    .from("followups")
    .update({ status: "sent" })
    .eq("id", id)
    .select("person_id, draft_id")
    .single();
  if (error || !f) return Response.json({ error: error?.message }, { status: 404 });
  await sb.from("interactions").insert({
    user_id: USER_ID,
    person_id: f.person_id,
    agent_type: "reach_out",
    interaction_type: "followed_up",
    draft_id: f.draft_id,
  });
  if (f.draft_id) {
    await sb.from("drafts").update({ status: "sent" }).eq("id", f.draft_id);
    await sb.from("interactions").insert({
      user_id: USER_ID,
      person_id: f.person_id,
      agent_type: "reach_out",
      interaction_type: "sent",
      draft_id: f.draft_id,
    });
  }
  return Response.json({ ok: true });
}
