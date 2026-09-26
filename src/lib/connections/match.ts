// Company keys for matching a LinkedIn connection's free-text company
// ("Goldman Sachs", "JPMorganChase", "Stripe, Inc.") to a catalog employer
// ("Goldman Sachs Group", "JPMorgan Chase", "Stripe"). Pure; stored on each
// connection row at import so lookups are an indexed equality match.
//
//   key  — the employer-name normalization used for H-1B matching (suffixes
//          like Inc / Group / Holdings dropped), with spaces removed:
//          "JPMorgan Chase & Co." → "jpmorganchaseand" → … → "jpmorganchase"
//   core — additionally drops filler words ("technologies", "labs") and
//          trailing descriptors ("AI", "Health"), the same lists the board
//          ownership check uses, so "Scale AI" ↔ "Scale" and
//          "Palantir Technologies" ↔ "Palantir" meet.
// A connection matches a company when their cores are equal.
//
// Relative imports only (node --test).

import { normalizeEmployerName } from "../jobs/h1b/normalize.ts";
import { DESCRIPTORS, DROP_WORDS } from "../jobs/universe/probe.ts";

function words(name: string): string[] {
  const w = normalizeEmployerName(name).split(" ").filter(Boolean);
  // "JPMorgan Chase & Co" → "... chase and" once "co" is stripped.
  while (w.length > 1 && w[w.length - 1] === "and") w.pop();
  return w;
}

export function companyKey(name: string | null | undefined): string | null {
  if (!name) return null;
  const k = words(name).join("");
  return k.length >= 2 ? k : null;
}

export function companyCore(name: string | null | undefined): string | null {
  if (!name) return null;
  let w = words(name).filter((x) => !DROP_WORDS.has(x));
  while (w.length > 1 && DESCRIPTORS.has(w[w.length - 1])) w = w.slice(0, -1);
  const k = w.join("");
  return k.length >= 2 ? k : companyKey(name);
}

// Every core an employer may appear under: its catalog name plus the
// universe's display name and aliases (legal / USCIS spellings).
export function employerCores(names: Array<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const n of names) {
    const c = companyCore(n);
    if (c) out.add(c);
  }
  return [...out];
}

// "Not a real employer" strings people put in the Company field.
const NOT_EMPLOYERS = new Set([
  "selfemployed", "self", "freelance", "freelancer", "independent", "independentconsultant",
  "stealth", "stealthstartup", "stealthmode", "none", "na", "retired", "student", "unemployed",
  "confidential", "various",
]);

export function isRealEmployer(company: string | null | undefined): boolean {
  const k = companyKey(company);
  return !!k && !NOT_EMPLOYERS.has(k);
}
