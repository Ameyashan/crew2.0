import {
  research,
  draft,
  findPublicEmail,
  type Channel,
  type PublicEmailResult,
} from "@/lib/claude";
import {
  inferDomain,
  buildGuesses,
  type FindEmailResult,
  type EmailGuess,
} from "@/lib/apollo";
import { lookupEmployer } from "@/lib/employer";
import { findEmailHunter as findEmail } from "@/lib/hunter";
import { supabaseAdmin } from "@/lib/supabase";
import { currentUserId } from "@/lib/user-context";
import { getProfile, senderContextFromProfile } from "@/lib/profile";
import { agentEnabled } from "@/lib/agent-selection";

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
  // Job-application flow: the role/company this outreach is for. Anchors the
  // draft so a stray intent can't point the email at the wrong company.
  job_context?: { role?: string | null; company?: string | null };
  // History feature: when set, drafts are tagged with this compose_run_id so
  // the /app/history detail view can fetch a run's drafts directly.
  compose_run_id?: string;
  // Crew selector (Phase 2): the agents the user opted into. Research always
  // runs (it's the identity step everything else depends on); 'email' gates the
  // address lookup and 'outreach' gates the drafting. Undefined → run all.
  agents?: string[];
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
    // Job / hiring-manager flow: the person must currently work at the job's
    // company. Passing it lets research reject a same-name person who has moved
    // on (the "shown at Speak, but really an Anthropic IC" failure) instead of
    // asserting a wrong brief.
    const expectCompany = input.job_context?.company ?? null;
    const researchInput = input.picked?.linkedin
      ? {
          linkedin_url: input.picked.linkedin,
          name: input.picked.name,
          intent:
            input.intent ||
            [input.picked.role, input.picked.company].filter(Boolean).join(" at "),
          intent_image: input.intent_image,
          expect_company: expectCompany,
        }
      : {
          ...classify(input.text),
          // When a candidate was picked (job flow / disambiguation retry), anchor
          // research on that name — but research may still null it out and force a
          // re-pick if it can't confirm a single, correct person (see parseResearch).
          ...(input.picked?.name ? { name: input.picked.name } : {}),
          intent: input.intent,
          intent_image: input.intent_image,
          expect_company: expectCompany,
        };
    const ctx = await research(researchInput);

    // Disambiguation gate first — no point resolving an employer for a person we
    // couldn't even identify. Research nulls the name when it can't stand behind
    // the identity (mixed facts, or not currently at the expected company), so a
    // gated result forces a re-pick here rather than drafting a confidently-wrong
    // brief — even when no alternative candidates came back.
    if (!ctx.name) {
      yield { type: "step", id: "research", status: "done", data: ctx };
      yield { type: "needs_disambiguation", data: ctx.candidates ?? [] };
      yield { type: "complete" };
      return;
    }

    // Employer-of-record. The research model derives `company`/`role` from web
    // search, which can rank a PAST employer as current. A structured people-data
    // provider (Apollo → PeopleDataLabs → Proxycurl, keyed on the LinkedIn URL)
    // returns the person's CURRENT organization as a structured field — trust it
    // over the synthesized company, and take its primary domain as the
    // authoritative one for the email lookup below. Degrades to the research
    // company when no provider is configured / nobody matches.
    const linkedinForLookup = ctx.links?.linkedin ?? input.picked?.linkedin ?? null;
    const employer = await lookupEmployer({
      name: ctx.name ?? input.picked?.name,
      company: ctx.company ?? input.picked?.company,
      linkedin_url: linkedinForLookup,
    }).catch(() => null);
    if (employer?.company) ctx.company = employer.company;
    if (employer?.title) ctx.role = employer.title;
    const employerDomain = employer?.domain ?? null;

    yield { type: "step", id: "research", status: "done", data: ctx };

    // Email lookup — skip when the user already has the email, OR when they
    // deselected Email Wallah in the crew checklist.
    const providedEmail = input.provided_email?.trim();
    const emailEnabled = agentEnabled(input.agents, "email");
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
    } else if (!emailEnabled) {
      // Email Wallah was switched off — don't hunt for an address. Downstream
      // drafting still works; the "To" line just stays empty.
      enrichment = {
        email: null,
        confidence: 0,
        source: "skipped",
        domain: null,
        guesses: [],
        message: null,
      };
      enrichmentForUi = enrichment;
      yield { type: "step", id: "email_lookup", status: "skipped", data: enrichmentForUi };
    } else {
      yield { type: "step", id: "email_lookup", status: "start" };
      const lookupName = ctx.name ?? input.text;
      // Two lookups in parallel. Hunter is a corporate-domain finder
      // (name@company-domain) and can never return a personal address on
      // another domain; the public-web pass catches an email the person
      // published themselves (GitHub, personal site, blog, paper/bio). We then
      // prefer a self-published hit over a domain guess.
      const [hunter, pub] = await Promise.all([
        findEmail({
          name: lookupName,
          company: ctx.company ?? undefined,
          linkedin_url: ctx.links?.linkedin,
          // Apollo's verified org domain when we have it — beats guessing a
          // domain from the company name (e.g. anthropic.com, not a name-mangle).
          domain: employerDomain,
        }),
        findPublicEmail({
          name: lookupName,
          company: ctx.company,
          links: ctx.links,
        }),
      ]);

      enrichment = mergeEmailSources(hunter, pub, ctx.company, ctx.links);

      // Always guarantee guesses + domain so the UI has a fallback even when
      // neither provider returns usable data. The authoritative org domain wins.
      const finalDomain =
        employerDomain ?? enrichment.domain ?? inferDomain({ company: ctx.company, links: ctx.links });
      const finalGuesses =
        enrichment.guesses && enrichment.guesses.length
          ? enrichment.guesses
          : finalDomain
            ? buildGuesses(lookupName, finalDomain)
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

    // Drafts: emit start for each, then await all in parallel and emit done as
    // they land. Skipped wholesale when Outreach Bhai is switched off — the run
    // then ends at "person found (+ maybe email)" with no drafts.
    if (agentEnabled(input.agents, "outreach")) {
      const channels: Channel[] = ["email", "x_dm", "linkedin"];
      for (const c of channels) yield { type: "step", id: "draft", status: "start", channel: c };

      const senderCtx = senderContextFromProfile(profile);
      const draftPromises = channels.map((c) =>
        draft({
          person_context: ctx,
          channel: c,
          intent: input.intent,
          job_context: input.job_context,
          sender_context: senderCtx || undefined,
          sender_writing_samples: profile?.writing_samples ?? undefined,
          sender_full_name: profile?.full_name ?? undefined,
          sender_linkedin: profile?.linkedin_url ?? undefined,
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
        compose_run_id: input.compose_run_id ?? null,
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
    }

    yield { type: "complete" };
  } catch (e) {
    yield { type: "error", message: String(e) };
  }
}

// Combine the corporate-domain (Hunter) and public-web lookups into the single
// FindEmailResult shape the UI already understands. Ranking, best first:
//   1. an address the person self-published (most reliable way to reach them),
//   2. a real mailbox Hunter stands behind,
//   3. a public address seen on a third-party source (better than a blind guess),
//   4. nothing — fall through to Hunter's domain + pattern guesses.
// The address that doesn't win is kept as a secondary, clickable candidate.
function mergeEmailSources(
  hunter: FindEmailResult,
  pub: PublicEmailResult,
  company: string | null,
  links: Record<string, string> | null,
): FindEmailResult {
  const domain = hunter.domain ?? inferDomain({ company, links });
  const publicRaw = { source_url: pub.source_url, raw: pub.raw };

  // 1) Self-published wins outright — even a personal Gmail beats a corporate guess.
  if (pub.email && pub.self_published) {
    const extras: EmailGuess[] = [];
    if (hunter.email) extras.push({ email: hunter.email, pattern: hunter.source });
    return {
      email: pub.email,
      confidence: Math.max(pub.confidence, 0.9),
      source: "public_web",
      domain,
      guesses: dedupeGuesses([...extras, ...(hunter.guesses ?? [])], pub.email),
      message: pub.source_url ? `published at ${pub.source_url}` : "self-published address",
      raw: { hunter: hunter.raw ?? null, public: publicRaw },
    };
  }

  // 2) A real mailbox Hunter could find.
  if (hunter.email) {
    const extras: EmailGuess[] = [];
    if (pub.email) extras.push({ email: pub.email, pattern: "public_web" });
    return {
      ...hunter,
      domain,
      guesses: dedupeGuesses([...extras, ...(hunter.guesses ?? [])], hunter.email),
      raw: { hunter: hunter.raw ?? null, public: pub.email ? publicRaw : null },
    };
  }

  // 3) A public address from a source the person doesn't control — flag it.
  if (pub.email) {
    return {
      email: pub.email,
      confidence: Math.min(pub.confidence, 0.7),
      source: "public_web_unverified",
      domain,
      guesses: dedupeGuesses(hunter.guesses ?? [], pub.email),
      message: pub.source_url ? `seen at ${pub.source_url}` : null,
      raw: { hunter: hunter.raw ?? null, public: publicRaw },
    };
  }

  // 4) Nothing found — keep Hunter's no-match payload (domain + guesses).
  return { ...hunter, domain };
}

function dedupeGuesses(guesses: EmailGuess[], primary: string): EmailGuess[] {
  const seen = new Set<string>([primary.toLowerCase()]);
  const out: EmailGuess[] = [];
  for (const g of guesses) {
    const key = g.email?.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(g);
  }
  return out.slice(0, 6);
}
