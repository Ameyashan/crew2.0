// Pure, render-free helpers for the Desk + composer (Phase 3 of the jugaadu
// reskin). Extracted from compose/page.tsx so they can be unit-tested under
// `node --test` — the page file imports React / next/navigation / Supabase and
// can't run in that context. Same split the top bar uses (top-bar-logic.ts).
//
// Nothing here reaches into the DOM or localStorage directly: the component owns
// the side effects (reading storage, fetching), these functions own the rules.

import { RUN_STATUS_LABEL } from "./run-status.ts";

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

// `excludeIds` holds the server row ids of runs that are currently LIVE in the
// store (surfaced as the top-bar chip / focused card). Their history rows are
// filtered out so a single run never appears twice — once live and once here.
export function deskEarlierRuns(
  composeRuns: ComposeRunRow[] | null | undefined,
  resumeRuns: ResumeRunRow[] | null | undefined,
  limit = 4,
  excludeIds?: Set<string> | null,
): EarlierRow[] {
  const skip = (id: string) => !!excludeIds && excludeIds.has(id);
  const rows: EarlierRow[] = [];
  for (const r of composeRuns || []) {
    if (skip(r.id)) continue;
    rows.push({
      key: `c:${r.id}`,
      agent: "compose",
      id: r.id,
      title: deskRunTitle("compose", r),
      chips: deskRunChips("compose", r),
      created_at: r.created_at,
    });
  }
  for (const r of resumeRuns || []) {
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
