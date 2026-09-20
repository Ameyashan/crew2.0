// Target-role → title search terms, shared by candidate selection.
//
// Candidate selection (src/lib/jobs/scan.ts) used to pick jobs to score by
// recency alone, so a user targeting "Product Manager" could burn the whole
// scoring budget on whatever engineering roles were posted most recently and
// never see a PM listing scored at all. These helpers resolve the same
// role-family signal the scorer uses (src/lib/jobs/score.ts,
// resolveTargetRoleLine) into ilike-safe title terms, so title-matching jobs
// can be pulled into the candidate set ahead of the recency pool.
//
// Pure string logic, no imports — keeps it loadable by `node --test` (the
// runner can't resolve the "@/" path alias scan.ts uses).

import type { RoleMode } from "./types";

// Onboarding stores roles in whatever shape the UI produced ("ProductManager",
// "product_manager", "Product Manager"). Split camelCase and separators into a
// single lowercase phrase so it works as a title substring match.
export function normalizeRoleTitle(raw: string): string {
  return raw
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Characters that are ilike wildcards (% _) or PostgREST `or=()` syntax
// (commas, parens, quotes) — stripped so a stored role name can't break or
// widen the query.
const UNSAFE = /[%_,()"']/g;

// The title terms candidate selection should prioritize, resolved with the
// same precedence as the scorer's target-role line: explicit target roles when
// the user asked for a different role, else their current role. Terms shorter
// than 3 chars are dropped — "pm" substring-matches "development".
export function roleTitleTerms(
  roleMode: RoleMode,
  targetRoles: string[],
  currentRole: string | null,
): string[] {
  const raw = roleMode === "different" && targetRoles.length ? targetRoles : currentRole ? [currentRole] : [];
  const seen = new Set<string>();
  for (const r of raw) {
    const term = normalizeRoleTitle(r.replace(UNSAFE, " "));
    if (term.length >= 3) seen.add(term);
  }
  return [...seen];
}
