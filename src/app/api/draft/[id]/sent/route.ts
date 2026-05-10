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
  const { data: d, error } = await sb
    .from("drafts")
    .update({ status: "sent" })
    .eq("id", id)
    .select("id, person_id, channel")
    .single();
  if (error || !d) return Response.json({ error: error?.message ?? "not found" }, { status: 404 });
  await sb.from("interactions").insert({
    user_id: USER_ID,
    person_id: d.person_id,
    agent_type: "reach_out",
    interaction_type: "sent",
    channel: d.channel,
    draft_id: d.id,
  });
  return Response.json({ ok: true });
}
