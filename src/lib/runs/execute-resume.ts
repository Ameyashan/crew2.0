// Durable executor for a standalone résumé-tailor run.
//
// The standalone résumé path (/api/resume/tailor) used to run the tailor inside
// an SSE ReadableStream, so it died when the client backgrounded. It now runs
// here off the persisted resume_generations row, scheduled via next/server
// after() with the cron-worker backstop.
//
// The row is inserted by the route (with payload) BEFORE this runs, so this uses
// the RAW runResumeTailorStream (not the runResumeTailorStreamPersisted wrapper,
// which would insert a second row) and finalizes the existing row. The embedded
// résumé inside a job compose run keeps using the persisted wrapper unchanged.

import { runResumeTailorStream } from "@/lib/agents/resume-tailor";
import type { ResumeTailorInput, TailoredResume } from "@/lib/agents/resume-tailor/types";
import { supabaseAdmin } from "@/lib/supabase";
import { runWithUser } from "@/lib/user-context";
import type { RunSink, DrainableSink } from "./sink";

// Inputs captured on the resume_generations row so a fresh worker can re-run.
export type ResumePayload = {
  job_url?: string;
  highlights?: string;
  page_count: 1 | 2;
  regenerate_notes?: string;
};

// Finalize the existing row. Idempotent: only writes while status is in_flight,
// so a worker re-run racing the original after() can't clobber a settled row.
async function finalizeResumeRun(
  generationId: string,
  args: { resume: TailoredResume | null; error: string | null; steps: unknown[] },
) {
  const { resume } = args;
  try {
    await supabaseAdmin()
      .from("resume_generations")
      .update({
        target_role: resume?.meta.target_role ?? null,
        target_company: resume?.meta.target_company ?? null,
        model: resume?.meta.model ?? null,
        resume,
        ats_score: resume?.meta.ats_score ?? null,
        status: resume ? "complete" : "error",
        error: resume ? null : (args.error ?? "The run ended before a resume was produced."),
        steps: args.steps,
        heartbeat_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .eq("id", generationId)
      .eq("status", "in_flight");
  } catch (e) {
    console.error("[resume_generations] finalize failed", e);
  }
}

// Load a résumé generation's row and drive the tailor to completion, emitting
// progress through `sink`. Establishes its own user context from the row.
// Idempotent at the row level — a terminal row is a no-op.
export async function runResumePipeline(generationId: string, sink: RunSink): Promise<void> {
  const sb = supabaseAdmin();
  const { data: row, error: loadErr } = await sb
    .from("resume_generations")
    .select("id, user_id, payload, status")
    .eq("id", generationId)
    .maybeSingle();
  if (loadErr || !row) {
    console.error("[runResumePipeline] row load failed", loadErr);
    return;
  }
  if (row.status && row.status !== "in_flight") return;

  const userId: string | null = row.user_id ?? null;
  const p: ResumePayload = (row.payload as ResumePayload) ?? { page_count: 1 };

  await runWithUser(userId, async () => {
    const send = (obj: unknown) => sink.emit(obj);

    const input: ResumeTailorInput = {
      job_url: p.job_url || undefined,
      highlights: p.highlights,
      page_count: p.page_count === 2 ? 2 : 1,
      regenerate_notes: p.regenerate_notes,
    };

    let finalResume: TailoredResume | null = null;
    let errorMessage: string | null = null;

    try {
      for await (const evt of runResumeTailorStream(input)) {
        if (evt.type === "step" && evt.id === "tailor" && evt.status === "done") {
          finalResume = evt.data.resume;
        } else if (evt.type === "error") {
          errorMessage = evt.message;
        }
        send(evt);
      }
    } catch (e) {
      errorMessage = String(e instanceof Error ? e.message : e);
      send({ type: "error", message: errorMessage });
    } finally {
      const drain = (sink as Partial<DrainableSink>)._drain;
      if (drain) await drain().catch(() => {});
      const steps = (sink as Partial<DrainableSink>)._steps ?? [];
      await finalizeResumeRun(generationId, { resume: finalResume, error: errorMessage, steps });
    }
  });
}
