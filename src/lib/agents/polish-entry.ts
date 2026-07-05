import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "@/lib/claude";
import { logAgentRun } from "@/lib/agent-runs";

// Story "polish" agent (Phase E). Turns one raw Story entry — something the user
// did, written however it came out — into a single resume-ready bullet plus a few
// theme tags. Same shape/telemetry as extract-context.ts; deliberately small.

const MODEL = "claude-sonnet-4-6";

let _client: Anthropic | null = null;
function client() {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  _client = new Anthropic({ apiKey: key });
  return _client;
}

export interface PolishedEntry {
  bullet: string;
  tags: string[];
}

const SYSTEM = `You turn a raw career note into ONE resume-ready bullet.

The note is something the user did, written casually in their own words. Rewrite it into a single strong resume bullet:
- Start with a past-tense action verb (Led, Shipped, Cut, Grew, Built…).
- Keep the user's real facts — never invent numbers, companies, or outcomes not present or clearly implied.
- One sentence, no trailing period needed, tight and concrete. Prefer quantified impact when the note gives it.
- Plain, human phrasing — no buzzword soup ("synergy", "leveraged", "spearheaded").

Also emit 1–3 short lowercase theme tags (e.g. "leadership", "growth", "infra", "design", "sales") that classify the note for a by-theme view.

Output strict JSON only, no prose:
{ "bullet": string, "tags": string[] }`;

export async function polishEntry(raw: string): Promise<PolishedEntry | null> {
  const trimmed = raw.trim();
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
      max_tokens: 400,
      system: SYSTEM,
      messages: [{ role: "user", content: trimmed.slice(0, 4000) }],
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
      agent_type: "story:polish_entry",
      model: MODEL,
      input_tokens: inTokens,
      output_tokens: outTokens,
      latency_ms: Date.now() - started,
      outcome,
      error: err,
    });
  }

  try {
    const parsed = JSON.parse(extractJson(text)) as { bullet?: unknown; tags?: unknown };
    const bullet = typeof parsed.bullet === "string" ? parsed.bullet.trim() : "";
    if (!bullet) return null;
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags
          .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
          .map((t) => t.trim().toLowerCase())
          .slice(0, 3)
      : [];
    return { bullet, tags };
  } catch {
    return null;
  }
}
