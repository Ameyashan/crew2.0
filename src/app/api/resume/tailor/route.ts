import { NextRequest } from "next/server";
import { runResumeTailorStream } from "@/lib/agents/resume-tailor";
import type { TailoredResume } from "@/lib/agents/resume-tailor/types";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveUserId } from "@/lib/auth";
import { runWithUser } from "@/lib/user-context";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const userId = await resolveUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const job_url = (body?.job_url ?? "").toString().trim();
  const highlights = body?.highlights ? body.highlights.toString() : undefined;
  const regenerate_notes = body?.regenerate_notes
    ? body.regenerate_notes.toString()
    : undefined;
  const pageRaw = Number(body?.page_count);
  const page_count: 1 | 2 = pageRaw === 2 ? 2 : 1;

  if (!job_url && !highlights?.trim()) {
    return Response.json(
      { error: "Provide a job URL or a description of how to change the resume" },
      { status: 400 }
    );
  }
  if (job_url && !/^https?:\/\//i.test(job_url)) {
    return Response.json({ error: "job_url must be http(s)" }, { status: 400 });
  }

  // Insert the row up front (status in_flight) so a run that dies mid-stream —
  // navigation, tab reclaim, serverless timeout — is still visible in History,
  // and the client can poll it back to life. Finalized after the stream.
  const sb = supabaseAdmin();
  let generationId: string | null = null;
  try {
    const { data, error } = await sb
      .from("resume_generations")
      .insert({
        user_id: userId,
        job_url: job_url || null,
        highlights: highlights?.trim() || null,
        regenerate_notes: regenerate_notes?.trim() || null,
        page_count,
        status: "in_flight",
      })
      .select("id")
      .single();
    if (error) throw error;
    generationId = data?.id ?? null;
  } catch (e) {
    // Non-fatal: a failed insert shouldn't block the live stream — it just
    // means this run won't appear in /app/history. Log and keep going.
    console.error("[resume_generations] insert failed", e);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      await runWithUser(userId, async () => {
        let finalResume: TailoredResume | null = null;
        let errorMessage: string | null = null;

        // Guarded enqueue: once the client disconnects (navigated away, locked
        // phone) enqueue throws. Swallow it so the tailor keeps running to
        // completion and we still persist the result — the client recovers by
        // polling the generation row.
        const send = (obj: unknown) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
          } catch {
            // stream already closed/cancelled — drop the event, keep working
          }
        };

        try {
          if (generationId) {
            // Send the row id back so the client can stash it for recovery and
            // for reopening the run from /app/history.
            send({ type: "resume_run", id: generationId });
          }
          for await (const evt of runResumeTailorStream({
            job_url: job_url || undefined,
            highlights,
            page_count,
            regenerate_notes,
          })) {
            if (
              evt.type === "step" &&
              evt.id === "tailor" &&
              evt.status === "done"
            ) {
              finalResume = evt.data.resume;
            } else if (evt.type === "error") {
              // The agent yields errors as events (no resume on file, unreadable
              // posting) rather than throwing — capture them for the row.
              errorMessage = evt.message;
            }
            send(evt);
          }
          if (!finalResume && !errorMessage) {
            errorMessage = "The run ended before a resume was produced.";
          }
        } catch (e) {
          errorMessage = String(e instanceof Error ? e.message : e);
          send({ type: "error", message: errorMessage });
        }

        // Finalize the row BEFORE emitting `saved`/closing so the client's
        // follow-up history fetch is guaranteed to see the settled status.
        if (generationId) {
          try {
            await sb
              .from("resume_generations")
              .update({
                target_role: finalResume?.meta.target_role ?? null,
                target_company: finalResume?.meta.target_company ?? null,
                model: finalResume?.meta.model ?? null,
                resume: finalResume,
                ats_score: finalResume?.meta.ats_score ?? null,
                status: finalResume ? "complete" : "error",
                error: finalResume ? null : errorMessage,
                completed_at: new Date().toISOString(),
              })
              .eq("id", generationId)
              .eq("user_id", userId);
          } catch (e) {
            console.error("[resume_generations] update failed", e);
          }
        }

        if (finalResume && generationId) {
          send({ type: "saved", id: generationId });
        }
        // Guard against a double/late close throwing on a disconnected stream.
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
