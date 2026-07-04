// Pure, render-free helpers for the run view (Phase 4 of the jugaadu reskin).
// Extracted from compose/page.tsx so they can be unit-tested under `node --test`
// — the page file imports React / next/navigation / Supabase and can't run in
// that context. Same split the Desk (desk-logic.ts) and top bar
// (top-bar-logic.ts) use: the component owns the side effects, these functions
// own the rules.
//
// Nothing here reaches into the DOM, localStorage, or Supabase directly.

// ── Status chip relabel ──────────────────────────────────────────────────────
// The run state machine (parsing / working / done / error) maps 1:1 onto the
// prototype's three status chips — a pure rename/recolor, no logic change:
//   parsing → RUNNING  (amber, pulsing)   — reading the input
//   working → RUNNING  (amber, pulsing)   — agents on it (RECONNECTING variant)
//   done    → DONE     (green)
//   error   → NEEDS YOU(amber)            — the crew needs a decision
export type RunStage = "parsing" | "working" | "done" | "error";
export type ChipTone = "running" | "done" | "attention";
export type StatusChip = { label: string; tone: ChipTone; pulse: boolean };

export function runStatusChip(
  stage: RunStage | string | null | undefined,
  opts: { reconnecting?: boolean } = {},
): StatusChip {
  switch (stage) {
    case "parsing":
      return { label: "RUNNING", tone: "running", pulse: true };
    case "working":
      return opts.reconnecting
        ? { label: "RECONNECTING", tone: "running", pulse: true }
        : { label: "RUNNING", tone: "running", pulse: true };
    case "done":
      return { label: "DONE", tone: "done", pulse: false };
    case "error":
      return { label: "NEEDS YOU", tone: "attention", pulse: false };
    default:
      // Unknown stage → treat as running so the card never renders chrome-less.
      return { label: "RUNNING", tone: "running", pulse: true };
  }
}

// Presentation for each abstract chip tone (token hexes, kept here so the chip
// colour is a single source of truth shared by the card header and any future
// consumer). RUNNING + NEEDS-YOU are both amber per the prototype; DONE is green.
export const CHIP_TONE_COLORS: Record<ChipTone, { color: string; bg: string; line: string }> = {
  running: { color: "#8a6d2f", bg: "#f4ecda", line: "#ecdfc0" },
  attention: { color: "#8a6d2f", bg: "#f4ecda", line: "#ecdfc0" },
  done: { color: "#3d7a4f", bg: "#e9f1e9", line: "#cfe0cf" },
};

// ── Thin-Story states ────────────────────────────────────────────────────────
// All driven by the single `storyIsEmpty` flag derived on the Desk (Phase 3,
// deriveStoryIsEmpty) and threaded down as a prop. When the account has no
// resume on file the crew is weaving from guesses, so every output panel wears a
// warning treatment. Copy strings live here so the panels stay markup-only.
export const THIN_STORY = {
  banner: "THIN STORY",
  // resume pull-review panel
  pullNote: "The crew is working from guesses — add your resume to weave from real material.",
  // ATS card
  atsHeader: "BUILT FROM A THIN STORY",
  atsNote: "passable, not sharp",
  atsNegative: "no baseline to lift from — scored cold against the JD",
  // people / drafts panel
  peopleWarn: "Drafts are running generic — add your resume so outreach speaks to real work.",
  cta: "Add resume",
} as const;

// The two generic entries the pull-review panel shows when the Story is thin —
// placeholders the crew inferred, not real Story material.
export const THIN_STORY_ENTRIES = [
  { title: "Generalist background", why: "inferred from the role — no Story entry to draw on" },
  { title: "Relevant experience", why: "a safe guess; add your resume to make this specific" },
] as const;

// Is this run's Story thin? A run that was seeded before a profile loaded is
// treated as thin only once we positively know the account has no resume.
export function isThinStory(storyIsEmpty: boolean | null | undefined): boolean {
  return storyIsEmpty === true;
}

