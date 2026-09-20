// Visa-sponsorship inference (Module 3). A lightweight LLM pass over a job's
// description. Two signals, both from EXPLICIT text only:
//   'likely_sponsors' — the JD offers sponsorship.
//   'no_sponsorship'  — the JD explicitly rules it out. This one is a hard,
//                       job-level fact: enrich.ts lets it override even a
//                       USCIS-verified company track record (a verified company
//                       can still post individual reqs it won't sponsor), and
//                       the feed hides such jobs from visa_required users.
// Everything else is 'unclear' (incl. no JD text). The mentionsVisa() keyword
// screen skips the LLM entirely for the majority of JDs that never touch the
// topic — an explicit statement necessarily contains one of those keywords.

import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "@/lib/claude";
import { logAgentRun } from "@/lib/agent-runs";
import { mentionsVisa } from "@/lib/jobs/util";
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

const SYSTEM = `You read a job description and judge what it says about VISA SPONSORSHIP.

Return:
- "likely_sponsors" ONLY when the text explicitly offers visa sponsorship, work authorization support, or relocation+visa assistance (e.g. "we sponsor visas", "visa sponsorship available", "we support H-1B").
- "no_sponsorship" ONLY when the text explicitly rules sponsorship out (e.g. "we are unable to sponsor", "will not sponsor visas now or in the future", "must be authorized to work in the US without sponsorship", "OPT/CPT candidates are not eligible"). A requirement to merely BE authorized to work, without ruling out sponsorship, is NOT enough.
- "unclear" in every other case — the posting says nothing definitive either way.

Do not guess from company size or prestige; judge only from the text. When in doubt between "no_sponsorship" and "unclear", choose "unclear" — a wrong "no" hides a job from someone who needs it. Output strict JSON only, no prose:
{ "confidence": "likely_sponsors" | "no_sponsorship" | "unclear" }`;

// Returns 'unclear' without an LLM call when there's no JD text or the JD never
// mentions visas/sponsorship at all (saves the large majority of calls).
export async function inferVisa(jdText: string): Promise<VisaConfidence> {
  const text = (jdText || "").trim();
  if (!text || !mentionsVisa(text)) return "unclear";

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
    if (parsed.confidence === "likely_sponsors" || parsed.confidence === "no_sponsorship") {
      return parsed.confidence;
    }
    return "unclear";
  } catch {
    return "unclear";
  }
}
