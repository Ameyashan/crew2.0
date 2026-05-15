import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { USER_ID } from "@/lib/utils";
import { getProfile } from "@/lib/profile";
import { scheduleFollowup } from "@/lib/followups";
import type { Channel } from "@/lib/claude";

export const runtime = "nodejs";
export const maxDuration = 60;

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

  const { data: ix } = await sb
    .from("interactions")
    .insert({
      user_id: USER_ID,
      person_id: d.person_id,
      agent_type: "reach_out",
      interaction_type: "sent",
      channel: d.channel,
      draft_id: d.id,
    })
    .select("id")
    .single();

  let followup: { id: string; due_at: string } | null = null;
  if (d.channel === "email" && ix?.id && d.person_id) {
    try {
      const profile = await getProfile();
      const result = await scheduleFollowup({
        person_id: d.person_id as string,
        source_interaction_id: ix.id as string,
        original_draft_id: d.id as string,
        channel: d.channel as Channel,
        sent_at: new Date(),
        days: profile?.followup_days ?? null,
      });
      if ("id" in result) {
        followup = { id: result.id, due_at: result.due_at };
      }
    } catch (e) {
      // Never fail the send because the followup pre-draft failed.
      console.error("[draft.sent] scheduleFollowup failed", e);
    }
  }

  return Response.json({ ok: true, followup });
}
