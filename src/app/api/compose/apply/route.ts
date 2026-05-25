import { NextRequest } from "next/server";
import { runResumeTailorStream } from "@/lib/agents/resume-tailor";
import { runReachOutStream } from "@/lib/agents/reach-out";
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

      try {
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
        for await (const evt of runResumeTailorStream({ job_url, page_count: 1 })) {
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
            ats_score: tailored?.meta?.ats_score,
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

        // ── Steps 2-4: identify hiring manager + email + outreach draft via reach-out.
        // Phrasing the seed as a free-text query keeps the existing classify()
        // happy and lets the research agent take over from there.
        const seed = `hiring manager for ${tailored.meta.target_role || "this role"} at ${tailored.meta.target_company}`;
        const composeIntent =
          intent ||
          [tailored.meta.target_role, tailored.meta.target_company]
            .filter(Boolean)
            .join(" at ");

        for await (const evt of runReachOutStream({ text: seed, intent: composeIntent })) {
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
          } else if (evt.type === "needs_disambiguation") {
            send({ type: "needs_disambiguation", data: evt.data });
          } else if (evt.type === "error") {
            send({ type: "error", message: evt.message });
          }
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
