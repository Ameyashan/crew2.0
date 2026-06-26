// Visa-sponsorship inference (Module 3). A lightweight LLM pass over a job's
// description that returns a confidence signal only — never a hard yes/no, never
// a reason to drop a job. v1 is JD text-parse; a DOL/LCA disclosure join can
// backfill later. Defaults to "unclear" (incl. when there's no JD text), so the
// feed always renders a badge.

import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "@/lib/claude";
import { logAgentRun } from "@/lib/agent-runs";
import type { VisaConfidence } from "@/lib/jobs/types";

const MODEL = "claude-sonnet-4-6";

let _client: Anthropic | null = null;
function client() {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  _client = new Anthropic({ apiKey: key });
  return _client;
}

const SYSTEM = `You read a job description and judge whether it indicates the employer offers VISA SPONSORSHIP.

Return:
- "likely_sponsors" ONLY when the text explicitly offers visa sponsorship, work authorization support, or relocation+visa assistance (e.g. "we sponsor visas", "visa sponsorship available", "we support H-1B").
- "unclear" in every other case — including when the posting says nothing about it, or when it says they do NOT sponsor (v1 has no negative bucket; treat as unclear).

Do not guess from company size or prestige; judge only from the text. Output strict JSON only, no prose:
{ "confidence": "likely_sponsors" | "unclear" }`;

// Returns 'unclear' without an LLM call when there's no JD text (saves cost).
export async function inferVisa(jdText: string): Promise<VisaConfidence> {
  const text = (jdText || "").trim();
  if (!text) return "unclear";

  const started = Date.now();
  let out = "";
  let inTokens = 0;
  let outTokens = 0;
  let outcome: "ok" | "error" = "ok";
  let err: string | null = null;

  try {
    const resp = await client().messages.create({
      model: MODEL,
      max_tokens: 30,
      system: SYSTEM,
      messages: [{ role: "user", content: text.slice(0, 6000) }],
    });
    inTokens = resp.usage.input_tokens;
    outTokens = resp.usage.output_tokens;
    for (const block of resp.content) {
      if (block.type === "text") out += block.text;
    }
  } catch (e) {
    // Never throw: visa is a soft signal. A failure just means "unclear".
    outcome = "error";
    err = String(e);
  } finally {
    await logAgentRun({
      agent_type: "jobs:visa_infer",
      model: MODEL,
      input_tokens: inTokens,
      output_tokens: outTokens,
      latency_ms: Date.now() - started,
      outcome,
      error: err,
    });
  }

  if (outcome === "error") return "unclear";
  try {
    const parsed = JSON.parse(extractJson(out)) as { confidence?: unknown };
    return parsed.confidence === "likely_sponsors" ? "likely_sponsors" : "unclear";
  } catch {
    return "unclear";
  }
}
