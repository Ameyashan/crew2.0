// Pure, render-free helpers for the Desk + composer (Phase 3 of the jugaadu
// reskin). Extracted from compose/page.tsx so they can be unit-tested under
// `node --test` — the page file imports React / next/navigation / Supabase and
// can't run in that context. Same split the top bar uses (top-bar-logic.ts).
//
// Nothing here reaches into the DOM or localStorage directly: the component owns
// the side effects (reading storage, fetching), these functions own the rules.

import { RUN_STATUS_LABEL, runStatusState, type RunStatusState } from "./run-status.ts";
import { liveRunTitle, type LiveRunTitleInput } from "./run-view-logic.ts";

// ── Composer suggestion pills ────────────────────────────────────────────────
// The three pills under the composer. Each just seeds the paste box with a
// starter prompt the user completes; classifyKind + the run store route it from
// there (see plan.md — "simple setInput(...) triggers").
export const SUGGESTION_PILLS = [
  { id: "apply", label: "Apply to a role", fill: "Apply to this job: " },
  { id: "resume", label: "Just a resume", fill: "Tailor my resume for " },
  { id: "find", label: "Find the right person", fill: "Find people at " },
] as const;

export type SuggestionPill = (typeof SUGGESTION_PILLS)[number];

// ── First-time "Things your crew can do" cards ───────────────────────────────
// Shown only before the account has any run. Tapping one seeds the composer.
export const FIRST_TIME_CARDS = [
  {
    id: "apply",
    title: '"Apply to this job link"',
    desc: "Weaves a resume from your Story, finds 3 people who could say yes, drafts email + LinkedIn + X for each.",
    chips: ["resume", "person", "email", "outreach"],
    fill: "Apply to this job: ",
  },
  {
    id: "log",
    title: '"Log: the quarterly review greenlit 3 of my projects"',
    desc: "Everything you do, captured in your own words. Your Story is what resumes get woven from.",
    chips: ["story", "resume"],
    fill: "Log: ",
  },
  {
    id: "find",
    title: '"Find me people at Stripe who run design"',
    desc: "Scans the team, ranks by who actually decides, drafts outreach for every channel.",
    chips: ["person", "email", "outreach"],
    fill: "Find people at ",
  },
] as const;

// ── Screenshot attach validation ─────────────────────────────────────────────
// The single source of truth for "is this file an attachable screenshot", shared
// by the file-picker, paste, drag-drop, and sample-row paths. Returns the exact
// `screenshot` shape the composer's setScreenshot(...) expects, or an error.
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type ScreenshotLike = { name: string; size: string; file: File };
export type ValidateResult =
  | { ok: true; error: null; screenshot: ScreenshotLike }
  | { ok: false; error: string | null; screenshot: null };

type FileLike = { type: string; size: number; name: string };

export function validateScreenshot(
  file: FileLike | null | undefined,
  opts: { allowedTypes?: string[]; maxBytes?: number } = {},
): ValidateResult {
  const allowed = opts.allowedTypes ?? ALLOWED_IMAGE_TYPES;
  const maxBytes = opts.maxBytes ?? MAX_IMAGE_BYTES;
  if (!file) return { ok: false, error: null, screenshot: null };
  if (!allowed.includes(file.type)) {
    return { ok: false, error: "Use a PNG, JPG, WEBP, or GIF.", screenshot: null };
  }
  if (file.size > maxBytes) {
    return { ok: false, error: "Image must be under 5MB.", screenshot: null };
  }
  return {
    ok: true,
    error: null,
    screenshot: { name: file.name, size: `${Math.round(file.size / 1024)} KB`, file: file as File },
  };
}

// Pull the first image file out of a paste ClipboardEvent's items, if any.
export function imageFromClipboard(
  items: ReadonlyArray<{ type: string; getAsFile: () => File | null }> | null | undefined,
): File | null {
  if (!items) return null;
  for (const it of items) {
    if (it.type && it.type.indexOf("image") === 0) return it.getAsFile();
  }
  return null;
}

// ── Thin-Story derivation + dismissal key ────────────────────────────────────
// The Story is "empty" when the account has no Story entries AND no resume on
// file — either is material the crew can weave from. `entryCount` wins when
// known (Phase E's story_entries model); the resume_text fallback keeps accounts
// that onboarded before Story existed from suddenly flipping to thin.
// Threaded down to Phase 4's thin-Story states as a single flag.
export function deriveStoryIsEmpty(
  profile: { resume_text?: string | null } | null | undefined,
  entryCount?: number | null,
): boolean {
  if (typeof entryCount === "number" && entryCount > 0) return false;
  if (!profile) return true;
  const text = typeof profile.resume_text === "string" ? profile.resume_text.trim() : "";
  return text.length === 0;
}

