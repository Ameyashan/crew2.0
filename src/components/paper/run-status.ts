// Single source of truth for a run's status label, so every surface — the
// top-bar chip, the run card header, the Desk "Earlier runs" list, and the
// history page — speaks ONE lexicon instead of four ("in progress…" vs
// "RUNNING", "needs pick"/"error" vs "NEEDS YOU", "ready" vs "DONE"). Callers
// keep their own tone→colour maps; this only unifies which abstract state a run
// is in and the words shown for it.
//
// The canonical states:
//   running       — parsing/working/in_flight (the crew is on it)
//   reconnecting  — a working run whose live connection dropped; being re-observed
//   ready         — complete (the result is ready)
//   needs-you     — needs_disambiguation OR error (the crew needs a decision)

export type RunStatusState = "running" | "reconnecting" | "ready" | "needs-you";

export type RunStatusInput = {
  outcome?: string | null; // compose_runs.outcome
  status?: string | null; // resume_generations.status
  stage?: string | null; // client Run.stage (parsing|working|done|error)
  reconnecting?: boolean;
};

export function runStatusState(input: RunStatusInput): RunStatusState {
  const v = input.outcome ?? input.status ?? input.stage ?? null;
  let base: RunStatusState;
  switch (v) {
    case "complete":
    case "done":
      base = "ready";
      break;
    case "needs_disambiguation":
    case "error":
      base = "needs-you";
      break;
    case "in_flight":
    case "working":
    case "parsing":
    default:
      base = "running";
      break;
  }
  // `reconnecting` only qualifies a still-working run — a done/errored run is
  // terminal regardless of a stale live connection.
  if (base === "running" && input.reconnecting) return "reconnecting";
  return base;
}

// The word shown for each state (lowercase; surfaces uppercase as needed).
export const RUN_STATUS_LABEL: Record<RunStatusState, string> = {
  running: "running",
  reconnecting: "reconnecting",
  ready: "ready",
  "needs-you": "needs you",
};

export function runStatusLabel(input: RunStatusInput): string {
  return RUN_STATUS_LABEL[runStatusState(input)];
}
