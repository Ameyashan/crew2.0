// Self-growing catalog coverage (Module 2). Public entrypoint:
// ensureCatalogCoverage — given a user's interests (sector ids) and pins
// (company names), make sure the catalog actually covers them.
//
// Flow: coverage-check FIRST (short-circuits before any LLM call when everything
// requested is already covered) -> resolve the gaps via the LLM -> validate each
// guess against the live board -> insert only the winners. Inserts are tagged
// source='llm_resolved' with verified_at set, so the fetch layer (M1) picks them
// up on the next scan.

import { supabaseAdmin } from "@/lib/supabase";
import { mapPool } from "@/lib/jobs/util";
import { resolveCandidates } from "@/lib/jobs/catalog/resolve";
import { validateAttempts } from "@/lib/jobs/catalog/validate";
import { isSectorId } from "@/lib/jobs/catalog/sectors";
import type { Company } from "@/lib/db/schema";

// A sector is "covered" once this many active companies carry the tag.
const MIN_COMPANIES_PER_SECTOR = 8;
// Cap how many companies we validate in one pass (bounds probe time/cost). The
// preferences PUT uses a small cap for responsiveness; the cron a larger one.
const DEFAULT_MAX_VALIDATE = 24;
const VALIDATE_CONCURRENCY = 5;

export interface EnsureCoverageInput {
  sectors?: string[]; // sector ids the user picked
  companyNames?: string[]; // profile pins (target_companies)
  addedBy?: string | null; // user whose demand grows the catalog
  maxValidate?: number;
}

export interface EnsureCoverageResult {
  added: Company[];
  gapsSectors: string[];
  gapsCompanies: string[];
  resolved: number;
  validated: number;
}

const EMPTY = (gapsSectors: string[], gapsCompanies: string[]): EnsureCoverageResult => ({
  added: [],
  gapsSectors,
  gapsCompanies,
  resolved: 0,
  validated: 0,
});

export async function ensureCatalogCoverage(
  input: EnsureCoverageInput,
): Promise<EnsureCoverageResult> {
  const sb = supabaseAdmin();
  const wantSectors = [...new Set((input.sectors ?? []).filter(isSectorId))];
  const wantCompanies = [
    ...new Set((input.companyNames ?? []).map((c) => c.trim()).filter(Boolean)),
  ];
  if (!wantSectors.length && !wantCompanies.length) return EMPTY([], []);

  // ── coverage check (no LLM yet) ──
  const gapsSectors: string[] = [];
  for (const s of wantSectors) {
    const { count } = await sb
      .from("companies")
      .select("id", { count: "exact", head: true })
      .eq("active", true)
      .contains("sectors", [s]);
    if ((count ?? 0) < MIN_COMPANIES_PER_SECTOR) gapsSectors.push(s);
  }

  const gapsCompanies: string[] = [];
  for (const name of wantCompanies) {
    const norm = name.toLowerCase().trim();
    const { count } = await sb
      .from("companies")
      .select("id", { count: "exact", head: true })
      .eq("normalized", norm);
    if ((count ?? 0) === 0) gapsCompanies.push(name);
  }

  if (!gapsSectors.length && !gapsCompanies.length) return EMPTY(gapsSectors, gapsCompanies);

  // ── resolve gaps -> guesses ──
  const resolved = await resolveCandidates({
    sectors: gapsSectors,
    companyNames: gapsCompanies,
  });
  if (!resolved.length) return { ...EMPTY(gapsSectors, gapsCompanies), resolved: 0 };

  // Skip companies whose normalized name OR any attempt key already exists.
  const { data: existing } = await sb.from("companies").select("ats, slug, normalized");
  const existingKeys = new Set((existing ?? []).map((r) => `${r.ats}:${String(r.slug).toLowerCase()}`));
  const existingNorms = new Set((existing ?? []).map((r) => r.normalized as string));

  const pending = resolved
    .filter((c) => !existingNorms.has(c.company.toLowerCase().trim()))
    .map((c) => ({
      ...c,
      attempts: c.attempts.filter((a) => !existingKeys.has(`${a.ats}:${a.slug.toLowerCase()}`)),
    }))
    .filter((c) => c.attempts.length > 0)
    .slice(0, input.maxValidate ?? DEFAULT_MAX_VALIDATE);

  // ── validate (bounded concurrency) ──
  const validatedRows = await mapPool(pending, VALIDATE_CONCURRENCY, async (c) => {
    const hit = await validateAttempts(c.attempts);
    return hit ? { company: c, hit } : null;
  });

  // ── insert winners (sequential; dedupe by normalized name) ──
  const added: Company[] = [];
  let validated = 0;
  const inserted = new Set<string>();
  const nowIso = new Date().toISOString();
  for (const row of validatedRows) {
    if (!row) continue;
    validated++;
    const norm = row.company.company.toLowerCase().trim();
    if (inserted.has(norm)) continue;
    inserted.add(norm);
    const { data: ins, error } = await sb
      .from("companies")
      .insert({
        name: row.company.company,
        normalized: norm,
        ats: row.hit.ats,
        slug: row.hit.slug,
        sectors: row.company.sectors,
        source: "llm_resolved",
        added_by: input.addedBy ?? null,
        verified_at: nowIso,
      })
      .select()
      .single();
    if (!error && ins) added.push(ins as Company);
  }

  return { added, gapsSectors, gapsCompanies, resolved: resolved.length, validated };
}
