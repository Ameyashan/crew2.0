import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "@/lib/claude";
import { logAgentRun } from "@/lib/agent-runs";

const MODEL = "claude-sonnet-4-6";

let _client: Anthropic | null = null;
function client() {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  _client = new Anthropic({ apiKey: key });
  return _client;
}

export interface UserContext {
  current_role: string | null;
  background_summary: string | null;
  looking_for: string[];
  motivations: string[];
  target_companies: string[];
  target_roles: string[];
  voice: {
    tone: string | null;
    formality: "casual" | "neutral" | "formal" | null;
    avoid: string[];
  };
  notable_projects: string[];
  other: string[];
}

const SYSTEM = `You extract structured context from a user's self-summary. The summary was written by them (often with help from another LLM) to give an outreach-drafting tool a richer picture of who they are.

Extract only what is explicitly stated or strongly implied. Do NOT invent or pad. Empty arrays and null fields are fine — they're better than hallucinations.

Output strict JSON only, no prose, matching this shape:
{
  "current_role": string | null,
  "background_summary": string | null,         // 1–2 sentence neutral summary
  "looking_for": string[],                      // what they want next (roles, intros, learnings)
  "motivations": string[],                      // what excites them professionally
  "target_companies": string[],
  "target_roles": string[],
  "voice": {
    "tone": string | null,                      // e.g. "warm but direct", "dry, technical"
    "formality": "casual" | "neutral" | "formal" | null,
    "avoid": string[]                           // phrases/styles they reject
  },
  "notable_projects": string[],
  "other": string[]                             // anything else relevant for outreach
}`;

export async function extractUserContext(rawText: string): Promise<UserContext | null> {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  const started = Date.now();
  let inTokens = 0;
  let outTokens = 0;
  let outcome: "ok" | "error" = "ok";
  let err: string | null = null;
  let text = "";

  try {
    const resp = await client().messages.create({
      model: MODEL,
      max_tokens: 1200,
      system: SYSTEM,
      messages: [{ role: "user", content: trimmed.slice(0, 12000) }],
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
      agent_type: "profile:extract_context",
      model: MODEL,
      input_tokens: inTokens,
      output_tokens: outTokens,
      latency_ms: Date.now() - started,
      outcome,
      error: err,
    });
  }

  try {
    return JSON.parse(extractJson(text)) as UserContext;
  } catch {
    return null;
  }
}
