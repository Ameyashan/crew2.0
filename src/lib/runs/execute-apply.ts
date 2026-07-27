// Durable executor for a job/apply compose run.
//
// The whole agent pipeline used to live inside the SSE ReadableStream of
// /api/compose/apply, so it died the moment the client connection did (mobile
// backgrounding). It now lives here, driven off a persisted compose_runs row so
// it can run independent of the request:
//
//   • fresh runs   → the route schedules runPipeline() via next/server after(),
//                    which outlives the response, and a cron worker re-drives
//                    any run whose lease goes stale (redeploy / > maxDuration).
//   • re-picks     → the route runs runPipeline() inside a short-lived SSE
//                    stream (a fast, user-present amendment), so pickCandidate
//                    keeps its live stream.
//
// The pipeline emits the exact same event shapes it always did; a `sink`
// decides where they go — appended to compose_runs.steps for the durable path
// (observed by the client polling the row), or enqueued as SSE frames for the
// re-pick path.

import { runResumeTailorStreamPersisted } from "@/lib/agents/resume-tailor/persisted";
import { runReachOutStream } from "@/lib/agents/reach-out";
import { sourceHiringManagers, parseJobMeta, parseJobMetaFromText, findJobOpening, detectApplicationQuestions, type JobMeta } from "@/lib/claude";
import { fetchAtsPosting } from "@/lib/job-fetch";
import { authWalledJobHost, pasteJdJobHost } from "@/lib/job-url";
import type { TailoredResume } from "@/lib/agents/resume-tailor/types";
import { supabaseAdmin } from "@/lib/supabase";
import { getProfile } from "@/lib/profile";
import { runWithUser } from "@/lib/user-context";
import { agentEnabled, parseAgents } from "@/lib/agent-selection";
import { mergeRepickOutput } from "./repick-merge";
import type { RunSink, DrainableSink } from "./sink";

// The inputs a run needs to execute, captured on the compose_runs row at POST
// time so a fresh worker invocation can re-run with no client involvement.
export type RunPayload = {
  job_url?: string;
  job_text?: string;
  intent?: string;
  prior?: Record<string, unknown> | null;
  person_name?: string;
  detected_role?: string;
  detected_company?: string;
  detected_team?: string;
  poster_is_hiring_manager?: boolean;
  screenshot_id?: string;
  agents?: unknown;
  picked?: { name: string; role: string | null; company: string | null; linkedin: string | null } | null;
  job_context?: { role: string | null; company: string | null } | null;
};

type Contact = { person: unknown; enrichment: unknown; drafts: unknown[]; personId: string | null; draftId: string | null; sameAsPoster?: boolean };

