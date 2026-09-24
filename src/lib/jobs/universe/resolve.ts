// Universe resolver: turns company_universe rows into scannable `companies`
// rows by finding and VERIFYING each employer's job board. Works the backlog
// down in bounded, time-budgeted batches (the jobs-fetch cron calls it every
// tick; POST /api/admin/universe runs it on demand), so ~1.3k employers never
// need to fit in one request.
//
// Per row, cheapest first:
//   1. slug probe — name variants on Greenhouse / Lever / Ashby (probe.ts).
//      Skipped when probed_at is set (the seed migration ships pre-probed rows).
//   2. LLM guesses — one batched call proposes boards for the misses (incl.
//      Workday, whose tenant/site can't be derived from the name). Every guess
//      is verified against the live board before it's trusted, same trust model
//      as the catalog resolver (catalog/resolve.ts).
//   3. careers-page sniff — fetch the careers URL the model suggested and scan
//      its HTML for a board link (careers.ts).
// Hits insert a companies row (source 'universe'); misses back off
// (next_resolve_at) and are retried a few times before staying unresolved.
//
// MUST run inside a user context (runWithUser(null, …)) — logAgentRun needs one.

import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "@/lib/claude";
import { logAgentRun } from "@/lib/agent-runs";
import { supabaseAdmin } from "@/lib/supabase";
import { mapPool } from "@/lib/jobs/util";
import {
  canonicalSlug,
  findBoard,
  probeBoard,
  workdayBelongsTo,
  LARGE_MIN_JOBS,
  type ProbeAts,
} from "@/lib/jobs/universe/probe";
import { selectAll } from "@/lib/jobs/paging";
import { discoverFromCareersPage } from "@/lib/jobs/universe/careers";
import { parseWorkdaySlug, workdayEvidence } from "@/lib/jobs/sources/workday";
import type { Ats } from "@/lib/jobs/types";

const MODEL = "claude-sonnet-4-6";
const DEFAULT_LIMIT = 60;
const PROBE_CONCURRENCY = 6;
const LLM_BATCH = 25;
// Retry schedule for rows nothing verified: 7d, 14d, 28d, then give up until
// an operator resets them (or the list is re-seeded).
const MAX_ATTEMPTS = 4;
const BACKOFF_DAYS = [7, 14, 28];

let _client: Anthropic | null = null;
function client() {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  _client = new Anthropic({ apiKey: key });
  return _client;
}

export interface UniverseRow {
  id: string;
  name: string;
  org_type: string;
  sectors: string[];
  size_bucket: string | null;
  resolve_attempts: number;
  probed_at: string | null;
}

// A board guess to verify. Workday slugs are "tenant/wdN/site".
export interface BoardAttempt {
  ats: Ats;
  slug: string;
}

export interface VerifiedBoard extends BoardAttempt {
  jobs: number;
}

// Verify one guess against the live board; returns its job count or null.
// Every ATS must also show the board is THIS company's: Greenhouse/Lever/Ashby
// via board name / posting text (probe.ts), Workday via tenant name or the
// site's own branding + a posting (workdayBelongsTo) — tenant names collide
// across employers. Large employers must clear LARGE_MIN_JOBS either way.
export async function verifyAttempt(a: BoardAttempt, row: Pick<UniverseRow, "name" | "size_bucket">): Promise<number | null> {
  const minJobs = row.size_bucket === "large" ? LARGE_MIN_JOBS : 1;
  let n: number | null;
  if (a.ats === "workday") {
    const ev = await workdayEvidence(a.slug);
    const tenant = parseWorkdaySlug(a.slug)?.tenant ?? "";
    n = ev && workdayBelongsTo(tenant, ev.text, row.name) ? ev.total : null;
  } else {
    n = await probeBoard(a.ats as ProbeAts, a.slug, row.name).catch(() => null);
  }
  return n && n >= minJobs ? n : null;
}

// ── LLM guesses ──────────────────────────────────────────────────────────────

