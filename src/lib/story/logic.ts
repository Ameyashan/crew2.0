// Pure, render-free + network-free helpers for the Story feature (Phase E).
//
// Kept runtime-import-free (only type-only imports, which are erased) so it runs
// under `node --test` and can be shared by the Story page (src/app/app/resume),
// the /api/story routes, and the resume-upload seeder without dragging React /
// Supabase into the test harness.

import type { StoryStatus, StoryEntry } from "@/lib/db/schema";

export const STORY_STATUSES: readonly StoryStatus[] = ["pending", "proposed", "polished", "raw"];

export function isStoryStatus(v: unknown): v is StoryStatus {
  return typeof v === "string" && (STORY_STATUSES as readonly string[]).includes(v);
}

// ── Segmented view toggle (prototype: Timeline / By theme) ───────────────────
export const STORY_VIEWS = [
  { id: "timeline", label: "Timeline" },
  { id: "themes", label: "By theme" },
] as const;
export type StoryView = (typeof STORY_VIEWS)[number]["id"];

// ── Relative "when" for entry rows ───────────────────────────────────────────
// "just now" / "3d ago" / a plain date past ~30 days. `now` is injectable so the
// helper is deterministic under test.
export function storyWhen(iso: string | null, now: number = Date.now()): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = now - t;
  const day = 86_400_000;
  if (diff < 0) return "just now";
  if (diff < day) {
    const h = Math.floor(diff / 3_600_000);
    return h < 1 ? "just now" : `${h}h ago`;
  }
  const d = Math.floor(diff / day);
  if (d === 1) return "1d ago";
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}

// ── "By theme" grouping ──────────────────────────────────────────────────────
// Group entries by their tags. An entry with several tags appears under each;
// untagged entries collect under a trailing "untagged" group. Theme headers are
// sorted alphabetically, with "untagged" pinned last. Entry order within a group
// preserves the input order (newest-first, as the API returns them).
export interface Theme<T = StoryEntry> {
  name: string;
  items: T[];
}

export function groupByTheme<T extends { tags?: string[] | null }>(entries: T[]): Theme<T>[] {
  const map = new Map<string, T[]>();
  const untagged: T[] = [];
  for (const e of entries) {
    const tags = (e.tags ?? []).map((t) => t.trim()).filter(Boolean);
    if (tags.length === 0) {
      untagged.push(e);
      continue;
    }
    for (const tag of tags) {
      const arr = map.get(tag) ?? [];
      arr.push(e);
      map.set(tag, arr);
    }
  }
  const themes: Theme<T>[] = [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, items]) => ({ name, items }));
  if (untagged.length) themes.push({ name: "untagged", items: untagged });
  return themes;
}

// ── Resume → Story seed extraction ───────────────────────────────────────────
// On resume upload we pre-fill the Story with the accomplishment-looking lines
// pulled from the resume text (the prototype's "12 entries extracted"). Pure and
// deterministic so the seeder is testable and never calls the model.

export const MAX_SEED_ENTRIES = 12;

// Section headers, contact lines, dates, and one-word labels are noise, not
// accomplishments. Everything that survives reads like a bullet.
function looksLikeAccomplishment(line: string): boolean {
  if (line.length < 20 || line.length > 300) return false;
  if (!/[a-z]/i.test(line)) return false; // must contain letters
  const words = line.split(" ").filter(Boolean);
  if (words.length < 4) return false; // names / titles / dates are short
  // contact info (email, url, phone)
  if (/@|https?:\/\/|www\.|\b\d{3}[-.)\s]?\d{3}[-.\s]?\d{4}\b/.test(line)) return false;
  // ALL-CAPS section header (e.g. "PROFESSIONAL EXPERIENCE")
  const letters = line.replace(/[^A-Za-z]/g, "");
  if (letters && letters === letters.toUpperCase() && words.length <= 5) return false;
  return true;
}

export function extractStorySeeds(resumeText: string | null, max: number = MAX_SEED_ENTRIES): string[] {
  if (!resumeText) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const rawLine of resumeText.split(/\r?\n/)) {
    // collapse whitespace, strip a leading bullet glyph or "1." / "1)" numbering
    const line = rawLine
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^([•·▪◦‣*\-–—]+|\d+[.)])\s+/, "")
      .trim();
    if (!looksLikeAccomplishment(line)) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
    if (out.length >= max) break;
  }
  return out;
}