// Persist the terminal state of a run. Idempotent: only writes while the row is
// still in_flight, so a worker re-run that races the original after() (or a
// double-drive) can't clobber an already-final row.
async function finalizeRun(
  composeRunId: string,
  userId: string | null,
  args: {
    outcome: "complete" | "error" | "needs_disambiguation";
    error: string | null;
    personId: string | null;
    resumeGenerationId: string | null;
    output: Record<string, unknown>;
    steps: unknown[];
  },
) {
  try {
    await supabaseAdmin()
      .from("compose_runs")
      .update({
        person_id: args.personId,
        resume_generation_id: args.resumeGenerationId,
        output: args.output,
        outcome: args.outcome,
        error: args.error,
        steps: args.steps,
        heartbeat_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .eq("id", composeRunId)
      .eq("outcome", "in_flight");
  } catch (e) {
    console.error("[compose_runs] finalize failed", e);
  }
}

// Merge a re-pick's freshly-drafted contact into the parent run's persisted
// `output`, preserving everything else the original run produced (résumé,
// candidates, application questions). A dual-contact (screenshot) run updates
// its hiring_manager slot; a single-contact run replaces the top-level
// person/enrichment/drafts. Read-modify-write on the already-complete row — it
// deliberately does NOT gate on outcome='in_flight' (the parent is done).
async function mergeRepickIntoParent(
  composeRunId: string,
  amend: { person: unknown; enrichment: unknown; drafts: unknown[]; personId: string | null },
): Promise<void> {
  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from("compose_runs")
    .select("output, person_id")
    .eq("id", composeRunId)
    .maybeSingle();

  const output = mergeRepickOutput(row?.output, {
    person: amend.person,
    enrichment: amend.enrichment,
    drafts: amend.drafts,
  });

  try {
    await sb
      .from("compose_runs")
      .update({
        output,
        person_id: amend.personId ?? row?.person_id ?? null,
        heartbeat_at: new Date().toISOString(),
      })
      .eq("id", composeRunId);
  } catch (e) {
    console.error("[compose_runs] re-pick merge failed", e);
  }
}

// Re-pick amendment: the user chose a different hiring-manager candidate on a
// FINISHED job run. We re-draft email + outreach for that person and MERGE the
// result into the parent run's package — instead of persisting a throwaway
// compose_runs row (which used to surface in history as a duplicate, résumé-less
// entry). The stream emits the exact step events pickCandidate already reads, so
// the live view is unchanged; only the persistence target differs.
export async function applyRepick(
  parentComposeRunId: string,
  picked: { name: string; role: string | null; company: string | null; linkedin: string | null },
  opts: { intent?: string; agents?: unknown; job_context?: { role: string | null; company: string | null } | null },
  sink: RunSink,
): Promise<void> {
  const sb = supabaseAdmin();
  const { data: row, error: loadErr } = await sb
    .from("compose_runs")
    .select("id, user_id")
    .eq("id", parentComposeRunId)
    .maybeSingle();
  if (loadErr || !row) {
    sink.emit({ type: "error", message: "Couldn't find the run to update." });
    return;
  }

  const userId: string | null = row.user_id ?? null;
  const agents = parseAgents(opts.agents);
  const send = (obj: unknown) => sink.emit(obj);

  await runWithUser(userId, async () => {
    let collectedPerson: unknown = null;
    let collectedEnrichment: unknown = null;
    const collectedDrafts: unknown[] = [];
    let personId: string | null = null;
    let errored: string | null = null;

    send({ type: "compose_run", id: parentComposeRunId });
    send({ type: "step", id: "person", status: "start" });
    try {
      for await (const evt of runReachOutStream({
        text: picked.name,
        intent: opts.intent || [picked.role, picked.company].filter(Boolean).join(" at ") || undefined,
        picked,
        job_context: opts.job_context ?? { role: picked.role, company: picked.company },
        agents,
        compose_run_id: parentComposeRunId,
      })) {
        if (evt.type === "step" && evt.id === "research") {
          send({ type: "step", id: "person", status: evt.status, data: (evt as { data?: unknown }).data });
          if (evt.status === "done") collectedPerson = (evt as { data?: unknown }).data;
        } else if (evt.type === "step" && evt.id === "email_lookup") {
          send({ type: "step", id: "email", status: evt.status, data: (evt as { data?: unknown }).data });
          if ((evt as { data?: unknown }).data) collectedEnrichment = (evt as { data?: unknown }).data;
        } else if (evt.type === "step" && evt.id === "person_saved") {
          personId = evt.data.id;
          send({ type: "person_saved", data: evt.data });
        } else if (evt.type === "step" && evt.id === "draft") {
          send({ type: "step", id: "outreach", status: evt.status, channel: evt.channel, data: (evt as { data?: unknown }).data });
          if (evt.status === "done" && evt.data) collectedDrafts.push(evt.data);
        } else if (evt.type === "error") {
          errored = evt.message;
          send({ type: "error", message: evt.message });
        } else if (evt.type === "needs_disambiguation") {
          send({ type: "step", id: "email", status: "done", data: { email: null, guesses: [] } });
          send({ type: "step", id: "outreach", status: "done", channel: "email", data: null });
        }
      }
    } catch (e) {
      errored = "Re-pick failed.";
      console.error("[applyRepick] reach-out failed", e);
      send({ type: "error", message: errored });
    }

    // Only rewrite the parent's package once we actually have a new draft — a
    // failed re-pick must leave the original contact intact.
    if (!errored && collectedDrafts.length) {
      await mergeRepickIntoParent(parentComposeRunId, {
        person: collectedPerson,
        enrichment: collectedEnrichment,
        drafts: collectedDrafts,
        personId,
      });
    }
    send({ type: "complete" });
  });
}

// Load a run's row and drive its pipeline to completion, emitting progress
// through `sink`. Establishes its own user context from the row (never relies on
// a request-scoped context surviving into after()/a worker). Idempotent at the
// row level — a row that is already terminal is a no-op.
export async function runPipeline(composeRunId: string, sink: RunSink): Promise<void> {
  const sb = supabaseAdmin();
  const { data: row, error: loadErr } = await sb
    .from("compose_runs")
    .select("id, user_id, anon_id, payload, outcome")
    .eq("id", composeRunId)
    .maybeSingle();
  if (loadErr || !row) {
    console.error("[runPipeline] row load failed", loadErr);
    return;
  }
  // Already finished (or picked up by another driver that finished it) — nothing to do.
  if (row.outcome && row.outcome !== "in_flight") return;

  const userId: string | null = row.user_id ?? null;
  const p: RunPayload = (row.payload as RunPayload) ?? {};

  await runWithUser(userId, async () => {
    const job_url = (p.job_url ?? "").toString();
    const intent = p.intent ? p.intent.toString() : undefined;
    const prior = p.prior && typeof p.prior === "object" ? p.prior : null;
    const job_text = (p.job_text ?? "").toString();
    const posterName = (p.person_name ?? "").toString();
    const detectedRole = (p.detected_role ?? "").toString();
    const detectedCompany = (p.detected_company ?? "").toString();
    const detectedTeam = (p.detected_team ?? "").toString();
    const posterIsHiringManager = p.poster_is_hiring_manager === true && !!posterName;
    const screenshotId = (p.screenshot_id ?? "").toString();
    const agents = parseAgents(p.agents);
    const picked = p.picked ?? null;
    const job_context = p.job_context ?? null;

    const screenshotMode = !!posterName || !!(detectedRole && detectedCompany);
    const resumeEnabled = !!userId && agentEnabled(agents, "resume");
    const personEnabled = agentEnabled(agents, "person");
    const questionsEnabled = !!userId && agentEnabled(agents, "application");

    const send = (obj: unknown) => sink.emit(obj);

    const resumePages: 1 | 2 = (await getProfile())?.resume_pages === 2 ? 2 : 1;

    const collectedDrafts: unknown[] = [];
    let collectedPerson: unknown = prior?.person ?? null;
    let collectedEnrichment: unknown = prior?.enrichment ?? null;
    let collectedCandidates: unknown[] | null = Array.isArray(prior?.candidates) ? (prior!.candidates as unknown[]) : null;
    let collectedTailored: TailoredResume | null = null;
    let collectedQuestions: string[] = [];
    const collectedContacts: Record<string, Contact> = {};
    if (prior && Array.isArray(prior.drafts)) collectedDrafts.push(...(prior.drafts as unknown[]));

    let resumeGenerationId: string | null = null;
    let personId: string | null = null;
    let draftId: string | null = null;
    let runOutcome: "complete" | "error" | "needs_disambiguation" = "error";
    let runError: string | null = null;

    send({ type: "compose_run", id: composeRunId });

    const pipeReachOut = async (reachInput: Parameters<typeof runReachOutStream>[0]) => {
      for await (const evt of runReachOutStream({ ...reachInput, agents, compose_run_id: composeRunId })) {
        if (evt.type === "step" && evt.id === "research") {
          send({ type: "step", id: "person", status: evt.status, data: (evt as { data?: unknown }).data });
          if (evt.status === "done") collectedPerson = (evt as { data?: unknown }).data;
        } else if (evt.type === "step" && evt.id === "email_lookup") {
          send({ type: "step", id: "email", status: evt.status, data: (evt as { data?: unknown }).data });
          if ((evt as { data?: unknown }).data) collectedEnrichment = (evt as { data?: unknown }).data;
        } else if (evt.type === "step" && evt.id === "person_saved") {
          personId = evt.data.id;
          send({ type: "person_saved", data: evt.data });
        } else if (evt.type === "step" && evt.id === "draft") {
          send({ type: "step", id: "outreach", status: evt.status, channel: evt.channel, data: (evt as { data?: unknown }).data });
          if (evt.status === "done" && evt.data) {
            if (!draftId) draftId = evt.data.id;
            collectedDrafts.push(evt.data);
          }
        } else if (evt.type === "error") {
          send({ type: "error", message: evt.message });
          runError = evt.message;
        } else if (evt.type === "needs_disambiguation") {
          collectedCandidates = Array.isArray(evt.data) && evt.data.length ? evt.data : collectedCandidates;
          send({ type: "step", id: "email", status: "done", data: { email: null, guesses: [] } });
          send({ type: "step", id: "outreach", status: "done", channel: "email", data: null });
        }
      }
    };

    const runContactSlot = async (slot: "poster" | "hiring_manager", reachInput: Parameters<typeof runReachOutStream>[0]) => {
      const c: Contact = collectedContacts[slot] ?? { person: null, enrichment: null, drafts: [], personId: null, draftId: null };
      collectedContacts[slot] = c;
      send({ type: "step", id: "person", slot, status: "start" });
      try {
        for await (const evt of runReachOutStream({ ...reachInput, agents, compose_run_id: composeRunId })) {
          if (evt.type === "step" && evt.id === "research") {
            send({ type: "step", id: "person", slot, status: evt.status, data: (evt as { data?: unknown }).data });
            if (evt.status === "done") c.person = (evt as { data?: unknown }).data;
          } else if (evt.type === "step" && evt.id === "email_lookup") {
            send({ type: "step", id: "email", slot, status: evt.status, data: (evt as { data?: unknown }).data });
            if ((evt as { data?: unknown }).data) c.enrichment = (evt as { data?: unknown }).data;
          } else if (evt.type === "step" && evt.id === "person_saved") {
            c.personId = evt.data.id;
            send({ type: "person_saved", slot, data: evt.data });
          } else if (evt.type === "step" && evt.id === "draft") {
            send({ type: "step", id: "outreach", slot, status: evt.status, channel: evt.channel, data: (evt as { data?: unknown }).data });
            if (evt.status === "done" && evt.data) {
              if (!c.draftId) c.draftId = evt.data.id;
              c.drafts.push(evt.data);
            }
          } else if (evt.type === "error") {
            send({ type: "step", id: "person", slot, status: "done", data: { name: null, role: null, company: null, searched: null, candidates: [] } });
            send({ type: "step", id: "email", slot, status: "done", data: { email: null, guesses: [] } });
            send({ type: "step", id: "outreach", slot, status: "done", channel: "email", data: null });
          } else if (evt.type === "needs_disambiguation") {
            send({ type: "step", id: "email", slot, status: "done", data: { email: null, guesses: [] } });
            send({ type: "step", id: "outreach", slot, status: "done", channel: "email", data: null });
          }
        }
      } catch (e) {
        console.error(`[apply] contact slot ${slot} failed`, e);
        send({ type: "step", id: "outreach", slot, status: "done", channel: "email", data: null });
      }
    };

    const resolveOpening = async (): Promise<{ url: string | null; team: string | null }> => {
      if (job_url && !authWalledJobHost(job_url)) return { url: job_url, team: null };
      if (!detectedCompany) return { url: null, team: null };
      const found = await findJobOpening({ role: detectedRole || null, company: detectedCompany }).catch((e) => {
        console.error("[apply] findJobOpening failed", e);
        return null;
      });
      return { url: found?.job_url ?? null, team: found?.team ?? null };
    };

    let posterImageResolved: { data: string; media_type: string } | undefined;
    let posterImageLoaded = false;
    const loadScreenshotImage = async (): Promise<{ data: string; media_type: string } | undefined> => {
      if (posterImageLoaded) return posterImageResolved;
      posterImageLoaded = true;
      if (!screenshotId || !userId) return undefined;
      try {
        const { data: shot } = await sb
          .from("screenshots")
          .select("bucket, path, content_type")
          .eq("id", screenshotId)
          .eq("user_id", userId)
          .single();
        if (!shot?.path) return undefined;
        const { data: blob, error } = await sb.storage.from((shot.bucket as string) || "screenshots").download(shot.path as string);
        if (error || !blob) return undefined;
        const buf = Buffer.from(await blob.arrayBuffer());
        posterImageResolved = { data: buf.toString("base64"), media_type: (shot.content_type as string) || "image/png" };
      } catch (e) {
        console.error("[apply] loadScreenshotImage failed", e);
      }
      return posterImageResolved;
    };

    const detectQuestions = async (opts: { url?: string | null; pastedText?: string | null }): Promise<string[]> => {
      const dedupe = (arr: string[]) => {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const q of arr) {
          const s = (q ?? "").trim();
          if (!s || seen.has(s.toLowerCase())) continue;
          seen.add(s.toLowerCase());
          out.push(s);
        }
        return out.slice(0, 8);
      };
      try {
        if (opts.pastedText && opts.pastedText.trim()) return dedupe(await detectApplicationQuestions(opts.pastedText));
        if (opts.url) {
          const fetched = await fetchAtsPosting(opts.url).catch(() => null);
          if (fetched) {
            const fromForm = fetched.questions ?? [];
            const fromText = fetched.text ? await detectApplicationQuestions(fetched.text).catch(() => []) : [];
            return dedupe([...fromForm, ...fromText]);
          }
        }
      } catch (e) {
        console.error("[apply] detectQuestions failed", e);
      }
      return [];
    };

    const runQuestionsDetection = async (opts: { url?: string | null; pastedText?: string | null }) => {
      if (!questionsEnabled) return;
      send({ type: "step", id: "application", status: "start" });
      const questions = await detectQuestions(opts);
      collectedQuestions = questions;
      send({ type: "step", id: "application", status: "done", data: { questions } });
    };

    try {
      // ── Re-pick path: re-run only email + draft for the chosen person.
      if (picked) {
        send({ type: "step", id: "person", status: "start" });
        await pipeReachOut({
          text: picked.name,
          intent: intent || [picked.role, picked.company].filter(Boolean).join(" at ") || undefined,
          picked,
          job_context: job_context ?? { role: picked.role, company: picked.company },
        });
        runOutcome = "complete";
        send({ type: "complete" });
        return;
      }

      // ── Screenshot dual-contact flow.
      if (screenshotMode) {
        const { url: openingUrl, team: openingTeam } = await resolveOpening();

        const resumeTask = async (): Promise<TailoredResume | null> => {
          if (!resumeEnabled) return null;
          send({ type: "step", id: "resume", status: "start" });
          const tailorInput = openingUrl
            ? { job_url: openingUrl, page_count: resumePages }
            : {
                page_count: resumePages,
                highlights: [detectedRole && `Target role: ${detectedRole}`, detectedCompany && `Company: ${detectedCompany}`, intent].filter(Boolean).join("\n"),
              };
          let resume: TailoredResume | null = null;
          try {
            for await (const evt of runResumeTailorStreamPersisted(tailorInput)) {
              if (evt.type === "step" && evt.id === "tailor" && evt.status === "done") resume = evt.data.resume;
              if (evt.type === "saved") resumeGenerationId = evt.id;
              if (evt.type === "error") {
                send({ type: "step", id: "resume", status: "error", message: evt.message });
                return null;
              }
              if (evt.type === "progress") send({ type: "progress", id: "resume", chars: evt.chars, bullets: evt.bullets });
            }
          } catch (e) {
            console.error("[apply] screenshot résumé failed", e);
            send({ type: "step", id: "resume", status: "error", message: "Résumé tailoring failed." });
            return null;
          }
          send({
            type: "step",
            id: "resume",
            status: "done",
            data: {
              resume_generation_id: resumeGenerationId,
              target_role: resume?.meta?.target_role,
              target_company: resume?.meta?.target_company,
              team: resume?.meta?.team ?? null,
              ats_score: resume?.meta?.ats_score,
              ats_score_before: resume?.meta?.ats_score_before,
              resume,
            },
          });
          return resume;
        };

        const peopleTask = async () => {
          if (!personEnabled) return;
          const meta = openingUrl
            ? await parseJobMeta(openingUrl).catch((e) => {
                console.error("[apply] parseJobMeta failed", e);
                return null as JobMeta | null;
              })
            : null;
          const role = meta?.role ?? (detectedRole || null);
          const company = meta?.company ?? (detectedCompany || null);
          // The screenshot's own "…my <team> team" is the most specific signal we
          // have; only let a parsed opening's team override it, never null it out.
          const team = meta?.team ?? openingTeam ?? (detectedTeam || null);
          const composeIntent = intent || [role, company].filter(Boolean).join(" at ") || undefined;
          const jc = { role, company };
          const samePerson = (n?: string | null) => !!posterName && !!n && n.trim().toLowerCase() === posterName.trim().toLowerCase();

          const posterTask = () =>
            posterName
              ? (async () =>
                  runContactSlot("poster", { text: posterName, intent: composeIntent, intent_image: await loadScreenshotImage(), job_context: jc }))()
              : Promise.resolve();

          // Source the org chart for a hiring manager and reach out to the top
          // candidate who isn't the poster. Used both as the second contact on a
          // plain hiring post and as the FALLBACK when the poster (who told us
          // they're the manager) couldn't be confirmed.
          const hmTask = async () => {
            let candidates: Awaited<ReturnType<typeof sourceHiringManagers>>["candidates"] = [];
            if (company) {
              try {
                candidates = (await sourceHiringManagers({ role, company, team })).candidates ?? [];
              } catch (e) {
                console.error("[apply] sourceHiringManagers failed", e);
              }
            }
            send({ type: "candidates", slot: "hiring_manager", data: candidates });
            collectedCandidates = candidates;
            const top = candidates.find((c) => c.name && !samePerson(c.name)) ?? null;
            if (!top) {
              if (candidates.some((c) => samePerson(c.name))) {
                collectedContacts["hiring_manager"] = { person: null, enrichment: null, drafts: [], personId: null, draftId: null, sameAsPoster: true };
                send({ type: "contact_meta", slot: "hiring_manager", data: { sameAsPoster: true } });
              } else {
                const query = [team, role, company].filter(Boolean).join(" ");
                send({ type: "step", id: "person", slot: "hiring_manager", status: "done", data: { name: null, role, company, searched: query, candidates: [] } });
                send({ type: "step", id: "email", slot: "hiring_manager", status: "done", data: { email: null, guesses: [] } });
                send({ type: "step", id: "outreach", slot: "hiring_manager", status: "done", channel: "email", data: null });
              }
              return;
            }
            await runContactSlot("hiring_manager", {
              text: top.name,
              intent: composeIntent,
              picked: { name: top.name, role: top.role ?? null, company: top.company ?? null, linkedin: top.linkedin ?? null },
              job_context: jc,
            });
          };

          // "I'm hiring for my team" post: the named poster IS the hiring manager,
          // so reach out to THEM — draft for the poster directly and skip the
          // org-chart search entirely. Climbing the org chart for a separate
          // "who decides" is exactly what surfaced unrelated VPs before. We only
          // fall back to sourcing a manager if the poster can't be confirmed.
          if (posterIsHiringManager) {
            await posterTask();
            const posterConfirmed = !!(collectedContacts["poster"]?.person as { name?: string } | null)?.name;
            if (!posterConfirmed) await hmTask();
            return;
          }

          // Plain hiring post: pursue the poster and a sourced hiring manager in
          // parallel, each as its own contact.
          await Promise.allSettled([posterTask(), hmTask()]);
        };

        const [resumeSettled] = await Promise.allSettled([resumeTask(), peopleTask(), runQuestionsDetection({ url: openingUrl })]);
        collectedTailored = resumeSettled.status === "fulfilled" ? resumeSettled.value : null;

        const primary = collectedContacts["poster"] ?? collectedContacts["hiring_manager"] ?? null;
        if (primary) {
          collectedPerson = primary.person;
          collectedEnrichment = primary.enrichment;
          if (Array.isArray(primary.drafts)) collectedDrafts.push(...primary.drafts);
          personId = primary.personId ?? personId;
          draftId = primary.draftId ?? draftId;
        }

        if (userId) {
          try {
            const { data, error } = await sb
              .from("job_applications")
              .insert({
                user_id: userId,
                job_url: openingUrl || job_url || null,
                job_json: collectedTailored?.meta ?? null,
                application_qa: collectedQuestions.length ? { questions: collectedQuestions, answers: [] } : null,
                resume_generation_id: resumeGenerationId,
                person_id: personId,
                draft_id: draftId,
                status: "drafted",
              })
              .select("id")
              .single();
            if (error) throw error;
            if (data?.id) send({ type: "saved", id: data.id });
          } catch (e) {
            console.error("[job_applications] insert failed", e);
          }
        }

        runOutcome = "complete";
        send({ type: "complete" });
        return;
      }

      // ── Step 0: login-walled boards can't be fetched — bail with guidance.
      const walled = authWalledJobHost(job_url);
      if (walled) {
        send({ type: "step", id: "resume", status: "error", message: `${walled} job links are behind a login wall, so Jugaadu can't read them.` });
        runError = `${walled} job links are behind a login wall, so Jugaadu can't read them. Paste a public posting URL instead — the company's careers page, or a Greenhouse / Lever / Ashby link.`;
        runOutcome = "error";
        send({ type: "error", message: runError });
        return;
      }

      // ── Step 0b: read-gated boards we can still run off a pasted JD.
      const pasteJd = pasteJdJobHost(job_url);
      const pastedPosting = job_text ? { text: job_text } : null;
      const resumeNeedsPaste = !!pasteJd && !pastedPosting;
      if (resumeNeedsPaste) {
        send({ type: "needs_job_text", id: "resume", label: pasteJd, message: `${pasteJd} postings sit behind a login, so Jugaadu can't read them. Paste the job description below and re-run to tailor your resume.` });
      }

      let settleResumeMeta!: (m: JobMeta | null) => void;
      let resumeMetaSettled = false;
      const resumeMetaReady = new Promise<JobMeta | null>((resolve) => {
        settleResumeMeta = (m) => {
          if (resumeMetaSettled) return;
          resumeMetaSettled = true;
          resolve(m);
        };
      });

      const resumeTask = async (): Promise<TailoredResume | null> => {
        if (resumeNeedsPaste) {
          send({ type: "step", id: "resume", status: "error", message: `${pasteJd} postings are behind a login — paste the job description and re-run to tailor your resume.` });
          settleResumeMeta(null);
          return null;
        }
        send({ type: "step", id: "resume", status: "start" });
        let resume: TailoredResume | null = null;
        try {
          for await (const evt of runResumeTailorStreamPersisted({ job_url, job_posting: pastedPosting ?? undefined, page_count: resumePages })) {
            if (evt.type === "step" && evt.id === "tailor" && evt.status === "done") resume = evt.data.resume;
            if (evt.type === "saved") resumeGenerationId = evt.id;
            if (evt.type === "error") {
              send({ type: "step", id: "resume", status: "error", message: evt.message });
              return null;
            }
            if (evt.type === "progress") send({ type: "progress", id: "resume", chars: evt.chars, bullets: evt.bullets });
            if (evt.type === "tool" && evt.name === "web_search") send({ type: "activity", id: "resume", label: "reading the job posting" });
            if (evt.type === "tool" && evt.name === "skill") send({ type: "activity", id: "resume", label: "formatting the document" });
            if (evt.type === "step" && evt.id === "research" && evt.status === "done") {
              const company = (evt.data as { company?: string } | undefined)?.company;
              send({ type: "activity", id: "resume", label: company ? `matched to ${company} — writing bullets` : "matching your Story to the role" });
            }
          }
        } catch (e) {
          console.error("[apply] résumé tailoring failed", e);
          send({ type: "step", id: "resume", status: "error", message: "Résumé tailoring failed." });
          return null;
        } finally {
          settleResumeMeta(resume?.meta ? { role: resume.meta.target_role ?? null, company: resume.meta.target_company ?? null, team: resume.meta.team ?? null } : null);
        }
        send({
          type: "step",
          id: "resume",
          status: "done",
          data: {
            resume_generation_id: resumeGenerationId,
            target_role: resume?.meta?.target_role,
            target_company: resume?.meta?.target_company,
            team: resume?.meta?.team ?? null,
            ats_score: resume?.meta?.ats_score,
            ats_score_before: resume?.meta?.ats_score_before,
            resume,
          },
        });
        return resume;
      };

      const peopleTask = async () => {
        send({ type: "step", id: "person", status: "start" });
        let meta = pastedPosting
          ? await parseJobMetaFromText(job_text).catch((e) => {
              console.error("[apply] parseJobMetaFromText failed", e);
              return null as JobMeta | null;
            })
          : await parseJobMeta(job_url).catch((e) => {
              console.error("[apply] parseJobMeta failed", e);
              return null as JobMeta | null;
            });
        if (!meta?.company) meta = await resumeMetaReady;

        const role = meta?.role ?? null;
        const company = meta?.company ?? null;
        const team = meta?.team ?? null;

        if (!company) {
          send({ type: "step", id: "person", status: "done", data: { name: null, role, company: null, searched: null, candidates: [] } });
          send({ type: "step", id: "email", status: "done", data: { email: null, guesses: [] } });
          send({ type: "step", id: "outreach", status: "done", channel: "email", data: null });
          return;
        }

        const composeIntent = intent || [role, company].filter(Boolean).join(" at ");

        let candidates: Awaited<ReturnType<typeof sourceHiringManagers>>["candidates"] = [];
        try {
          const sourced = await sourceHiringManagers({ role, company, team });
          candidates = sourced.candidates ?? [];
        } catch (e) {
          console.error("[apply] sourceHiringManagers failed", e);
        }
        send({ type: "candidates", data: candidates });
        collectedCandidates = candidates;

        const top = candidates[0] ?? null;
        if (!top) {
          const query = [team, role, company].filter(Boolean).join(" ");
          send({ type: "step", id: "person", status: "done", data: { name: null, role, company, searched: query, candidates: [] } });
          send({ type: "step", id: "email", status: "done", data: { email: null, guesses: [] } });
          send({ type: "step", id: "outreach", status: "done", channel: "email", data: null });
        } else {
          await pipeReachOut({
            text: top.name,
            intent: composeIntent || undefined,
            picked: { name: top.name, role: top.role ?? null, company: top.company ?? null, linkedin: top.linkedin ?? null },
            job_context: { role, company },
          });
        }
      };

      if (!resumeEnabled) settleResumeMeta(null);
      const resumePromise: Promise<TailoredResume | null> = resumeEnabled ? resumeTask() : Promise.resolve(null);
      const peoplePromise: Promise<void> = personEnabled ? peopleTask() : Promise.resolve();
      const questionsPromise: Promise<void> = runQuestionsDetection({ url: pastedPosting ? null : job_url, pastedText: pastedPosting ? job_text : null });

      const [resumeSettled] = await Promise.allSettled([resumePromise, peoplePromise, questionsPromise]);
      const tailored: TailoredResume | null = resumeSettled.status === "fulfilled" ? resumeSettled.value : null;
      collectedTailored = tailored;

      if (userId) {
        try {
          const { data, error } = await sb
            .from("job_applications")
            .insert({
              user_id: userId,
              job_url,
              job_json: tailored?.meta ?? null,
              application_qa: collectedQuestions.length ? { questions: collectedQuestions, answers: [] } : null,
              resume_generation_id: resumeGenerationId,
              person_id: personId,
              draft_id: draftId,
              status: "drafted",
            })
            .select("id")
            .single();
          if (error) throw error;
          if (data?.id) send({ type: "saved", id: data.id });
        } catch (e) {
          console.error("[job_applications] insert failed", e);
        }
      }

      runOutcome = "complete";
      send({ type: "complete" });
    } catch (e) {
      runError = String(e instanceof Error ? e.message : e);
      send({ type: "error", message: runError });
    } finally {
      const parsedBundle = collectedTailored
        ? {
            ats_score: collectedTailored.meta?.ats_score ?? null,
            ats_score_before: collectedTailored.meta?.ats_score_before ?? null,
            target_role: collectedTailored.meta?.target_role ?? null,
            target_company: collectedTailored.meta?.target_company ?? null,
            team: collectedTailored.meta?.team ?? null,
            resume: collectedTailored,
            role: collectedTailored.meta?.target_role ?? null,
            company: collectedTailored.meta?.target_company ?? null,
          }
        : null;
      // Drain any buffered step writes before the terminal write so the observer
      // never sees `complete` land before the steps that preceded it.
      const drain = (sink as Partial<DrainableSink>)._drain;
      if (drain) await drain().catch(() => {});
      const steps = (sink as Partial<DrainableSink>)._steps ?? [];
      await finalizeRun(composeRunId, userId, {
        outcome: runOutcome,
        error: runError,
        personId,
        resumeGenerationId,
        output: {
          parsed: parsedBundle,
          person: collectedPerson,
          enrichment: collectedEnrichment,
          candidates: collectedCandidates,
          drafts: collectedDrafts,
          contacts: Object.keys(collectedContacts).length ? collectedContacts : null,
          questions: collectedQuestions.length ? collectedQuestions : null,
        },
        steps,
      });
    }
  });
}
