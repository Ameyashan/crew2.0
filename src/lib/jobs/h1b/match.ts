// Company ⇄ USCIS employer matching — the load-bearing join of the H-1B track
// record. USCIS publishes LEGAL names ("AMAZON.COM SERVICES LLC"); the catalog
// holds display names ("Amazon"). Two tiers, conservative on purpose:
//
//   1. exact:  normalizeEmployerName(company) === h1b_employer_records.normalized_name.
//              Trusted outright (suffix-stripped equality).
//   2. LLM:    for companies with no exact hit, prefix-matched candidate legal
//              names go to the model, which picks the subset that IS the company
//              (or none). Same trust model as the catalog resolver: the model
//              proposes, code validates membership in the candidate list.
//
// An unmatched company stays unmatched — a wrong match would produce a
// confidently wrong "verified" chip, which is worse than no chip. Matches and
// the stats rollup are stored on companies (h1b_employer_names / h1b_stats);
// jobs get their snapshot via applyTrackRecordToJobs() and the enrichment pass.
//
// MUST run inside a user context (runWithUser(null, …) is fine) — logAgentRun
// requires one.

import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "@/lib/claude";
import { logAgentRun } from "@/lib/agent-runs";
import { supabaseAdmin } from "@/lib/supabase";
import { mapPool } from "@/lib/jobs/util";
import { normalizeEmployerName, rollupStats, evidenceFromStats, type FyRecord } from "@/lib/jobs/h1b/normalize";
import type { H1bStats } from "@/lib/db/schema";

const MODEL = "claude-sonnet-4-6";
const CANDIDATES_PER_COMPANY = 15;
const COMPANIES_PER_LLM_CALL = 20;
const MIN_PREFIX_KEY_LEN = 4; // "ramp" ok; shorter keys would sweep in noise
const DB_CONCURRENCY = 6;

let _client: Anthropic | null = null;
function client() {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  _client = new Anthropic({ apiKey: key });
  return _client;
}

const SYSTEM = `You match tech companies to their US legal entity names from USCIS H-1B filing records.

For each company you get candidate legal names that share a name prefix. Pick ONLY the candidates that are genuinely the same company (subsidiaries and dba entities of it count, e.g. "AMAZON.COM SERVICES LLC" for Amazon). A similarly-named but DIFFERENT company must be excluded — when unsure, exclude. An empty list is a correct answer.

Copy candidate names EXACTLY as given. Output strict JSON only, no prose:
{ "matches": [ { "i": number, "employers": string[] } ] }`;

interface CompanyRow {
  id: string;
  name: string;
  h1b_matched_at: string | null;
}

interface Pending {
  company: CompanyRow;
  candidates: string[];
}

export interface MatchSummary {
  companies: number;
  matched_exact: number;
  matched_llm: number;
  unmatched: number;
}

// Distinct legal names for a normalized-name equality or prefix query. The
// table repeats an employer across FYs/locations, so dedupe in code.
async function namesWhere(mode: "eq" | "prefix", key: string, cap: number): Promise<string[]> {
  const sb = supabaseAdmin();
  let q = sb.from("h1b_employer_records").select("employer_name").limit(500);
  q = mode === "eq" ? q.eq("normalized_name", key) : q.like("normalized_name", `${key}%`);
  const { data, error } = await q;
  if (error) throw new Error(`h1b name lookup failed: ${error.message}`);
  const seen = new Set<string>();
  for (const r of data ?? []) {
    seen.add(r.employer_name as string);
    if (seen.size >= cap) break;
  }
  return [...seen];
}

// One LLM call disambiguating a batch of companies against their candidates.
// Returns validated employer-name subsets keyed by batch index.
async function llmDisambiguate(batch: Pending[]): Promise<Map<number, string[]>> {
  const userPrompt = batch
    .map((p, i) => `[${i + 1}] ${p.company.name}\nCandidates:\n${p.candidates.map((c) => `- ${c}`).join("\n")}`)
    .join("\n\n");

  const started = Date.now();
  let text = "";
  let inTokens = 0;
  let outTokens = 0;
  let outcome: "ok" | "error" = "ok";
  let err: string | null = null;

  try {
    const resp = await client().messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
    });
    inTokens = resp.usage.input_tokens;
    outTokens = resp.usage.output_tokens;
    for (const block of resp.content) {
      if (block.type === "text") text += block.text;
    }
  } catch (e) {
    outcome = "error";
    err = String(e);
  } finally {
    await logAgentRun({
      agent_type: "jobs:h1b_match",
      model: MODEL,
      input_tokens: inTokens,
      output_tokens: outTokens,
      latency_ms: Date.now() - started,
      outcome,
      error: err,
      meta: { companies: batch.length },
    });
  }

  const out = new Map<number, string[]>();
  if (outcome === "error") return out;

  let parsed: { matches?: Array<{ i?: unknown; employers?: unknown }> } = {};
  try {
    parsed = JSON.parse(extractJson(text));
  } catch {
    return out;
  }
  for (const m of Array.isArray(parsed.matches) ? parsed.matches : []) {
    const idx = typeof m.i === "number" ? m.i - 1 : NaN;
    const pending = batch[idx];
    if (!pending) continue;
    const allowed = new Set(pending.candidates);
    const employers = Array.isArray(m.employers)
      ? m.employers.filter((e): e is string => typeof e === "string" && allowed.has(e))
      : [];
    out.set(idx, employers);
  }
  return out;
}

