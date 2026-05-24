import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";
import { getProfile } from "@/lib/profile";
import { scheduleFollowup, cancelPendingFollowups } from "@/lib/followups";
import type { Channel } from "@/lib/claude";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  return withUser(async (userId) => {
    const body = await req.json();
    const interaction_id = body.interaction_id as string;
    const outcome = body.outcome as "replied" | "no_reply";
    if (!interaction_id || !["replied", "no_reply"].includes(outcome)) {
      return Response.json({ error: "bad input" }, { status: 400 });
    }
    const sb = supabaseAdmin();

    const { data: src, error } = await sb
      .from("interactions")
      .select("person_id, draft_id, channel, created_at")
      .eq("id", interaction_id)
      .eq("user_id", userId)
      .single();
    if (error || !src) return Response.json({ error: "not found" }, { status: 404 });

    await sb.from("interactions").insert({
      user_id: userId,
      person_id: src.person_id,
      agent_type: "reach_out",
      interaction_type: outcome,
      channel: src.channel,
      draft_id: src.draft_id,
      meta: { source_interaction_id: interaction_id },
    });

    if (outcome === "replied") {
      if (src.person_id) await cancelPendingFollowups(src.person_id as string);
      return Response.json({ ok: true });
    }

    if (!src.person_id || !src.draft_id) {
      return Response.json({ ok: true, skipped: "missing person/draft" });
    }

    const profile = await getProfile();
    const result = await scheduleFollowup({
      person_id: src.person_id as string,
      source_interaction_id: interaction_id,
      original_draft_id: src.draft_id as string,
      channel: (src.channel as Channel) ?? "email",
      sent_at: new Date(src.created_at as string),
      days: profile?.followup_days ?? 5,
    });

    if ("id" in result) {
      return Response.json({ ok: true, followup_due_at: result.due_at });
    }
    return Response.json({ ok: true, skipped: result.skipped });
  });
}
