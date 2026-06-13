import { NextRequest } from "next/server";
import { runResumeTailorStream } from "@/lib/agents/resume-tailor";
import { runReachOutStream } from "@/lib/agents/reach-out";
import { sourceHiringManagers, parseJobMeta, findJobOpening, type JobMeta } from "@/lib/claude";
import { authWalledJobHost } from "@/lib/job-url";
import type { TailoredResume } from "@/lib/agents/resume-tailor/types";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveUserId } from "@/lib/auth";
import { runWithUser } from "@/lib/user-context";
import { agentEnabled, parseAgents } from "@/lib/agent-selection";

export const runtime = "nodejs";
export const maxDuration = 180;

// POST /api/compose/apply { job_url, intent? }
//
// Streams a four-step pipeline (resume → person → email → outreach) so the
// /app/compose "working" UI can light up its four progress bars. Internally
// it pipes the existing resume-tailor and reach-out agents end-to-end and
// records one job_applications row.
export async function POST(req: NextRequest) {
  const userId = await resolveUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const job_url = (body?.job_url ?? "").toString().trim();
  const intent = body?.intent ? body.intent.toString() : undefined;
  // A screenshot-driven job run may name the person who posted the role (the
  // recruiter / hiring manager who announced it). When present, we reach out to
  // them directly instead of sourcing a hiring manager from scratch.
  const posterName = body?.person_name ? body.person_name.toString().trim() : "";
  // The role/company the vision pass read off the screenshot. Used to search for
  // the real opening when the screenshot link can't be fetched, and as a fallback
  // when the posting itself won't parse.
  const detectedRole = body?.detected_role ? body.detected_role.toString().trim() : "";
  const detectedCompany = body?.detected_company ? body.detected_company.toString().trim() : "";

  // Crew selector (Phase 2). Undefined → run the whole four-agent pipeline.
  // Resume Darzi is independent; the people pipeline (Person Khoji → Email
  // Wallah → Outreach Bhai) is gated as a unit on 'person', with 'email' and
  // 'outreach' gated individually inside the reach-out agent.
  const agents = parseAgents(body?.agents);
  const resumeEnabled = agentEnabled(agents, "resume");
  const personEnabled = agentEnabled(agents, "person");

  // Re-pick: when the user clicks a different candidate in the UI, we re-run
  // only the email + draft for that person (no resume, no sourcing).
  const picked = body?.picked
    ? {
        name: (body.picked.name ?? "").toString(),
        role: body.picked.role ? body.picked.role.toString() : null,
        company: body.picked.company ? body.picked.company.toString() : null,
        linkedin: body.picked.linkedin ? body.picked.linkedin.toString() : null,
      }
    : null;

  // The role/company of the job being applied to. On a re-pick the client sends
  // it (the resume meta lives on the client by then); on a fresh run we derive
  // it below from the tailored resume. Anchors the outreach draft.
  const job_context = body?.job_context
    ? {
        role: body.job_context.role ? body.job_context.role.toString() : null,
        company: body.job_context.company ? body.job_context.company.toString() : null,
      }
    : null;

  // A screenshot-driven run can carry a named poster and/or a detected
  // role+company instead of a usable URL — the server resolves the real opening
  // from those. Outside that mode we still require a fetchable job_url.
  const screenshotMode = !!posterName || !!(detectedRole && detectedCompany);
  if (!job_url && !screenshotMode) {
    return Response.json({ error: "job_url is required" }, { status: 400 });
  }
  if (job_url && !/^https?:\/\//i.test(job_url)) {
    return Response.json({ error: "job_url must be http(s)" }, { status: 400 });
  }

  // Insert the compose_runs row up front so a job run kicked off on mobile shows
  // up on desktop. Re-picks are amendments to the original run rather than a new
  // session, but for simplicity we still record them — the client can dedupe.
  let composeRunId: string | null = null;
  try {
    const { data, error } = await supabaseAdmin()
      .from("compose_runs")
      .insert({
        user_id: userId,
        kind: "job",
        input: job_url || [detectedRole, detectedCompany].filter(Boolean).join(" at ") || posterName,
        intent: intent ?? null,
        picked: picked ?? null,
        outcome: "in_flight",
      })
      .select("id")
      .single();
    if (error) throw error;
    composeRunId = data?.id ?? null;
  } catch (e) {
    console.error("[compose_runs] insert failed", e);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      await runWithUser(userId, async () => {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          // Stream already closed/cancelled (e.g. the client navigated away, or
          // one parallel branch errored and the client stopped reading). Drop
          // the event rather than let a late enqueue from the other branch throw.
        }
      };

      let resumeGenerationId: string | null = null;
      let personId: string | null = null;
      let draftId: string | null = null;

      // Collected for compose_runs.output so the history page can reconstruct
      // the package card (parsed bundle, person research, email enrichment).
      const collectedDrafts: unknown[] = [];
      let collectedPerson: unknown = null;
      let collectedEnrichment: unknown = null;
      let collectedCandidates: unknown[] | null = null;
      let collectedTailored: TailoredResume | null = null;
      // Dual-contact (screenshot) mode: the poster and the hiring manager, each
      // with their own research + email + drafts. Persisted to compose_runs.output
      // so /app/history can rebuild the toggle. Empty for legacy single-contact runs.
      type Contact = { person: unknown; enrichment: unknown; drafts: unknown[]; personId: string | null; draftId: string | null; sameAsPoster?: boolean };
      const collectedContacts: Record<string, Contact> = {};
      let runOutcome: "complete" | "error" | "needs_disambiguation" = "error";
      let runError: string | null = null;

      if (composeRunId) {
        send({ type: "compose_run", id: composeRunId });
      }

      // Consume the reach-out agent (research → email → save → draft) for a
      // single person and remap its step ids onto the four-bar job UI.
      const pipeReachOut = async (reachInput: Parameters<typeof runReachOutStream>[0]) => {
        for await (const evt of runReachOutStream({
          ...reachInput,
          agents,
          compose_run_id: composeRunId ?? undefined,
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
            if (evt.status === "done" && evt.data) {
              if (!draftId) draftId = evt.data.id;
              collectedDrafts.push(evt.data);
            }
          } else if (evt.type === "error") {
            send({ type: "error", message: evt.message });
            runError = evt.message;
          } else if (evt.type === "needs_disambiguation") {
            // Research couldn't confirm the auto-picked person is the right,
            // currently-employed human — so don't draft to them. The research
            // "done" event already streamed name=null, and the sourced shortlist
            // went out via {type:"candidates"}; close the email + outreach bars
            // so the UI settles on "pick the right person" instead of hanging.
            collectedCandidates =
              Array.isArray(evt.data) && evt.data.length ? evt.data : collectedCandidates;
            send({ type: "step", id: "email", status: "done", data: { email: null, guesses: [] } });
            send({ type: "step", id: "outreach", status: "done", channel: "email", data: null });
          }
        }
      };

      // Dual-contact variant of pipeReachOut: run the reach-out pipeline for ONE
      // slot ("poster" | "hiring_manager") and tag every step with that slot so
      // the client can drive a poster⇄hiring-manager toggle. A failure in one
      // slot becomes an honest dead-end for that slot only — it never takes the
      // other contact (or the résumé) down with it.
      const runContactSlot = async (
        slot: "poster" | "hiring_manager",
        reachInput: Parameters<typeof runReachOutStream>[0],
      ) => {
        const c: Contact = collectedContacts[slot] ?? {
          person: null, enrichment: null, drafts: [], personId: null, draftId: null,
        };
        collectedContacts[slot] = c;
        send({ type: "step", id: "person", slot, status: "start" });
        try {
          for await (const evt of runReachOutStream({
            ...reachInput,
            agents,
            compose_run_id: composeRunId ?? undefined,
          })) {
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
              // One contact failed — mark its slot done-empty and keep going.
              send({ type: "step", id: "person", slot, status: "done", data: { name: null, role: null, company: null, searched: null, candidates: [] } });
              send({ type: "step", id: "email", slot, status: "done", data: { email: null, guesses: [] } });
              send({ type: "step", id: "outreach", slot, status: "done", channel: "email", data: null });
            } else if (evt.type === "needs_disambiguation") {
              // Couldn't confirm this slot's person is the right, currently-employed
              // human — close email + outreach so the slot settles on a re-pick
              // rather than drafting to the wrong person. (Research already
              // streamed name=null for the person step.)
              send({ type: "step", id: "email", slot, status: "done", data: { email: null, guesses: [] } });
              send({ type: "step", id: "outreach", slot, status: "done", channel: "email", data: null });
            }
          }
        } catch (e) {
          console.error(`[apply] contact slot ${slot} failed`, e);
          send({ type: "step", id: "outreach", slot, status: "done", channel: "email", data: null });
        }
      };

      // Resolve a fetchable opening for a screenshot run: if the screenshot's link
      // is unfetchable (LinkedIn/lnkd.in share) or missing, search the open web for
      // the company's real posting so the résumé tailor + hiring-manager sourcing
      // have a JD to work from.
      const resolveOpening = async (): Promise<{ url: string | null; team: string | null }> => {
        if (job_url && !authWalledJobHost(job_url)) return { url: job_url, team: null };
        if (!detectedCompany) return { url: null, team: null };
        const found = await findJobOpening({ role: detectedRole || null, company: detectedCompany }).catch(
          (e) => { console.error("[apply] findJobOpening failed", e); return null; },
        );
        return { url: found?.job_url ?? null, team: found?.team ?? null };
      };

      try {
        // ── Re-pick path: the user clicked a different candidate. Skip resume +
        // sourcing and just re-run email + draft for that person.
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

        // ── Screenshot dual-contact flow: tailor the résumé against the real
        // opening, and surface BOTH the person who posted the role and the
        // most-probable hiring manager — each with their own email + drafts.
        if (screenshotMode) {
          const { url: openingUrl, team: openingTeam } = await resolveOpening();

          // Branch A — résumé. Tailor against the resolved opening; if we never
          // found a fetchable URL, fall back to a role/company brief. A résumé
          // failure here is non-fatal (the contacts still ship).
          const resumeTask = async (): Promise<TailoredResume | null> => {
            if (!resumeEnabled) return null;
            send({ type: "step", id: "resume", status: "start" });
            const tailorInput = openingUrl
              ? { job_url: openingUrl, page_count: 2 as const }
              : {
                  page_count: 2 as const,
                  highlights: [
                    detectedRole && `Target role: ${detectedRole}`,
                    detectedCompany && `Company: ${detectedCompany}`,
                    intent,
                  ].filter(Boolean).join("\n"),
                };
            let resume: TailoredResume | null = null;
            try {
              for await (const evt of runResumeTailorStream(tailorInput)) {
                if (evt.type === "step" && evt.id === "tailor" && evt.status === "done") resume = evt.data.resume;
                if (evt.type === "saved") resumeGenerationId = evt.id;
                if (evt.type === "error") {
                  // Non-fatal: report the résumé step as errored but keep the run alive.
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
              type: "step", id: "resume", status: "done",
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

          // Branch B — the two contacts.
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
            const team = meta?.team ?? openingTeam ?? null;
            const composeIntent = intent || [role, company].filter(Boolean).join(" at ") || undefined;
            const jc = { role, company };
            const samePerson = (n?: string | null) =>
              !!posterName && !!n && n.trim().toLowerCase() === posterName.trim().toLowerCase();

            // Poster contact — the human who announced the role.
            const posterTask = posterName
              ? runContactSlot("poster", { text: posterName, intent: composeIntent, job_context: jc })
              : Promise.resolve();

            // Hiring-manager contact — sourced from role/company/team, skipping the
            // poster (already covered) and collapsing when they're the same person.
            const hmTask = (async () => {
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
                  // The poster IS the hiring manager — collapse to one contact.
                  collectedContacts["hiring_manager"] = {
                    person: null, enrichment: null, drafts: [], personId: null, draftId: null, sameAsPoster: true,
                  };
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
            })();

            await Promise.allSettled([posterTask, hmTask]);
          };

          const [resumeSettled] = await Promise.allSettled([resumeTask(), peopleTask()]);
          collectedTailored = resumeSettled.status === "fulfilled" ? resumeSettled.value : null;

          // Mirror the primary (poster, else hiring manager) onto the legacy
          // collected* fields so job_applications + history keep a single contact.
          const primary = collectedContacts["poster"] ?? collectedContacts["hiring_manager"] ?? null;
          if (primary) {
            collectedPerson = primary.person;
            collectedEnrichment = primary.enrichment;
            if (Array.isArray(primary.drafts)) collectedDrafts.push(...primary.drafts);
            personId = primary.personId ?? personId;
            draftId = primary.draftId ?? draftId;
          }

          try {
            const { data, error } = await supabaseAdmin()
              .from("job_applications")
              .insert({
                user_id: userId,
                job_url: openingUrl || job_url || null,
                job_json: collectedTailored?.meta ?? null,
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

          runOutcome = "complete";
          send({ type: "complete" });
          return;
        }

        // ── Step 0: bail early on login-walled boards (LinkedIn, etc.). Their
        // postings can't be fetched, so skip the doomed API call and tell the
        // user to use a public posting URL.
        const walled = authWalledJobHost(job_url);
        if (walled) {
          send({
            type: "step",
            id: "resume",
            status: "error",
            message: `${walled} job links are behind a login wall, so Jugaadu can't read them.`,
          });
          runError = `${walled} job links are behind a login wall, so Jugaadu can't read them. Paste a public posting URL instead — the company's careers page, or a Greenhouse / Lever / Ashby link.`;
          runOutcome = "error";
          send({ type: "error", message: runError });
          return;
        }

        // ── Run the resume tailor and the people pipeline CONCURRENTLY.
        // Person Khoji (+ Email Wallah + Outreach Bhai) only needs the job's
        // role/company/team, which we read straight off the posting with a fast
        // parseJobMeta call — so it no longer waits for the much slower resume
        // tailoring. The resume's own meta is exposed via resumeMetaReady as a
        // fallback, preserving the old behavior when parseJobMeta flakes.
        let settleResumeMeta!: (m: JobMeta | null) => void;
        let resumeMetaSettled = false;
        const resumeMetaReady = new Promise<JobMeta | null>((resolve) => {
          settleResumeMeta = (m) => {
            if (resumeMetaSettled) return;
            resumeMetaSettled = true;
            resolve(m);
          };
        });

        // ── Branch A: tailor the resume (the long pole). Returns the tailored
        // resume so the outer scope can record it — assignments inside this
        // closure aren't visible to the outer flow analysis.
        const resumeTask = async (): Promise<TailoredResume | null> => {
          send({ type: "step", id: "resume", status: "start" });
          let resume: TailoredResume | null = null;
          try {
            for await (const evt of runResumeTailorStream({ job_url, page_count: 2 })) {
              if (evt.type === "step" && evt.id === "tailor" && evt.status === "done") {
                resume = evt.data.resume;
              }
              if (evt.type === "saved") resumeGenerationId = evt.id;
              if (evt.type === "error") {
                send({ type: "step", id: "resume", status: "error", message: evt.message });
                send({ type: "error", message: evt.message });
                return null;
              }
              // Pass progress through so the UI can render byte counts if we ever
              // want to surface them.
              if (evt.type === "progress") send({ type: "progress", id: "resume", chars: evt.chars, bullets: evt.bullets });
            }
          } finally {
            // Hand the resume's own metadata to the people branch as a fallback,
            // and never leave it awaiting a resolution that won't arrive.
            settleResumeMeta(
              resume?.meta
                ? {
                    role: resume.meta.target_role ?? null,
                    company: resume.meta.target_company ?? null,
                    team: resume.meta.team ?? null,
                  }
                : null
            );
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

        // ── Branch B: Person Khoji → Email Wallah → Outreach Bhai.
        const peopleTask = async () => {
          // Light Agent 2 up immediately so the parallelism is visible, instead
          // of sitting "queued…" until the resume finishes.
          send({ type: "step", id: "person", status: "start" });

          // Fast path: pull role/company/team straight off the posting. Fall
          // back to the resume's own meta only if this flakes.
          let meta = await parseJobMeta(job_url).catch((e) => {
            console.error("[apply] parseJobMeta failed", e);
            return null as JobMeta | null;
          });
          if (!meta?.company) meta = await resumeMetaReady;

          const role = meta?.role ?? null;
          const company = meta?.company ?? null;
          const team = meta?.team ?? null;

          if (!company) {
            // No company from either source — honest dead-end for the people
            // steps (the resume branch reports its own status separately).
            send({
              type: "step",
              id: "person",
              status: "done",
              data: { name: null, role, company: null, searched: null, candidates: [] },
            });
            send({ type: "step", id: "email", status: "done", data: { email: null, guesses: [] } });
            send({ type: "step", id: "outreach", status: "done", channel: "email", data: null });
            return;
          }

          const composeIntent = intent || [role, company].filter(Boolean).join(" at ");

          // Source a ranked shortlist of likely hiring managers by searching
          // "[team] [role] [company]" (the way a candidate would).
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
            // Honest dead-end: name the query we ran so the user knows what to fix.
            const query = [team, role, company].filter(Boolean).join(" ");
            send({
              type: "step",
              id: "person",
              status: "done",
              data: { name: null, role, company, searched: query, candidates: [] },
            });
            send({ type: "step", id: "email", status: "done", data: { email: null, guesses: [] } });
            send({ type: "step", id: "outreach", status: "done", channel: "email", data: null });
          } else {
            // Anchor the proven downstream pipeline on the chosen person.
            await pipeReachOut({
              text: top.name,
              intent: composeIntent || undefined,
              picked: {
                name: top.name,
                role: top.role ?? null,
                company: top.company ?? null,
                linkedin: top.linkedin ?? null,
              },
              // Anchor the cold email on the JOB's role/company (not the intent),
              // so the subject/body never drift to a company the user only
              // mentioned in passing.
              job_context: { role, company },
            });
          }
        };

        // Crew selector: only run the branches the user kept. Resume Darzi off
        // → skip Branch A (and settle the meta promise now so Branch B's
        // fallback await can't hang). Person Khoji off → skip Branch B entirely
        // (its dependents, Email & Outreach, can't run without a target).
        if (!resumeEnabled) settleResumeMeta(null);
        const resumePromise: Promise<TailoredResume | null> =
          resumeEnabled ? resumeTask() : Promise.resolve(null);
        const peoplePromise: Promise<void> =
          personEnabled ? peopleTask() : Promise.resolve();

        // Wait for BOTH branches before recording/closing. allSettled (not all)
        // so a thrown error in one branch can't leave the other enqueuing onto a
        // closed stream — each branch already surfaces its own errors via send().
        const [resumeSettled] = await Promise.allSettled([resumePromise, peoplePromise]);
        const tailored: TailoredResume | null =
          resumeSettled.status === "fulfilled" ? resumeSettled.value : null;
        collectedTailored = tailored;

        // Record the bundle. Soft FKs — failure to insert is non-fatal so the
        // client still sees the drafts in the SSE stream.
        try {
          const { data, error } = await supabaseAdmin()
            .from("job_applications")
            .insert({
              user_id: userId,
              job_url,
              job_json: tailored?.meta ?? null,
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

        runOutcome = "complete";
        send({ type: "complete" });
      } catch (e) {
        runError = String(e instanceof Error ? e.message : e);
        send({ type: "error", message: runError });
      } finally {
        // Sole close for every path (early returns above just `return`). Guard
        // against a double-close throwing out of start() — on buffered
        // serverless streaming that rejection surfaces as an HTTP 500 and
        // discards the graceful SSE error we already enqueued.
        try {
          controller.close();
        } catch {
          // already closed
        }

        // Persist the final compose_runs state. Mirrors what runs-store.ts
        // patches into the run on stream end, so /app/history can reconstruct
        // the package card on any device.
        if (composeRunId) {
          try {
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
            await supabaseAdmin()
              .from("compose_runs")
              .update({
                person_id: personId,
                resume_generation_id: resumeGenerationId,
                output: {
                  parsed: parsedBundle,
                  person: collectedPerson,
                  enrichment: collectedEnrichment,
                  candidates: collectedCandidates,
                  drafts: collectedDrafts,
                  contacts: Object.keys(collectedContacts).length ? collectedContacts : null,
                },
                outcome: runOutcome,
                error: runError,
                completed_at: new Date().toISOString(),
              })
              .eq("id", composeRunId)
              .eq("user_id", userId);
          } catch (e) {
            console.error("[compose_runs] update failed", e);
          }
        }
      }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
