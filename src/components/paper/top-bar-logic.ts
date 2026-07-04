// Pure, render-free helpers for the app top bar. Extracted from top-bar.tsx so
// they can be unit-tested under `node --test` — the component file imports React
// and next/navigation and can't run in that context.

// The four top-bar nav pills. `match` is the route prefix used for active-pill
// detection; `href` is where the pill navigates. "Story" lives at /app/resume
// (the route name predates the "Story" rename — see plan.md screen mapping).
export const TOP_NAV = [
  { id: "desk", label: "Desk", href: "/app/compose", match: "/app/compose" },
  { id: "jobs", label: "Jobs", href: "/app/jobs", match: "/app/jobs" },
  { id: "story", label: "Story", href: "/app/resume", match: "/app/resume" },
  { id: "people", label: "People", href: "/app/people", match: "/app/people" },
] as const;

// Turn an email local-part into a readable name, e.g. "ameya.shanbhag" → "Ameya Shanbhag".
export function nameFromEmail(email?: string | null): string {
  if (!email) return "";
  const local = email.split("@")[0] ?? "";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

// A pill is active when the current path is under its route prefix.
export function isNavActive(pathname: string | null | undefined, match: string): boolean {
  return !!pathname && pathname.startsWith(match);
}

// Deterministic warm avatar background so the same account always gets the same
// colour (mirrors the prototype's per-account `userBg`).
export const AVATAR_BG = ["#3d7a4f", "#8a6d2f", "#a03d2e", "#3a352c", "#6f6656"];
export function avatarBg(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_BG[h % AVATAR_BG.length];
}

// The single uppercase glyph shown in the avatar circle.
export function avatarInitial(displayName: string): string {
  return (displayName.trim()[0] || "?").toUpperCase();
}

// Live-runs chip model. Mirrors the old sidebar's activeRuns/attentionRuns
// logic: green "crew running" while anything is working, amber "needs you" when
// something errored, and null when there's nothing to surface. `target` follows
// the runs that need eyes — resume-only focus lands on /app/resume, otherwise
// /app/compose (which shows the richest progress).
export type RunLite = { stage: string; kind: string };
export function crewChip(
  runs: RunLite[],
): { tone: "active" | "attention"; label: string; target: string } | null {
  const active = runs.filter((r) => r.stage === "working" || r.stage === "parsing");
  const attention = runs.filter((r) => r.stage === "error");
  const focus = active.length ? active : attention;
  if (!focus.length) return null;
  const target = focus.every((r) => r.kind === "resume") ? "/app/resume" : "/app/compose";
  return {
    tone: active.length ? "active" : "attention",
    label: active.length ? "crew running" : "needs you",
    target,
  };
}
