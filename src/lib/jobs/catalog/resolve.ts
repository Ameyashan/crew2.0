// Catalog resolver (Module 2). Expands interest sectors and/or company names into
// candidate company boards with best-guess (ats, slug). These are GUESSES — the
// validator (validate.ts) probes the live board before anything is trusted, so
// accuracy comes from validation, not the model.

import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "@/lib/claude";
import { logAgentRun } from "@/lib/agent-runs";
import { SECTORS, isSectorId } from "@/lib/jobs/catalog/sectors";
import type { Ats } from "@/lib/jobs/types";

const MODEL = "claude-sonnet-4-6";
const MAX_ATTEMPTS = 3;

let _client: Anthropic | null = null;
function client() {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  _client = new Anthropic({ apiKey: key });
  return _client;
}

// One company to attempt: a display name, the sector tags it belongs to, and an
// ordered list of (ats, slug) guesses to try until one validates.
export interface ResolvedCompany {
  company: string;
  sectors: string[];
  attempts: { ats: Ats; slug: string }[];
}

interface ResolveInput {
  sectors?: string[]; // sector ids that need coverage
  companyNames?: string[]; // explicit company names (profile pins) to resolve
  perSector?: number; // how many companies to request per sector
}

const SYSTEM = `You map job-market interests to company career boards. Given sector tags and/or specific company names, list real companies that ACTIVELY hire and are likely hosted on Greenhouse, Lever, or Ashby.

For each company give your single best guess of:
- "ats": one of "greenhouse" | "lever" | "ashby".
- "slug": the board/site slug used in that ATS's URL. Greenhouse and Lever slugs are almost always the company name lowercased with no spaces (e.g. "stripe", "scaleai"); Ashby slugs are usually the company name in its normal casing (e.g. "Ramp", "Linear", "OpenAI").
- "sectors": which of the PROVIDED sector ids this company fits (subset; may be empty for a company given only by name).

Rules:
- Prefer well-known, currently-hiring companies. It is fine to be wrong about the exact slug — a validator checks every guess against the live board, so guess your best.
- Only use sector ids from the provided list. Do not invent sector ids.
- Do NOT include a company more than once.

Output strict JSON only, no prose:
{ "companies": [ { "company": string, "ats": "greenhouse"|"lever"|"ashby", "slug": string, "sectors": string[] } ] }`;

function isAts(v: unknown): v is Ats {
  return v === "greenhouse" || v === "lever" || v === "ashby";
}

// Programmatic slug variants for a company name, used as fallbacks after the
// model's primary guess. Bounded so the validator never probes too much.
function slugVariants(name: string): string[] {
  const base = name.toLowerCase().trim();
  const noSpace = base.replace(/[^a-z0-9]/g, "");
  const hyphen = base.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return [...new Set([noSpace, hyphen])].filter(Boolean);
}

export async function resolveCandidates(input: ResolveInput): Promise<ResolvedCompany[]> {
  const sectors = (input.sectors ?? []).filter(isSectorId);
  const companyNames = (input.companyNames ?? []).map((c) => c.trim()).filter(Boolean);
  if (!sectors.length && !companyNames.length) return [];

  const perSector = input.perSector ?? 12;
  const sectorLines = sectors
    .map((id) => {
      const s = SECTORS.find((x) => x.id === id);
      return s ? `- ${s.id}: ${s.label} (${s.hint})` : `- ${id}`;
    })
    .join("\n");

  const userPrompt = [
    sectors.length &&
      `Sectors needing coverage (return ~${perSector} companies each, tagged with the matching sector ids):\n${sectorLines}`,
    companyNames.length &&
      `Specific companies to resolve to an ATS board:\n${companyNames.map((c) => `- ${c}`).join("\n")}`,
  ]
    .filter(Boolean)
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
      max_tokens: 2000,
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
    throw e;
  } finally {
    await logAgentRun({
      agent_type: "jobs:catalog_resolve",
      model: MODEL,
      input_tokens: inTokens,
      output_tokens: outTokens,
      latency_ms: Date.now() - started,
      outcome,
      error: err,
      meta: { sectors, companies: companyNames.length },
    });
  }

  let parsed: { companies?: Array<{ company?: unknown; ats?: unknown; slug?: unknown; sectors?: unknown }> } = {};
  try {
    parsed = JSON.parse(extractJson(text));
  } catch {
    return [];
  }
  const raw = Array.isArray(parsed.companies) ? parsed.companies : [];

  const out: ResolvedCompany[] = [];
  for (const r of raw) {
    const company = typeof r.company === "string" ? r.company.trim() : "";
    if (!company || !isAts(r.ats)) continue;
    const primarySlug = typeof r.slug === "string" ? r.slug.trim() : "";
    if (!primarySlug) continue;
    const tags = Array.isArray(r.sectors) ? r.sectors.filter((s): s is string => typeof s === "string" && isSectorId(s)) : [];

    // Ordered attempts: model's primary guess, then programmatic variants on the
    // same ATS. Deduped and capped.
    const slugs = [primarySlug, ...slugVariants(company)];
    const attempts: { ats: Ats; slug: string }[] = [];
    const seen = new Set<string>();
    for (const slug of slugs) {
      const key = `${r.ats}:${slug.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      attempts.push({ ats: r.ats, slug });
      if (attempts.length >= MAX_ATTEMPTS) break;
    }
    out.push({ company, sectors: tags, attempts });
  }
  return out;
}
