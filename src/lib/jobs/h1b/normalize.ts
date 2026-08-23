// Pure H-1B matching + rollup logic (no deps, node --test safe). The impure
// orchestration (Supabase, LLM disambiguation) lives in match.ts.

import type { H1bStats, H1bFyCounts, VisaEvidence, VisaConfidence } from "@/lib/db/schema";

// Trailing corporate-suffix tokens stripped (repeatedly) from the END of a name
// so "STRIPE, INC" and catalog "Stripe" collapse to the same key. Deliberately
// short: over-stripping ("technologies", "labs") would merge distinct
// companies; the LLM disambiguation tier handles those safely instead.
const SUFFIXES = new Set([
  "inc", "incorporated", "llc", "llp", "lp", "ltd", "limited", "corp",
  "corporation", "co", "company", "plc", "pllc", "pc", "usa", "us",
  "holdings", "holding", "group", "international", "intl",
]);

// Lowercase, fold "&"→"and", drop punctuation, collapse whitespace, strip
// trailing corporate suffixes and a leading "the". Applied identically to
// USCIS legal names (at ingest) and catalog names (at match), so the suffix
// handling cancels out on both sides.
export function normalizeEmployerName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const tokens = base.split(" ").filter(Boolean);
  while (tokens.length > 1 && SUFFIXES.has(tokens[tokens.length - 1])) tokens.pop();
  if (tokens.length > 1 && tokens[0] === "the") tokens.shift();
  return tokens.join(" ");
}

export interface FyRecord extends H1bFyCounts {
  fiscal_year: number;
}

const total = (c: H1bFyCounts) =>
  c.initial_approvals + c.initial_denials + c.continuing_approvals + c.continuing_denials;

// How many recent FYs count toward the approval rate (and its minimum sample
// size before we show a percentage at all).
const RATE_WINDOW_FYS = 3;
const RATE_MIN_DECISIONS = 5;

// Aggregate matched USCIS rows (already filtered to one company's employer
// names) into the companies.h1b_stats rollup.
export function rollupStats(records: FyRecord[]): H1bStats {
  const by_fy: Record<string, H1bFyCounts> = {};
  for (const r of records) {
    const key = String(r.fiscal_year);
    const cur = (by_fy[key] ??= {
      initial_approvals: 0,
      initial_denials: 0,
      continuing_approvals: 0,
      continuing_denials: 0,
    });
    cur.initial_approvals += r.initial_approvals;
    cur.initial_denials += r.initial_denials;
    cur.continuing_approvals += r.continuing_approvals;
    cur.continuing_denials += r.continuing_denials;
  }

  const filedFys = Object.keys(by_fy)
    .map(Number)
    .filter((fy) => total(by_fy[String(fy)]) > 0)
    .sort((a, b) => a - b);
  const last_filed_fy = filedFys.length ? filedFys[filedFys.length - 1] : null;
  const recent_filed = last_filed_fy ? total(by_fy[String(last_filed_fy)]) : 0;

  let approvals = 0;
  let decisions = 0;
  for (const fy of filedFys.slice(-RATE_WINDOW_FYS)) {
    const c = by_fy[String(fy)];
    approvals += c.initial_approvals + c.continuing_approvals;
    decisions += total(c);
  }
  const approval_rate = decisions >= RATE_MIN_DECISIONS ? approvals / decisions : null;

  return { by_fy, last_filed_fy, recent_filed, approval_rate };
}

// US federal fiscal year for a date (FY starts Oct 1: Aug 2026 → FY2026,
// Nov 2026 → FY2027).
export function currentFiscalYear(now: Date): number {
  return now.getUTCFullYear() + (now.getUTCMonth() >= 9 ? 1 : 0);
}

// A track record only earns the 'sponsors_verified' chip while it's CURRENT:
// filings within the last N fiscal years. Companies that quietly stopped
// sponsoring keep their history in h1b_stats but fall back to the JD-parse
// signal.
export const RECENT_FY_WINDOW = 2;

export function isRecentTrackRecord(stats: H1bStats | null, now: Date): boolean {
  if (!stats?.last_filed_fy || stats.recent_filed <= 0) return false;
  return stats.last_filed_fy >= currentFiscalYear(now) - RECENT_FY_WINDOW;
}

// The snapshot denormalized onto jobs.visa_evidence for a current track record;
// null when the record is missing or stale (chip then falls back to JD-parse).
export function evidenceFromStats(stats: H1bStats | null, now: Date): VisaEvidence | null {
  if (!isRecentTrackRecord(stats, now) || !stats?.last_filed_fy) return null;
  return {
    recent_filed: stats.recent_filed,
    recent_fy: stats.last_filed_fy,
    approval_rate: stats.approval_rate,
  };
}

// Deterministic ranking bump applied when the user said they need sponsorship
// (job_preferences.visa_required). Small on purpose: fit stays the primary
// axis; this breaks ties toward employers who demonstrably sponsor.
export function visaScoreBoost(v: VisaConfidence | null): number {
  if (v === "sponsors_verified") return 6;
  if (v === "likely_sponsors") return 3;
  return 0;
}
