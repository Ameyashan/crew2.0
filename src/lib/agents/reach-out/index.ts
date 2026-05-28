import { research, draft, type Channel } from "@/lib/claude";
import { inferDomain, buildGuesses } from "@/lib/apollo";
import { findEmailHunter as findEmail } from "@/lib/hunter";
import { supabaseAdmin } from "@/lib/supabase";
import { currentUserId } from "@/lib/user-context";
import { getProfile, senderContextFromProfile } from "@/lib/profile";

export interface RunReachOutInput {
  text: string;
  intent?: string;
  intent_image?: { data: string; media_type: string };
  provided_email?: string;
  picked?: {
    name?: string;
    role?: string | null;
    company?: string | null;
    linkedin?: string | null;
  };
}

export type StepEvent =
  | { type: "step"; id: "research"; status: "start" }
  | { type: "step"; id: "research"; status: "done"; data: Awaited<ReturnType<typeof research>> }
  | { type: "step"; id: "email_lookup"; status: "start" }
  | { type: "step"; id: "email_lookup"; status: "done"; data: Awaited<ReturnType<typeof findEmail>> }
  | { type: "step"; id: "email_lookup"; status: "skipped"; data: Awaited<ReturnType<typeof findEmail>> }
  | { type: "step"; id: "person_saved"; status: "done"; data: { id: string; name: string; role: string | null; company: string | null } }
  | { type: "step"; id: "draft"; status: "start"; channel: Channel }
  | { type: "step"; id: "draft"; status: "done"; channel: Channel; data: { id: string; channel: Channel; subject: string | null; body: string } }
  | { type: "needs_disambiguation"; data: NonNullable<Awaited<ReturnType<typeof research>>["candidates"]> }
  | { type: "complete" }
  | { type: "error"; message: string };

