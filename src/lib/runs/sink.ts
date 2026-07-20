// Where a durable run pipeline's progress events go.
//
// A run's pipeline emits the same event shapes it always did (`{type:"step",…}`,
// `{type:"progress",…}`, `{type:"complete"}`, …); a `sink` decides where they
// land:
//   • makeDbSink   — appends them to the run row's `steps` column (throttled)
//                    and keeps `heartbeat_at` fresh, so a client polling the row
//                    can render live progress and the cron worker can tell a live
//                    run from a dead one. Used by the durable (after()/worker) path.
//   • makeStreamSink — enqueues each event as an SSE `data:` frame, for the
//                    fast, user-present amendment paths (job re-pick, résumé
//                    regenerate) that still stream synchronously.
//
// The DB sink is parameterized by table + status column so the one implementation
// serves both compose_runs (status column `outcome`) and resume_generations
// (status column `status`); both use the sentinel value 'in_flight'.

import { supabaseAdmin } from "@/lib/supabase";

export type RunSink = { emit: (evt: unknown) => void };

// Internal shape the finalizer relies on to drain buffered writes and read the
// full step list before the terminal write.
export type DrainableSink = RunSink & {
  _drain: () => Promise<void>;
  _steps: unknown[];
};

function nowMs(): number {
  // A Date instance (not Date.now) keeps this usable where Date.now is stubbed;
  // the value is only used for write throttling.
  return new Date().getTime();
}

const FORCE_TYPES = new Set([
  "compose_run",
  "resume_run",
  "candidates",
  "complete",
  "error",
  "saved",
  "needs_job_text",
  "person_saved",
  "contact_meta",
  "needs_disambiguation",
  "kind_suggestion",
]);

function isForced(evt: unknown): boolean {
  const t = (evt as { type?: string })?.type;
  if (t && FORCE_TYPES.has(t)) return true;
  // A step reaching a terminal status is worth flushing immediately so the
  // observer's bar snaps to done rather than waiting out the throttle.
  if (t === "step") {
    const s = (evt as { status?: string }).status;
    return s === "done" || s === "error" || s === "skipped";
  }
  return false;
}

// A sink that appends events to <table>.steps and keeps heartbeat_at fresh,
// throttled to at most one write per second (forced on meaningful transitions)
// so per-char résumé progress can't hammer Postgres. The guard on
// statusColumn='in_flight' means a flush after the row has been finalized (by
// this executor or a racing worker) is a harmless no-op.
export function makeDbSink(opts: { table: string; id: string; statusColumn: string }): DrainableSink {
  const { table, id, statusColumn } = opts;
  const steps: unknown[] = [];
  let lastFlush = 0;
  let pending: Promise<void> | null = null;
  let dirty = false;

  const flush = async () => {
    dirty = false;
    lastFlush = nowMs();
    try {
      await supabaseAdmin()
        .from(table)
        .update({ steps, heartbeat_at: new Date().toISOString() })
        .eq("id", id)
        .eq(statusColumn, "in_flight");
    } catch (e) {
      console.error(`[${table}] steps flush failed`, e);
    }
  };

  return {
    emit(evt) {
      steps.push(evt);
      dirty = true;
      const due = nowMs() - lastFlush >= 1000;
      if (isForced(evt) || due) {
        // Serialize flushes; coalesce anything piling up behind the current one.
        pending = (pending ?? Promise.resolve()).then(flush);
      }
    },
    async _drain() {
      if (dirty) pending = (pending ?? Promise.resolve()).then(flush);
      if (pending) await pending;
    },
    _steps: steps,
  };
}

// A sink that enqueues each event as an SSE `data:` frame — the re-pick /
// regenerate amendment paths, so their client readers see the same stream.
export function makeStreamSink(controller: ReadableStreamDefaultController, encoder: TextEncoder): RunSink {
  return {
    emit(evt) {
      try {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
      } catch {
        // Stream already closed/cancelled — drop the event rather than throw.
      }
    },
  };
}
