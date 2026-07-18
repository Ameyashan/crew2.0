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

// ── Run view: title / steps list (prototype lines 534–566) ──────────────────
// The prototype replaces the agent-tile grid with a vertical steps list: done
// rows get a green ✓ circle, the single active row a pulsing gold ring, each
// with a mono agent chip. These helpers derive those rows from the run-store's
// real state (stage / progress / stepErrors) — presentation naming only, the
// state machine itself is untouched.

// Mono chip label per pipeline step id (progress keys in runs-store).
export const RUN_AGENT_CHIPS: Record<string, string> = {
  parse: "TRACKER",
  resume: "RESUME",
  person: "PERSON KHOJI",
  email: "EMAIL WALLAH",
  outreach: "OUTREACH",
  application: "SAWAAL JAWAAB",
};

// ── Live agent activity ticker (FALLBACK) ────────────────────────────────────
// While a step is active, a short "what the agent is doing right now" caption
// shows under its title. The run view now prefers REAL activity streamed from
// the pipeline (run.activity[step] — a resume web_search, the live bullet count,
// how many people were sourced). These hand-authored phrases are the fallback,
// cycled on a timer only until a real signal lands, so the line still moves
// during the quiet gaps between real events.
export const STEP_ACTIVITY: Record<string, string[]> = {
  parse: ["reading your request", "picking the right crew", "checking the tracker"],
  resume: [
    "reading the job description",
    "matching your Story to the role",
    "picking the strongest bullets",
    "tightening the language",
    "scoring against ATS keywords",
    "weaving the final draft",
  ],
  person: [
    "scanning the team",
    "reading titles & tenure",
    "working out who decides",
    "checking who's still there",
    "ranking the shortlist",
  ],
  email: [
    "testing address patterns",
    "checking the mail server",
    "scoring deliverability",
    "holding alternates in reserve",
  ],
  outreach: [
    "finding the sharpest hook",
    "drafting the email",
    "adapting it for LinkedIn",
    "cutting a version for X",
    "matching your voice",
  ],
  application: [
    "opening the application form",
    "reading the supplemental questions",
    "spotting the essay prompts",
  ],
};

// The activity caption to show for a step on a given tick. `tick` is a
// monotonically increasing counter the component bumps on an interval; we cycle
// through the step's phrases so the line keeps moving while the agent works.
// Returns "" for steps with no phrases (nothing to narrate).
export function stepActivityPhrase(id: string, tick: number): string {
  const phrases = STEP_ACTIVITY[id];
  if (!phrases || phrases.length === 0) return "";
  const i = ((Math.trunc(tick) % phrases.length) + phrases.length) % phrases.length;
  return phrases[i];
}

// Step order per run kind. `parse` always leads; agent steps are filtered to
// the user's frozen selection when one exists.
export const RUN_STEP_ORDER: Record<"job" | "person", string[]> = {
  job: ["parse", "resume", "person", "email", "outreach", "application"],
  person: ["parse", "person", "email", "outreach"],
};

export type RunStepState = "done" | "active" | "error" | "skipped" | "pending";
export type RunStepRow = {
  id: string;
  title: string;
  sub: string;
  agent: string;
  state: RunStepState;
};

export type BuildRunStepsInput = {
  stage: RunStage | string | null | undefined;
  kind: "job" | "person" | string;
  progress?: Record<string, number> | null;
  selectedAgents?: string[] | null;
  stepErrors?: Record<string, string> | null;
  screenshot?: boolean;
  // "Role · Company · Location" (or person "Name · Role") once parsed.
  parsedLabel?: string | null;
  thin?: boolean;
  // The pull-review panel is on screen — the resume step reads as "choosing
  // what to pull" rather than "weaving".
  pulling?: boolean;
  // Signed-out job runs never run the Resume agent server-side (there's no
  // uploaded Story to weave from), so the resume step renders as a "skipped"
  // row and the crew jumps straight to finding the hiring manager.
  skipResume?: boolean;
  // Whether the run actually holds a woven resume artifact (parsed.resume). The
  // resume done-row must not claim "PDF + Word below" when no resume was
  // produced — the download card is gated on the same artifact, so without this
  // the row promises a download that never renders.
  resumePresent?: boolean;
  // Real data for the done-row subtitles. All optional; rows degrade to
  // generic (but honest) copy when an agent returned nothing.
  peopleCount?: number | null;
  personLabel?: string | null; // "Anika Mehta"
  personSub?: string | null; // "Staff PD · Stripe"
  emailVerdict?: string | null; // e.g. "96% verified" (real Hunter signal)
  draftCount?: number | null;
  ats?: { before?: number | null; after?: number | null } | null;
  // Sawaal Jawaab: how many supplemental essay questions were detected (null
  // until the step finishes). Drives the "N questions found" vs "none found" copy.
  questionCount?: number | null;
};

