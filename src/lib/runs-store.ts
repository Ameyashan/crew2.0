// @ts-nocheck — loose `any` parsed shapes, ported from compose prototype v3
"use client";

import { useSyncExternalStore } from "react";
import { detectKind } from "@/lib/kind-detect";
import { normalizeCandidateKey } from "@/components/paper/run-view-logic";

// Shown when a signed-out visitor exceeds the anonymous-run cap (HTTP 429 from
// the compose/tailor routes). Nudges them to sign in rather than leaking a raw
// "failed: 429".
const ANON_LIMIT_MESSAGE =
  "You've used up your free tries. Sign in to keep your crew running.";

// Set the instant an outbound OAuth navigation begins (the Sign-in buttons call
// beginAuthNavigation() right before signInWithGoogle). A live run's streaming
// fetch is torn down by that navigation, and because the browser — not our
// AbortController — kills it, the abort surfaces as a generic fetch error
// ("Load failed" on WebKit). Without this flag the store would flip the run to a
// bogus error card in the split second before the page leaves for Google. Treat
// any drop during this window as an intentional teardown, not a failure.
let navigatingForAuth = false;
export function beginAuthNavigation() {
  navigatingForAuth = true;
}

/* ─────────────────────── types ─────────────────────── */

export type RunStage = "parsing" | "working" | "done" | "error";

// One contact in a dual-contact (screenshot) job run — the poster or the hiring
// manager — with its own research, email enrichment, and channel drafts.
export type ContactData = {
  person: unknown;
  enrichment: unknown;
  drafts: unknown[];
  sameAsPoster?: boolean;
};

// Real "just started" caption per step, keyed by the step id used in each
// stream path (job path: resume/person/email/outreach/application; person path:
// research/email_lookup/draft). Event-driven — shown the moment the agent's
// step-start event lands, describing what that agent genuinely does first —
// unlike the cosmetic STEP_ACTIVITY timer it supersedes.
const STEP_START_ACTIVITY: Record<string, string> = {
  resume: "reading the job description",
  person: "scanning the team for who decides",
  research: "scanning the team for who decides",
  email: "checking email patterns",
  email_lookup: "checking email patterns",
  outreach: "drafting your outreach — email, LinkedIn, X",
  draft: "drafting your outreach — email, LinkedIn, X",
  application: "reading the application form",
};

export type Run = {
  id: string;
  input: string;
  intent?: string;
  providedEmail?: boolean;
  kind: "person" | "job" | "resume";
  stage: RunStage;
  parsed: unknown;
  progress: Record<string, number>;
  // Real "what the agent is doing right now" caption per step, derived from the
  // stream's own events (a resume web_search, the bullet count as it grows, the
  // number of people sourced, which step just started) — NOT a cosmetic timer.
  // The run view prefers this over the hand-authored STEP_ACTIVITY fallback.
  activity?: Record<string, string> | null;
  drafts: unknown[] | null;
  enrichment: unknown;
  person: unknown;
  candidates: unknown[] | null;
  error: string | null;
  createdAt: number;
  // True while a dropped streaming connection is being recovered by polling the
  // persisted run (e.g. after the phone was locked mid-run). UI shows "reconnecting…".
  reconnecting?: boolean;
  // Resume "regenerate with notes" state (job runs only).
  regenerating?: boolean;
  regenError?: string | null;
  // "Another angle" draft-rewrite state. Holds the UI channel currently being
  // rewritten ('email' | 'linkedin' | 'x'), or null when idle.
  redrafting?: string | null;
  redraftError?: string | null;
  // Re-pick state (job runs): the name of the candidate a re-pick is currently
  // drafting for, or null when idle. While set, the person panel clears the
  // previous contact's email/drafts and reads "drafting for {name}…" instead of
  // showing the old person's message.
  picking?: string | null;
  // Latches once the user re-picks a candidate. The main run's stream is kept
  // alive (so the résumé finishes) but must no longer overwrite the person /
  // email / drafts the pick now owns — this flag tells the final consolidation
  // patch to preserve them.
  repicked?: boolean;
  // "Steer the draft" — free-form directive applied to all three channels at
  // once. `steering` is true while the parallel redraft is in flight.
  // `steerHistory` is a session-scoped list of recent directives (newest first,
  // capped at 3) surfaced as click-to-rerun chips.
  steering?: boolean;
  steerError?: string | null;
  steerHistory?: string[];
  // Screenshot-driven runs. `imageFile` is the raw File (client-only; forwarded
  // to the person pipeline as research context). `screenshot` is the display
  // meta shown in the card header. `screenshotId` is the id of the row in the
  // screenshots table after /api/identify-image — forwarded to /api/compose so
  // compose_runs.screenshot_id links the run back to the image.
  imageFile?: File | null;
  screenshot?: { name: string; size: string } | null;
  screenshotId?: string | null;
  // Screenshot-driven job run context. `fromScreenshot` switches the job path
  // into dual-contact mode; the rest is forwarded to /api/compose/apply so it can
  // resolve the real opening, tailor the résumé, and reach BOTH the poster
  // (the person who announced the role) and the sourced hiring manager.
  fromScreenshot?: boolean;
  screenshotJobUrl?: string | null;
  screenshotPersonName?: string | null;
  screenshotRole?: string | null;
  screenshotCompany?: string | null;
  // Dual-contact results: each slot holds its own research + email + drafts. The
  // package card toggles between them. `sameAsPoster` marks a hiring-manager slot
  // that collapsed into the poster (they're the same person).
  contacts?: {
    poster?: ContactData | null;
    hiring_manager?: ContactData | null;
  } | null;
  // The compose_runs row id reported back by the server once the stream starts.
  // Used by the history page to dedupe and to hydrate the right run.
  composeRunId?: string | null;
  // The agents the user opted into for this run (e.g. ['person', 'email', 'outreach']).
  // Frozen at startRun() time; the progress row filters to these. Phase 1 is
  // display-only — the backend still runs every agent.
  selectedAgents?: string[];
  // Resume-tailor runs (kind "resume"): the resume_generations row id (from the
  // stream's resume_run event; used for recovery and history dedupe), the live
  // "chars/bullets written" caption, and the original request so Retry can
  // re-tailor with the same inputs.
  resumeGenerationId?: string | null;
  tailor?: { chars: number; bullets: number } | null;
  resumeRequest?: { jobUrl?: string; highlights?: string; pageCount?: 1 | 2 } | null;
  // Per-agent non-fatal errors (e.g. the résumé branch failed but the rest of
  // the crew finished). Keyed like `progress` (resume | person | email | outreach).
  stepErrors?: Record<string, string>;
  // Set when the job board is login-walled but we can still run off a pasted JD
  // (Work at a Startup, etc.). Holds the board label; the run view renders a
  // paste-the-description box that re-launches the crew via submitJobText().
  needsJobText?: { label: string } | null;
  // The job description the user pasted for a login-walled board — forwarded to
  // /api/compose/apply as job_text so the whole crew runs off it.
  jobText?: string;
  // Set when the person flow couldn't identify anyone AND the input looks like
  // a job posting — the error card offers a one-click "run as job" switch.
  suggestedKind?: "job" | null;
  // Session-scoped cache of generated outreach per shortlist candidate, keyed by
  // normalizeCandidateKey(name). Lets re-selecting a previously-drafted person
  // restore instantly instead of re-streaming /api/compose/apply. In-memory only
  // (wiped on a full reload, like the rest of the store); single-contact job runs.
  draftsByCandidate?: Record<string, { person: unknown; enrichment: unknown; drafts: unknown[] }>;
  // Sawaal Jawaab (application Q&A). `applicationQuestions` is the essay-question
  // list detected during the apply run (job runs only). `applicationAnswers` is
  // the on-demand drafted answers, keyed by question. `answering` is true while
  // /api/compose/answers is streaming; `answerError` holds a failure message.
  // `savedApplicationId` is the job_applications row id (from the "saved" event),
  // forwarded so drafted answers persist onto that application.
  applicationQuestions?: string[] | null;
  applicationAnswers?: { question: string; body: string; model?: string }[] | null;
  answering?: boolean;
  answerError?: string | null;
  savedApplicationId?: string | null;
  // Pre-login people/outreach results restored from sessionStorage after sign-in
  // (see startRestoredRun). Forwarded to /api/compose/apply so the persisted
  // bundle is complete even though the people agents don't re-run.
  priorResults?: {
    person?: unknown;
    enrichment?: unknown;
    candidates?: unknown[] | null;
    drafts?: unknown[] | null;
    contacts?: unknown;
  } | null;
};

/* ─────────────────────── module store ─────────────────────── */
// Mirrors the house pattern in components/paper/use-paper-theme.ts: a module
// singleton + subscriber set + useSyncExternalStore. Living outside the React
// tree means in-flight fetch/reader loops survive /app/* navigation (route
// children swap, the module persists). A full page refresh resets it.

const EMPTY: Run[] = [];
let runs: Run[] = [];
const controllers = new Map<string, AbortController>();
// Re-pick streams get their OWN controller registry, keyed by run id. A re-pick
// must be cancellable (rapid clicks supersede each other) WITHOUT aborting the
// run's main stream — which may still be weaving the résumé (the long pole).
// Sharing `controllers` here is what used to kill an in-flight résumé the moment
// the user clicked a different candidate, leaving it stuck at "Weaving…".
const pickControllers = new Map<string, AbortController>();
const subscribers = new Set<() => void>();

function emit() {
  for (const s of subscribers) s();
}