async function statsFor(employerNames: string[]): Promise<H1bStats> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("h1b_employer_records")
    .select("fiscal_year, initial_approvals, initial_denials, continuing_approvals, continuing_denials")
    .in("employer_name", employerNames)
    .limit(5000);
  if (error) throw new Error(`h1b stats load failed: ${error.message}`);
  return rollupStats((data ?? []) as FyRecord[]);
}

async function saveMatch(companyId: string, employerNames: string[], stats: H1bStats | null) {
  const sb = supabaseAdmin();
  const { error } = await sb
    .from("companies")
    .update({
      h1b_employer_names: employerNames,
      h1b_stats: stats,
      h1b_matched_at: new Date().toISOString(),
    })
    .eq("id", companyId);
  if (error) throw new Error(`save h1b match failed: ${error.message}`);
}

// Match catalog companies to USCIS employer records and store the rollups.
// onlyUnmatched (default true) skips companies already stamped h1b_matched_at,
// so re-runs only touch catalog growth; pass false after ingesting fresh data
// to recompute everyone.
export async function matchCompaniesToH1b(opts?: { onlyUnmatched?: boolean }): Promise<MatchSummary> {
  const sb = supabaseAdmin();
  const onlyUnmatched = opts?.onlyUnmatched ?? true;

  // Nothing ingested yet → nothing to match against.
  const { count } = await sb.from("h1b_employer_records").select("id", { count: "exact", head: true });
  if (!count) return { companies: 0, matched_exact: 0, matched_llm: 0, unmatched: 0 };

  let q = sb.from("companies").select("id, name, h1b_matched_at").eq("active", true);
  if (onlyUnmatched) q = q.is("h1b_matched_at", null);
  const { data: compData, error } = await q;
  if (error) throw new Error(`load companies failed: ${error.message}`);
  const companies = (compData ?? []) as CompanyRow[];
  if (!companies.length) return { companies: 0, matched_exact: 0, matched_llm: 0, unmatched: 0 };

  const summary: MatchSummary = { companies: companies.length, matched_exact: 0, matched_llm: 0, unmatched: 0 };
  const pending: Pending[] = [];

  // Tier 1: exact normalized equality; collect prefix candidates for the rest.
  await mapPool(companies, DB_CONCURRENCY, async (company) => {
    const key = normalizeEmployerName(company.name);
    if (!key) {
      await saveMatch(company.id, [], null);
      summary.unmatched++;
      return;
    }
    const exact = await namesWhere("eq", key, CANDIDATES_PER_COMPANY);
    if (exact.length) {
      await saveMatch(company.id, exact, await statsFor(exact));
      summary.matched_exact++;
      return;
    }
    const candidates =
      key.length >= MIN_PREFIX_KEY_LEN ? await namesWhere("prefix", key, CANDIDATES_PER_COMPANY) : [];
    if (candidates.length) {
      pending.push({ company, candidates });
    } else {
      await saveMatch(company.id, [], null);
      summary.unmatched++;
    }
  });

  // Tier 2: LLM disambiguation over the prefix candidates, batched.
  for (let i = 0; i < pending.length; i += COMPANIES_PER_LLM_CALL) {
    const batch = pending.slice(i, i + COMPANIES_PER_LLM_CALL);
    const picks = await llmDisambiguate(batch);
    for (let b = 0; b < batch.length; b++) {
      const employers = picks.get(b) ?? [];
      if (employers.length) {
        await saveMatch(batch[b].company.id, employers, await statsFor(employers));
        summary.matched_llm++;
      } else {
        await saveMatch(batch[b].company.id, [], null);
        summary.unmatched++;
      }
    }
  }

  return summary;
}

// Push current track records onto the live feed: every active job of a company
// with recent filings gets visa_confidence='sponsors_verified' + the evidence
// snapshot, without waiting for (or re-running) the LLM enrichment pass.
export async function applyTrackRecordToJobs(): Promise<{ companies: number; jobs_updated: number }> {
  const sb = supabaseAdmin();
  const now = new Date();

  const { data, error } = await sb
    .from("companies")
    .select("id, h1b_stats")
    .eq("active", true)
    .not("h1b_stats", "is", null);
  if (error) throw new Error(`load matched companies failed: ${error.message}`);

  let companiesTouched = 0;
  let jobsUpdated = 0;
  for (const row of data ?? []) {
    const evidence = evidenceFromStats(row.h1b_stats as H1bStats, now);
    if (!evidence) continue;
    companiesTouched++;
    const { data: updated, error: upErr } = await sb
      .from("jobs")
      .update({ visa_confidence: "sponsors_verified", visa_evidence: evidence })
      .eq("company_id", row.id as string)
      .eq("is_active", true)
      .select("id");
    if (!upErr) jobsUpdated += (updated ?? []).length;
  }
  return { companies: companiesTouched, jobs_updated: jobsUpdated };
}
