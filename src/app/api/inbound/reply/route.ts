import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { USER_ID } from "@/lib/utils";

export const runtime = "nodejs";

// Inbound email webhook (Postmark-style payload). Configure your mail provider
// to POST replies here; we match In-Reply-To → drafts.message_id and insert
// a row into `replies`. The Today screen's right stack reads from `replies`
// where summary is null OR the user hasn't marked it handled yet.
//
// Expected body (Postmark/SendGrid compatible enough):
//   { FromFull?: { Email }, From?: string, Subject?, TextBody?, HtmlBody?,
//     Headers?: [{ Name, Value }], MessageID?, InReplyTo? }
type InboundPayload = {
  FromFull?: { Email?: string };
  From?: string;
  Subject?: string;
  TextBody?: string;
  HtmlBody?: string;
  Headers?: Array<{ Name: string; Value: string }>;
  MessageID?: string;
  InReplyTo?: string;
};

function pickFrom(p: InboundPayload): string {
  return p.FromFull?.Email || p.From || "";
}

function pickInReplyTo(p: InboundPayload): string | null {
  if (p.InReplyTo) return p.InReplyTo;
  const hdr = (p.Headers || []).find(
    (h) => h.Name.toLowerCase() === "in-reply-to",
  );
  return hdr?.Value ?? null;
}

export async function POST(req: NextRequest) {
  // Provider-side secret — set a long random string in env, configure the
  // webhook to pass it as ?token= so random pokes get 401'd.
  const expected = process.env.INBOUND_WEBHOOK_TOKEN;
  if (expected) {
    const got = new URL(req.url).searchParams.get("token");
    if (got !== expected) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const payload = (await req.json().catch(() => ({}))) as InboundPayload;
  const from = pickFrom(payload);
  const body = payload.TextBody?.trim() || payload.HtmlBody?.trim() || "";
  if (!from || !body) {
    return Response.json({ error: "from + body required" }, { status: 400 });
  }

  const inReplyTo = pickInReplyTo(payload);
  const sb = supabaseAdmin();

  let draftId: string | null = null;
  let personId: string | null = null;
  if (inReplyTo) {
    // Trim angle brackets if present
    const cleaned = inReplyTo.replace(/^<|>$/g, "");
    const { data: draft } = await sb
      .from("drafts")
      .select("id, person_id")
      .eq("message_id", cleaned)
      .maybeSingle();
    if (draft) {
      draftId = draft.id as string;
      personId = (draft.person_id as string | null) ?? null;
    }
  }

  // Fall back to matching by email if we couldn't match the thread
  if (!personId && from) {
    const { data: person } = await sb
      .from("people")
      .select("id")
      .eq("user_id", USER_ID)
      .eq("email", from.toLowerCase())
      .maybeSingle();
    if (person) personId = person.id as string;
  }

  const { data, error } = await sb
    .from("replies")
    .insert({
      user_id: USER_ID,
      draft_id: draftId,
      person_id: personId,
      from_email: from,
      subject: payload.Subject || null,
      body,
      raw: payload as unknown as Record<string, unknown>,
    })
    .select("id")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Also log an interaction so the People timeline picks it up.
  if (personId) {
    await sb.from("interactions").insert({
      user_id: USER_ID,
      person_id: personId,
      draft_id: draftId,
      agent_type: "reach_out",
      interaction_type: "replied",
      channel: "email",
      meta: { reply_id: data?.id, from },
    });
  }

  return Response.json({ ok: true, reply_id: data?.id });
}