// ── Signed-out blur gate ─────────────────────────────────────────────────────
// A run has gate-able output once it's done, or mid-run once any deliverable has
// landed. Mirrors the same "show the package" condition the RunCard already uses
// (done || (working && hasPartialResult)). `hasPartial` is injected so this stays
// free of the run-store's internals.
export function hasGateableOutput(
  run: { stage?: string | null } | null | undefined,
  hasPartial: boolean,
): boolean {
  if (!run) return false;
  return run.stage === "done" || (run.stage === "working" && hasPartial);
}

// Blur gate shows when the viewer is signed OUT and the run has output worth
// gating. Signed-in users never see it.
export function shouldBlurGate(args: {
  signedIn: boolean;
  run: { stage?: string | null } | null | undefined;
  hasPartial: boolean;
}): boolean {
  if (args.signedIn) return false;
  return hasGateableOutput(args.run, args.hasPartial);
}

// The flow-specific summary line on the gate overlay card.
export function gateSummary(kind: string | null | undefined): string {
  switch (kind) {
    case "job":
      return "Your tailored resume, the hiring manager, and a cold email are ready.";
    case "person":
      return "The person is verified and your outreach is drafted across every channel.";
    default:
      return "Your crew's work is ready and waiting.";
  }
}

// ── Anonymous route allow-list ───────────────────────────────────────────────
// The server gate (src/app/app/layout.tsx) hard-redirects signed-out traffic to
// "/" for every /app/* route EXCEPT the ones here. Today only the Desk itself is
// reachable signed-out (try-before-sign-in); every other /app route and all
// writes stay gated exactly as before.
export const ANON_ALLOWED_PATHS = ["/app/compose"] as const;

export function isAnonAllowedPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  // Exact match or a nested segment of an allowed base (e.g. /app/compose/x).
  return ANON_ALLOWED_PATHS.some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  );
}

// ── pendingRun persistence ───────────────────────────────────────────────────
// A run started while signed-out is stashed (sessionStorage, which survives the
// same-origin OAuth + onboarding redirect) so we can re-open it "unlocked" once
// the user is back. We persist enough to reconstruct the run, never the File
// blob itself (only its name, for the chip) — the user re-attaches if needed.
export const PENDING_RUN_KEY = "crew.pendingRun.v1";

export type PendingRun = {
  input: string;
  intent: string;
  kind: "job" | "person" | "fuzzy" | null;
  providedEmail: boolean;
  selectedAgents: string[];
  screenshotName: string | null;
  at: number;
};

export function serializePendingRun(
  r: Partial<PendingRun> & { input?: string },
  now: number = Date.now(),
): string {
  const payload: PendingRun = {
    input: r.input ?? "",
    intent: r.intent ?? "",
    kind: r.kind ?? null,
    providedEmail: !!r.providedEmail,
    selectedAgents: Array.isArray(r.selectedAgents) ? r.selectedAgents : [],
    screenshotName: r.screenshotName ?? null,
    at: r.at ?? now,
  };
  return JSON.stringify(payload);
}

// Parse a stashed pendingRun back out. Tolerates junk/missing fields and returns
// null when there's nothing usable (no input AND no screenshot to reconstruct).
export function parsePendingRun(raw: string | null | undefined): PendingRun | null {
  if (!raw) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const input = typeof o.input === "string" ? o.input : "";
  const screenshotName = typeof o.screenshotName === "string" ? o.screenshotName : null;
  if (!input.trim() && !screenshotName) return null;
  const kind = o.kind === "job" || o.kind === "person" || o.kind === "fuzzy" ? o.kind : null;
  return {
    input,
    intent: typeof o.intent === "string" ? o.intent : "",
    kind,
    providedEmail: o.providedEmail === true,
    selectedAgents: Array.isArray(o.selectedAgents)
      ? o.selectedAgents.filter((s): s is string => typeof s === "string")
      : [],
    screenshotName,
    at: typeof o.at === "number" ? o.at : 0,
  };
}