// Per-account localStorage key for the "Your Story is empty" nudge dismissal, so
// it persists across reloads but NOT across a different account.
export const STORY_NUDGE_PREFIX = "crew.storyNudge.v1";
export function storyNudgeKey(userKey?: string | null): string {
  const k = (userKey || "").trim().toLowerCase();
  return k ? `${STORY_NUDGE_PREFIX}:${k}` : STORY_NUDGE_PREFIX;
}

// ── Desk headline ────────────────────────────────────────────────────────────
// Prototype `deskHeadline` (line 1302): signed-out pitch → first-time welcome →
// returning greeting. `signedIn` is the tri-state the session probe returns.
// Returning signed-in users get a personalized "Welcome back, {first} — …", but
// only once we've confirmed the session AND resolved a name; while either is
// still pending (signedIn null, or name not yet loaded) we fall back to the
// neutral prompt rather than flashing the wrong variant.
export function deskHeadline(
  signedIn: boolean | null,
  firstTime: boolean,
  name?: string | null,
): string {
  if (signedIn === false) return "A crew of agents for your job hunt.";
  const first = (name || "").trim().split(/\s+/)[0] || "";
  if (signedIn === true && firstTime) return first ? `Welcome, ${first}.` : "Welcome.";
  if (signedIn === true && first) return `Welcome back, ${first} — what should the crew get done?`;
  return "What should the crew get done?";
}

// ── First-time gate ──────────────────────────────────────────────────────────
// The 3-card grid + first-time headline show only when the account has produced
// nothing yet (no compose runs, no resume generations).
export function isFirstTime(composeCount: number, resumeCount: number): boolean {
  return (composeCount || 0) === 0 && (resumeCount || 0) === 0;
}

// ── Earlier-runs rows (Desk) ─────────────────────────────────────────────────
// Derive the "Earlier runs" list from the same history payload the history page
// fetches (compose runs + resume generations). Newest first, capped at `limit`.
export type EarlierChip = { label: string; tone: "done" | "progress" | "attention" | "error" };
export type EarlierRow = {
  key: string;
  agent: "compose" | "resume";
  // compose_runs.kind ("job" | "person") for compose rows.
  kind?: string;
  id: string;
  title: string;
  chips: EarlierChip[];
  created_at: string;
};

// Loose shapes for the two history payloads — only the fields the Desk reads.
// The endpoints return more; unknowns are tolerated.
export type ComposeRunRow = {
  id: string;
  created_at: string;
  kind?: string;
  outcome?: string | null;
  input?: string | null;
  // The id of the resume_generations row a job run created (if any). Used to
  // drop that generation from the merged list — see dropLinkedResumeRuns.
  resume_generation_id?: string | null;
  person?: { name?: string | null } | null;
  // The tailored résumé joined by the history list (compose_runs → resume_generations).
  // Gives a job row its real role/company without shipping the full `output` blob.
  resume_generation?: { target_role?: string | null; target_company?: string | null } | null;
  output?: {
    parsed?: { target_role?: string; role?: string; target_company?: string } | null;
    person?: { name?: string | null } | null;
  } | null;
};
export type ResumeRunRow = {
  id: string;
  created_at: string;
  target_role?: string | null;
  status?: string | null;
  ats_score?: number | null;
};
export type RunRow = ComposeRunRow & ResumeRunRow;