function subscribe(cb: () => void) {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

// All mutations go through patch(), keyed by the primitive id. Sibling runs keep
// reference identity and are never clobbered by a concurrent stream.
function patch(id: string, updater: (r: Run) => Partial<Run>) {
  runs = runs.map((r) => (r.id === id ? { ...r, ...updater(r) } : r));
  emit();
}

export function useRuns(): Run[] {
  return useSyncExternalStore(
    subscribe,
    () => runs,
    () => EMPTY,
  );
}

/* ─────────────────────── focused run (in-page run screen) ─────────────────────── */
// Which run the Desk is showing full-screen instead of the composer. Kept in the
// module (not React state / the URL) so the top bar and the compose page share
// one source of truth without a route change: submitting focuses the new run,
// "Back to the Desk" / the Desk nav pill clear it, the "crew running" chip
// re-focuses it. A full page reload resets it (back to the Desk), same as `runs`.

let focusedRunId: string | null = null;
const focusSubscribers = new Set<() => void>();

function emitFocus() {
  for (const s of focusSubscribers) s();
}

function subscribeFocus(cb: () => void) {
  focusSubscribers.add(cb);
  return () => {
    focusSubscribers.delete(cb);
  };
}

export function setFocusedRun(id: string | null) {
  if (focusedRunId === id) return;
  focusedRunId = id;
  emitFocus();
}

export function useFocusedRun(): string | null {
  return useSyncExternalStore(
    subscribeFocus,
    () => focusedRunId,
    () => null,
  );
}

/* ─────────────────────── pending-run registry ─────────────────────── */
// The server inserts compose_runs up front and keeps running after the client
// disconnects (phone locked / tab backgrounded), persisting the result. The
// in-memory `runs` array, however, is wiped on a full page reload — which is
// exactly what iOS does when it reclaims a backgrounded tab. So we mirror the
// id of every in-flight run into localStorage. On the next load we replay the
// list and poll each survivor to completion, instead of losing the run to the
// "Lost the connection" dead-end. Entries are removed in streamRun's `finally`
// once the run settles; if the page is killed mid-flight `finally` never runs,
// so the entry correctly survives for recovery.

const PENDING_KEY = "jugaadu.pendingRuns.v1";
const PENDING_MAX_AGE_MS = 30 * 60 * 1000; // don't resurrect ancient runs
const PENDING_MAX = 20;

type PendingRun = {
  // For person/job runs this is the compose_runs row id; for resume runs it
  // holds the resume_generations row id. The field name is kept for
  // compatibility with entries already stored under the v1 key.
  composeRunId: string;
  kind: "person" | "job" | "resume";
  input: string;
  intent: string | null;
  createdAt: number;
};

function loadPending(): PendingRun[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    const cutoff = Date.now() - PENDING_MAX_AGE_MS;
    return list.filter(
      (e) => e && typeof e.composeRunId === "string" && Number(e.createdAt) >= cutoff,
    );
  } catch {
    return [];
  }
}

function savePending(list: PendingRun[]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(0, PENDING_MAX)));
  } catch {
    // private mode / quota — degrade to in-memory-only recovery
  }
}

function rememberPending(entry: PendingRun) {
  const list = loadPending().filter((e) => e.composeRunId !== entry.composeRunId);
  list.unshift(entry);
  savePending(list);
}

function forgetPending(composeRunId?: string | null) {
  if (!composeRunId) return;
  savePending(loadPending().filter((e) => e.composeRunId !== composeRunId));
}

// Patch the live run with the server-reported compose_runs id AND register it
// for cross-reload recovery. Called the moment the stream emits compose_run.
function setComposeRunId(localId: string, composeRunId: string, run: Run) {
  patch(localId, () => ({ composeRunId }));
  rememberPending({
    composeRunId,
    kind: run.kind,
    input: run.input,
    intent: run.intent ?? null,
    createdAt: run.createdAt,
  });
}

// Drop the pending entry for whichever server row a local run is bound to
// (compose_runs for person/job runs, resume_generations for resume runs).
function clearPending(localId: string) {
  const r = runs.find((x) => x.id === localId);
  forgetPending(r?.composeRunId ?? r?.resumeGenerationId);
}

/* ─────────────────────── actions ─────────────────────── */

export function startRun(
  input: string,
  opts?: { intent?: string; providedEmail?: boolean; kind?: "person" | "job"; selectedAgents?: string[] },
): string | null {
  const text = (input || "").trim();
  if (!text) return null;

  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `run_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const run: Run = {
    id,
    input: text,
    intent: opts?.intent || undefined,
    providedEmail: opts?.providedEmail || false,
    kind: opts?.kind || detectKind(text),
    stage: "parsing",
    parsed: null,
    progress: {},
    drafts: null,
    enrichment: null,
    person: null,
    candidates: null,
    error: null,
    createdAt: Date.now(),
    selectedAgents: Array.isArray(opts?.selectedAgents) ? [...opts.selectedAgents] : undefined,
  };

  // newest on top
  runs = [run, ...runs];
  emit();

  // ~900ms parse preview, then auto-confirm into the working stream.
  setTimeout(() => {
    if (!runs.some((r) => r.id === id)) return; // dismissed during parse
    const parsed = run.kind === "job" ? inferJobV3(text) : inferPersonV3(text);
    patch(id, () => ({
      parsed,
      candidates: run.kind === "person" ? parsed.candidates : null,
      stage: "working",
    }));
    launch(id);
  }, 900);

  return id;
}

// Re-open a signed-out job run after sign-in with its people/email/outreach work
// ALREADY DONE (restored from sessionStorage), running only the agents anon
// skipped: Resume Darzi (+ Sawaal Jawaab). The seeded person/drafts/enrichment
// show immediately (un-blurred, now that we're signed in); streamRun forwards
// `priorResults` so the persisted compose_runs bundle stays complete. Falls back
// to a fresh full run (startRun) at the call site when there's nothing to
// restore. Job runs only.
export function startRestoredRun(
  input: string,
  results: {
    parsed?: unknown;
    person?: unknown;
    enrichment?: unknown;
    candidates?: unknown[] | null;
    drafts?: unknown[] | null;
    contacts?: unknown;
  },
  opts?: { intent?: string; providedEmail?: boolean },
): string | null {
  const text = (input || "").trim();
  if (!text) return null;

  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `run_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const seededParsed =
    results.parsed && typeof results.parsed === "object"
      ? { ...(results.parsed as Record<string, unknown>), unparsed: false }
      : null;

  const run: Run = {
    id,
    input: text,
    intent: opts?.intent || undefined,
    providedEmail: opts?.providedEmail || false,
    kind: "job",
    // Resume still runs, so the run is "working"; the restored people steps are
    // marked 100% below so their rows read as done from the first paint.
    stage: "working",
    parsed: seededParsed,
    progress: { person: 100, email: 100, outreach: 100 },
    drafts: Array.isArray(results.drafts) ? results.drafts : null,
    enrichment: results.enrichment ?? null,
    person: results.person ?? null,
    candidates: Array.isArray(results.candidates) ? results.candidates : null,
    contacts: (results.contacts as Run["contacts"]) ?? null,
    error: null,
    createdAt: Date.now(),
    // Display ALL step rows (people show as done from the seeded progress);
    // streamRun restricts EXECUTION to resume + application because priorResults
    // is set, so the people agents don't re-run.
    selectedAgents: undefined,
    priorResults: {
      person: results.person ?? null,
      enrichment: results.enrichment ?? null,
      candidates: Array.isArray(results.candidates) ? results.candidates : null,
      drafts: Array.isArray(results.drafts) ? results.drafts : null,
      contacts: results.contacts ?? null,
    },
  };

  runs = [run, ...runs];
  emit();
  // No parse-preview delay — the people work is already restored; go straight to
  // streaming the resume.
  launch(id);
  return id;
}

// Screenshot-first run. The user attached an image (with or without text), so
// there's nothing to classify from a URL/name yet. We open a run in "parsing",
// POST the image to /api/identify-image (which stores it in Supabase and runs a
// vision pass), then resolve it into the right kind + query and hand off to the
// normal streaming pipeline. A job posting with a legible public URL takes the
// full job flow; everything else (a person, or a job whose URL we can't read)
// runs the person flow with the screenshot forwarded as research context.
export function startImageRun(
  file: File,
  opts?: { text?: string; intent?: string; providedEmail?: boolean; selectedAgents?: string[] },
): string | null {
  if (!file) return null;

  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `run_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const typed = (opts?.text || "").trim();
  const run: Run = {
    id,
    input: typed || file.name || "screenshot",
    intent: opts?.intent?.trim() || undefined,
    providedEmail: opts?.providedEmail || false,
    kind: "person",
    stage: "parsing",
    parsed: null,
    progress: {},
    drafts: null,
    enrichment: null,
    person: null,
    candidates: null,
    error: null,
    createdAt: Date.now(),
    imageFile: file,
    screenshot: { name: file.name || "screenshot", size: `${Math.round(file.size / 1024)} KB` },
    selectedAgents: Array.isArray(opts?.selectedAgents) ? [...opts.selectedAgents] : undefined,
  };

  runs = [run, ...runs];
  emit();

  void (async () => {
    try {
      const form = new FormData();
      form.append("image", file);
      if (typed) form.append("text", typed);
      if (opts?.intent?.trim()) form.append("intent", opts.intent.trim());

      const res = await fetch("/api/identify-image", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) {
        throw new Error(data?.error || `identify-image failed: ${res.status}`);
      }
      if (!runs.some((r) => r.id === id)) return; // dismissed while classifying

      const hasJobUrl =
        typeof data.job_url === "string" && /^https?:\/\//i.test(data.job_url);
      const personName =
        typeof data.person_name === "string" && data.person_name.trim()
          ? data.person_name.trim()
          : null;
      const detRole = typeof data.role === "string" && data.role.trim() ? data.role.trim() : null;
      const detCompany = typeof data.company === "string" && data.company.trim() ? data.company.trim() : null;

      // A hiring-post screenshot runs the JOB flow (résumé + poster + hiring
      // manager) whenever there's something to act on — a URL, a role+company, or
      // a named poster. The server resolves the real opening when the screenshot
      // link can't be fetched. Everything else (a profile, a tweet) runs person.
      const canJob = data.kind === "job" && (hasJobUrl || (!!detRole && !!detCompany) || !!personName);
      const kind: "person" | "job" = canJob ? "job" : "person";
      const resolvedInput =
        kind === "job"
          ? (hasJobUrl ? data.job_url : ([detRole, detCompany].filter(Boolean).join(" at ") || personName || typed || run.input))
          : (data.query || typed || run.input);
      // On the person flow, when the vision pass resolved identity from the image
      // (data.query), any typed text is the user's "why" — it wasn't consumed as
      // the identity — so route it to intent instead of dropping it. A typed
      // string the vision pass echoed back as the query is skipped (typed ===
      // resolvedInput). If it differs it still lands here and acts as a
      // disambiguation signal for research — the safety valve for "typed a name,
      // screenshotted a post". When the image yields no query, typed becomes
      // resolvedInput (→ research free_text) and the server synthesizes the intent.
      const usedImageQuery = kind === "person" && !!data.query;
      const typedAsIntent =
        usedImageQuery && typed && typed !== resolvedInput ? typed : undefined;
      const mergedIntent =
        run.intent || typedAsIntent || (data.intent ? String(data.intent) : undefined);
      const parsed =
        kind === "job"
          ? { ...inferJobV3(hasJobUrl ? data.job_url : (detCompany || "")), role: detRole || undefined, company: detCompany || undefined }
          : inferPersonV3(resolvedInput);

      patch(id, () => ({
        kind,
        input: resolvedInput,
        intent: mergedIntent,
        parsed,
        candidates: kind === "person" ? parsed.candidates : null,
        screenshotId: typeof data.screenshot_id === "string" ? data.screenshot_id : null,
        // Screenshot-job context forwarded to /api/compose/apply so it can find
        // the real opening, tailor the résumé, and reach out to BOTH the poster
        // and the hiring manager.
        fromScreenshot: kind === "job",
        screenshotJobUrl: kind === "job" ? (hasJobUrl ? data.job_url : null) : null,
        screenshotPersonName: personName,
        screenshotRole: detRole,
        screenshotCompany: detCompany,
        stage: "working",
      }));
      launch(id);
    } catch (e) {
      if (!runs.some((r) => r.id === id)) return;
      if (navigatingForAuth) return; // page is leaving for OAuth — not a real failure
      patch(id, () => ({ stage: "error", error: String(e?.message || e) }));
    }
  })();

  return id;
}

// Kick off a resume-tailor run that survives navigation, exactly like compose
// runs: the streaming loop lives in this module, the resume_generations row id
// is registered for cross-reload recovery, and the resume page just renders
// store state. Returns the local run id (null when there's nothing to run).
export function startResumeRun(opts: {
  jobUrl?: string;
  highlights?: string;
  pageCount?: 1 | 2;
}): string | null {
  const jobUrl = (opts?.jobUrl || "").trim();
  const highlights = (opts?.highlights || "").trim();
  if (!jobUrl && !highlights) return null;

  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `run_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const run: Run = {
    id,
    input: jobUrl || (highlights.length > 80 ? `${highlights.slice(0, 77)}…` : highlights),
    providedEmail: false,
    kind: "resume",
    stage: "working",
    parsed: null,
    progress: { tailor: 5 },
    drafts: null,
    enrichment: null,
    person: null,
    candidates: null,
    error: null,
    createdAt: Date.now(),
    tailor: null,
    resumeRequest: {
      jobUrl: jobUrl || undefined,
      highlights: highlights || undefined,
      pageCount: opts?.pageCount === 2 ? 2 : 1,
    },
  };

  runs = [run, ...runs];
  emit();

  const controller = new AbortController();
  controllers.set(id, controller);
  ensureProgressTicker();
  void streamResumeRun(run, controller.signal);
  return id;
}

