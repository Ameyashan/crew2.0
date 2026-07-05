import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "@/lib/claude";
import { logAgentRun } from "@/lib/agent-runs";
import type { NewStoryEntry } from "@/lib/story";

// Story seed agent (Phase E). Reads a user's uploaded resume text and extracts
// the discrete accomplishments into Story entries — the "12 entries extracted
// into your Story" the prototype's onboarding promises. Entries come from an
// already-polished resume, so each lands as `polished`: `raw` = the resume line,
// `bullet` = a tightened version, plus theme tags.

const MODEL = "claude-sonnet-4-6";

let _client: Anthropic | null = null;
function client() {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  _client = new Anthropic({ apiKey: key });
  return _client;
}

const SYSTEM = `You extract a person's discrete accomplishments from their resume text into "Story entries".

Each entry is ONE thing they did — a shipped project, a result, a role responsibility with impact. Pull the real bullets and role lines; do NOT invent anything not in the text. Aim for 6–15 entries covering the resume's substance (skip contact info, headers, pure section titles).

For each entry emit:
- "raw": the accomplishment in the person's own resume phrasing (lightly cleaned)
- "bullet": a tight resume-ready one-liner (past-tense action verb, keep real facts/numbers)
- "tags": 1–3 short lowercase theme tags (e.g. "leadership", "growth", "infra", "design")

Output strict JSON only, no prose:
{ "entries": [ { "raw": string, "bullet": string, "tags": string[] } ] }`;

// Returns entries ready for createStoryEntries(); [] on any failure (best-effort
// so a seed miss never blocks a resume upload).
export async function extractStoryFromResume(resumeText: string): Promise<NewStoryEntry[]> {
  const trimmed = resumeText.trim();
  if (!trimmed) return [];

  const started = Date.now();
  let inTokens = 0;
  let outTokens = 0;
  let outcome: "ok" | "error" = "ok";
  let err: string | null = null;
  let text = "";

  try {
    const resp = await client().messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: "user", content: trimmed.slice(0, 16000) }],
    });
    inTokens = resp.usage.input_tokens;
    outTokens = resp.usage.output_tokens;
    for (const block of resp.content) {
      if (block.type === "text") text += block.text;
    }
  } catch (e) {
    outcome = "error";
    err = String(e);
    // Best-effort seed: swallow so the caller (resume upload) still succeeds.
    return [];
  } finally {
    await logAgentRun({
      agent_type: "story:extract_from_resume",
      model: MODEL,
      input_tokens: inTokens,
      output_tokens: outTokens,
      latency_ms: Date.now() - started,
      outcome,
      error: err,
    });
  }

  try {
    const parsed = JSON.parse(extractJson(text)) as { entries?: unknown };
    if (!Array.isArray(parsed.entries)) return [];
    const out: NewStoryEntry[] = [];
    for (const e of parsed.entries) {
      if (!e || typeof e !== "object") continue;
      const rec = e as { raw?: unknown; bullet?: unknown; tags?: unknown };
      const raw = typeof rec.raw === "string" ? rec.raw.trim() : "";
      if (!raw) continue;
      const bullet = typeof rec.bullet === "string" && rec.bullet.trim() ? rec.bullet.trim() : null;
      const tags = Array.isArray(rec.tags)
        ? rec.tags
            .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
            .map((t) => t.trim().toLowerCase())
            .slice(0, 3)
        : [];
      out.push({ raw, bullet, status: bullet ? "polished" : "raw", tags });
    }
    return out.slice(0, 20);
  } catch {
    return [];
  }
}