function personHost(s: string | null | undefined): string {
  const t = (s || "").trim();
  if (!t) return "";
  try {
    return new URL(t.match(/^https?:\/\//) ? t : `https://${t}`).hostname.replace(/^www\./, "");
  } catch {
    return t;
  }
}

export function deskRunTitle(agent: "compose" | "resume", row: RunRow): string {
  if (agent === "resume") {
    return row?.target_role || (row?.status === "in_flight" ? "Tailoring…" : "Tailored resume");
  }
  if (row?.kind === "job") {
    // `output` is only present on the detail fetch; the history list instead
    // joins the tailored résumé, so read the role/company from either source
    // before falling back to the job link's host — anything but a row of
    // indistinguishable "Job application" entries.
    const parsed = row?.output?.parsed;
    const gen = row?.resume_generation;
    return (
      parsed?.target_role ||
      parsed?.role ||
      gen?.target_role ||
      parsed?.target_company ||
      gen?.target_company ||
      personHost(row?.input) ||
      "Job application"
    );
  }
  return row?.person?.name || row?.output?.person?.name || personHost(row?.input) || row?.input || "Outreach";
}

export function deskRunChips(agent: "compose" | "resume", row: RunRow): EarlierChip[] {
  // Labels come from the shared run-status lexicon (run-status.ts); the tones
  // stay as they were so the row colours don't change.
  if (agent === "resume") {
    if (row?.status === "in_flight") return [{ label: RUN_STATUS_LABEL.running, tone: "progress" }];
    if (row?.status === "error") return [{ label: RUN_STATUS_LABEL["needs-you"], tone: "error" }];
    return [{ label: row?.ats_score != null ? `ATS ${row.ats_score}` : "tailored", tone: "done" }];
  }
  const outcome = row?.outcome;
  if (outcome === "complete") return [{ label: RUN_STATUS_LABEL.ready, tone: "done" }];
  if (outcome === "in_flight") return [{ label: RUN_STATUS_LABEL.running, tone: "progress" }];
  if (outcome === "needs_disambiguation") return [{ label: RUN_STATUS_LABEL["needs-you"], tone: "attention" }];
  return [{ label: RUN_STATUS_LABEL["needs-you"], tone: "error" }];
}

// A job compose run tailors its résumé through a child resume_generations row
// (compose_runs.resume_generation_id). /api/resume/history returns ALL
// generations, so merging the two feeds naively lists every job application
// twice — once as the full package ("ready") and once as its child résumé
// ("ATS n"), and the child opens as a resume-only view missing the rest of the
// package. Drop generations a compose run owns; the standalone tailors remain.
// Shared by the Desk (deskEarlierRuns) and the history page's feed.
export function dropLinkedResumeRuns<T extends { id: string }>(
  composeRuns: ReadonlyArray<{ resume_generation_id?: string | null }> | null | undefined,
  resumeRuns: ReadonlyArray<T> | null | undefined,
): T[] {
  const linked = new Set<string>();
  for (const r of composeRuns || []) {
    if (r?.resume_generation_id) linked.add(r.resume_generation_id);
  }
  return (resumeRuns || []).filter((r) => !linked.has(r.id));
}

// `excludeIds` holds the server row ids of runs that are currently LIVE in the
// store (surfaced as the top-bar chip / focused card). Their history rows are
// filtered out so a single run never appears twice — once live and once here.
// (Runs merely reopened from history — hydrated — must NOT be in this set: once
// unfocused they're surfaced nowhere, so excluding them makes rows vanish.)
export function deskEarlierRuns(
  composeRuns: ComposeRunRow[] | null | undefined,
  resumeRuns: ResumeRunRow[] | null | undefined,
  limit = 4,
  excludeIds?: Set<string> | null,
): EarlierRow[] {
  const skip = (id: string) => !!excludeIds && excludeIds.has(id);
  const rows: EarlierRow[] = [];
  const standaloneResumeRuns = dropLinkedResumeRuns(composeRuns, resumeRuns);
  for (const r of composeRuns || []) {
    if (skip(r.id)) continue;
    rows.push({
      key: `c:${r.id}`,
      agent: "compose",
      kind: r.kind,
      id: r.id,
      title: deskRunTitle("compose", r),
      chips: deskRunChips("compose", r),
      created_at: r.created_at,
    });
  }
  for (const r of standaloneResumeRuns) {
    if (skip(r.id)) continue;
    rows.push({
      key: `r:${r.id}`,
      agent: "resume",
      id: r.id,
      title: deskRunTitle("resume", r),
      chips: deskRunChips("resume", r),
      created_at: r.created_at,
    });
  }
  rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return rows.slice(0, Math.max(0, limit));
}

// Relative timestamp for the earlier-runs rows. `now` is injectable so the
// output is deterministic under test.
export function fmtWhen(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  const diff = now - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "1d ago";
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ── Runs rail (Desk sidebar) ─────────────────────────────────────────────────
// The Desk's left column: every run the crew is on right now, the ones that
// need a decision, then history — so two jobs running side by side are both one
// click away instead of hiding behind a single "crew running" chip.
//
// Live rows come from the module run store; history rows from the same payload
// "Earlier runs" always used (deskEarlierRuns). A store run and its history row
// share a server id (composeRunId / resumeGenerationId), which is how a run is
// kept from showing twice.

// Agents per kind, in the order the crew runs them (the run store's progress
// keys). Résumé-tailor runs report a single "tailor" key.
const RAIL_AGENT_KEYS: Record<string, string[]> = {
  person: ["person", "email", "outreach"],
  job: ["resume", "person", "email", "outreach", "application"],
  resume: ["tailor"],
};

export type RailLiveRun = LiveRunTitleInput & {
  id: string;
  stage: string;
  createdAt?: number | null;
  hydrated?: boolean;
  reconnecting?: boolean;
  composeRunId?: string | null;
  resumeGenerationId?: string | null;
  progress?: Record<string, number> | null;
  activity?: Record<string, string> | null;
  selectedAgents?: string[] | null;
  stepErrors?: Record<string, string> | null;
};

export type RailRow = {
  key: string;
  source: "live" | "history";
  // live rows: the store id to focus. history rows: the EarlierRow to open.
  localId?: string;
  row?: EarlierRow;
  // Server id(s) this row stands for — lets the page mark a reopened history
  // run as selected.
  serverId?: string | null;
  title: string;
  status: RunStatusState;
  caption?: string | null;
  stepsDone?: number;
  stepsTotal?: number;
  createdAt: string;
};

export type RailSections = { running: RailRow[]; attention: RailRow[]; earlier: RailRow[] };

function liveSteps(run: RailLiveRun): { done: number; total: number; caption: string | null } {
  const all = RAIL_AGENT_KEYS[run.kind] || RAIL_AGENT_KEYS.person;
  const picked = Array.isArray(run.selectedAgents) && run.selectedAgents.length ? run.selectedAgents : null;
  const keys = picked ? all.filter((k) => picked.includes(k)) : all;
  const progress = run.progress || {};
  let done = 0;
  let caption: string | null = null;
  for (const k of keys) {
    if ((progress[k] ?? 0) >= 100 || run.stepErrors?.[k]) {
      done++;
      continue;
    }
    // The first unfinished agent is the one working — its live caption is the
    // most useful single line to show.
    if (caption == null) caption = run.activity?.[k] || null;
  }
  if (run.stage === "parsing") caption = caption || "Reading your request…";
  return { done, total: keys.length, caption };
}

function liveRow(run: RailLiveRun): RailRow {
  const steps = liveSteps(run);
  return {
    key: `l:${run.id}`,
    source: "live",
    localId: run.id,
    serverId: run.composeRunId || run.resumeGenerationId || null,
    title: liveRunTitle(run),
    status: runStatusState({ stage: run.stage, reconnecting: run.reconnecting }),
    caption: steps.caption,
    stepsDone: steps.done,
    stepsTotal: steps.total,
    createdAt: new Date(run.createdAt || Date.now()).toISOString(),
  };
}

// History titles get the same verb prefix live runs carry (runViewTitle), so
// the rail reads as one list: "Apply — …", "Reach — …", "Résumé — …".
function historyRailTitle(row: EarlierRow): string {
  if (row.agent === "resume") return `Résumé — ${row.title}`;
  return `${row.kind === "job" ? "Apply" : "Reach"} — ${row.title}`;
}

function historyRow(row: EarlierRow): RailRow {
  const chip = row.chips[0];
  const status: RunStatusState =
    chip?.tone === "done" ? "ready" : chip?.tone === "progress" ? "running" : "needs-you";
  return {
    key: `h:${row.key}`,
    source: "history",
    row,
    serverId: row.id,
    title: historyRailTitle(row),
    status,
    caption: chip && chip.tone === "done" && chip.label !== RUN_STATUS_LABEL.ready ? chip.label : null,
    createdAt: row.created_at,
  };
}

export function deskRailSections(input: {
  liveRuns: RailLiveRun[] | null | undefined;
  composeRuns: ComposeRunRow[] | null | undefined;
  resumeRuns: ResumeRunRow[] | null | undefined;
  limit?: number;
}): RailSections {
  const limit = input.limit ?? 15;
  // Runs started in this session (not reopened from history). Newest first,
  // matching the store's order.
  const own = (input.liveRuns || [])
    .filter((r) => !r.hydrated)
    .slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const running = own.filter((r) => r.stage === "parsing" || r.stage === "working").map(liveRow);
  const attention = own.filter((r) => r.stage === "error").map(liveRow);

  // Every server id a live row already stands for — its history row is hidden
  // so one run never shows twice.
  const liveIds = new Set<string>();
  for (const r of own) {
    if (r.stage === "done") continue;
    if (r.composeRunId) liveIds.add(r.composeRunId);
    if (r.resumeGenerationId) liveIds.add(r.resumeGenerationId);
  }
  const history = deskEarlierRuns(input.composeRuns, input.resumeRuns, limit, liveIds);
  const historyIds = new Set(history.map((h) => h.id));

  // A run that just finished can beat the history refetch; keep it visible at
  // the top of Earlier until its saved row arrives.
  const justDone = own
    .filter((r) => r.stage === "done")
    .filter((r) => {
      const sid = r.composeRunId || r.resumeGenerationId;
      return !sid || !historyIds.has(sid);
    })
    .map(liveRow);

  const earlier = [...justDone, ...history.map(historyRow)].slice(0, Math.max(0, limit));
  return { running, attention, earlier };
}
