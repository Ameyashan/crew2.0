// Match scoring (Module 4). Scores how well each candidate job fits the current
// user, using the SAME profile context the draft pipeline uses, so rankings
// align with house style. Batched (one LLM call per ~15 jobs) for cost; only the
// not-yet-scored subset is touched, so cost scales with deltas, not the corpus.
//
// MUST run inside runWithUser() — currentUserId() and logAgentRun() require it.

import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "@/lib/claude";
import { logAgentRun } from "@/lib/agent-runs";
import { supabaseAdmin } from "@/lib/supabase";
import { currentUserId } from "@/lib/user-context";
import { getProfile, senderContextFromProfile } from "@/lib/profile";
import { jdText } from "@/lib/jobs/util";
import type { Job } from "@/lib/db/schema";
import type { ScoreResult } from "@/lib/jobs/types";

const MODEL = "claude-sonnet-4-6";
const BATCH = 15;
const SNIPPET_CHARS = 500;

let _client: Anthropic | null = null;
function client() {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  _client = new Anthropic({ apiKey: key });
  return _client;
}

const SYSTEM = `You are a job-matching assistant. Given a candidate's background/goals and a list of jobs, score how well EACH job fits the candidate.

Scoring (0–100):
- 80–100: strong fit — role, level, and domain align with their background and what they want.
- 50–79: plausible fit with gaps.
- 0–49: weak fit.

For each job give ONE short, concrete reason (max ~15 words) citing the actual match or gap ("Backend role matches their Go/infra background"). No flattery, no filler.

If the candidate info is sparse, score by general role desirability/seniority and say so briefly. Score every job; never skip one.

Output strict JSON only, no prose:
{ "scores": [ { "i": number, "score": number, "reasons": string } ] }`;

function buildJobsBlock(batch: Job[]): string {
  return batch
    .map((j, idx) => {
      const loc = j.location_raw || [j.city, j.region, j.country].filter(Boolean).join(", ") || "—";
      const snippet = jdText(j.ats, j.raw_json, SNIPPET_CHARS).replace(/\s+/g, " ").trim();
      return `[${idx + 1}] ${j.title} — ${j.company} — ${loc}${snippet ? `\n${snippet}` : ""}`;
    })
    .join("\n\n");
}

async function scoreBatch(senderContext: string, batch: Job[]): Promise<ScoreResult[]> {
  const userPrompt = [
    `# Candidate`,
    senderContext || "(limited profile information available)",
    `# Jobs (score each by its number)`,
    buildJobsBlock(batch),
  ].join("\n\n");

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
      agent_type: "jobs:match_score",
      model: MODEL,
      input_tokens: inTokens,
      output_tokens: outTokens,
      latency_ms: Date.now() - started,
      outcome,
      error: err,
      meta: { batch: batch.length },
    });
  }

  if (outcome === "error") return [];

  let parsed: { scores?: Array<{ i?: unknown; score?: unknown; reasons?: unknown }> } = {};
  try {
    parsed = JSON.parse(extractJson(text));
  } catch {
    return [];
  }
  const rows = Array.isArray(parsed.scores) ? parsed.scores : [];
  const out: ScoreResult[] = [];
  for (const r of rows) {
    const idx = typeof r.i === "number" ? r.i - 1 : NaN;
    const job = batch[idx];
    if (!job) continue;
    const rawScore = typeof r.score === "number" ? r.score : Number(r.score);
    const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, Math.round(rawScore))) : 0;
    const reasons = typeof r.reasons === "string" ? r.reasons.trim().slice(0, 300) : "";
    out.push({ job_id: job.id, score, reasons });
  }
  return out;
}

export interface ScoreSummary {
  scored: number;
  skipped: number; // already-scored jobs left untouched
}

export async function scoreJobsForUser({ jobs }: { jobs: Job[] }): Promise<ScoreSummary> {
  const userId = currentUserId();
  if (!jobs.length) return { scored: 0, skipped: 0 };
  const sb = supabaseAdmin();

  // Only score what isn't already scored for this user (preserves any existing
  // status like 'dismissed' / 'outreach_started').
  const ids = jobs.map((j) => j.id);
  const { data: existing } = await sb
    .from("job_matches")
    .select("job_id")
    .eq("user_id", userId)
    .in("job_id", ids);
  const already = new Set((existing ?? []).map((r) => r.job_id as string));
  const todo = jobs.filter((j) => !already.has(j.id));
  if (!todo.length) return { scored: 0, skipped: jobs.length };

  const profile = await getProfile();
  const senderContext = senderContextFromProfile(profile);

  let scored = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const results = await scoreBatch(senderContext, batch);
    if (!results.length) continue;
    const nowIso = new Date().toISOString();
    const rows = results.map((r) => ({
      user_id: userId,
      job_id: r.job_id,
      score: r.score,
      reasons: r.reasons || null,
      status: "new",
      scored_at: nowIso,
    }));
    const { error } = await sb
      .from("job_matches")
      .upsert(rows, { onConflict: "user_id,job_id", ignoreDuplicates: true });
    if (!error) scored += rows.length;
  }

  return { scored, skipped: jobs.length - todo.length };
}