export function buildRunSteps(input: BuildRunStepsInput): RunStepRow[] {
  const kind = input.kind === "job" ? "job" : "person";
  const stage = input.stage;
  const progress = input.progress || {};
  const selected =
    Array.isArray(input.selectedAgents) && input.selectedAgents.length > 0
      ? input.selectedAgents
      : null;
  const rows: RunStepRow[] = [];

  const order = RUN_STEP_ORDER[kind].filter(
    (id) => id === "parse" || !selected || selected.includes(id),
  );

  // parse row
  if (stage === "parsing") {
    rows.push({
      id: "parse",
      title: input.screenshot ? "Reading your screenshot…" : "Parsing…",
      sub: input.parsedLabel || "reading your request · picking the crew",
      agent: RUN_AGENT_CHIPS.parse,
      state: "active",
    });
    return rows; // nothing after parse can be done or active yet
  }
  rows.push({
    id: "parse",
    title: input.screenshot
      ? "Screenshot read & saved to tracker"
      : kind === "job"
        ? "Role parsed & saved to tracker"
        : "Request parsed",
    sub:
      input.parsedLabel ||
      (input.screenshot
        ? "company, role and link recovered from the image"
        : "crew assembled automatically"),
    agent: RUN_AGENT_CHIPS.parse,
    state: "done",
  });

  const ats = input.ats || {};
  const doneRow = (id: string): { title: string; sub: string } => {
    switch (id) {
      case "resume": {
        const atsSub =
          ats.after != null
            ? ats.before != null
              ? `ATS ${ats.before} → ${ats.after} · PDF + Word below`
              : `ATS ${ats.after} · PDF + Word below`
            : "PDF + Word below";
        return input.thin
          ? { title: "Resume woven — but your Story is thin", sub: `${atsSub} · add your resume for real material` }
          : { title: "Resume woven from your Story", sub: atsSub };
      }
      case "person": {
        const n = input.peopleCount ?? 0;
        if (n > 1) {
          // A confirmed lead backs the shortlist — safe to say we ranked them.
          if (input.personLabel)
            return {
              title: `${n} people found — ranked by who decides`,
              sub: `${input.personLabel} first · alternates in the shortlist`,
            };
          // Candidates were sourced but research confirmed nobody (the dual
          // screenshot / disambiguation dead-ends). Don't imply a pick was made
          // or that anyone is reachable — the "Who to reach out to" card has no
          // confirmed person to show, so an "N found · ranked" claim reads as a
          // lie against an empty card.
          return {
            title: `${n} possible people — none confirmed yet`,
            sub: "pick who to reach out to, or add a LinkedIn/X link to pin one down",
          };
        }
        if (input.personLabel)
          return {
            title: `${input.personLabel} found`,
            sub: input.personSub || "ranked by who decides",
          };
        // The step closed but nothing came back — say so instead of claiming a
        // person was found.
        return {
          title: "No specific person pinned down",
          sub: "try a LinkedIn or X link, or add a company to the request",
        };
      }
      case "email":
        return {
          title: "Email address checked",
          sub: input.emailVerdict
            ? `${input.emailVerdict} · alternates held in reserve`
            : "alternates held in reserve",
        };
      case "outreach": {
        const n = input.draftCount ?? 0;
        // Nothing was drafted — the step closed because the person pipeline
        // dead-ended, not because outreach succeeded. Saying "Outreach drafted"
        // here is the lie the user saw next to an empty drafts card.
        if (n === 0)
          return {
            title: "No outreach drafted",
            sub: "no confirmed person to write to — pick someone above first",
          };
        return {
          title: n >= 3 ? "Outreach drafted for each — email, LinkedIn, X" : "Outreach drafted",
          sub: input.thin
            ? "drafted generic — a fuller Story would give each one a personal hook"
            : "in your voice, angled to what they care about",
        };
      }
      case "application": {
        const n = input.questionCount ?? 0;
        if (n > 0)
          return {
            title: `${n} application question${n === 1 ? "" : "s"} found`,
            sub: "draft first-person answers below",
          };
        return {
          title: "No supplemental questions found",
          sub: "paste them below if the form asks any",
        };
      }
      default:
        return { title: "Done", sub: "" };
    }
  };

  const activeRow = (id: string): { title: string; sub: string } => {
    switch (id) {
      case "resume":
        return input.pulling
          ? {
              title: "Choosing what to pull from your Story",
              sub: input.thin
                ? "your Story is nearly empty — pulling the little there is"
                : "the resume gets woven from your record — review below",
            }
          : {
              title: "Weaving your resume…",
              sub: input.thin
                ? "your Story is nearly empty — weaving from the little there is"
                : "matched to what the posting asks for",
            };
      case "person":
        return {
          title: "Finding who could say yes…",
          sub: "scanning the team · titles, tenure, what they own",
        };
      case "email":
        return {
          title: "Verifying emails…",
          sub: "checking patterns · alternates held in reserve",
        };
      case "outreach":
        return {
          title: "Drafting outreach…",
          sub: "email, LinkedIn and X · in your voice",
        };
      case "application":
        return {
          title: "Reading the application…",
          sub: "looking for supplemental essay questions",
        };
      default:
        return { title: "Working…", sub: "" };
    }
  };

  const errorTitle: Record<string, string> = {
    resume: "Resume agent hit a snag",
    person: "Person search hit a snag",
    email: "Email check hit a snag",
    outreach: "Outreach drafting hit a snag",
    application: "Question check hit a snag",
  };

  // Copy for a step that hasn't started yet — shown as a muted "pending" row so
  // the user sees the whole roadmap upfront instead of steps popping in later.
  // Infinitive ("to-do") phrasing, no "…", since nothing is happening yet.
  const queuedRow = (id: string): { title: string; sub: string } => {
    switch (id) {
      case "resume":
        return {
          title: "Weave your resume",
          sub: input.pulling
            ? "from what we pull from your Story"
            : "tailored to what the posting asks for",
        };
      case "person":
        return { title: "Find who could say yes", sub: "who owns the decision on the team" };
      case "email":
        return { title: "Check the email address", sub: "verify patterns · alternates held in reserve" };
      case "outreach":
        return { title: "Draft the outreach", sub: "email, LinkedIn and X · in your voice" };
      case "application":
        return { title: "Check the application", sub: "any supplemental essay questions to answer" };
      default:
        return { title: "Up next", sub: "" };
    }
  };

  // A step is "in progress" once it has started (progress between 5 and 100) and
  // the run is still working. We surface EVERY in-progress step as active — not
  // just the first — so a re-pick that re-runs person/email/outreach at once
  // keeps all their rows on screen instead of collapsing them into one (the
  // flicker where rows vanished and popped back). Only when nothing is actively
  // running do we light the next not-yet-started step as the single "upcoming"
  // row, preserving the one-row-at-a-time reveal on a fresh run.
  const isRunning = (id: string): boolean => {
    if (stage !== "working") return false;
    if (id === "resume" && input.skipResume) return false;
    if (input.stepErrors?.[id]) return false;
    const pct = progress[id] ?? 0;
    return pct >= 5 && pct < 100;
  };
  const anyRunning = order.some((id) => id !== "parse" && isRunning(id));

  let upcomingPlaced = false;
  for (const id of order) {
    if (id === "parse") continue;
    // Signed-out job runs skip Resume Darzi entirely (the server never runs it):
    // show one muted "skipped" row and move on, so `person` becomes the active
    // step rather than a resume row stuck mid-weave.
    if (id === "resume" && input.skipResume) {
      rows.push({
        id,
        title: "Skipped resume — going to find the hiring manager",
        sub: "signed-out runs skip the resume — sign in to weave one from your Story",
        agent: RUN_AGENT_CHIPS.resume,
        state: "skipped",
      });
      continue;
    }
    const err = input.stepErrors?.[id];
    if (err) {
      rows.push({
        id,
        title: errorTitle[id] || "Hit a snag",
        sub: err,
        agent: RUN_AGENT_CHIPS[id] || id.toUpperCase(),
        state: "error",
      });
      continue;
    }
    const pct = progress[id] ?? (stage === "done" ? 100 : 0);
    if (pct >= 100 || stage === "done") {
      // The resume step finished but produced no artifact (thin Story, or the
      // agent returned nothing without a hard error). Don't print the triumphant
      // "Resume woven · PDF + Word below" against an empty card — say so plainly.
      if (id === "resume" && !input.skipResume && !input.resumePresent) {
        rows.push({
          id,
          title: "No resume to show this time",
          sub: input.thin
            ? "your Story is too thin to weave from — add your resume, then run again"
            : "the crew couldn't produce a resume this time — run it again",
          agent: RUN_AGENT_CHIPS.resume,
          state: "error",
        });
        continue;
      }
      const d = doneRow(id);
      rows.push({ id, title: d.title, sub: d.sub, agent: RUN_AGENT_CHIPS[id] || id.toUpperCase(), state: "done" });
    } else if (stage === "working" && isRunning(id)) {
      // Actively running — always shown, however many are in flight at once.
      const a = activeRow(id);
      rows.push({ id, title: a.title, sub: a.sub, agent: RUN_AGENT_CHIPS[id] || id.toUpperCase(), state: "active" });
    } else if (stage === "working" && !anyRunning && !upcomingPlaced) {
      // Nothing running yet — light the next step as the single upcoming row.
      const a = activeRow(id);
      rows.push({ id, title: a.title, sub: a.sub, agent: RUN_AGENT_CHIPS[id] || id.toUpperCase(), state: "active" });
      upcomingPlaced = true;
    } else if (stage === "working") {
      // Not started yet — render a muted pending placeholder so the full pipeline
      // (the roadmap) is visible from the start; the row flips to active in place
      // when the crew reaches it, instead of popping in out of nowhere.
      const q = queuedRow(id);
      rows.push({ id, title: q.title, sub: q.sub, agent: RUN_AGENT_CHIPS[id] || id.toUpperCase(), state: "pending" });
    }
  }
  return rows;
}