const SYSTEM = `You locate the public job boards of well-known employers. For each numbered company, give up to 3 best guesses of the applicant-tracking-system board that hosts its CURRENT US job listings, plus its careers page URL.

Board formats:
- {"ats":"greenhouse","slug":"<board token>"} — boards.greenhouse.io/<slug>
- {"ats":"lever","slug":"<site>"} — jobs.lever.co/<site>
- {"ats":"ashby","slug":"<org>"} — jobs.ashbyhq.com/<org>
- {"ats":"workday","slug":"<tenant>/<wdN>/<site>"} — https://<tenant>.<wdN>.myworkdayjobs.com/<site>, e.g. "nvidia/wd5/NVIDIAExternalCareerSite", "salesforce/wd12/External_Career_Site"

Rules:
- Large enterprises mostly use Workday; startups mostly Greenhouse, Lever or Ashby. Guess the one you believe is live today.
- It is fine to be unsure — every guess is verified against the live board, so a wrong guess costs nothing. Omit a company entirely only if you have no idea.
- "careers_url" is the company's own careers landing page (or null).

Output strict JSON only, no prose:
{ "companies": [ { "i": number, "boards": [ { "ats": string, "slug": string } ], "careers_url": string | null } ] }`;

const ATS_SET = new Set<Ats>(["greenhouse", "lever", "ashby", "workday"]);

export interface Guess {
  boards: BoardAttempt[];
  careersUrl: string | null;
}

// ok=false when the model call failed or returned garbage — callers must not
// count that against the rows (an API outage would otherwise burn their
// retry budget and park them for weeks).
export async function guessBoards(names: string[]): Promise<{ ok: boolean; guesses: Map<number, Guess> }> {
  const out = new Map<number, Guess>();
  if (!names.length) return { ok: true, guesses: out };
  const userPrompt = names.map((n, i) => `[${i + 1}] ${n}`).join("\n");

  const started = Date.now();
  let text = "";
  let inTokens = 0;
  let outTokens = 0;
  let outcome: "ok" | "error" = "ok";
  let err: string | null = null;
  try {
    const resp = await client().messages.create({
      model: MODEL,
      max_tokens: 4000,
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
      agent_type: "jobs:universe_resolve",
      model: MODEL,
      input_tokens: inTokens,
      output_tokens: outTokens,
      latency_ms: Date.now() - started,
      outcome,
      error: err,
      meta: { companies: names.length },
    });
  }
  if (outcome === "error") return { ok: false, guesses: out };

  let parsed: { companies?: Array<{ i?: unknown; boards?: unknown; careers_url?: unknown }> } = {};
  try {
    parsed = JSON.parse(extractJson(text));
  } catch {
    return { ok: false, guesses: out };
  }
  for (const c of Array.isArray(parsed.companies) ? parsed.companies : []) {
    const idx = typeof c.i === "number" ? c.i - 1 : NaN;
    if (!(idx >= 0 && idx < names.length)) continue;
    const boards: BoardAttempt[] = [];
    for (const b of Array.isArray(c.boards) ? (c.boards as Array<Record<string, unknown>>) : []) {
      const ats = b?.ats as Ats;
      const slug = typeof b?.slug === "string" ? b.slug.trim() : "";
      if (ATS_SET.has(ats) && slug && boards.length < 3) boards.push({ ats, slug });
    }
    const careersUrl =
      typeof c.careers_url === "string" && /^https?:\/\//i.test(c.careers_url) ? c.careers_url : null;
    out.set(idx, { boards, careersUrl });
  }
  return { ok: true, guesses: out };
}

// ── persistence ──────────────────────────────────────────────────────────────

// Thrown when a verified board already belongs to a different universe
// employer — the two rows are the same company under two names (fold them in
// classify.ts) or one guess is wrong; either way, don't steal the board.
export class BoardOwnedError extends Error {}

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