// Reset a resume run and stream a fresh tailor (which opens a new server row).
function relaunchResumeRun(id: string) {
  const run = runs.find((r) => r.id === id);
  if (!run) return;
  forgetPending(run.resumeGenerationId);
  patch(id, () => ({
    stage: "working",
    progress: { tailor: 5 },
    tailor: null,
    error: null,
    reconnecting: false,
    resumeGenerationId: null,
  }));
  const fresh = runs.find((r) => r.id === id);
  if (!fresh) return;
  const controller = new AbortController();
  controllers.set(id, controller);
  ensureProgressTicker();
  void streamResumeRun(fresh, controller.signal);
}

export function dismissRun(id: string) {
  controllers.get(id)?.abort();
  controllers.delete(id);
  pickControllers.get(id)?.abort();
  pickControllers.delete(id);
  runs = runs.filter((r) => r.id !== id);
  if (focusedRunId === id) setFocusedRun(null);
  emit();
}

export function clearAllRuns() {
  for (const c of controllers.values()) c.abort();
  controllers.clear();
  for (const c of pickControllers.values()) c.abort();
  pickControllers.clear();
  runs = [];
  setFocusedRun(null);
  emit();
}

export function retryRun(id: string, picked?: unknown) {
  const run = runs.find((r) => r.id === id);
  if (!run) return;
  controllers.get(id)?.abort();
  controllers.delete(id);

  if (run.kind === "resume") {
    // Same recover-first strategy as compose: if the server finished and
    // persisted while we were disconnected, adopt that result instead of
    // burning another tailor run.
    if (run.resumeGenerationId && picked === undefined) {
      const generationId = run.resumeGenerationId;
      patch(id, () => ({ stage: "working", error: null, reconnecting: true }));
      const controller = new AbortController();
      controllers.set(id, controller);
      void (async () => {
        try {
          const res = await fetch(`/api/resume/history/${generationId}`, { signal: controller.signal });
          if (res.ok) {
            const json = await res.json().catch(() => null);
            const gen = json?.generation;
            if (gen && gen.status === "complete") {
              applyPersistedResume(id, gen);
              forgetPending(generationId);
              controllers.delete(id);
              return;
            }
          }
        } catch {
          // fall through to a fresh tailor
        }
        if (controller.signal.aborted) return; // superseded by another action
        controllers.delete(id);
        relaunchResumeRun(id);
      })();
      return;
    }
    relaunchResumeRun(id);
    return;
  }

  // The common "Retry" case is a connection that dropped while the server kept
  // working — the run already finished and persisted. Re-running the whole crew
  // would be slow and wasteful, so when we know the compose_runs id (and this
  // isn't a candidate re-pick), check the persisted row first and recover its
  // result. Only fall back to a full re-run if it didn't actually complete.
  if (run.composeRunId && picked === undefined) {
    const composeRunId = run.composeRunId;
    patch(id, () => ({ stage: "working", error: null, reconnecting: true }));
    const controller = new AbortController();
    controllers.set(id, controller);
    void (async () => {
      try {
        const res = await fetch(`/api/compose/history/${composeRunId}`, { signal: controller.signal });
        if (res.ok) {
          const json = await res.json().catch(() => null);
          const persisted = json?.run;
          // complete or needs_disambiguation are real results worth recovering;
          // only a hard `error` (or still in_flight) warrants re-running.
          if (
            persisted &&
            persisted.outcome &&
            persisted.outcome !== "in_flight" &&
            persisted.outcome !== "error"
          ) {
            applyPersisted(id, persisted);
            forgetPending(composeRunId);
            controllers.delete(id);
            return;
          }
        }
      } catch {
        // fall through to a full re-run
      }
      if (controller.signal.aborted) return; // superseded by another action
      controllers.delete(id);
      relaunchRun(id, picked);
    })();
    return;
  }

  relaunchRun(id, picked);
}

// Reset a run to a clean working state and stream it from scratch.
function relaunchRun(id: string, picked?: unknown) {
  const run = runs.find((r) => r.id === id);
  forgetPending(run?.composeRunId);
  // Cancel any in-flight re-pick so it can't patch onto the fresh stream.
  pickControllers.get(id)?.abort();
  pickControllers.delete(id);
  patch(id, () => ({
    stage: "working",
    progress: {},
    drafts: null,
    enrichment: null,
    person: null,
    contacts: null,
    error: null,
    stepErrors: {},
    suggestedKind: null,
    reconnecting: false,
    // Clear re-pick state — a fresh stream owns the person/drafts again.
    picking: null,
    repicked: false,
    // Drop the stale id so the fresh stream registers its own.
    composeRunId: null,
  }));
  launch(id, picked);
}

// The person flow was handed a job posting (see suggestedKind) — flip the run
// onto the job path and stream it from scratch. The abandoned person attempt
// stays in History as needs_disambiguation; this opens a fresh compose row.
export function switchRunToJob(id: string) {
  const run = runs.find((r) => r.id === id);
  if (!run || run.kind === "job") return;
  controllers.get(id)?.abort();
  controllers.delete(id);
  pickControllers.get(id)?.abort();
  pickControllers.delete(id);
  forgetPending(run.composeRunId);
  patch(id, () => ({
    kind: "job",
    stage: "working",
    parsed: inferJobV3(run.input),
    progress: {},
    drafts: null,
    enrichment: null,
    person: null,
    candidates: null,
    contacts: null,
    error: null,
    stepErrors: {},
    suggestedKind: null,
    reconnecting: false,
    picking: null,
    repicked: false,
    composeRunId: null,
  }));
  launch(id);
}

export function updateRun(id: string, partial: Partial<Run>) {
  patch(id, () => partial);
}

// Push a persisted compose run (loaded from /api/compose/history/[id]) into
// the ephemeral store as a finished Run. The existing PackageV3 card renders
// it unchanged, and the action functions (regenerateDraft, steerAllChannels,
// pickCandidate, regenerateResume) all key off run.id without needing to know
// the row was hydrated from the DB rather than live-streamed.
//
// Returns the local run id. If a run from the same compose_runs row is
// already in the store, we don't duplicate it — return the existing id.
export type PersistedComposeRun = {
  id: string;                                   // compose_runs.id
  kind: "person" | "job";
  input: string;
  intent: string | null;
  outcome: string;
  error: string | null;
  created_at: string;
  output: {
    parsed?: unknown;
    person?: unknown;
    enrichment?: unknown;
    candidates?: unknown[] | null;
    drafts?: unknown[];
    contacts?: { poster?: ContactData | null; hiring_manager?: ContactData | null } | null;
    questions?: string[] | null;
    answers?: { question: string; body: string; model?: string }[] | null;
  } | null;
  screenshot?: { name: string; size: string } | null;
};

