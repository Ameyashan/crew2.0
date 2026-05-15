import { supabaseAdmin } from "@/lib/supabase";
import { USER_ID } from "@/lib/utils";
import { draft as claudeDraft, type Channel } from "@/lib/claude";

export type ScheduleResult =
  | { id: string; due_at: string; draft_id: string | null }
  | { skipped: "never" | "duplicate" | "channel" | "missing_draft" };

export interface ScheduleFollowupOpts {
  person_id: string;
  source_interaction_id: string;
  original_draft_id: string;
  channel: Channel;
  sent_at: Date;
  days: number | null;
}

export async function scheduleFollowup(opts: ScheduleFollowupOpts): Promise<ScheduleResult> {
  if (opts.days == null) return { skipped: "never" };
  if (opts.channel !== "email") return { skipped: "channel" };
  if (!opts.original_draft_id) return { skipped: "missing_draft" };

  const sb = supabaseAdmin();

  // De-dupe: already-pending followup tied to this interaction or a child draft of the original.
  const { data: childDrafts } = await sb
    .from("drafts")
    .select("id")
    .eq("user_id", USER_ID)
    .eq("parent_draft_id", opts.original_draft_id);
  const childIds = (childDrafts ?? []).map((d) => d.id as string);

  const { data: existing } = await sb
    .from("followups")
    .select("id")
    .eq("user_id", USER_ID)
    .eq("person_id", opts.person_id)
    .eq("status", "pending")
    .or(
      [
        `source_interaction_id.eq.${opts.source_interaction_id}`,
        childIds.length ? `draft_id.in.(${childIds.join(",")})` : null,
      ]
        .filter(Boolean)
        .join(",")
    )
    .limit(1);

  if (existing && existing.length > 0) {
    return { skipped: "duplicate" };
  }

  const { data: original } = await sb
    .from("drafts")
    .select("body, channel, subject")
    .eq("id", opts.original_draft_id)
    .single();

  const { data: person } = await sb
    .from("people")
    .select("name, role, company, links, enrichment")
    .eq("id", opts.person_id)
    .single();

  const research = (person?.enrichment as Record<string, unknown> | null)?.research as
    | { context_lines?: string[]; links?: Record<string, string> }
    | undefined;

  const due = new Date(
    Math.max(opts.sent_at.getTime() + opts.days * 24 * 60 * 60 * 1000, Date.now())
  );

  let followupDraftId: string | null = null;
  if (original) {
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
        channel: (original.channel as Channel) ?? opts.channel,
        parent_draft: { channel: original.channel as Channel, body: original.body },
        intent: `Polite, short followup. No reply yet after ${opts.days} days.`,
      });

      const { data: fuRow } = await sb
        .from("drafts")
        .insert({
          user_id: USER_ID,
          person_id: opts.person_id,
          channel: original.channel ?? opts.channel,
          subject: fu.subject,
          body: fu.body,
          status: "generated",
          model: fu.model,
          parent_draft_id: opts.original_draft_id,
          intent: "followup",
        })
        .select("id")
        .single();
      followupDraftId = (fuRow?.id as string) ?? null;
    } catch (e) {
      console.error("[followups] pre-draft failed", e);
    }
  }

  const { data: row, error } = await sb
    .from("followups")
    .insert({
      user_id: USER_ID,
      person_id: opts.person_id,
      source_interaction_id: opts.source_interaction_id,
      draft_id: followupDraftId,
      due_at: due.toISOString(),
      status: "pending",
    })
    .select("id, due_at, draft_id")
    .single();

  if (error || !row) {
    throw new Error(`scheduleFollowup insert failed: ${error?.message ?? "unknown"}`);
  }

  return {
    id: row.id as string,
    due_at: row.due_at as string,
    draft_id: (row.draft_id as string | null) ?? null,
  };
}

export async function cancelPendingFollowups(person_id: string): Promise<void> {
  const sb = supabaseAdmin();
  await sb
    .from("followups")
    .update({ status: "cancelled" })
    .eq("user_id", USER_ID)
    .eq("person_id", person_id)
    .eq("status", "pending");
}
