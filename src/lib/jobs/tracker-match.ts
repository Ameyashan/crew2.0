// Company tracker: the free (no-LLM) matching rules.
//
// The tracker watches a short list of companies the user named and surfaces
// roles whose TITLE fits the role they're after. Matching is plain string logic
// so a daily check costs nothing: a word-level title match stands in for the
// LLM fit score the ranked feed uses.
//
// Pure, no imports beyond types — keeps it loadable by `node --test` (the
// runner can't resolve the "@/" path alias).

// How many companies one user can track.
export const TRACK_LIMIT = 15;

// A company's very first fetch imports its whole board at once, so those rows
// all carry a fresh first_seen_at. A job only counts as "new" when it was
// first seen this long after the company's earliest job — i.e. it showed up on
// a later fetch, not in the initial import.
export const BASELINE_GRACE_MS = 60 * 60 * 1000;

// Words that carry no signal in a title ("Head of Product" → head, product).
const STOP = new Set(["of", "and", "the", "for", "in", "at", "to", "a", "an", "&"]);

// Split a normalized role term ("senior product manager") into the words a
// title must contain. Only [a-z0-9+#.] survives, so a word is always safe
// inside a PostgREST ilike filter. Single letters are dropped ("c" would match
// every title); two-letter words stay (ml, ai, qa, ux).
export function titleWords(term: string): string[] {
  const words = term
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9+#.]/g, "").replace(/^\.+|\.+$/g, ""))
    .filter((w) => w.length >= 2 && !STOP.has(w));
  return [...new Set(words)];
}

// The PostgREST `or=(…)` body pre-filtering titles in SQL: any term matches
// when ALL its words appear somewhere in the title. Loose on purpose (substring
// match); titleMatches() re-checks each row on word boundaries.
export function titleFilterOr(terms: string[]): string | null {
  const clauses = terms
    .map(titleWords)
    .filter((ws) => ws.length > 0)
    .map((ws) =>
      ws.length === 1 ? `title.ilike.%${ws[0]}%` : `and(${ws.map((w) => `title.ilike.%${w}%`).join(",")})`,
    );
  return clauses.length ? clauses.join(",") : null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Does this title fit any of the user's role terms? Every word of a term must
// START a word in the title, in any order: "product manager" matches "Manager,
// Product (Payments)" and "Senior Product Manager", and "engineer" matches
// "Engineering Manager", but "ai" doesn't match "Maintenance". No terms → every
// title passes (the user tracks the whole company).
export function titleMatches(title: string, terms: string[]): boolean {
  const wordSets = terms.map(titleWords).filter((ws) => ws.length > 0);
  if (!wordSets.length) return true;
  const t = title.toLowerCase();
  return wordSets.some((ws) => ws.every((w) => new RegExp(`(^|[^a-z0-9])${escapeRe(w)}`).test(t)));
}

// Is a listing new for the tracker? First seen since `since`, and not part of
// the company's initial import (see BASELINE_GRACE_MS). `baseline` is the
// earliest first_seen_at we hold for the company.
export function isNewListing(firstSeenAt: string, since: number, baseline: string | null): boolean {
  const seen = Date.parse(firstSeenAt);
  if (!Number.isFinite(seen) || seen < since) return false;
  if (!baseline) return true;
  const base = Date.parse(baseline);
  return !Number.isFinite(base) || seen > base + BASELINE_GRACE_MS;
}