export function hydrateRun(persisted: PersistedComposeRun): string {
  const existing = runs.find((r) => r.composeRunId === persisted.id);
  if (existing) return existing.id;

  const out = persisted.output || {};
  const stage: RunStage = persisted.outcome === "complete" ? "done" : "error";
  const progress =
    stage === "done"
      ? persisted.kind === "job"
        ? { resume: 100, person: 100, email: 100, outreach: 100 }
        : { person: 100, email: 100, outreach: 100 }
      : {};
  const localId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `run_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const run: Run = {
    id: localId,
    input: persisted.input,
    intent: persisted.intent ?? undefined,
    providedEmail: false,
    kind: persisted.kind,
    stage,
    parsed: out.parsed ?? null,
    progress,
    drafts: Array.isArray(out.drafts) && out.drafts.length ? out.drafts : null,
    enrichment: out.enrichment ?? null,
    person: out.person ?? null,
    candidates: Array.isArray(out.candidates) ? out.candidates : null,
    contacts: out.contacts ?? null,
    error: persisted.error,
    createdAt: new Date(persisted.created_at).getTime(),
    screenshot: persisted.screenshot ?? null,
    composeRunId: persisted.id,
  };

  runs = [run, ...runs];
  emit();
  return localId;
}

// Re-pick a different hiring-manager candidate on a finished job run. Re-runs
// only the email + draft for that person (server skips resume + sourcing) and
// patches the email/person/draft in place — the package card stays visible.
export async function pickCandidate(
  id: string,
  candidate: { name?: string; role?: string | null; company?: string | null; linkedin?: string | null },
) {
  const run = runs.find((r) => r.id === id);
  if (!run || run.kind !== "job") return;
  const picked = {
    name: candidate?.name,
    role: candidate?.role ?? null,
    company: candidate?.company ?? null,
    linkedin: candidate?.linkedin ?? null,
  };
  if (!picked.name) return;

  // On a dual-contact (screenshot) run the re-pick updates the hiring-manager
  // slot; otherwise it replaces the single legacy contact.
  const dual = !!run.contacts;
  const jobUrl = run.fromScreenshot
    ? (run.screenshotJobUrl || "")
    : (run.input.match(/^https?:\/\//) ? run.input : `https://${run.input}`);
  const newPerson = (prev: unknown) => ({
    ...((prev as object) || {}),
    name: picked.name,
    role: picked.role,
    company: picked.company,
    links: picked.linkedin ? { linkedin: picked.linkedin } : ((prev as { links?: unknown })?.links || {}),
    context_lines: [],
  });
  const patchPicked = (partial: { person?: unknown; enrichment?: unknown; drafts?: unknown[] }) =>
    patch(id, (r) => {
      if (dual) {
        const contacts = { ...(r.contacts || {}) } as Record<string, ContactData>;
        const cur = contacts.hiring_manager || { person: null, enrichment: null, drafts: [] };
        contacts.hiring_manager = {
          ...cur,
          sameAsPoster: false,
          person: partial.person !== undefined ? partial.person : cur.person,
          enrichment: partial.enrichment !== undefined ? partial.enrichment : cur.enrichment,
          drafts: partial.drafts ?? cur.drafts,
        };
        return { contacts };
      }
      return {
        ...(partial.person !== undefined ? { person: partial.person } : {}),
        ...(partial.enrichment !== undefined ? { enrichment: partial.enrichment } : {}),
        ...(partial.drafts ? { drafts: partial.drafts } : {}),
      };
    });

  // Already drafted this candidate this session? Restore instantly from the
  // per-candidate cache — no clear-to-[], no fetch/stream — so switching back to
  // a person shows their saved draft immediately instead of re-drafting.
  const cacheKey = normalizeCandidateKey(picked.name);
  const cached = run.draftsByCandidate?.[cacheKey];
  if (cached && Array.isArray(cached.drafts) && cached.drafts.length) {
    pickControllers.get(id)?.abort();
    patchPicked({
      person: cached.person ?? newPerson(dual ? run.contacts?.hiring_manager?.person : run.person),
      enrichment: cached.enrichment,
      drafts: cached.drafts,
    });
    patch(id, (r) => ({
      picking: null,
      repicked: true,
      progress: { ...r.progress, person: 100, email: 100, outreach: 100 },
    }));
    return;
  }

  // Reflect the click immediately: swap in the picked person AND clear the
  // previous contact's email + drafts, so the panel never keeps showing the old
  // person's message under the new name. `picking` flags the in-flight re-draft
  // so the cards read "drafting for {name}…" until the new copy lands.
  patchPicked({
    person: newPerson(dual ? run.contacts?.hiring_manager?.person : run.person),
    enrichment: null,
    drafts: [],
  });
  patch(id, (r) => ({
    picking: picked.name || null,
    repicked: true,
    progress: { ...r.progress, person: 100, email: 10, outreach: 10 },
  }));

  // Cancel any prior in-flight re-pick, but NOT the run's main stream (which may
  // still be weaving the résumé) — that's why picks use their own registry.
  pickControllers.get(id)?.abort();
  const controller = new AbortController();
  pickControllers.set(id, controller);
  try {
    const res = await fetch("/api/compose/apply", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({
        job_url: jobUrl,
        picked,
        intent: run.intent || undefined,
        agents: run.selectedAgents || undefined,
        // Keep the cold email anchored on the job, not the picked person's own
        // company, when we re-draft for a different candidate.
        job_context: { role: run.parsed?.role ?? null, company: run.parsed?.company ?? null },
        // So the re-pick passes server validation even when the screenshot had no
        // fetchable URL (the picked branch short-circuits before using these).
        detected_role: run.screenshotRole || undefined,
        detected_company: run.screenshotCompany || undefined,
      }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) throw new Error(`pick failed: ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    const collectedDrafts: unknown[] = [];
    let collectedEnrichment: unknown = null;
    let collectedPerson: unknown = null;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() || "";
      for (const raw of parts) {
        const line = raw.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        let evt;
        try {
          evt = JSON.parse(line.slice(6));
        } catch {
          continue;
        }
        if (evt.type === "step") {
          const k = evt.id;
          // The person is already chosen on a re-pick, so keep its row settled at
          // "done" — don't let the server's person "start" event drop it back to
          // 10 and read as "searching…" again.
          if (evt.status === "start" && k !== "person") patch(id, (r) => ({ progress: { ...r.progress, [k]: 10 } }));
          else if (evt.status === "done" || evt.status === "skipped")
            patch(id, (r) => ({ progress: { ...r.progress, [k]: 100 } }));
          if (k === "person" && evt.status === "done" && evt.data) collectedPerson = evt.data;
          if (k === "email" && evt.data) collectedEnrichment = evt.data;
          if (k === "outreach" && evt.status === "done" && evt.data) collectedDrafts.push(evt.data);
        } else if (evt.type === "error") {
          throw new Error(evt.message || "pick error");
        }
      }
    }
    patchPicked({
      person: collectedPerson || undefined,
      enrichment: collectedEnrichment || undefined,
      drafts: collectedDrafts.length ? collectedDrafts : undefined,
    });
    patch(id, (r) => ({
      picking: null,
      progress: { ...r.progress, person: 100, email: 100, outreach: 100 },
      // Cache this candidate's freshly-drafted outreach so re-selecting them
      // later restores instantly.
      ...(collectedDrafts.length
        ? {
            draftsByCandidate: {
              ...(r.draftsByCandidate || {}),
              [cacheKey]: {
                person: collectedPerson ?? (dual ? r.contacts?.hiring_manager?.person : r.person),
                enrichment: collectedEnrichment,
                drafts: collectedDrafts,
              },
            },
          }
        : {}),
    }));
  } catch (e) {
    if (controller.signal.aborted) return; // superseded by a newer pick
    // Keep the existing package; just restore the bars and log.
    patch(id, (r) => ({ picking: null, progress: { ...r.progress, email: 100, outreach: 100 } }));
    console.error("[pickCandidate]", e);
  } finally {
    // Only clear the registry if this controller is still the current one — a
    // newer pick may have replaced it while we were streaming.
    if (pickControllers.get(id) === controller) pickControllers.delete(id);
  }
}

// Re-run ONLY the resume agent for a finished job run, applying the user's
// "what to change" notes. Streams /api/resume/tailor and patches the tailored
// resume (+ ATS, role/company) in place — the rest of the package is untouched.
export async function regenerateResume(id: string, notes: string) {
  const run = runs.find((r) => r.id === id);
  if (!run || run.kind !== "job") return;
  const trimmed = (notes || "").trim();
  if (!trimmed || run.regenerating) return;

  const jobUrl = run.input.match(/^https?:\/\//) ? run.input : `https://${run.input}`;
  const pageCount = run.parsed?.resume?.meta?.page_count === 2 ? 2 : 1;

  patch(id, () => ({ regenerating: true, regenError: null }));

  try {
    const res = await fetch("/api/resume/tailor", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({ job_url: jobUrl, regenerate_notes: trimmed, page_count: pageCount }),
    });
    if (!res.ok || !res.body) throw new Error(`regenerate failed: ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let newResume: unknown = null;
    let newId: string | null = null;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() || "";
      for (const raw of parts) {
        const line = raw.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        let evt;
        try {
          evt = JSON.parse(line.slice(6));
        } catch {
          continue;
        }
        if (evt.type === "step" && evt.id === "tailor" && evt.status === "done" && evt.data?.resume) {
          newResume = evt.data.resume;
        } else if (evt.type === "saved") {
          newId = evt.id;
        } else if (evt.type === "error") {
          throw new Error(evt.message || "regenerate error");
        }
      }
    }
    if (!newResume) throw new Error("no resume returned");
    patch(id, (r) => ({
      parsed: {
        ...(r.parsed || {}),
        resume: newResume,
        ats_score: newResume?.meta?.ats_score ?? r.parsed?.ats_score,
        ats_score_before: newResume?.meta?.ats_score_before ?? r.parsed?.ats_score_before,
        resume_generation_id: newId ?? r.parsed?.resume_generation_id,
        role: newResume?.meta?.target_role ?? r.parsed?.role,
        company: newResume?.meta?.target_company ?? r.parsed?.company,
      },
      regenerating: false,
      regenError: null,
    }));
  } catch (e) {
    patch(id, () => ({ regenerating: false, regenError: String(e?.message || e) }));
  }
}

// Re-launch a login-walled job run with the job description the user pasted.
// Stores the text on the run (forwarded to /api/compose/apply as job_text),
// clears the paste prompt + prior stub results, resets the bars, and streams the
// whole crew again — this time off the pasted brief, so the résumé tailors and
// the hiring-manager pipeline gets a real role/company to search.
export function submitJobText(id: string, text: string) {
  const run = runs.find((r) => r.id === id);
  if (!run || run.kind !== "job") return;
  const trimmed = (text || "").trim();
  if (!trimmed) return;

  // Cancel any still-open stream for this run before relaunching.
  controllers.get(id)?.abort();

  patch(id, (r) => ({
    jobText: trimmed,
    needsJobText: null,
    stage: "working",
    error: null,
    stepErrors: {},
    // Back to a fresh crew run: only the parse step is settled.
    progress: { parse: 100 },
    drafts: null,
    enrichment: null,
    person: null,
    candidates: null,
    contacts: null,
    tailor: null,
    // Keep any preview role/company we already showed; the stream overwrites it.
    parsed: r.parsed,
  }));

  launch(id);
}

// Sawaal Jawaab — draft full first-person answers to the application's essay
// questions on demand. Hits /api/compose/answers (SSE) and fills each answer into
// the run as it lands, so the card streams question-by-question. `questions` lets
// the caller pass a custom set (the paste-your-questions fallback); otherwise the
// run's detected questions are used.
export async function draftAnswers(id: string, questions?: string[]) {
  const run = runs.find((r) => r.id === id);
  if (!run || run.kind !== "job" || run.answering) return;
  const qs = (Array.isArray(questions) && questions.length ? questions : run.applicationQuestions) || [];
  const cleaned = qs.map((q) => (q || "").toString().trim()).filter(Boolean).slice(0, 8);
  if (!cleaned.length) return;

  const jc = {
    role: run.parsed?.role || run.parsed?.target_role || run.screenshotRole || null,
    company: run.parsed?.company || run.parsed?.target_company || run.screenshotCompany || null,
  };

  patch(id, () => ({
    answering: true,
    answerError: null,
    applicationQuestions: cleaned,
    // Seed placeholder rows so the card can show each question with a spinner.
    applicationAnswers: cleaned.map((q) => ({ question: q, body: "" })),
  }));

  const upsertAnswer = (question: string, body: string, model?: string) => {
    patch(id, (r) => {
      const prev = Array.isArray(r.applicationAnswers) ? r.applicationAnswers.slice() : [];
      const i = prev.findIndex((a) => a.question.trim().toLowerCase() === question.trim().toLowerCase());
      const next = { question, body, model };
      if (i >= 0) prev[i] = next;
      else prev.push(next);
      return { applicationAnswers: prev };
    });
  };

  try {
    const res = await fetch("/api/compose/answers", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({
        questions: cleaned,
        job_context: jc,
        compose_run_id: run.composeRunId || undefined,
        job_application_id: run.savedApplicationId || undefined,
      }),
    });
    if (!res.ok || !res.body) throw new Error(`answers failed: ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() || "";
      for (const raw of parts) {
        const line = raw.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        let evt;
        try {
          evt = JSON.parse(line.slice(6));
        } catch {
          continue;
        }
        if (evt.type === "answer" && evt.status === "done") {
          upsertAnswer(evt.question, evt.body, evt.model);
        } else if (evt.type === "answer" && evt.status === "error") {
          upsertAnswer(evt.question, "");
        } else if (evt.type === "error") {
          patch(id, () => ({ answerError: evt.message || "Couldn't draft answers." }));
        }
      }
    }
  } catch (e) {
    patch(id, () => ({ answerError: e?.message || "Couldn't draft answers." }));
  } finally {
    // Drop any placeholder rows that never got a body (errored questions).
    patch(id, (r) => ({
      answering: false,
      applicationAnswers: Array.isArray(r.applicationAnswers)
        ? r.applicationAnswers.filter((a) => (a.body || "").trim())
        : r.applicationAnswers,
    }));
  }
}

// "Another angle" — rewrite the draft for one channel with a preset directive
// ("make it shorter", "more founder-like", a fresh angle, …). Hits the
// lightweight /api/compose/redraft endpoint (no research / email re-lookup) and
// swaps the rewritten subject+body into the run's drafts in place, so the email
// card re-renders with the new copy. `current` carries what's on screen now —
// which may be a fallback when no real draft exists yet, so there's always
// something to rewrite.
export async function regenerateDraft(
  id: string,
  channel: string, // UI channel: 'email' | 'linkedin' | 'x'
  directive: string,
  current: { subject?: string | null; body?: string | null; recipientName?: string | null },
  // On a dual-contact run, which contact's draft to rewrite ('poster' |
  // 'hiring_manager'). Undefined → the legacy single draft list.
  slot?: string,
) {
  const run = runs.find((r) => r.id === id);
  if (!run) return;
  const body = (current?.body || "").trim();
  if (!body || run.redrafting) return;
  // The draft pipeline speaks 'x_dm'; the UI tabs say 'x'.
  const apiChannel = channel === "x" ? "x_dm" : channel;

  patch(id, () => ({ redrafting: channel, redraftError: null }));
  try {
    const res = await fetch("/api/compose/redraft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        channel: apiChannel,
        subject: current?.subject ?? null,
        body,
        directive,
        recipient_name: current?.recipientName ?? null,
      }),
    });
    if (!res.ok) throw new Error(`redraft failed: ${res.status}`);
    const data = await res.json();
    if (data?.error) throw new Error(data.error);
    const next = { subject: data.subject ?? current?.subject ?? null, body: data.body };
    if (slot) {
      // Dual-contact run — swap the rewrite into the active contact's drafts.
      patch(id, (r) => {
        const contacts = { ...(r.contacts || {}) } as Record<string, ContactData>;
        const cur = contacts[slot] || { person: null, enrichment: null, drafts: [] };
        contacts[slot] = { ...cur, drafts: upsertDraft(cur.drafts, channel, next) };
        return { contacts, redrafting: null, redraftError: null };
      });
      return;
    }
    patch(id, (r) => ({
      drafts: upsertDraft(r.drafts, channel, {
        subject: data.subject ?? current?.subject ?? null,
        body: data.body,
      }),
      redrafting: null,
      redraftError: null,
    }));
  } catch (e) {
    if (e?.message === "redrafting") return;
    patch(id, () => ({ redrafting: null, redraftError: String(e?.message || e) }));
  }
}

