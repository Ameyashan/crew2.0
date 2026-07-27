// Pure, render-free helpers for Phase 5 of the jugaadu reskin
// (Jobs / Story / People / run-history detail + Today / Settings / Onboarding).
// Extracted so they run under `node --test` — the page files import React /
// next/navigation / Supabase and can't execute in that context. Same split the
// Desk (desk-logic.ts), top bar (top-bar-logic.ts) and run view
// (run-view-logic.ts) already use: the components own the side effects, these
// functions own the rules.
//
// Nothing here touches the DOM, localStorage, Supabase, or the network.

import { RUN_STATUS_LABEL } from "./run-status.ts";

// ── Follow-up cadence (Settings + Onboarding) ────────────────────────────────
// The nudge-cadence control persists to `profile.followup_days` (0 = never).
// Both Settings and Onboarding share the same option set and label⇄days mapping.
export type FollowupOption = { label: string; days: number };

export const FOLLOWUP_OPTIONS: FollowupOption[] = [
  { label: "3d", days: 3 },
  { label: "5d", days: 5 },
  { label: "7d", days: 7 },
  { label: "10d", days: 10 },
  { label: "never", days: 0 },
];

// A stored `followup_days` number → the pill label. Unknown values fall back to
// "{d}d"; null/undefined defaults to the "5d" middle of the range.
export function daysToFollowupLabel(d: number | null | undefined): string {
  if (d == null) return "5d";
  if (d === 0) return "never";
  const match = FOLLOWUP_OPTIONS.find((o) => o.days === d);
  return match?.label ?? `${d}d`;
}

// A pill label → the number to persist. Unknown labels → null (leave unset).
export function followupLabelToDays(label: string | null | undefined): number | null {
  const opt = FOLLOWUP_OPTIONS.find((o) => o.label === label);
  return opt ? opt.days : null;
}

// ── Writing samples (Settings) ───────────────────────────────────────────────
// `writing_samples` is a `text` column, so an array written at onboarding comes
// back as a JSON-encoded string. Normalize to an array of non-empty samples.
export function parseWritingSamples(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
      }
    } catch {
      // not JSON — treat the whole string as a single sample
    }
    return [raw];
  }
  return [];
}

