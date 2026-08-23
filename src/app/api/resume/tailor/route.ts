import { NextRequest, after } from "next/server";
import { runResumeTailorStreamPersisted } from "@/lib/agents/resume-tailor/persisted";
import { resolveUserId } from "@/lib/auth";
import { runWithUser } from "@/lib/user-context";
import { assertAnonRunAllowed } from "@/lib/anon-rate-limit";
import { supabaseAdmin } from "@/lib/supabase";
import { runResumePipeline, type ResumePayload } from "@/lib/runs/execute-resume";
import { makeDbSink } from "@/lib/runs/sink";
import { coercePageCount } from "@/lib/agents/resume-tailor/types";

export const runtime = "nodejs";
export const maxDuration = 120;

// Stream the tailor synchronously (SSE), persisting via the resume_generations
// wrapper. Used for the fast, user-present amendments — the "regenerate with
// notes" flow on a finished job run — and for anonymous runs (which persist
// nothing and just surface the honest "no resume on file" error).
function streamTailor(
  userId: string | null,
  input: { job_url?: string; highlights?: string; page_count: 1 | 2; regenerate_notes?: string },
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      await runWithUser(userId, async () => {
        const send = (obj: unknown) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
          } catch {
            // stream already closed/cancelled — drop the event, keep working
          }
        };
        try {
          for await (const evt of runResumeTailorStreamPersisted(input)) {
            send(evt);
          }
        } catch (e) {
          send({ type: "error", message: String(e instanceof Error ? e.message : e) });
        }
        try {
          controller.close();
        } catch {
          // already closed
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

// POST /api/resume/tailor
//
// A fresh standalone résumé run (signed-in, no regenerate notes) is DURABLE: it
// persists a resume_generations row and drives the tailor in a background
// continuation (next/server `after()`) that outlives this request, so
// backgrounding the app no longer strands it. The client observes the row via
// /api/resume/history/[id]. A "regenerate with notes" amendment stays a live SSE
// stream (fast, user-present); anonymous runs stream too (nothing to persist).
export async function POST(req: NextRequest) {
  const userId = await resolveUserId();
  if (!userId) {
    const limited = await assertAnonRunAllowed(req);
    if (limited) return limited;
  }

  const body = await req.json().catch(() => ({}));
  const job_url = (body?.job_url ?? "").toString().trim();
  const highlights = body?.highlights ? body.highlights.toString() : undefined;
  const regenerate_notes = body?.regenerate_notes ? body.regenerate_notes.toString() : undefined;
  const page_count = coercePageCount(body?.page_count);

  if (!job_url && !highlights?.trim()) {
    return Response.json(
      { error: "Provide a job URL or a description of how to change the resume" },
      { status: 400 }
    );
  }
  if (job_url && !/^https?:\/\//i.test(job_url)) {
    return Response.json({ error: "job_url must be http(s)" }, { status: 400 });
  }

  const input = { job_url: job_url || undefined, highlights, page_count, regenerate_notes };

  // Amendment (regenerate) or anonymous → stream synchronously (as before).
  if (regenerate_notes || !userId) {
    return streamTailor(userId, input);
  }

  // Fresh standalone run → durable. Insert the row up front, run in the
  // background, return the generation id for the client to observe.
  const payload: ResumePayload = { job_url: job_url || undefined, highlights, page_count };
  const nowIso = new Date().toISOString();
  let generationId: string | null = null;
  try {
    const { data, error } = await supabaseAdmin()
      .from("resume_generations")
      .insert({
        user_id: userId,
        job_url: job_url || null,
        highlights: highlights?.trim() || null,
        page_count,
        payload,
        status: "in_flight",
        heartbeat_at: nowIso,
        locked_at: nowIso,
      })
      .select("id")
      .single();
    if (error) throw error;
    generationId = data?.id ?? null;
  } catch (e) {
    console.error("[resume_generations] insert failed", e);
  }

  if (!generationId) {
    return Response.json({ error: "could not start run" }, { status: 500 });
  }
  const genId = generationId;

  after(() => runResumePipeline(genId, makeDbSink({ table: "resume_generations", id: genId, statusColumn: "status" })));

  return Response.json({ generationId: genId, status: "in_flight" }, { status: 202 });
}