// "Steer the draft" — apply ONE free-form directive across email + LinkedIn +
// X in parallel, so all three channels end up consistent with the new angle.
// Hits /api/compose/steer (parallel redraft fan-out) and patches each returned
// channel into the run's drafts. The directive is pushed to a small in-memory
// history (dedup + cap 3) so the UI can offer click-to-rerun chips.
export async function steerAllChannels(
  id: string,
  directive: string,
  current: { drafts: unknown[] | null; recipientName?: string | null },
) {
  const run = runs.find((r) => r.id === id);
  if (!run || run.steering) return;
  const trimmed = (directive || "").trim();
  if (!trimmed) return;

  // Build the request payload from what's on screen right now. The server
  // normalizes 'x' ↔ 'x_dm'; we send whatever channel keys the run has.
  const drafts = Array.isArray(current?.drafts) ? current.drafts : [];
  const payloadDrafts = drafts
    .map((d) => {
      const ch = (d as { channel?: string })?.channel;
      if (!ch) return null;
      return {
        channel: ch,
        subject: (d as { subject?: string | null })?.subject ?? null,
        body: (d as { body?: string })?.body ?? "",
      };
    })
    .filter(Boolean);
  if (!payloadDrafts.some((d) => (d as { body: string }).body.trim())) return;

  patch(id, () => ({ steering: true, steerError: null }));
  try {
    const res = await fetch("/api/compose/steer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        directive: trimmed,
        recipient_name: current?.recipientName ?? null,
        drafts: payloadDrafts,
      }),
    });
    if (!res.ok) throw new Error(`steer failed: ${res.status}`);
    const data = await res.json();
    if (data?.error) throw new Error(data.error);

    patch(id, (r) => {
      let next = r.drafts;
      // Map server API channels back to the UI channels the package cards read.
      const mapping: Record<string, string> = { email: "email", linkedin: "linkedin", x_dm: "x" };
      for (const [apiCh, uiCh] of Object.entries(mapping)) {
        const part = data?.[apiCh];
        if (!part || !part.body) continue;
        next = upsertDraft(next, uiCh, {
          subject: part.subject ?? null,
          body: part.body,
        });
      }
      const prevHistory = Array.isArray(r.steerHistory) ? r.steerHistory : [];
      const nextHistory = [trimmed, ...prevHistory.filter((s) => s !== trimmed)].slice(0, 3);
      return {
        drafts: next,
        steering: false,
        steerError: null,
        steerHistory: nextHistory,
      };
    });
  } catch (e) {
    patch(id, () => ({ steering: false, steerError: String(e?.message || e) }));
  }
}

// Replace (or insert) the draft for one channel, keeping reference identity for
// siblings. Keyed by the UI channel so the package cards — which read
// drafts.find(d => d.channel === 'email' | 'linkedin' | 'x') — pick up the swap.
function upsertDraft(
  drafts: unknown[] | null,
  channel: string,
  next: { subject: string | null; body: string },
): unknown[] {
  const arr = Array.isArray(drafts) ? [...drafts] : [];
  const i = arr.findIndex((d) => (d as { channel?: string })?.channel === channel);
  if (i >= 0) arr[i] = { ...(arr[i] as object), ...next, channel };
  else arr.push({ channel, ...next });
  return arr;
}

/* ─────────────────────── progress easing ─────────────────────── */
// Step events only land at start (10) and done (100), so between them the bars
// used to sit frozen at 10% — reading as "stuck" (the exact complaint from
// user testing). While any run is working, ease its bars toward an 88%
// ceiling; real events still snap past it to 100.

const PROGRESS_EASE_CEILING = 88;
let progressTicker: ReturnType<typeof setInterval> | null = null;

function ensureProgressTicker() {
  if (progressTicker || typeof window === "undefined") return;
  progressTicker = setInterval(tickProgress, 1200);
}

function tickProgress() {
  let touched = false;
  runs = runs.map((r) => {
    if (r.stage !== "working" || r.reconnecting) return r;
    let changed = false;
    const next: Record<string, number> = { ...r.progress };
    for (const k of Object.keys(next)) {
      const v = next[k];
      if (v >= 5 && v < PROGRESS_EASE_CEILING) {
        next[k] = Math.min(PROGRESS_EASE_CEILING, v + 2);
        changed = true;
      }
    }
    if (!changed) return r;
    touched = true;
    return { ...r, progress: next };
  });
  if (touched) emit();
  // Nothing left to animate — stop until the next launch.
  if (!runs.some((r) => r.stage === "working" && !r.reconnecting)) {
    if (progressTicker) clearInterval(progressTicker);
    progressTicker = null;
  }
}

/* ─────────────────────── streaming ─────────────────────── */

function launch(id: string, picked?: unknown) {
  const run = runs.find((r) => r.id === id);
  if (!run) return;
  const controller = new AbortController();
  controllers.set(id, controller);
  ensureProgressTicker();
  void streamRun(run, controller.signal, picked);
}

