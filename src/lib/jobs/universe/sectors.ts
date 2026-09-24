// Sector refinement for universe employers. The seed maps the sheet's coarse
// industry to sectors ("Enterprise Tech" → enterprise_saas), which can't tell
// an AI lab from a security vendor, and H-1B-only rows carry no industry at
// all — so Snowflake or Datadog would never reach a user who picked "Data &
// Infra". One batched LLM call tags ~60 employers with the interest taxonomy
// (catalog/sectors.ts); results land on the universe row AND its catalog row,
// which is what interest-based candidate selection reads.
//
// Bounded per call; the jobs-fetch cron drains it a batch per tick.
// MUST run inside a user context (logAgentRun).

import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "@/lib/claude";
import { logAgentRun } from "@/lib/agent-runs";
import { supabaseAdmin } from "@/lib/supabase";
import { SECTORS, isSectorId } from "@/lib/jobs/catalog/sectors";

const MODEL = "claude-sonnet-4-6";
const BATCH = 60;

let _client: Anthropic | null = null;
function client() {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  _client = new Anthropic({ apiKey: key });
  return _client;
}

const SYSTEM = `You tag employers with job-market interest sectors. For each numbered employer, pick the sector ids (0-3) that best describe what the company does. Use ONLY these ids:
${SECTORS.map((s) => `- ${s.id}: ${s.label} (${s.hint})`).join("\n")}

An employer outside all of them (a steel maker, an airline, a university) gets an empty list — do not force a fit. Output strict JSON only, no prose:
{ "companies": [ { "i": number, "sectors": string[] } ] }`;

interface Row {
  id: string;
  name: string;
  industry: string | null;
  sectors: string[];
}

async function tagBatch(rows: Row[]): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>();
  const userPrompt = rows
    .map((r, i) => `[${i + 1}] ${r.name}${r.industry ? ` — ${r.industry}` : ""}`)
    .join("\n");
  const started = Date.now();
  let text = "";
  let inTokens = 0;
  let outTokens = 0;
  let outcome: "ok" | "error" = "ok";
  let err: string | null = null;
  try {
    const resp = await client().messages.create({
      model: MODEL,
      max_tokens: 3000,
      system: SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
    });
    inTokens = resp.usage.input_tokens;
    outTokens = resp.usage.output_tokens;
    for (const block of resp.content) if (block.type === "text") text += block.text;
  } catch (e) {
    outcome = "error";
    err = String(e);
  } finally {
    await logAgentRun({
      agent_type: "jobs:universe_sectors",
      model: MODEL,
      input_tokens: inTokens,
      output_tokens: outTokens,
      latency_ms: Date.now() - started,
      outcome,
      error: err,
      meta: { companies: rows.length },
    });
  }
  if (outcome === "error") return out;
  let parsed: { companies?: Array<{ i?: unknown; sectors?: unknown }> } = {};
  try {
    parsed = JSON.parse(extractJson(text));
  } catch {
    return out;
  }
  for (const c of Array.isArray(parsed.companies) ? parsed.companies : []) {
    const idx = typeof c.i === "number" ? c.i - 1 : NaN;
    if (!(idx >= 0 && idx < rows.length)) continue;
    const sectors = Array.isArray(c.sectors)
      ? [...new Set(c.sectors.filter((s): s is string => typeof s === "string" && isSectorId(s)))].slice(0, 3)
      : [];
    out.set(idx, sectors);
  }
  return out;
}

export interface RefineSummary {
  considered: number;
  refined: number;
}

// Tag one batch of not-yet-refined employers (resolved ones first — they're
// the ones candidate selection can already reach). Staffing firms and
// academic employers are skipped: they're excluded or sector-less by design.
export async function refineUniverseSectors(opts?: { limit?: number }): Promise<RefineSummary> {
  const sb = supabaseAdmin();
  const limit = Math.min(opts?.limit ?? BATCH, BATCH);
  const load = async (resolved: boolean, n: number) => {
    let q = sb
      .from("company_universe")
      .select("id, name, industry, sectors")
      .is("sectors_refined_at", null)
      .in("org_type", ["company", "hospital"]);
    q = resolved ? q.eq("resolve_status", "resolved") : q.neq("resolve_status", "resolved");
    const { data, error } = await q.limit(n);
    if (error) throw new Error(`load universe for sectors failed: ${error.message}`);
    return (data ?? []) as Row[];
  };
  const rows = await load(true, limit);
  if (rows.length < limit) rows.push(...(await load(false, limit - rows.length)));
  if (!rows.length) return { considered: 0, refined: 0 };

  const tags = await tagBatch(rows);
  if (!tags.size) return { considered: rows.length, refined: 0 }; // LLM failed — retry next tick

  let refined = 0;
  const nowIso = new Date().toISOString();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // A row the model skipped keeps its industry-derived sectors.
    const sectors = tags.get(i) ?? row.sectors;
    await sb
      .from("company_universe")
      .update({ sectors, sectors_refined_at: nowIso, updated_at: nowIso })
      .eq("id", row.id);

    // Catalog rows: universe-sourced ones take the refined tags outright;
    // seeded / LLM-resolved ones keep their curated tags and gain these.
    const { data: comps } = await sb.from("companies").select("id, source, sectors").eq("universe_id", row.id);
    for (const c of comps ?? []) {
      const next =
        c.source === "universe" ? sectors : [...new Set([...((c.sectors as string[]) ?? []), ...sectors])];
      await sb.from("companies").update({ sectors: next }).eq("id", c.id as string);
    }
    refined++;
  }
  return { considered: rows.length, refined };
}
