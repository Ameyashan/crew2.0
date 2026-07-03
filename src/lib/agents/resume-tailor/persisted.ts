import { supabaseAdmin } from "@/lib/supabase";
import { currentUserId } from "@/lib/user-context";
import { runResumeTailorStream } from "./index";
import type { ResumeTailorInput, ResumeTailorStepEvent, TailoredResume } from "./types";

export type PersistedTailorEvent =
  | ResumeTailorStepEvent
  // The resume_generations row id, yielded before the agent starts so clients
  // can register it for drop recovery.
  | { type: "resume_run"; id: string };

// runResumeTailorStream wrapped with the resume_generations lifecycle:
// insert an `in_flight` row before streaming, finalize it complete/error
// after, then yield `saved` with the row id on success. Every tailor —
// standalone (/api/resume/tailor), inside a job compose run, or a regenerate —
// goes through here so it lands in resume history instead of living only in
// the caller's output blob.
//
// Must run inside runWithUser(). Consumers may bail out of the loop early
// (e.g. on an `error` event) — the `finally` still finalizes the row.
export async function* runResumeTailorStreamPersisted(
  input: ResumeTailorInput,
): AsyncGenerator<PersistedTailorEvent> {
  const sb = supabaseAdmin();
  const userId = currentUserId();

  let generationId: string | null = null;
  try {
    const { data, error } = await sb
      .from("resume_generations")
      .insert({
        user_id: userId,
        job_url: input.job_url || null,
        highlights: input.highlights?.trim() || null,
        regenerate_notes: input.regenerate_notes?.trim() || null,
        page_count: input.page_count,
        status: "in_flight",
      })
      .select("id")
      .single();
    if (error) throw error;
    generationId = data?.id ?? null;
  } catch (e) {
    // Non-fatal: a failed insert shouldn't block the tailor — the run just
    // won't appear in resume history. Log and keep going.
    console.error("[resume_generations] insert failed", e);
  }

  if (generationId) {
    yield { type: "resume_run", id: generationId };
  }

  let finalResume: TailoredResume | null = null;
  let errorMessage: string | null = null;
  let settled = false;
  const finalize = async () => {
    if (settled || !generationId) return;
    settled = true;
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
          error: finalResume
            ? null
            : (errorMessage ?? "The run ended before a resume was produced."),
          completed_at: new Date().toISOString(),
        })
        .eq("id", generationId)
        .eq("user_id", userId);
    } catch (e) {
      console.error("[resume_generations] update failed", e);
    }
  };

  let threw = false;
  try {
    for await (const evt of runResumeTailorStream(input)) {
      if (evt.type === "step" && evt.id === "tailor" && evt.status === "done") {
        finalResume = evt.data.resume;
      } else if (evt.type === "error") {
        // The agent yields errors as events (no resume on file, unreadable
        // posting) rather than throwing — capture them for the row.
        errorMessage = evt.message;
      }
      yield evt;
    }
  } catch (e) {
    errorMessage = String(e instanceof Error ? e.message : e);
    threw = true;
  } finally {
    // Runs on normal completion, on a thrown error, AND when the consumer
    // abandons the loop early — the row settles in every case.
    await finalize();
  }

  if (threw) {
    yield { type: "error", message: errorMessage ?? "resume tailoring failed" };
    return;
  }
  if (finalResume && generationId) {
    yield { type: "saved", id: generationId };
  }
}
