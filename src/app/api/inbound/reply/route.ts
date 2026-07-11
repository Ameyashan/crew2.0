import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

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
  // Provider-side secret. FAIL CLOSED: without a configured token the endpoint
  // is disabled (503) rather than accepting arbitrary unauthenticated POSTs that
  // write to `replies`/`interactions`. Inbound isn't wired to a mail provider
  // yet; when it is, set INBOUND_WEBHOOK_TOKEN in Vercel and configure the
  // provider webhook to pass it as ?token=<secret> so random pokes get 401'd.
  const expected = process.env.INBOUND_WEBHOOK_TOKEN;
  if (!expected) {
    return Response.json(
      { error: "inbound webhook not configured" },
      { status: 503 },
    );
  }
  const got = new URL(req.url).searchParams.get("token");
  if (got !== expected) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = (await req.json().catch(() => ({}))) as InboundPayload;
  const from = pickFrom(payload);
  const body = payload.TextBody?.trim() || payload.HtmlBody?.trim() || "";
  if (!from || !body) {
    return Response.json({ error: "from + body required" }, { status: 400 });
  }

  const inReplyTo = pickInReplyTo(payload);
  const sb = supabaseAdmin();

  // No session on a webhook — the owning user is whoever the matched draft (or,
  // failing that, the matched person) belongs to.
  let draftId: string | null = null;
  let personId: string | null = null;
  let userId: string | null = null;
  if (inReplyTo) {
    // Trim angle brackets if present
    const cleaned = inReplyTo.replace(/^<|>$/g, "");
    const { data: draft } = await sb
      .from("drafts")
      .select("id, person_id, user_id")
      .eq("message_id", cleaned)
      .maybeSingle();
    if (draft) {
      draftId = draft.id as string;
      personId = (draft.person_id as string | null) ?? null;
      userId = (draft.user_id as string | null) ?? null;
    }
  }

  // Fall back to matching by sender email if we couldn't match the thread.
  // Best-effort only — the same email can exist across tenants, so take the
  // most recent match rather than erroring on multiple rows.
  if (!userId && from) {
    const { data: matches } = await sb
      .from("people")
      .select("id, user_id")
      .eq("email", from.toLowerCase())
      .order("updated_at", { ascending: false })
      .limit(1);
    const person = matches?.[0];
    if (person) {
      personId = person.id as string;
      userId = (person.user_id as string | null) ?? null;
    }
  }

  // Can't attribute the reply to an account — ack so the provider stops
  // retrying, but record nothing.
  if (!userId) {
    return Response.json({ ok: true, skipped: "no matching user" });
  }

  const { data, error } = await sb
    .from("replies")
    .insert({
      user_id: userId,
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
      user_id: userId,
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
