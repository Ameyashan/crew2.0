import { supabaseAdmin } from "@/lib/supabase";
import { currentUserId } from "@/lib/user-context";

export interface FollowupRow {
  id: string;
  due_at: string;
  person: { id: string; name: string; email: string | null };
  draft: { id: string; channel: string; subject: string | null; body: string } | null;
  parent: { subject: string | null; body: string; sent_at: string } | null;
  source_sent_at: string | null;
}

export interface ReviewRow {
  interaction_id: string;
  sent_at: string;
  person: { id: string; name: string; email: string | null };
  draft: { id: string; channel: string; subject: string | null; body: string } | null;
}

export interface ReplyRow {
  id: string;
  from_email: string;
  subject: string | null;
  body: string;
  sentiment: string | null;
  summary: string | null;
  suggested_reply: string | null;
  intro_offered: boolean;
  meeting: string | null;
  person: { id: string; name: string; email: string | null } | null;
  created_at: string;
}

export async function loadTodayData() {
  const sb = supabaseAdmin();
  const userId = currentUserId();

  const { data: dueRaw } = await sb
    .from("followups")
    .select(
      "id, due_at, source_interaction_id, person:people(id,name,email), draft:drafts(id,channel,subject,body)"
    )
    .eq("user_id", userId)
    .eq("status", "pending")
    .lte("due_at", new Date().toISOString())
    .order("due_at", { ascending: true });

  const dueRows = (dueRaw ?? []) as Array<Record<string, unknown>>;

  // Load the original ("previous") message for each followup via source_interaction_id.
  const interactionIds = dueRows
    .map((r) => r.source_interaction_id as string | null)
    .filter((x): x is string => !!x);

  const parentByIxId = new Map<
    string,
    { subject: string | null; body: string; sent_at: string }
  >();
  if (interactionIds.length) {
    const { data: parents } = await sb
      .from("interactions")
      .select("id, created_at, draft:drafts(id, subject, body)")
      .in("id", interactionIds);
    for (const p of (parents ?? []) as Array<Record<string, unknown>>) {
      const draft = pickDraftRaw(p.draft);
      if (draft) {
        parentByIxId.set(p.id as string, {
          subject: draft.subject ?? null,
          body: draft.body ?? "",
          sent_at: p.created_at as string,
        });
      }
    }
  }

  const due: FollowupRow[] = dueRows.map((r) => ({
    id: r.id as string,
    due_at: r.due_at as string,
    person: pickPerson(r.person),
    draft: pickDraft(r.draft),
    parent: parentByIxId.get(r.source_interaction_id as string) ?? null,
    source_sent_at: parentByIxId.get(r.source_interaction_id as string)?.sent_at ?? null,
  }));

  // Conversations needing review: 'sent' interactions in last 14d that don't have a 'replied' or 'no_reply' for the same person+draft yet.
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: sentRaw } = await sb
    .from("interactions")
    .select(
      "id, created_at, person_id, draft_id, person:people(id,name,email), draft:drafts(id,channel,subject,body)"
    )
    .eq("user_id", userId)
    .eq("interaction_type", "sent")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  const sentRows = (sentRaw ?? []) as Array<Record<string, unknown>>;

  const personIds = Array.from(new Set(sentRows.map((r) => r.person_id as string).filter(Boolean)));
  const closedPersonIds = new Set<string>();
  if (personIds.length) {
    const { data: closures } = await sb
      .from("interactions")
      .select("person_id, interaction_type, created_at")
      .eq("user_id", userId)
      .in("person_id", personIds)
      .in("interaction_type", ["replied", "no_reply"]);
    for (const c of closures ?? []) closedPersonIds.add(c.person_id as string);
  }

  const reviews: ReviewRow[] = sentRows
    .filter((r) => !closedPersonIds.has(r.person_id as string))
    .map((r) => ({
      interaction_id: r.id as string,
      sent_at: r.created_at as string,
      person: pickPerson(r.person),
      draft: pickDraft(r.draft),
    }));

  // Replies needing human attention — populated by the inbound webhook.
  // Treat anything from the last 30 days that isn't marked handled as "needs review".
  const replySince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: replyRaw } = await sb
    .from("replies")
    .select(
      "id, from_email, subject, body, sentiment, summary, suggested_reply, intro_offered, meeting, created_at, person:people(id,name,email)",
    )
    .eq("user_id", userId)
    .gte("created_at", replySince)
    .order("created_at", { ascending: false });

  const replies: ReplyRow[] = ((replyRaw ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    from_email: r.from_email as string,
    subject: (r.subject as string) ?? null,
    body: r.body as string,
    sentiment: (r.sentiment as string) ?? null,
    summary: (r.summary as string) ?? null,
    suggested_reply: (r.suggested_reply as string) ?? null,
    intro_offered: !!r.intro_offered,
    meeting: (r.meeting as string) ?? null,
    person: r.person ? pickPerson(r.person) : null,
    created_at: r.created_at as string,
  }));

  // Things that will land in tomorrow's 8am digest:
  //   armed = pending followups not yet due now, but due before tomorrow's digest fires.
  const nextDigest = new Date();
  nextDigest.setDate(nextDigest.getDate() + 1);
  nextDigest.setHours(8, 0, 0, 0);
  const { data: armedRaw } = await sb
    .from("followups")
    .select("id, due_at, person:people(id,name,email)")
    .eq("user_id", userId)
    .eq("status", "pending")
    .gt("due_at", new Date().toISOString())
    .lte("due_at", nextDigest.toISOString())
    .order("due_at", { ascending: true });

  const armed = ((armedRaw ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    due_at: r.due_at as string,
    person: pickPerson(r.person),
  }));

  // reply_expected = open sent threads still awaiting a reply (same set as `reviews`, presented as a
  // forward-looking expectation for the next digest).
  const replyExpected = reviews.map((r) => ({
    interaction_id: r.interaction_id,
    sent_at: r.sent_at,
    person: r.person,
    subject: r.draft?.subject ?? null,
  }));

  return {
    due,
    reviews,
    replies,
    tomorrow: { armed, reply_expected: replyExpected },
  };
}

function pickPerson(p: unknown): { id: string; name: string; email: string | null } {
  const x = (Array.isArray(p) ? p[0] : p) as Record<string, unknown> | null;
  return {
    id: (x?.id as string) ?? "",
    name: (x?.name as string) ?? "(unknown)",
    email: (x?.email as string) ?? null,
  };
}
function pickDraft(d: unknown) {
  const x = pickDraftRaw(d);
  if (!x) return null;
  return {
    id: x.id as string,
    channel: x.channel as string,
    subject: (x.subject as string) ?? null,
    body: x.body as string,
  };
}
function pickDraftRaw(d: unknown): Record<string, string> | null {
  const x = (Array.isArray(d) ? d[0] : d) as Record<string, string> | null;
  return x ?? null;
}
