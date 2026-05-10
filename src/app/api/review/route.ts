import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { USER_ID } from "@/lib/utils";
import { draft as claudeDraft } from "@/lib/claude";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
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
    .single();
  if (error || !src) return Response.json({ error: "not found" }, { status: 404 });

  await sb.from("interactions").insert({
    user_id: USER_ID,
    person_id: src.person_id,
    agent_type: "reach_out",
    interaction_type: outcome,
    channel: src.channel,
    draft_id: src.draft_id,
    meta: { source_interaction_id: interaction_id },
  });

  if (outcome === "replied") {
    await sb
      .from("followups")
      .update({ status: "cancelled" })
      .eq("user_id", USER_ID)
      .eq("person_id", src.person_id)
      .eq("status", "pending");
    return Response.json({ ok: true });
  }

  // no_reply → schedule a followup
  const sentAt = new Date(src.created_at as string).getTime();
  const due = new Date(Math.max(sentAt + 5 * 24 * 60 * 60 * 1000, Date.now()));

  // Pre-generate the followup draft from the original draft + person enrichment.
  const { data: original } = await sb
    .from("drafts")
    .select("body, channel")
    .eq("id", src.draft_id as string)
    .single();
  const { data: person } = await sb
    .from("people")
    .select("name, role, company, links, enrichment")
    .eq("id", src.person_id as string)
    .single();

  const research = (person?.enrichment as Record<string, unknown>)?.research as
    | { context_lines?: string[]; links?: Record<string, string> }
    | undefined;

  let followupDraftId: string | null = null;
  try {
    const fu = await claudeDraft({
      person_context: {
        name: person?.name ?? null,
        role: person?.role ?? null,
        company: person?.company ?? null,
        links: (person?.links as Record<string, string>) ?? {},
        context_lines: research?.context_lines ?? ["", "", ""],
        raw: "",
      },
      channel: (original?.channel as "email" | "x_dm" | "linkedin") ?? "email",
      parent_draft: original
        ? { channel: original.channel as "email" | "x_dm" | "linkedin", body: original.body }
        : undefined,
      intent: "Polite, short followup. No reply yet after 5 days.",
    });

    const { data: fuRow } = await sb
      .from("drafts")
      .insert({
        user_id: USER_ID,
        person_id: src.person_id,
        channel: original?.channel ?? "email",
        subject: fu.subject,
        body: fu.body,
        status: "generated",
        model: fu.model,
        parent_draft_id: src.draft_id,
        intent: "followup",
      })
      .select("id")
      .single();
    followupDraftId = fuRow?.id ?? null;
  } catch (e) {
    console.error("[review] followup draft failed", e);
  }

  await sb.from("followups").insert({
    user_id: USER_ID,
    person_id: src.person_id,
    source_interaction_id: interaction_id,
    draft_id: followupDraftId,
    due_at: due.toISOString(),
    status: "pending",
  });

  return Response.json({ ok: true, followup_due_at: due.toISOString() });
}