// Insert (or link) the catalog row for a verified board. An existing row on the
// same board (matched case-insensitively) — seeded or LLM-resolved — is linked
// instead, keeping its curated sectors (unioned) and size, and its fetch
// failure count reset (it may have been deactivated as dead).
export async function upsertUniverseCompany(row: UniverseRow, board: BoardAttempt): Promise<void> {
  const sb = supabaseAdmin();
  const slug = canonicalSlug(board.ats, board.slug);
  const { data: existing } = await sb
    .from("companies")
    .select("id, sectors, size_bucket, universe_id, name")
    .eq("ats", board.ats)
    .ilike("slug", likeEscape(slug))
    .maybeSingle();
  if (existing?.universe_id && existing.universe_id !== row.id) {
    throw new BoardOwnedError(`board ${board.ats}:${slug} already belongs to ${existing.name as string}`);
  }
  if (existing) {
    const sectors = [...new Set([...((existing.sectors as string[]) ?? []), ...row.sectors])];
    const { error } = await sb
      .from("companies")
      .update({
        universe_id: row.id,
        org_type: row.org_type,
        sectors,
        size_bucket: existing.size_bucket ?? row.size_bucket,
        active: true,
        fetch_failures: 0,
        fetch_error: null,
      })
      .eq("id", existing.id as string);
    if (error) throw new Error(`link company failed: ${error.message}`);
    return;
  }
  const { error } = await sb.from("companies").insert({
    name: row.name,
    normalized: row.name.toLowerCase().trim(),
    ats: board.ats,
    slug,
    sectors: row.sectors,
    size_bucket: row.size_bucket,
    source: "universe",
    verified_at: new Date().toISOString(),
    universe_id: row.id,
    org_type: row.org_type,
  });
  if (error) throw new Error(`insert company failed: ${error.message}`);
}

async function markResolved(row: UniverseRow, board: VerifiedBoard) {
  const nowIso = new Date().toISOString();
  await supabaseAdmin()
    .from("company_universe")
    .update({
      resolve_status: "resolved",
      resolved_at: nowIso,
      resolve_note: `${board.ats}:${board.slug} (${board.jobs} jobs)`,
      probed_at: row.probed_at ?? nowIso,
      updated_at: nowIso,
    })
    .eq("id", row.id);
}

async function markMiss(row: UniverseRow, note: string) {
  const attempts = row.resolve_attempts + 1;
  const now = Date.now();
  const days = BACKOFF_DAYS[Math.min(attempts - 1, BACKOFF_DAYS.length - 1)];
  const nowIso = new Date(now).toISOString();
  await supabaseAdmin()
    .from("company_universe")
    .update({
      resolve_status: "unresolved",
      resolve_attempts: attempts,
      resolve_note: note,
      probed_at: row.probed_at ?? nowIso,
      // After the last attempt, park it (null next_resolve_at + attempts cap
      // keeps it out of the queue).
      next_resolve_at: attempts >= MAX_ATTEMPTS ? null : new Date(now + days * 86_400_000).toISOString(),
      updated_at: nowIso,
    })
    .eq("id", row.id);
}

// ── batch ────────────────────────────────────────────────────────────────────

export interface ResolveSummary {
  considered: number;
  resolved: number;
  unresolved: number;
  by_method: Record<string, number>;
  errors: number;
}

// Rows due for a resolution attempt, strongest list signal first (Fortune
// rank, then startup rank, then H-1B rank); staffing firms last.
export async function loadDueRows(limit: number): Promise<UniverseRow[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("company_universe")
    .select("id, name, org_type, sectors, size_bucket, resolve_attempts, probed_at, fortune_rank, startup_rank, h1b_rank")
    .neq("resolve_status", "resolved")
    .lt("resolve_attempts", MAX_ATTEMPTS)
    .or(`next_resolve_at.is.null,next_resolve_at.lte.${new Date().toISOString()}`)
    .order("resolve_attempts", { ascending: true })
    .limit(Math.max(limit * 4, 200));
  if (error) throw new Error(`load universe rows failed: ${error.message}`);
  const rank = (r: Record<string, unknown>) =>
    (r.org_type === "staffing" ? 10_000 : 0) +
    Math.min(
      (r.fortune_rank as number | null) ?? 9_999,
      (r.startup_rank as number | null) ?? 9_999,
      (r.h1b_rank as number | null) ?? 9_999,
    );
  return ((data ?? []) as Array<Record<string, unknown>>)
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, limit)
    .map((r) => ({
      id: r.id as string,
      name: r.name as string,
      org_type: r.org_type as string,
      sectors: (r.sectors as string[]) ?? [],
      size_bucket: (r.size_bucket as string | null) ?? null,
      resolve_attempts: (r.resolve_attempts as number) ?? 0,
      probed_at: (r.probed_at as string | null) ?? null,
    }));
}

