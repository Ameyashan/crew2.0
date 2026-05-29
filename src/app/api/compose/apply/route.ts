import { NextRequest } from "next/server";
import { runResumeTailorStream } from "@/lib/agents/resume-tailor";
import { runReachOutStream } from "@/lib/agents/reach-out";
import { sourceHiringManagers } from "@/lib/claude";
import { authWalledJobHost } from "@/lib/job-url";
import type { TailoredResume } from "@/lib/agents/resume-tailor/types";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveUserId } from "@/lib/auth";
import { runWithUser } from "@/lib/user-context";

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

  if (!job_url) {
    return Response.json({ error: "job_url is required" }, { status: 400 });
  }
  if (!/^https?:\/\//i.test(job_url)) {
    return Response.json({ error: "job_url must be http(s)" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      await runWithUser(userId, async () => {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      let tailored: TailoredResume | null = null;
      let resumeGenerationId: string | null = null;
      let personId: string | null = null;
      let draftId: string | null = null;

      // Consume the reach-out agent (research → email → save → draft) for a
      // single person and remap its step ids onto the four-bar job UI.
      const pipeReachOut = async (reachInput: Parameters<typeof runReachOutStream>[0]) => {
        for await (const evt of runReachOutStream(reachInput)) {
          if (evt.type === "step" && evt.id === "research") {
            send({ type: "step", id: "person", status: evt.status, data: (evt as { data?: unknown }).data });
          } else if (evt.type === "step" && evt.id === "email_lookup") {
            send({ type: "step", id: "email", status: evt.status, data: (evt as { data?: unknown }).data });
          } else if (evt.type === "step" && evt.id === "person_saved") {
            personId = evt.data.id;
            send({ type: "person_saved", data: evt.data });
          } else if (evt.type === "step" && evt.id === "draft") {
            send({ type: "step", id: "outreach", status: evt.status, channel: evt.channel, data: (evt as { data?: unknown }).data });
            if (evt.status === "done" && evt.data && !draftId) draftId = evt.data.id;
          } else if (evt.type === "error") {
            send({ type: "error", message: evt.message });
          }
          // needs_disambiguation is intentionally ignored: in the job flow the
          // person is already chosen from the sourced shortlist (or re-picked),
          // so we let the draft proceed to the anchored candidate.
        }
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
          send({
            type: "error",
            message: `${walled} job links are behind a login wall, so Jugaadu can't read them. Paste a public posting URL instead — the company's careers page, or a Greenhouse / Lever / Ashby link.`,
          });
          return;
        }

        // ── Step 1: tailor the resume to this job
        send({ type: "step", id: "resume", status: "start" });
        for await (const evt of runResumeTailorStream({ job_url, page_count: 2 })) {
          if (evt.type === "step" && evt.id === "tailor" && evt.status === "done") {
            tailored = evt.data.resume;
          }
          if (evt.type === "saved") resumeGenerationId = evt.id;
          if (evt.type === "error") {
            send({ type: "step", id: "resume", status: "error", message: evt.message });
            send({ type: "error", message: evt.message });
            return;
          }
          // Pass progress through so the UI can render byte counts if we ever
          // want to surface them.
          if (evt.type === "progress") send({ type: "progress", id: "resume", chars: evt.chars, bullets: evt.bullets });
        }
        send({
          type: "step",
          id: "resume",
          status: "done",
          data: {
            resume_generation_id: resumeGenerationId,
            target_role: tailored?.meta?.target_role,
            target_company: tailored?.meta?.target_company,
            team: tailored?.meta?.team ?? null,
            ats_score: tailored?.meta?.ats_score,
            ats_score_before: tailored?.meta?.ats_score_before,
            resume: tailored,
          },
        });

        if (!tailored?.meta?.target_company) {
          send({
            type: "error",
            message:
              "Couldn't pull a company off the job posting. Try a more direct posting URL.",
          });
          return;
        }

        // ── Steps 2-4: source the hiring manager, then email + outreach draft.
        const role = tailored.meta.target_role ?? null;
        const company = tailored.meta.target_company;
        const team = tailored.meta.team ?? null;
        const composeIntent =
          intent || [role, company].filter(Boolean).join(" at ");

        // Step 2: source a ranked shortlist of likely hiring managers by
        // searching "[team] [role] [company]" (the way a candidate would).
        send({ type: "step", id: "person", status: "start" });
        let candidates: Awaited<ReturnType<typeof sourceHiringManagers>>["candidates"] = [];
        try {
          const sourced = await sourceHiringManagers({ role, company, team });
          candidates = sourced.candidates ?? [];
        } catch (e) {
          console.error("[apply] sourceHiringManagers failed", e);
        }
        send({ type: "candidates", data: candidates });

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
          // Step 3-4: anchor the proven downstream pipeline on the chosen person.
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

        send({ type: "complete" });
      } catch (e) {
        send({ type: "error", message: String(e instanceof Error ? e.message : e) });
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