// Pull the handle out of a stored LinkedIn URL (or accept a bare handle / URL).
export function linkedinHandle(url: string | null | undefined): string {
  if (!url) return "";
  const m = String(url).match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (m) return m[1];
  return String(url).replace(/^https?:\/\//, "").replace(/^www\./, "");
}

// The four "What Jugaadu reads" rows on Settings, derived from the profile. Each
// row's `on` flag drives the checkmark; `sub` is the caption. Pure so the page
// stays markup-only.
export type ConnectedRow = { key: string; name: string; sub: string; on: boolean };

export function deriveConnectedRows(profile: Record<string, unknown> | null | undefined): ConnectedRow[] {
  const p = profile || {};
  const samples = parseWritingSamples((p as Record<string, unknown>).writing_samples);
  const resumeText = typeof p.resume_text === "string" ? p.resume_text : "";
  const resumeFilename = typeof p.resume_filename === "string" ? p.resume_filename : "";
  const linkedin = typeof p.linkedin_url === "string" ? p.linkedin_url : "";
  const context = typeof p.context_prompt === "string" ? p.context_prompt : "";
  return [
    {
      key: "resume",
      name: "Resume",
      sub: resumeFilename
        ? `${resumeFilename}${resumeText ? ` · ${resumeText.length.toLocaleString()} chars` : ""}`
        : "Not yet uploaded",
      on: !!resumeText,
    },
    {
      key: "linkedin",
      name: "LinkedIn",
      sub: linkedin || "Not yet linked",
      on: !!linkedin,
    },
    {
      key: "writing",
      name: "Writing voice",
      sub: samples.length
        ? `${samples.length} sample${samples.length === 1 ? "" : "s"} learned`
        : "No samples on file yet",
      on: samples.length > 0,
    },
    {
      key: "goals",
      name: "Goals summary",
      sub: context
        ? `~ ${Math.round((context.length || 0) / 5)} word self-summary on file`
        : "No goals summary yet",
      on: !!context,
    },
  ];
}

// ── Onboarding ───────────────────────────────────────────────────────────────
// The "n/5 added" progress strip counts the optional context the user filled in.
export type OnboardingState = {
  resume: unknown;
  linkedin: string;
  samples: unknown[];
  goals: string;
  interests: unknown[];
};

export function onboardingCompletedCount(s: OnboardingState): number {
  return (
    (s.resume ? 1 : 0) +
    (s.linkedin && s.linkedin.trim() ? 1 : 0) +
    (Array.isArray(s.samples) && s.samples.length > 0 ? 1 : 0) +
    (s.goals && s.goals.trim() ? 1 : 0) +
    (Array.isArray(s.interests) && s.interests.length > 0 ? 1 : 0)
  );
}

// "Skip for now" still marks the profile onboarded (the /app layout gate
// redirects un-onboarded users back here, so a skip that didn't set `onboarded`
// would trap people in a loop). It writes NOTHING else — crucially no resume —
// which is exactly what leaves the account's Story empty (thin-Story path).
export function onboardingSkipPatch(): { onboarded: true } {
  return { onboarded: true };
}

// The full "finish" patch from a completed onboarding form.
export function onboardingDonePatch(s: {
  linkedin: string;
  samples: unknown[];
  goals: string;
  followup: string;
}): {
  linkedin_url: string | null;
  writing_samples: unknown[] | null;
  context_prompt: string | null;
  followup_days: number | null;
  onboarded: true;
} {
  const handle = s.linkedin.trim();
  return {
    linkedin_url: handle ? `https://linkedin.com/in/${handle}` : null,
    writing_samples: s.samples.length ? s.samples : null,
    context_prompt: s.goals.trim() || null,
    followup_days: followupLabelToDays(s.followup),
    onboarded: true,
  };
}

// Skipping onboarding (no resume ingested) leaves the Story thin. Derives the
// storyIsEmpty flag Phase 4's run view keys its thin-Story states off of.
export function skipLeavesStoryThin(patch: Record<string, unknown>): boolean {
  // A skip patch carries only { onboarded }. Any patch that never provided a
  // resume leaves the Story with nothing real to weave from.
  return !("resume_text" in patch) && !("resume_filename" in patch);
}

// ── Run-history detail (repurposed /app/history) ─────────────────────────────
// Status chip for a compose run's `outcome` and a resume generation's `status`.
export type ChipTone = "done" | "progress" | "attention" | "error";
export type HistoryChip = { label: string; tone: ChipTone };

// Labels come from the shared run-status lexicon (run-status.ts); tones unchanged.
export function composeOutcomeChip(outcome: string | null | undefined): HistoryChip {
  if (outcome === "complete") return { label: RUN_STATUS_LABEL.ready, tone: "done" };
  if (outcome === "in_flight") return { label: RUN_STATUS_LABEL.running, tone: "progress" };
  if (outcome === "needs_disambiguation") return { label: RUN_STATUS_LABEL["needs-you"], tone: "attention" };
  return { label: RUN_STATUS_LABEL["needs-you"], tone: "error" };
}

export function resumeRowChip(row: { status?: string | null; ats_score?: number | null }): HistoryChip {
  if (row?.status === "in_flight") return { label: RUN_STATUS_LABEL.running, tone: "progress" };
  if (row?.status === "error") return { label: RUN_STATUS_LABEL["needs-you"], tone: "error" };
  return { label: row?.ats_score != null ? `ATS ${row.ats_score}` : "tailored", tone: "done" };
}

// Whether a persisted run is a finished, gate-free "DONE" run worth showing a
// detail view for (vs. one still in flight or errored).
export function isRunDone(run: { outcome?: string | null; status?: string | null } | null | undefined): boolean {
  if (!run) return false;
  return run.outcome === "complete" || (run.status != null && run.status !== "in_flight" && run.status !== "error");
}

// Loose shape for a persisted compose run's `output` (a.k.a. `parsed`) — only the
// fields the detail summary reads. Unknowns are tolerated.
type RunOutput = {
  parsed?: { target_role?: string; role?: string; target_company?: string; company?: string } | null;
  resume?: unknown;
  ats_score?: number | null;
  drafts?: unknown[] | null;
  person?: { name?: string | null } | null;
  enrichment?: { email?: string | null } | null;
} | null;

type DetailRun = {
  kind?: string | null;
  input?: string | null;
  intent?: string | null;
  outcome?: string | null;
  created_at?: string | null;
  output?: RunOutput;
  person?: { name?: string | null; company?: string | null } | null;
  // Joined by the history list (compose_runs → resume_generations) so a job row
  // shows its real role/company even though the list omits the heavy `output`.
  resume_generation?: { target_role?: string | null; target_company?: string | null } | null;
};

function readOutput(run: DetailRun): RunOutput {
  const out = run?.output ?? null;
  return out;
}

// Header for the run-detail view: the big serif title + the "from … · when" line.
export function runDetailTitle(run: DetailRun): { title: string; company: string } {
  const out = readOutput(run);
  if (run?.kind === "job") {
    const parsed = out?.parsed ?? null;
    const gen = run?.resume_generation ?? null;
    const role = parsed?.target_role || parsed?.role || gen?.target_role || "Job application";
    const company =
      parsed?.target_company || parsed?.company || gen?.target_company || run?.person?.company || "";
    return { title: role, company: company || "Job" };
  }
  const name = run?.person?.name || out?.person?.name || run?.input || "Outreach";
  const company = run?.person?.company || "";
  return { title: name, company: company || "Person" };
}

export function runDetailSubline(run: DetailRun, now: number = Date.now()): string {
  const intent = (run?.intent || run?.input || "").trim();
  const when = relativeWhen(run?.created_at, now);
  const from = intent ? `from “${truncate(intent, 60)}”` : "from a run";
  return when ? `${from} · ${when}` : from;
}

// "WHAT CAME OF IT" — outcome rows derived from whatever the run produced.
// Each row is a concrete deliverable with a DONE-ish chip.
export type OutcomeRow = { label: string; detail: string; tone: ChipTone };

export function runOutcomeRows(run: DetailRun): OutcomeRow[] {
  const out = readOutput(run);
  const rows: OutcomeRow[] = [];
  if (out?.resume) {
    rows.push({
      label: "Tailored résumé",
      detail: out.ats_score != null ? `ATS ${out.ats_score}` : "woven from your Story",
      tone: "done",
    });
  }
  const drafts = Array.isArray(out?.drafts) ? out!.drafts! : [];
  if (drafts.length) {
    rows.push({
      label: "Outreach drafted",
      detail: `${drafts.length} draft${drafts.length === 1 ? "" : "s"} across channels`,
      tone: "done",
    });
  }
  const person = out?.person || run?.person;
  const email = out?.enrichment?.email;
  if (person?.name) {
    rows.push({
      label: "Person found",
      detail: email ? `${person.name} · email verified` : String(person.name),
      tone: "done",
    });
  }
  if (!rows.length) {
    rows.push({
      label: run?.kind === "job" ? "Application prepared" : "Run completed",
      detail: "the crew finished this one",
      tone: "done",
    });
  }
  return rows;
}

// Download tiles for the detail view — only when a résumé artifact exists.
export type DownloadTile = { label: string; kind: "pdf" | "docx" };

export function runDownloadTiles(run: DetailRun): DownloadTile[] {
  const out = readOutput(run);
  if (!out?.resume) return [];
  return [
    { label: "PDF", kind: "pdf" },
    { label: "Word", kind: "docx" },
  ];
}

// The all-✓ step rows shown on a completed run's detail view, each tagged with
// the agent chip the prototype shows next to it (prototype lines 294–305:
// TRACKER / RESUME / PERSON KHOJI / EMAIL WALLAH / OUTREACH). Pure so the
// history page stays markup-only.
export type DetailStep = { title: string; agent: string; sub: string };

export function runDetailSteps(run: { kind?: string | null } | null | undefined): DetailStep[] {
  if (run?.kind === "job") {
    return [
      { title: "Read your input", agent: "TRACKER", sub: "parsed the role and what you're after" },
      { title: "Tailored your résumé", agent: "RESUME", sub: "woven from your Story, tuned to the posting" },
      { title: "Found who decides", agent: "PERSON KHOJI", sub: "ranked by who can say yes" },
      { title: "Verified their email", agent: "EMAIL WALLAH", sub: "alternates held in reserve" },
      { title: "Drafted your outreach", agent: "OUTREACH", sub: "in your voice, across channels" },
    ];
  }
  return [
    { title: "Read your input", agent: "TRACKER", sub: "parsed who you're reaching out to" },
    { title: "Verified the person", agent: "PERSON KHOJI", sub: "confirmed the right match" },
    { title: "Found contact details", agent: "EMAIL WALLAH", sub: "email verified, alternates held" },
    { title: "Drafted your outreach", agent: "OUTREACH", sub: "in your voice, across channels" },
  ];
}

// ── People tracker ───────────────────────────────────────────────────────────
// Status chip tone: a reply is the win (green), an unanswered send is pending
// (amber), everything else is neutral/held. Matches the statuses the People page
// derives (replied / awaiting / queued).
export type PeopleTone = "replied" | "sent" | "held";
export type PeopleChip = { label: string; tone: PeopleTone };

export function personStatusChip(status: string | null | undefined): PeopleChip {
  switch (status) {
    case "replied":
      return { label: "REPLIED", tone: "replied" };
    case "awaiting":
    case "sent":
      return { label: "SENT", tone: "sent" };
    case "queued":
    case "drafted":
      return { label: "HELD", tone: "held" };
    default:
      return { label: (status || "held").toUpperCase(), tone: "held" };
  }
}

// The People tracker table (prototype lines 512–527) shows one row per contact,
// derived from that person's latest interaction and next pending follow-up.
// These helpers keep the derivation pure and unit-tested; the page turns the
// tones into token colors.
export type PersonRowInput = {
  last_interaction_type?: string | null;
  last_interaction?: string | null;
  next_followup_due?: string | null;
};

// "LAST TOUCH" column: "reply · yesterday", "sent · 4d ago", or "—".
export function personLastTouch(row: PersonRowInput, now: number = Date.now()): string {
  const when = relativeWhen(row?.last_interaction, now);
  if (!when) return "—";
  const type = row?.last_interaction_type;
  const word =
    type === "replied" ? "reply" : type === "sent" ? "sent" : type === "drafted" ? "draft" : "touch";
  return `${word} · ${when}`;
}

// "NEXT" column: what happens next, tinted by kind.
//   'you'    → the ball is in your court (they replied) — ink
//   'auto'   → an automatic follow-up is queued — muted
//   'closed' → nothing queued / gone cold — faint
export type NextTone = "you" | "auto" | "closed";

export function personNextStep(
  row: PersonRowInput,
  now: number = Date.now(),
): { label: string; tone: NextTone } {
  const type = row?.last_interaction_type;
  if (type === "replied") return { label: "you: your move", tone: "you" };
  if (type === "drafted") return { label: "draft held", tone: "auto" };
  if (type === "sent") {
    const dueRaw = row?.next_followup_due;
    if (dueRaw) {
      const due = new Date(dueRaw);
      if (Number.isFinite(due.getTime())) {
        const date = due.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        return { label: `auto follow-up · ${date}`, tone: "auto" };
      }
    }
    // No follow-up queued — cold if the last touch is old, else still awaiting.
    const last = row?.last_interaction ? new Date(row.last_interaction).getTime() : null;
    if (last != null && Number.isFinite(last) && now - last > 14 * 86400000) {
      return { label: "closed", tone: "closed" };
    }
    return { label: "auto follow-up queued", tone: "auto" };
  }
  return { label: "—", tone: "closed" };
}

// Maps a person's latest interaction type to the status string
// `personStatusChip` understands (replied → REPLIED, sent → SENT, else HELD).
export function interactionToStatus(type: string | null | undefined): string {
  if (type === "replied") return "replied";
  if (type === "sent") return "awaiting";
  if (type === "drafted") return "queued";
  return "queued";
}

// A tracker row needs your attention — highlighted `#fdfcf8` bg — when the
// person has replied and the next move is yours.
export function trackerRowNeedsAction(row: PersonRowInput): boolean {
  return row?.last_interaction_type === "replied";
}

// ── Shared time + text helpers ───────────────────────────────────────────────
// Relative timestamp. `now` is injectable so tests stay deterministic. (Kept
// local rather than importing desk-logic's fmtWhen so this module has no
// cross-module coupling in the test graph.)
export function relativeWhen(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
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

export function truncate(s: string, max: number): string {
  const t = (s || "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