export async function resolveUniverseBatch(opts?: {
  limit?: number;
  deadline?: number; // epoch ms; stop starting new work past this
  useLlm?: boolean;
}): Promise<ResolveSummary> {
  const limit = opts?.limit ?? DEFAULT_LIMIT;
  const deadline = opts?.deadline ?? Date.now() + 200_000;
  const useLlm = opts?.useLlm ?? true;
  const summary: ResolveSummary = { considered: 0, resolved: 0, unresolved: 0, by_method: {}, errors: 0 };
  const rows = await loadDueRows(limit);
  summary.considered = rows.length;
  if (!rows.length) return summary;

  // Link the verified board; a link failure (board owned by another
  // employer, insert error) is recorded as a miss so the row backs off
  // instead of retrying every tick.
  const hit = async (row: UniverseRow, board: VerifiedBoard, method: string) => {
    try {
      await upsertUniverseCompany(row, board);
    } catch (e) {
      await markMiss(row, `verified ${board.ats}:${board.slug} but could not link: ${e instanceof Error ? e.message : String(e)}`);
      summary.unresolved++;
      return;
    }
    await markResolved(row, board);
    summary.resolved++;
    summary.by_method[method] = (summary.by_method[method] ?? 0) + 1;
  };

  // 1. slug probe (rows not pre-probed).
  const misses: UniverseRow[] = [];
  await mapPool(rows, PROBE_CONCURRENCY, async (row) => {
    if (Date.now() > deadline) return;
    try {
      if (!row.probed_at) {
        const found = await findBoard(row.name, { minJobs: row.size_bucket === "large" ? LARGE_MIN_JOBS : 1 });
        if (found) return hit(row, found, "probe");
      }
      misses.push(row);
    } catch {
      summary.errors++;
    }
  });

  // 2 + 3. LLM guesses, then careers-page discovery, for the misses.
  for (let i = 0; i < misses.length; i += LLM_BATCH) {
    if (Date.now() > deadline) break;
    const batch = misses.slice(i, i + LLM_BATCH);
    const llm = useLlm ? await guessBoards(batch.map((r) => r.name)) : { ok: true, guesses: new Map<number, Guess>() };
    if (!llm.ok) {
      // Model unavailable: leave these rows untouched for the next tick.
      summary.errors += batch.length;
      continue;
    }
    const guesses = llm.guesses;
    await mapPool(batch, PROBE_CONCURRENCY, async (row) => {
      const b = batch.indexOf(row);
      try {
        const g = guesses.get(b);
        for (const attempt of g?.boards ?? []) {
          const n = await verifyAttempt(attempt, row);
          if (n) return hit(row, { ...attempt, jobs: n }, `llm_${attempt.ats}`);
        }
        for (const attempt of await discoverFromCareersPage(g?.careersUrl ?? null)) {
          const n = await verifyAttempt(attempt, row);
          if (n) return hit(row, { ...attempt, jobs: n }, `careers_${attempt.ats}`);
        }
        const tried = (g?.boards ?? []).map((a) => `${a.ats}:${a.slug}`).join(", ");
        await markMiss(row, tried ? `no verified board (tried ${tried})` : "no verified board");
        summary.unresolved++;
      } catch {
        summary.errors++;
      }
    });
  }
  return summary;
}

// Operator status for /api/admin/universe.
export async function universeStatus() {
  const sb = supabaseAdmin();
  const rows = await selectAll<{ resolve_status: string; org_type: string }>((from, to) =>
    sb.from("company_universe").select("resolve_status, org_type").order("id").range(from, to),
  );
  const status: Record<string, number> = {};
  for (const r of rows) {
    const k = `${r.resolve_status}:${r.org_type}`;
    status[k] = (status[k] ?? 0) + 1;
  }
  const comps = await selectAll<{ ats: string }>((from, to) =>
    sb.from("companies").select("ats").not("universe_id", "is", null).order("id").range(from, to),
  );
  const boards: Record<string, number> = {};
  for (const c of comps) boards[c.ats] = (boards[c.ats] ?? 0) + 1;
  return { universe: rows.length, status, boards };
}