async function streamRun(run: Run, signal: AbortSignal, picked?: unknown) {
  const id = run.id;

  try {
    if (run.kind === "job") {
      // ── job path ── start a DURABLE run, then observe it. The pipeline now
      // executes server-side in a background continuation (next/server `after()`)
      // with a cron-worker backstop, so it finishes even if this connection dies
      // (the classic mobile-background drop). The client only kicks it off and
      // polls the persisted row — see observeRun.
      const jobUrl = run.fromScreenshot
        ? (run.screenshotJobUrl || "")
        : (run.input.match(/^https?:\/\//) ? run.input : `https://${run.input}`);

      const res = await fetch("/api/compose/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          job_url: jobUrl || undefined,
          intent: run.intent || undefined,
          // A restored run only re-runs the agents anon skipped (resume +
          // application); the people work is already done and forwarded via
          // `prior`. Otherwise honor the user's own agent selection.
          agents: run.priorResults ? ["resume", "application"] : (run.selectedAgents || undefined),
          // A pasted JD for a login-walled board (Work at a Startup) — runs the
          // whole crew off this text instead of the unreadable URL.
          job_text: run.jobText || undefined,
          // Screenshot-job context: lets the server resolve the real opening and
          // reach out to both the poster and the hiring manager.
          person_name: run.screenshotPersonName || undefined,
          detected_role: run.screenshotRole || undefined,
          detected_company: run.screenshotCompany || undefined,
          // The stored screenshot id — the server re-loads the image to feed the
          // poster's research as disambiguation context.
          screenshot_id: run.screenshotId || undefined,
          // Restored pre-login people/outreach results (see startRestoredRun).
          prior: run.priorResults || undefined,
        }),
        signal,
      });
      if (!res.ok) {
        if (res.status === 429) throw new Error(ANON_LIMIT_MESSAGE);
        throw new Error(`apply failed: ${res.status}`);
      }
      const started = await res.json().catch(() => null);
      const composeRunId = started?.composeRunId;
      if (!composeRunId) throw new Error("apply failed: no run id");
      // Register for cross-reload recovery + history dedupe, then observe the
      // persisted row until it settles.
      setComposeRunId(id, composeRunId, run);
      await observeRun(id, composeRunId, signal);
      return;
    }

    // ── person path ── stream /api/compose (reach-out agent). Map SSE step
    // events to the three progress keys the AgentRow expects.
    const stepToKey: Record<string, string> = {
      research: "person",
      email_lookup: "email",
      draft: "outreach",
    };
    const collectedDrafts: unknown[] = [];
    let collectedEnrichment: unknown = null;
    let collectedPerson: unknown = null;
    let completed = false;

    // When the run started from a screenshot, forward the raw image so the
    // research agent can read role/company/handles straight off it (multipart).
    // Otherwise the plain JSON body is enough.
    let res: Response;
    if (run.imageFile) {
      const form = new FormData();
      form.append("text", run.input);
      if (run.intent) form.append("intent", run.intent);
      if (picked) form.append("picked", JSON.stringify(picked));
      if (run.screenshotId) form.append("screenshot_id", run.screenshotId);
      if (run.selectedAgents) form.append("agents", JSON.stringify(run.selectedAgents));
      form.append("intent_image", run.imageFile);
      res = await fetch("/api/compose", {
        method: "POST",
        headers: { accept: "text/event-stream" },
        body: form,
        signal,
      });
    } else {
      res = await fetch("/api/compose", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify({
          text: run.input,
          intent: run.intent || undefined,
          picked: picked || undefined,
          screenshot_id: run.screenshotId || undefined,
          agents: run.selectedAgents || undefined,
        }),
        signal,
      });
    }
    if (!res.ok || !res.body) {
      if (res.status === 429) throw new Error(ANON_LIMIT_MESSAGE);
      throw new Error(`compose failed: ${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() || "";
      for (const raw of parts) {
        const line = raw.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        let evt;
        try {
          evt = JSON.parse(line.slice(6));
        } catch {
          continue;
        }
        if (evt.type === "compose_run" && typeof evt.id === "string") {
          setComposeRunId(id, evt.id, run);
          continue;
        }
        if (evt.type === "step") {
          const key = stepToKey[evt.id];
          if (key) {
            if (evt.status === "start") patch(id, (r) => ({
              progress: { ...r.progress, [key]: 10 },
              activity: STEP_START_ACTIVITY[key]
                ? { ...(r.activity || {}), [key]: STEP_START_ACTIVITY[key] }
                : r.activity,
            }));
            else if (evt.status === "done" || evt.status === "skipped")
              patch(id, (r) => ({ progress: { ...r.progress, [key]: 100 } }));
            else if (evt.status === "error")
              patch(id, (r) => ({
                progress: { ...r.progress, [key]: 100 },
                stepErrors: { ...(r.stepErrors || {}), [key]: evt.message || "failed" },
              }));
          }
          // The research step carries the REAL researched person (name, role,
          // company, links, context_lines) — surface it so the package card
          // shows the actual human, not the prototype stub.
          // Stream each piece into the run as it lands so the package fills in
          // per-agent rather than all at once on the final "complete" event.
          if (evt.id === "research" && evt.status === "done" && evt.data) {
            collectedPerson = evt.data;
            // Surface the intent research synthesized from the paste/screenshot so
            // the run subline reflects what the draft is geared toward, without a
            // reload. An intent the user supplied explicitly still wins.
            const derivedIntent = (evt.data as { outreach_intent?: string | null })
              .outreach_intent;
            patch(id, (r) => ({
              person: evt.data,
              intent: r.intent || derivedIntent || undefined,
            }));
          }
          if (evt.id === "email_lookup" && evt.data) {
            collectedEnrichment = evt.data;
            patch(id, () => ({ enrichment: evt.data }));
          }
          if (evt.id === "draft" && evt.status === "done" && evt.data) {
            collectedDrafts.push(evt.data);
            patch(id, () => ({ drafts: [...collectedDrafts] }));
          }
        } else if (evt.type === "kind_suggestion") {
          // Server noticed the input is a job-board URL running down the person
          // path — remember it so an eventual dead-end offers the job switch.
          if (evt.suggest === "job") patch(id, () => ({ suggestedKind: "job" }));
        } else if (evt.type === "needs_disambiguation") {
          // Only claim there's a list to pick from when there actually is one.
          // An empty list on a job-looking input means the person flow was
          // handed a posting — offer the switch instead of a dead end.
          const candidates = Array.isArray(evt.data) ? evt.data : [];
          const suggestJob = candidates.length === 0 && detectKind(run.input) === "job";
          patch(id, (r) => ({
            stage: "error",
            candidates: candidates.length ? candidates : null,
            suggestedKind: suggestJob ? "job" : (r.suggestedKind ?? null),
            error: candidates.length
              ? "Multiple people matched — pick the right one below."
              : (suggestJob || r.suggestedKind === "job")
                ? "This looks like a job posting, not a person."
                : "Couldn't identify a specific person from that input. Try a full name plus their company, or paste their LinkedIn/X profile link, then retry.",
          }));
          return;
        } else if (evt.type === "complete") {
          completed = true;
          patch(id, (r) => ({
            enrichment: collectedEnrichment || r.enrichment,
            drafts: collectedDrafts.length ? collectedDrafts : r.drafts,
            person: collectedPerson || r.person,
            progress: { person: 100, email: 100, outreach: 100 },
            stage: "done",
          }));
        } else if (evt.type === "error") {
          throw Object.assign(new Error(evt.message || "compose error"), { serverReported: true });
        }
      }
    }
    // Some streams end without an explicit 'complete' event — fall through.
    if (!completed && collectedDrafts.length) {
      patch(id, (r) => ({
        enrichment: collectedEnrichment || r.enrichment,
        drafts: collectedDrafts,
        person: collectedPerson || r.person,
        progress: { person: 100, email: 100, outreach: 100 },
        stage: "done",
      }));
    }
  } catch (e) {
    if (signal.aborted) return; // dismissed/cleared — not an error
    if (navigatingForAuth) return; // page is leaving for OAuth — not a real failure
    // A terminal error the server already reported (and persisted) — show it now.
    if (e?.serverReported) {
      patch(id, () => ({ stage: "error", error: String(e?.message || e), reconnecting: false }));
      return;
    }
    // Otherwise this is a network drop (the classic: phone locked / tab
    // backgrounded kills the streaming connection). Not a real failure — the
    // server keeps running and persists to compose_runs, so recover by polling
    // for the finished run instead of giving up with "Load failed".
    const recovered = await recoverFromDrop(id, signal);
    if (!recovered) {
      patch(id, () => ({ stage: "error", error: String(e?.message || e), reconnecting: false }));
    }
  } finally {
    controllers.delete(id);
    // Reaching here means the run settled (done / terminal error / recovery
    // exhausted) within a live session — drop its cross-reload recovery entry.
    // If the page is killed mid-flight this never runs, so the entry survives
    // for resumePendingRuns() to pick up on the next load.
    clearPending(id);
  }
}

// Observe a durable job run by polling its persisted row until it settles. The
// run executes server-side (background continuation + cron-worker backstop), so
// this only READS: it drives the live progress bars off the row's append-only
// `steps`, and once terminal rebuilds the finished package from `output` via
// applyPersisted. Foreground-budgeted (a backgrounded tab spends nothing) and
// effectively unbounded while the run is in flight — a genuinely dead run is
// marked errored server-side, which we then observe and surface.
async function observeRun(id: string, composeRunId: string, signal: AbortSignal) {
  // Per-run accumulators, mirrored from the old streaming reducer. A cursor over
  // the append-only steps array applies each event exactly once, so array pushes
  // (drafts) never double-count across polls.
  const collectedDrafts: unknown[] = [];
  let collectedCandidates: unknown[] | null = null;
  let bundle = { ats_score: null, ats_score_before: null, target_role: null, target_company: null, team: null, resume: null };
  let cursor = 0;

  const patchContact = (slot: string, partial: Partial<ContactData>) =>
    patch(id, (r) => {
      const contacts = { ...(r.contacts || {}) } as Record<string, ContactData>;
      const cur = contacts[slot] || { person: null, enrichment: null, drafts: [] };
      contacts[slot] = { ...cur, ...partial };
      return { contacts };
    });
  const pushContactDraft = (slot: string, d: unknown) =>
    patch(id, (r) => {
      const contacts = { ...(r.contacts || {}) } as Record<string, ContactData>;
      const cur = contacts[slot] || { person: null, enrichment: null, drafts: [] };
      contacts[slot] = { ...cur, drafts: [...(cur.drafts || []), d] };
      return { contacts };
    });

  // Apply one persisted step event to the live run — the progress/data half of
  // the old SSE reducer. Terminal events (compose_run / complete / error /
  // person_saved / needs_disambiguation) are ignored here: the terminal state is
  // reconciled authoritatively from `output` by applyPersisted below.
  const applyStep = (evt: { type?: string; id?: string; status?: string; slot?: string; label?: string; chars?: number; bullets?: number; data?: unknown; message?: string }) => {
    if (evt.type === "needs_job_text") {
      patch(id, () => ({ needsJobText: { label: String(evt.label || "This board") } }));
      return;
    }
    if (evt.type === "activity" && typeof evt.id === "string" && typeof evt.label === "string") {
      patch(id, (r) => ({ activity: { ...(r.activity || {}), [evt.id!]: evt.label } }));
      return;
    }
    if (evt.type === "progress" && evt.id === "resume") {
      const chars = Number(evt.chars) || 0;
      const bullets = Number(evt.bullets) || 0;
      patch(id, (r) => ({
        tailor: { chars, bullets },
        activity: {
          ...(r.activity || {}),
          resume: bullets > 0
            ? `writing your resume — ${bullets} bullet${bullets === 1 ? "" : "s"} so far`
            : "writing your resume",
        },
        progress: {
          ...r.progress,
          resume: Math.max(r.progress?.resume || 0, Math.min(PROGRESS_EASE_CEILING, 10 + Math.round((chars / 9000) * 78))),
        },
      }));
      return;
    }
    if (evt.type === "step") {
      const k = evt.id!;
      if (evt.status === "start") patch(id, (r) => ({
        progress: { ...r.progress, [k]: Math.max(r.progress?.[k] || 0, 10) },
        activity: STEP_START_ACTIVITY[k] ? { ...(r.activity || {}), [k]: STEP_START_ACTIVITY[k] } : r.activity,
      }));
      else if (evt.status === "done" || evt.status === "skipped")
        patch(id, (r) => ({ progress: { ...r.progress, [k]: 100 } }));
      else if (evt.status === "error")
        patch(id, (r) => ({
          progress: { ...r.progress, [k]: 100 },
          stepErrors: { ...(r.stepErrors || {}), [k]: evt.message || "failed" },
        }));
      if (evt.slot) {
        if (k === "person" && evt.status === "done" && evt.data) patchContact(evt.slot, { person: evt.data });
        if (k === "email" && evt.data) patchContact(evt.slot, { enrichment: evt.data });
        if (k === "outreach" && evt.status === "done" && evt.data) pushContactDraft(evt.slot, evt.data);
      } else {
        if (k === "resume" && evt.status === "done" && evt.data) {
          bundle = { ...bundle, ...(evt.data as object) };
          patch(id, (r) => ({
            parsed: {
              ...(r.parsed || {}),
              ...bundle,
              unparsed: false,
              role: bundle.target_role || r.parsed?.role,
              company: bundle.target_company || r.parsed?.company,
              team: bundle.team ?? r.parsed?.team,
              ats_score: bundle.ats_score ?? r.parsed?.ats_score,
              ats_score_before: bundle.ats_score_before ?? r.parsed?.ats_score_before,
              resume: bundle.resume ?? r.parsed?.resume,
            },
          }));
        }
        if (k === "person" && evt.status === "done" && evt.data) {
          patch(id, () => ({ person: evt.data }));
        }
        if (k === "email" && evt.data) {
          patch(id, () => ({ enrichment: evt.data }));
        }
        if (k === "outreach" && evt.status === "done" && evt.data) {
          collectedDrafts.push(evt.data);
          patch(id, () => ({ drafts: [...collectedDrafts] }));
        }
        if (k === "application" && evt.status === "done") {
          const qs = Array.isArray((evt.data as { questions?: unknown })?.questions) ? (evt.data as { questions: unknown[] }).questions : [];
          patch(id, () => ({ applicationQuestions: qs }));
        }
      }
      return;
    }
    if (evt.type === "saved") {
      if (typeof (evt as { id?: unknown }).id === "string") patch(id, () => ({ savedApplicationId: (evt as { id: string }).id }));
      return;
    }
    if (evt.type === "candidates") {
      collectedCandidates = Array.isArray(evt.data) ? (evt.data as unknown[]) : [];
      const n = collectedCandidates.length;
      patch(id, (r) => ({
        candidates: collectedCandidates,
        activity: {
          ...(r.activity || {}),
          person: n > 0 ? `found ${n} ${n === 1 ? "person" : "people"} — ranking who decides` : "no obvious contact yet — widening the search",
        },
      }));
      return;
    }
    if (evt.type === "contact_meta") {
      if (evt.slot && (evt.data as { sameAsPoster?: boolean })?.sameAsPoster) patchContact(evt.slot, { sameAsPoster: true });
      return;
    }
    // compose_run / complete / error / person_saved / needs_disambiguation → ignored.
  };

  // Poll loop. Budget is FOREGROUND time (waitForVisible parks a hidden tab), so
  // locking the phone never burns it. The cap is generous; if we somehow exhaust
  // it the run is left as-is for the next mount's resumePendingRuns to re-adopt.
  let spent = 0;
  let delay = 1500;
  const budgetMs = 20 * 60 * 1000;
  while (spent < budgetMs) {
    if (signal.aborted) return;
    let persisted: PersistedComposeRun | null = null;
    try {
      const res = await fetch(`/api/compose/history/${composeRunId}`, { signal });
      if (res.ok) {
        const json = await res.json().catch(() => null);
        persisted = json?.run ?? null;
      }
    } catch {
      if (signal.aborted) return;
      // transient — keep polling
    }
    if (persisted) {
      const steps = Array.isArray((persisted as { steps?: unknown[] }).steps) ? (persisted as { steps: unknown[] }).steps : [];
      for (; cursor < steps.length; cursor++) {
        try { applyStep(steps[cursor] as Parameters<typeof applyStep>[0]); } catch { /* one bad step never derails the run */ }
      }
      if (persisted.outcome && persisted.outcome !== "in_flight") {
        applyPersisted(id, persisted);
        return;
      }
    }
    await sleep(delay, signal);
    if (signal.aborted) return;
    await waitForVisible(signal);
    if (signal.aborted) return;
    spent += delay;
    delay = Math.min(Math.round(delay * 1.4), 9000);
  }
}

// Patch the live run with the server-reported resume_generations id AND
// register it for cross-reload recovery — the resume twin of setComposeRunId.
function setResumeGenerationId(localId: string, generationId: string, run: Run) {
  patch(localId, () => ({ resumeGenerationId: generationId }));
  rememberPending({
    composeRunId: generationId,
    kind: "resume",
    input: run.input,
    intent: null,
    createdAt: run.createdAt,
  });
}

// Stream /api/resume/tailor for a kind:"resume" run. Same drop-recovery
// contract as streamRun: server-reported errors surface immediately; a network
// drop polls the persisted generation row instead of giving up.
async function streamResumeRun(run: Run, signal: AbortSignal) {
  const id = run.id;
  const req = run.resumeRequest || {};

  try {
    const res = await fetch("/api/resume/tailor", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({
        job_url: req.jobUrl || undefined,
        highlights: req.highlights || undefined,
        page_count: req.pageCount === 2 ? 2 : 1,
      }),
      signal,
    });
    if (!res.ok || !res.body) {
      if (res.status === 429) {
        throw Object.assign(new Error(ANON_LIMIT_MESSAGE), { serverReported: true });
      }
      // Non-stream failures (400/401) carry a JSON error worth showing as-is.
      let message = `tailor failed: ${res.status}`;
      try {
        const j = await res.json();
        if (j?.error) message = j.error;
      } catch {
        // no JSON body — keep the status message
      }
      throw Object.assign(new Error(message), { serverReported: true });
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let sawResume = false;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() || "";
      for (const raw of parts) {
        const line = raw.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        let evt;
        try {
          evt = JSON.parse(line.slice(6));
        } catch {
          continue;
        }
        if (evt.type === "resume_run" && typeof evt.id === "string") {
          setResumeGenerationId(id, evt.id, run);
        } else if (evt.type === "progress") {
          // ~chars of resume JSON written so far → ease the bar with real work.
          const chars = Number(evt.chars) || 0;
          const bullets = Number(evt.bullets) || 0;
          patch(id, (r) => ({
            tailor: { chars, bullets },
            progress: {
              ...r.progress,
              tailor: Math.max(
                r.progress?.tailor || 0,
                Math.min(PROGRESS_EASE_CEILING, 10 + Math.round((chars / 9000) * 78)),
              ),
            },
          }));
        } else if (evt.type === "step" && evt.id === "tailor" && evt.status === "done" && evt.data?.resume) {
          sawResume = true;
          const resume = evt.data.resume;
          patch(id, (r) => ({
            parsed: {
              ...(r.parsed || {}),
              resume,
              ats_score: resume?.meta?.ats_score ?? r.parsed?.ats_score,
              ats_score_before: resume?.meta?.ats_score_before ?? r.parsed?.ats_score_before,
              role: resume?.meta?.target_role ?? r.parsed?.role,
              company: resume?.meta?.target_company ?? r.parsed?.company,
            },
          }));
        } else if (evt.type === "saved" && typeof evt.id === "string") {
          patch(id, () => ({ resumeGenerationId: evt.id }));
        } else if (evt.type === "error") {
          throw Object.assign(new Error(evt.message || "tailor error"), { serverReported: true });
        }
      }
    }
    if (!sawResume) {
      throw Object.assign(new Error("The run ended before a resume was produced."), {
        serverReported: true,
      });
    }
    patch(id, (r) => ({
      progress: { ...r.progress, tailor: 100 },
      stage: "done",
      error: null,
      reconnecting: false,
    }));
  } catch (e) {
    if (signal.aborted) return; // dismissed/cleared — not an error
    if (navigatingForAuth) return; // page is leaving for OAuth — not a real failure
    if (e?.serverReported) {
      patch(id, () => ({ stage: "error", error: String(e?.message || e), reconnecting: false }));
      return;
    }
    // Network drop — the server keeps tailoring and finalizes the row; poll it.
    const recovered = await recoverResumeFromDrop(id, signal);
    if (!recovered) {
      patch(id, () => ({ stage: "error", error: String(e?.message || e), reconnecting: false }));
    }
  } finally {
    controllers.delete(id);
    clearPending(id);
  }
}

// The connection died mid-stream but the server-side run lives on. If we already
// learned the compose_runs id, keep the working UI and poll the persisted run
// until it finishes (or we give up), then patch the result in. Returns true when
// it handled the drop (recovered OR set its own terminal state), false when it
// can't recover (no run id yet) so the caller hard-errors.
async function recoverFromDrop(id: string, signal: AbortSignal): Promise<boolean> {
  const run = runs.find((r) => r.id === id);
  const composeRunId = run?.composeRunId;
  if (!composeRunId) return false; // dropped before we knew the run — can't recover

  patch(id, () => ({ reconnecting: true, error: null, stage: "working" }));

  const settled = await pollPersistedUntilSettled(id, composeRunId, signal);
  if (!settled) {
    patch(id, () => ({
      reconnecting: false,
      stage: "error",
      error: DROP_MESSAGE,
    }));
  }
  return true;
}

// The resume twin of recoverFromDrop: poll the persisted resume_generations
// row until the server-side tailor settles it, then adopt that result.
async function recoverResumeFromDrop(id: string, signal: AbortSignal): Promise<boolean> {
  const run = runs.find((r) => r.id === id);
  const generationId = run?.resumeGenerationId;
  if (!generationId) return false; // dropped before we knew the row — can't recover

  patch(id, () => ({ reconnecting: true, error: null, stage: "working" }));

  const settled = await pollResumeUntilSettled(id, generationId, signal);
  if (!settled) {
    patch(id, () => ({
      reconnecting: false,
      stage: "error",
      error: DROP_MESSAGE,
    }));
  }
  return true;
}

const DROP_MESSAGE =
  "Lost the connection (the app was backgrounded) before the run finished. Tap Retry — your work so far is saved in History.";

// Poll a persisted row until it leaves `in_flight`, then patch the result into
// the live run. Shared by the mid-stream drop recovery and the cross-reload
// resume path; `checkOnce` fetches + applies and returns true once terminal.
//
// The budget is counted in FOREGROUND time, not wall-clock: a poll is only
// spent after the tab is visible again (background timers are frozen anyway, and
// the server can't run past its own maxDuration). So locking the phone for ten
// minutes no longer burns the recovery window. Returns true once it applied a
// terminal result, false if the budget ran out with the run still in flight.
async function pollUntilSettled(
  signal: AbortSignal,
  checkOnce: () => Promise<boolean>,
  budgetMs = 4 * 60 * 1000,
): Promise<boolean> {
  let spent = 0;
  let delay = 2500;
  while (spent < budgetMs) {
    if (signal.aborted) return true;
    await sleep(delay, signal);
    if (signal.aborted) return true;
    // Don't spend the budget (or a poll) while backgrounded — wait for foreground.
    await waitForVisible(signal);
    if (signal.aborted) return true;
    spent += delay;
    try {
      if (await checkOnce()) return true;
    } catch {
      if (signal.aborted) return true;
      // transient — keep polling
    }
    delay = Math.min(Math.round(delay * 1.4), 9000);
  }
  return false;
}

function pollPersistedUntilSettled(
  localId: string,
  composeRunId: string,
  signal: AbortSignal,
  budgetMs?: number,
): Promise<boolean> {
  return pollUntilSettled(
    signal,
    async () => {
      const res = await fetch(`/api/compose/history/${composeRunId}`, { signal });
      if (!res.ok) return false;
      const json = await res.json().catch(() => null);
      const persisted = json?.run;
      if (persisted && persisted.outcome && persisted.outcome !== "in_flight") {
        applyPersisted(localId, persisted);
        return true;
      }
      return false;
    },
    budgetMs,
  );
}

function pollResumeUntilSettled(
  localId: string,
  generationId: string,
  signal: AbortSignal,
  budgetMs?: number,
): Promise<boolean> {
  return pollUntilSettled(
    signal,
    async () => {
      const res = await fetch(`/api/resume/history/${generationId}`, { signal });
      if (!res.ok) return false;
      const json = await res.json().catch(() => null);
      const gen = json?.generation;
      if (gen && gen.status && gen.status !== "in_flight") {
        applyPersistedResume(localId, gen);
        return true;
      }
      return false;
    },
    budgetMs,
  );
}

// Replay any in-flight runs left behind by a previous session (typically a
// mobile tab the OS reclaimed while the run was still streaming). For each
// survivor not already in the store, drop in a "reconnecting" placeholder and
// poll its persisted row to completion. Idempotent and safe to call on every
// mount — finished/duplicate entries are skipped. Call from a client effect so
// it never runs during SSR (which would also desync hydration).
export function resumePendingRuns() {
  if (typeof window === "undefined") return;
  const pending = loadPending();
  if (!pending.length) return;
  // Prune any entries we already trimmed by age back to storage.
  savePending(pending);

  for (const entry of pending) {
    // For resume entries the stored id is a resume_generations row id — dedupe
    // against the matching field.
    const isResume = entry.kind === "resume";
    const already = isResume
      ? runs.some((r) => r.resumeGenerationId === entry.composeRunId)
      : runs.some((r) => r.composeRunId === entry.composeRunId);
    if (already) continue;

    const localId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `run_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const run: Run = {
      id: localId,
      input: entry.input,
      intent: entry.intent ?? undefined,
      providedEmail: false,
      kind: entry.kind,
      stage: "working",
      parsed: null,
      progress: isResume ? { tailor: 10 } : {},
      drafts: null,
      enrichment: null,
      person: null,
      candidates: null,
      error: null,
      createdAt: entry.createdAt || Date.now(),
      reconnecting: true,
      composeRunId: isResume ? null : entry.composeRunId,
      resumeGenerationId: isResume ? entry.composeRunId : undefined,
    };
    runs = [run, ...runs];
    emit();

    const controller = new AbortController();
    controllers.set(localId, controller);
    void (async () => {
      try {
        const settled = isResume
          ? await pollResumeUntilSettled(localId, entry.composeRunId, controller.signal)
          : await pollPersistedUntilSettled(localId, entry.composeRunId, controller.signal);
        if (!settled && !controller.signal.aborted) {
          patch(localId, () => ({ reconnecting: false, stage: "error", error: DROP_MESSAGE }));
        }
      } finally {
        forgetPending(entry.composeRunId);
        controllers.delete(localId);
      }
    })();
  }
}

