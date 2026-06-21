// Catalog validator (Module 2). Probes a candidate (ats, slug) against the live
// board via the Module 1 fetch layer. A candidate is valid only if the board
// returns at least one job — this is what gates LLM guesses out of the catalog.

import { fetchBoard } from "@/lib/jobs/orchestrator";
import type { Ats } from "@/lib/jobs/types";

export interface ValidationResult {
  ok: boolean;
  jobCount: number;
}

export async function validateCandidate(ats: Ats, slug: string): Promise<ValidationResult> {
  try {
    const jobs = await fetchBoard(ats, slug);
    return { ok: jobs.length > 0, jobCount: jobs.length };
  } catch {
    // Network error / bad slug / non-ok status -> not valid (and distinct from an
    // empty board, which also fails the >0 check).
    return { ok: false, jobCount: 0 };
  }
}

// Try a company's ordered (ats, slug) attempts and return the first that
// validates, or null if none do.
export async function validateAttempts(
  attempts: { ats: Ats; slug: string }[],
): Promise<{ ats: Ats; slug: string } | null> {
  for (const a of attempts) {
    const v = await validateCandidate(a.ats, a.slug);
    if (v.ok) return a;
  }
  return null;
}