// The run header title, prototype-flavored: "Apply — Staff Product Designer,
// Stripe" / "Reach — Anika Mehta". `fallback` is what the page derives from the
// raw input (job host or the input itself) when nothing is parsed yet.
export function runViewTitle(r: {
  kind: "job" | "person" | string;
  role?: string | null;
  company?: string | null;
  personName?: string | null;
  fallback?: string | null;
}): string {
  const fb = truncateIntent(r.fallback || "", 64) || "your request";
  if (r.kind === "job") {
    if (r.role) return `Apply — ${r.role}${r.company ? `, ${r.company}` : ""}`;
    return `Apply — ${fb}`;
  }
  if (r.personName) return `Reach — ${r.personName}${r.company ? `, ${r.company}` : ""}`;
  return `Find — ${fb}`;
}

export function truncateIntent(s: string, max = 64): string {
  const t = (s || "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

// Normalized cache key for a candidate name — trim, collapse inner whitespace,
// lowercase — so "Yaoyuan  Liu", "YAOYUAN LIU" and "Yaoyuan Liu" resolve to one
// entry at both the write and read sites of the per-candidate draft cache
// (runs-store.ts). Lives here (not in the store) so it's unit-testable under
// `node --test`, which can't load the "use client" store module.
export function normalizeCandidateKey(name: string | null | undefined): string {
  return (name || "").trim().replace(/\s+/g, " ").toLowerCase();
}

// ── Angle pills (prototype lines 742–747) ────────────────────────────────────
// The prototype's inline "↻ Another angle:" pills, replacing the old dropdown.
// Each carries the directive the existing redraft endpoint applies to the draft
// currently on screen — facts and ask preserved, just a different cut.
export const ANGLE_PILLS = [
  {
    id: "warmer",
    label: "warmer",
    directive:
      "Make it warmer and more personable while staying concise — a touch more human, still not gushing or over-familiar.",
  },
  {
    id: "shorter",
    label: "shorter",
    directive:
      "Cut it down hard — aim for 60–80 words. Keep only the single strongest specific reference and the ask. Strip throat-clearing and filler.",
  },
  {
    id: "metrics",
    label: "lead with metrics",
    directive:
      "Rewrite to open with the strongest quantified results — numbers first, then the ask. Keep the same facts and the single ask.",
  },
] as const;

// ── Handoff → sent copy (prototype lines 750–762, 787–798) ───────────────────
export const CHANNEL_NAMES: Record<string, string> = {
  email: "Gmail",
  linkedin: "LinkedIn",
  x: "X",
};

// The word the sent-state rows use ("via email", not "via Gmail").
export const SENT_CHANNEL_WORD: Record<string, string> = {
  email: "email",
  linkedin: "LinkedIn",
  x: "X",
};

export function handoffCta(channel: string): string {
  return `Open in ${CHANNEL_NAMES[channel] || channel} →`;
}

export function handoffQuestion(channel: string): string {
  return `Opened ${CHANNEL_NAMES[channel] || channel} in a new tab.`;
}

export function sentLine(first: string | null | undefined, channel: string): string {
  const word = SENT_CHANNEL_WORD[channel] || channel;
  return first
    ? `Sent to ${first} via ${word}. The crew takes it from here.`
    : "Sent. The crew takes it from here.";
}

export function sentSub(first: string | null | undefined): string {
  const who = first || "They";
  return `${who} is in your tracker · a follow-up is auto-queued if no reply. You'll be nudged, not spammed.`;
}

// "3 more patterns if this bounces ▸" / "hide alternate patterns ▾"
export function altsLabel(open: boolean, n: number): string {
  if (open) return "hide alternate patterns ▾";
  return `${n} more pattern${n === 1 ? "" : "s"} if this bounces ▸`;
}

// ── Blur gate copy (prototype lines 770–783) ─────────────────────────────────
// Amber chip + outline Google button, per the prototype (the earlier build used
// a green chip and a solid ink button — both wrong). Tense-neutral: the gate
// drops over the results the moment the FIRST deliverable lands (mid-run), not
// only once the whole crew has finished, so the copy can't claim "finished".
export const GATE_CHIP_LABEL = "You're signed out · results locked";
export const GATE_BUTTON_LABEL = "Continue with Google";
export const GATE_FOOTNOTE =
  "Free — this run is saved to your account the moment you're in.";

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