// Patch a live run in place from its persisted compose_runs row (same field
// mapping as hydrateRun, but onto the existing run rather than a fresh one).
function applyPersisted(id: string, persisted: PersistedComposeRun) {
  const out = persisted.output || {};
  const stage: RunStage = persisted.outcome === "complete" ? "done" : "error";
  const progress =
    persisted.outcome === "complete"
      ? persisted.kind === "job"
        ? { resume: 100, person: 100, email: 100, outreach: 100 }
        : { person: 100, email: 100, outreach: 100 }
      : undefined;
  patch(id, (r) => ({
    parsed: out.parsed ?? r.parsed,
    drafts: Array.isArray(out.drafts) && out.drafts.length ? out.drafts : r.drafts,
    enrichment: out.enrichment ?? r.enrichment,
    person: out.person ?? r.person,
    candidates: Array.isArray(out.candidates) ? out.candidates : r.candidates,
    contacts: out.contacts ?? r.contacts,
    applicationQuestions: Array.isArray(out.questions) ? out.questions : r.applicationQuestions,
    applicationAnswers: Array.isArray(out.answers) ? out.answers : r.applicationAnswers,
    progress: progress ?? r.progress,
    error: persisted.outcome === "complete" ? null : (persisted.error ?? r.error),
    reconnecting: false,
    stage,
  }));
}

