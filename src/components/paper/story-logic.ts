// Pure, render-free helpers for the Story page (Phase E of the jugaadu reskin).
// Same split the Desk / top bar use: the page component owns fetching + state,
// these functions own the rules so they run under `node --test` without React /
// Supabase in scope.

export type StoryStatus = "raw" | "pending" | "proposed" | "polished";

export interface StoryEntryLike {
  id: string;
  raw: string;
  bullet?: string | null;
  status?: StoryStatus | string | null;
  tags?: string[] | null;
  created_at?: string | null;
}

// ── Per-entry render flags ───────────────────────────────────────────────────
// The prototype renders each entry through four mutually-informing branches
// (pending / proposed / polished / plain). Centralise the status→flags mapping
// so the row component stays declarative.
export interface EntryView {
  isPending: boolean;
  isProposed: boolean;
  isPolished: boolean;
  hasBullet: boolean;
}

export function entryView(entry: StoryEntryLike): EntryView {
  const status = entry?.status ?? "raw";
  const bullet = typeof entry?.bullet === "string" ? entry.bullet.trim() : "";
  return {
    isPending: status === "pending",
    // A proposed bullet is only meaningful if there's actually a bullet to show.
    isProposed: status === "proposed" && bullet.length > 0,
    isPolished: status === "polished" && bullet.length > 0,
    hasBullet: bullet.length > 0,
  };
}

// ── "By theme" grouping ──────────────────────────────────────────────────────
// Group entries by tag for the segmented "By theme" view. An entry with multiple
// tags appears under each; untagged entries collect under a trailing "Other"
// group. Themes are ordered by size (largest first), ties broken alphabetically;
// "Other" always sorts last. Entry order within a theme is preserved (the caller
// passes them newest-first).
export interface Theme {
  name: string; // display name (uppercased by the view)
  items: StoryEntryLike[];
}

export const UNTAGGED_THEME = "other";

export function groupByTheme(entries: StoryEntryLike[] | null | undefined): Theme[] {
  const buckets = new Map<string, StoryEntryLike[]>();
  for (const e of entries ?? []) {
    const tags = Array.isArray(e?.tags)
      ? e.tags.map((t) => (typeof t === "string" ? t.trim().toLowerCase() : "")).filter(Boolean)
      : [];
    const keys = tags.length ? Array.from(new Set(tags)) : [UNTAGGED_THEME];
    for (const k of keys) {
      const arr = buckets.get(k) ?? [];
      arr.push(e);
      buckets.set(k, arr);
    }
  }
  return Array.from(buckets.entries())
    .map(([name, items]) => ({ name, items }))
    .sort((a, b) => {
      // "Other" always last.
      if (a.name === UNTAGGED_THEME) return 1;
      if (b.name === UNTAGGED_THEME) return -1;
      if (b.items.length !== a.items.length) return b.items.length - a.items.length;
      return a.name.localeCompare(b.name);
    });
}

// ── Story emptiness ──────────────────────────────────────────────────────────
// Canonical "is the account's Story thin" test used by the Desk / run view.
// Entries win when present; the resume_text fallback keeps accounts that
// onboarded before Story existed from suddenly flipping to thin.
export function storyIsEmpty(
  entryCount: number | null | undefined,
  profile: { resume_text?: string | null } | null | undefined,
): boolean {
  if (typeof entryCount === "number" && entryCount > 0) return false;
  const text = typeof profile?.resume_text === "string" ? profile.resume_text.trim() : "";
  return text.length === 0;
}

// Relative timestamp for entry rows ("just now" / "3d ago" / a date). `now` is
// injectable so the output is deterministic under test. Mirrors desk-logic's
// fmtWhen but day-granular, matching the Story prototype's compact `e.when`.
export function entryWhen(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = now - t;
  const day = 86400000;
  if (diff < day) return "today";
  const d = Math.floor(diff / day);
  if (d === 1) return "1d ago";
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
