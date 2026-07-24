// Durable executor for a person (reach-out) compose run.
//
// Twin of execute-apply.ts for the person path. The reach-out pipeline used to
// run inside the SSE ReadableStream of /api/compose, so it died when the client
// backgrounded. It now runs here off the persisted compose_runs row (kind
// 'person'), scheduled via next/server after() with the cron-worker backstop.
//
// A person run can be started from a screenshot. The raw upload isn't available
// to a background job, but identify-image already stored the image and the row
// carries its screenshot_id — so we reload the image from storage and hand it to
// research, exactly like the job path's loadScreenshotImage.

import { runReachOutStream, type RunReachOutInput } from "@/lib/agents/reach-out";
import { supabaseAdmin } from "@/lib/supabase";
import { runWithUser } from "@/lib/user-context";
import { parseAgents } from "@/lib/agent-selection";
import { isJobBoardUrl } from "@/lib/kind-detect";
import type { RunSink, DrainableSink } from "./sink";

// Inputs captured on the compose_runs row so a fresh worker can re-run with no
// client involvement.
export type PersonPayload = {
  text: string;
  intent?: string;
  picked?: RunReachOutInput["picked"] | null;
  provided_email?: string;
  screenshot_id?: string;
  agents?: unknown;
};

// Reload the uploaded screenshot from storage so research can read the person's
// title/company off the image (the disambiguation a human would use), instead of
// guessing from a bare name. Best-effort: a miss just means the name-only path.
async function loadScreenshotImage(
  screenshotId: string | undefined,
  userId: string | null,
): Promise<RunReachOutInput["intent_image"] | undefined> {
  if (!screenshotId || !userId) return undefined;
  try {
    const sb = supabaseAdmin();
    const { data: shot } = await sb
      .from("screenshots")
      .select("bucket, path, content_type")
      .eq("id", screenshotId)
      .eq("user_id", userId)
      .single();
    if (!shot?.path) return undefined;
    const { data: blob, error } = await sb.storage
      .from((shot.bucket as string) || "screenshots")
      .download(shot.path as string);
    if (error || !blob) return undefined;
    const buf = Buffer.from(await blob.arrayBuffer());
    return { data: buf.toString("base64"), media_type: (shot.content_type as string) || "image/png" };
  } catch (e) {
    console.error("[compose/person] loadScreenshotImage failed", e);
    return undefined;
  }
}

// Persist the terminal state. Idempotent: only writes while the row is still
// in_flight, so a worker re-run racing the original after() can't clobber a
// finalized row.
async function finalizePersonRun(
  composeRunId: string,
  args: {
    outcome: "complete" | "error" | "needs_disambiguation";
    error: string | null;
    intent: string | null;
    personId: string | null;
    output: Record<string, unknown>;
    steps: unknown[];
  },
) {
  try {
    await supabaseAdmin()
      .from("compose_runs")
      .update({
        person_id: args.personId,
        intent: args.intent,
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

// Load a person run's row and drive its reach-out pipeline to completion,
// emitting progress through `sink`. Establishes its own user context from the
// row. Idempotent at the row level — a terminal row is a no-op.
export async function runPersonPipeline(composeRunId: string, sink: RunSink): Promise<void> {
  const sb = supabaseAdmin();
  const { data: row, error: loadErr } = await sb
    .from("compose_runs")
    .select("id, user_id, anon_id, payload, outcome")
    .eq("id", composeRunId)
    .maybeSingle();
  if (loadErr || !row) {
    console.error("[runPersonPipeline] row load failed", loadErr);
    return;
  }
  if (row.outcome && row.outcome !== "in_flight") return;

  const userId: string | null = row.user_id ?? null;
  const p: PersonPayload = (row.payload as PersonPayload) ?? { text: "" };

  await runWithUser(userId, async () => {
    const send = (obj: unknown) => sink.emit(obj);

    const text = (p.text ?? "").toString();
    const intent = p.intent ? p.intent.toString() : undefined;
    const picked = p.picked ?? undefined;
    const provided_email = p.provided_email || undefined;
    const agents = parseAgents(p.agents);

    let person: unknown = null;
    let enrichment: unknown = null;
    let candidates: unknown[] | null = null;
    let personId: string | null = null;
    let outcome: "complete" | "error" | "needs_disambiguation" = "error";
    let errorMessage: string | null = null;
    const drafts: unknown[] = [];

    try {
      send({ type: "compose_run", id: composeRunId });

      const intent_image = await loadScreenshotImage(p.screenshot_id, userId);

      if (isJobBoardUrl(text) && !picked) {
        // The person flow was handed a job-board URL — tip the client off so a
        // research dead-end can offer the job path instead.
        send({ type: "kind_suggestion", suggest: "job" });
      }

      const input: RunReachOutInput = { text, intent, picked, intent_image, provided_email, agents };
      for await (const evt of runReachOutStream({ ...input, compose_run_id: composeRunId })) {
        send(evt);
        if (evt.type === "step" && evt.id === "research" && evt.status === "done") {
          person = evt.data;
        } else if (evt.type === "step" && evt.id === "email_lookup" && (evt.status === "done" || evt.status === "skipped")) {
          enrichment = evt.data;
        } else if (evt.type === "step" && evt.id === "person_saved") {
          personId = evt.data.id;
        } else if (evt.type === "step" && evt.id === "draft" && evt.status === "done") {
          drafts.push(evt.data);
        } else if (evt.type === "needs_disambiguation") {
          candidates = Array.isArray(evt.data) ? evt.data : null;
          outcome = "needs_disambiguation";
        } else if (evt.type === "complete") {
          if (outcome !== "needs_disambiguation") outcome = "complete";
        } else if (evt.type === "error") {
          outcome = "error";
          errorMessage = evt.message;
        }
      }
    } catch (e) {
      outcome = "error";
      errorMessage = String(e instanceof Error ? e.message : e);
      send({ type: "error", message: errorMessage });
    } finally {
      const drain = (sink as Partial<DrainableSink>)._drain;
      if (drain) await drain().catch(() => {});
      const steps = (sink as Partial<DrainableSink>)._steps ?? [];
      await finalizePersonRun(composeRunId, {
        outcome,
        error: errorMessage,
        // Backfill the effective intent: an explicit one wins, else the intent
        // research synthesized from the paste/screenshot (the one-box "who + why"
        // path stores null up front).
        intent:
          intent ??
          (person as { outreach_intent?: string | null } | null)?.outreach_intent ??
          null,
        personId,
        output: { person, enrichment, candidates, drafts },
        steps,
      });
    }
  });
}