// The resume twin of applyPersisted: patch a live resume run in place from its
// persisted resume_generations row. Also rebuilds the original request off the
// row so Retry can re-tailor even when the run was revived after a reload.
function applyPersistedResume(
  id: string,
  gen: {
    id: string;
    status?: string | null;
    error?: string | null;
    resume?: unknown;
    ats_score?: number | null;
    target_role?: string | null;
    target_company?: string | null;
    job_url?: string | null;
    highlights?: string | null;
    page_count?: number | null;
  },
) {
  const resume = gen.resume ?? null;
  const complete = gen.status === "complete" && !!resume;
  patch(id, (r) => ({
    resumeGenerationId: gen.id,
    resumeRequest: r.resumeRequest ?? {
      jobUrl: gen.job_url || undefined,
      highlights: gen.highlights || undefined,
      pageCount: gen.page_count === 2 ? 2 : 1,
    },
    parsed: complete
      ? {
          ...(r.parsed || {}),
          resume,
          ats_score: gen.ats_score ?? resume?.meta?.ats_score ?? r.parsed?.ats_score,
          ats_score_before: resume?.meta?.ats_score_before ?? r.parsed?.ats_score_before,
          role: gen.target_role ?? r.parsed?.role,
          company: gen.target_company ?? r.parsed?.company,
        }
      : r.parsed,
    progress: { ...r.progress, tailor: 100 },
    stage: complete ? "done" : "error",
    error: complete ? null : (gen.error || "Resume tailoring failed."),
    reconnecting: false,
  }));
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });
}

// Resolves once the document is foreground again (immediately if it already is).
function waitForVisible(signal?: AbortSignal): Promise<void> {
  if (typeof document === "undefined" || !document.hidden) return Promise.resolve();
  return new Promise((resolve) => {
    const cleanup = () => {
      document.removeEventListener("visibilitychange", onVis);
      signal?.removeEventListener("abort", onAbort);
    };
    const onVis = () => { if (!document.hidden) { cleanup(); resolve(); } };
    const onAbort = () => { cleanup(); resolve(); };
    document.addEventListener("visibilitychange", onVis);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export { detectKind } from "@/lib/kind-detect";

function inferPersonV3(input: string) {
  const lo = (input || "").toLowerCase();
  if (lo.includes("maya")) {
    return {
      chosen: makeP("Maya Rao", "MR", "Head of Ops", "Ramp", "ramp", "Maya", 92, "NYC",
        "posted 4h ago about hiring ops", ["shipped Bill Pay ops in 8mo", "ex-Brex, Capital One", "replies long-form", 'allergic to "circling back"']),
      candidates: [
        makeP("Maya Rao", "MR", "Head of Ops", "Ramp", "ramp", "Maya", 92, "NYC"),
        makeP("Maya Patel", "MP", "Sr Ops Lead", "Ramp · Bill Pay", "ramp", "Maya", 78, "NYC"),
        makeP("Maya Gupta", "MG", "Ops PM", "Ramp", "ramp", "Maya", 64, "Remote"),
      ],
    };
  }
  if (lo.includes("anika") || lo.includes("stripe")) {
    return {
      chosen: makeP("Anika Mehta", "AM", "Senior Product Designer", "Stripe", "stripe", "Anika", 96, "NYC",
        "last post 4h · Atlas pricing thread", ["shipped Atlas pricing redesign", "long-form > 1-liners", "IIT-D · Stanford d.school", 'hates "hope this finds you well"']),
      candidates: [
        makeP("Anika Mehta", "AM", "Senior Product Designer", "Stripe", "stripe", "Anika", 96, "NYC"),
        makeP("Aniket Sharma", "AS", "Product Designer", "Stripe", "stripe", "Aniket", 71, "SF"),
        makeP("Anita Rao", "AR", "PM · Atlas", "Stripe", "stripe", "Anita", 68, "NYC"),
      ],
    };
  }
  return {
    chosen: makeP("Vishnu Sivaji", "VS", "Product Director", "Google DeepMind", "google", "Vishnu", 88, "London",
      "recently joined · 1mo ago", ["ex-Anthropic research", "transitioning to / recently joined Google DeepMind", "writes long-form", "prefers cold DMs over emails"]),
    candidates: [
      makeP("Vishnu Sivaji", "VS", "Product Director", "Google DeepMind", "google", "Vishnu", 88, "London"),
      makeP("Vinod Shankar", "VS", "Engineering Director", "Google DeepMind", "google", "Vinod", 62, "Mountain View"),
      makeP("Vivek Singh", "VS", "Product Lead", "Google", "google", "Vivek", 58, "Bangalore"),
    ],
  };
}

function makeP(name, initials, role, company, slug, firstName, confidence, location, signal = "replies long-form", facts: string[] = []) {
  return {
    name, initials, role, company,
    companySlug: slug, firstName, confidence, location,
    signal,
    angle: "pricing tables in Atlas",
    recent: "Atlas pricing redesign",
    detail: "discount-stacking edge case",
    facts: facts.length ? facts : ["recent product launches", "replies long-form", "writes on x weekly"],
  };
}

function inferJobV3(input: string) {
  const lo = (input || "").toLowerCase();
  if (lo.includes("stripe")) return {
    logo: "S", company: "Stripe · Payments", role: "Senior Product Designer · Atlas",
    location: "NYC · hybrid", comp: "$220k–$280k", posted: "Posted 3d ago",
    tags: ["design systems", "fintech", "b2b", "shipped products", "figma + prototyping"],
  };
  if (lo.includes("ramp")) return {
    logo: "R", company: "Ramp", role: "Staff Engineer · Bill Pay",
    location: "NYC · onsite 3d", comp: "$260k–$340k", posted: "Posted 6d ago",
    tags: ["typescript", "postgres", "high-throughput", "payments rails", "led teams 5+"],
  };
  if (lo.includes("anthropic")) return {
    logo: "A", company: "Anthropic", role: "Design Engineer · Claude",
    location: "SF · onsite 3d", comp: "$240k–$320k", posted: "Posted 1d ago",
    tags: ["react + typescript", "tight design taste", "shipped LLM UX", "systems thinking"],
  };
  // Unknown: real fetch+parse runs server-side on send. Return an honest
  // "not parsed yet" shape, not fabricated company/role/skills.
  return { unparsed: true, source: (input || "").trim() };
}

export function jobHost(source: string) {
  const s = (source || "").trim();
  if (!s) return "";
  try {
    return new URL(s.match(/^https?:\/\//) ? s : `https://${s}`).hostname.replace(/^www\./, "");
  } catch {
    return s;
  }
}