function classify(text: string) {
  const t = text.trim();
  if (/^https?:\/\/(www\.)?linkedin\.com\//i.test(t)) return { linkedin_url: t };
  if (/^https?:\/\/(twitter|x)\.com\//i.test(t)) return { x_post_url: t };
  if (/^[A-Z][a-zA-Z'.\-]+(\s+[A-Z][a-zA-Z'.\-]+)+$/.test(t) && t.length < 80)
    return { name: t };
  return { free_text: t };
}

export async function* runReachOutStream(
  input: RunReachOutInput
): AsyncGenerator<StepEvent> {
  try {
    const profile = await getProfile();

    // Research
    yield { type: "step", id: "research", status: "start" };
    // If a candidate was already picked in step 1, anchor research on the LinkedIn URL
    // (much higher fidelity than a name search).
    const researchInput = input.picked?.linkedin
      ? {
          linkedin_url: input.picked.linkedin,
          name: input.picked.name,
          intent:
            input.intent ||
            [input.picked.role, input.picked.company].filter(Boolean).join(" at "),
          intent_image: input.intent_image,
        }
      : {
          ...classify(input.text),
          // When a candidate was picked (job flow / disambiguation retry), force
          // the name so research anchors on it and never dead-ends into another
          // disambiguation prompt — parseResearch falls back to this name.
          ...(input.picked?.name ? { name: input.picked.name } : {}),
          intent: input.intent,
          intent_image: input.intent_image,
        };
    const ctx = await research(researchInput);
    yield { type: "step", id: "research", status: "done", data: ctx };

    if (!ctx.name && ctx.candidates && ctx.candidates.length > 0) {
      yield { type: "needs_disambiguation", data: ctx.candidates };
      yield { type: "complete" };
      return;
    }

    // Email lookup — skip when the user already has the email
    const providedEmail = input.provided_email?.trim();
    let enrichment: Awaited<ReturnType<typeof findEmail>>;
    let enrichmentForUi: Awaited<ReturnType<typeof findEmail>>;
    if (providedEmail) {
      const domain = providedEmail.includes("@") ? providedEmail.split("@")[1] : null;
      enrichment = {
        email: providedEmail,
        confidence: 1,
        source: "user_provided",
        domain,
        guesses: [],
        message: null,
      };
      enrichmentForUi = enrichment;
      yield { type: "step", id: "email_lookup", status: "skipped", data: enrichmentForUi };
    } else {
      yield { type: "step", id: "email_lookup", status: "start" };
      enrichment = await findEmail({
        name: ctx.name ?? input.text,
        company: ctx.company ?? undefined,
        linkedin_url: ctx.links?.linkedin,
      });

      // Always guarantee guesses + domain so the UI has a fallback even when
      // Apollo can't be called (free plan) or returns no domain data.
      const finalDomain =
        enrichment.domain ?? inferDomain({ company: ctx.company, links: ctx.links });
      const finalGuesses =
        enrichment.guesses && enrichment.guesses.length
          ? enrichment.guesses
          : finalDomain
            ? buildGuesses(ctx.name ?? input.text, finalDomain)
            : [];
      enrichmentForUi = { ...enrichment, domain: finalDomain, guesses: finalGuesses };
      yield { type: "step", id: "email_lookup", status: "done", data: enrichmentForUi };
    }

    // Dedupe: prefer linkedin URL match; fall back to lower(name) + lower(company).
    const sb = supabaseAdmin();
    const linkedin = ctx.links?.linkedin ?? input.picked?.linkedin ?? null;
    const personName = ctx.name ?? input.picked?.name ?? input.text.slice(0, 80);
    const personCompany = ctx.company ?? input.picked?.company ?? null;

    let existingId: string | null = null;
    if (linkedin) {
      const { data } = await sb
        .from("people")
        .select("id")
        .eq("user_id", currentUserId())
        .eq("links->>linkedin", linkedin)
        .limit(1);
      if (data?.[0]) existingId = data[0].id as string;
    }
    if (!existingId) {
      const { data } = await sb
        .from("people")
        .select("id")
        .eq("user_id", currentUserId())
        .ilike("name", personName)
        .ilike("company", personCompany ?? "")
        .limit(1);
      if (data?.[0]) existingId = data[0].id as string;
    }

    const personRow = {
      user_id: currentUserId(),
      name: personName,
      role: ctx.role,
      company: personCompany,
      email: enrichment.email,
      email_confidence: enrichment.confidence || null,
      email_source: enrichment.source,
      links: ctx.links ?? {},
      enrichment: { research: ctx, apollo: enrichment.raw ?? null },
    };

    let personId: string;
    if (existingId) {
      const { error: uErr } = await sb
        .from("people")
        .update({ ...personRow, updated_at: new Date().toISOString() })
        .eq("id", existingId);
      if (uErr) throw new Error(`people update: ${uErr.message}`);
      personId = existingId;
    } else {
      const { data: person, error: pErr } = await sb
        .from("people")
        .insert(personRow)
        .select("id")
        .single();
      if (pErr) throw new Error(`people insert: ${pErr.message}`);
      personId = person!.id as string;
    }
    yield {
      type: "step",
      id: "person_saved",
      status: "done",
      data: { id: personId, name: personRow.name, role: personRow.role, company: personRow.company },
    };

    // Drafts: emit start for each, then await all in parallel and emit done as they land
    const channels: Channel[] = ["email", "x_dm", "linkedin"];
    for (const c of channels) yield { type: "step", id: "draft", status: "start", channel: c };

    const senderCtx = senderContextFromProfile(profile);
    const draftPromises = channels.map((c) =>
      draft({
        person_context: ctx,
        channel: c,
        intent: input.intent,
        sender_context: senderCtx || undefined,
        sender_writing_samples: profile?.writing_samples ?? undefined,
        sender_full_name: profile?.full_name ?? undefined,
      }).then((r) => ({ channel: c, result: r }))
    );

    // Yield results as each promise settles
    const settled = await Promise.allSettled(draftPromises);
    const okResults: { channel: Channel; result: Awaited<ReturnType<typeof draft>> }[] = [];
    for (const s of settled) {
      if (s.status === "fulfilled") okResults.push(s.value);
      else console.error("[draft]", s.reason);
    }

    if (okResults.length === 0) {
      throw new Error("all drafts failed");
    }

    // Persist drafts + interactions, then emit done
    const draftRows = okResults.map(({ channel, result }) => ({
      user_id: currentUserId(),
      person_id: personId,
      channel,
      subject: result.subject,
      body: result.body,
      intent: input.intent ?? null,
      status: "generated" as const,
      model: result.model,
    }));
    const { data: drafts, error: dErr } = await sb
      .from("drafts")
      .insert(draftRows)
      .select("id, channel, subject, body");
    if (dErr) throw new Error(`drafts insert: ${dErr.message}`);

    await sb.from("interactions").insert(
      drafts!.map((d) => ({
        user_id: currentUserId(),
        person_id: personId,
        agent_type: "reach_out",
        interaction_type: "drafted",
        channel: d.channel,
        draft_id: d.id,
      }))
    );

    for (const d of drafts!) {
      yield {
        type: "step",
        id: "draft",
        status: "done",
        channel: d.channel as Channel,
        data: { id: d.id as string, channel: d.channel as Channel, subject: d.subject as string | null, body: d.body as string },
      };
    }

    yield { type: "complete" };
  } catch (e) {
    yield { type: "error", message: String(e) };
  }
}
