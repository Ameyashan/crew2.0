// The goal coach: a short multi-turn chat that turns "I want a PM job paying
// $200k+" into a confirmed, structured goal. Each turn streams text to the
// user; when the coach has enough, it calls the propose_goal tool and the UI
// renders an editable goal card the user locks (POST /api/goal).
//
// We never "execute" propose_goal — the server validates its input and hands
// the proposal to the UI. The tool_result is written later (lock, the user's
// next message, or an immediate is_error retry), so the transcript stays a
// valid tool_use → tool_result sequence. See chat-logic.ts.

import Anthropic from "@anthropic-ai/sdk";
import { logAgentRun } from "@/lib/agent-runs";
import {
  PROPOSE_GOAL_INPUT_SCHEMA,
  validateGoalSpec,
  type GoalSpec,
  type ValidateResult,
} from "@/lib/goal/goal-logic";
import {
  PROPOSE_GOAL_TOOL,
  sanitizeAssistantContent,
  invalidProposalTurn,
  type StoredMessage,
} from "@/lib/goal/chat-logic";

export const GOAL_MODEL = "claude-opus-5";

let _client: Anthropic | null = null;
function client() {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  _client = new Anthropic({ apiKey: key });
  return _client;
}

// Byte-stable: no dates, no per-user data (that goes in the snapshot block).
const STATIC_SYSTEM = `You are the goal coach inside Jugaadu, a job-search app. Your one job: help the user turn a rough job-search aim into a concrete goal they confirm. Jugaadu then uses that goal to rank jobs, pick companies to watch, and plan their week. Stay on the goal — no general career advice unless they ask.

Work out these, most important first:
1. Target role family (e.g. Product Manager, Backend Engineer, Investment Analyst).
2. Level / seniority.
3. Pay floor — a number, and whether it's base or total comp. If they say "good pay", ask for a number. Never invent one.
4. Industries or company types. Offer 3–5 concrete options that fit their role, e.g. for a PM who mentions finance: "hedge funds, investment banks, fintech startups, big tech payments teams?"
5. Company stage or size (startup / mid-size / large), if it matters to them.
6. Locations and remote preference.
7. Visa sponsorship, if relevant.
8. Must-haves and dealbreakers.
9. 3–6 example companies to prioritize. Suggest well-known names that fit their industries and let them pick or edit.
Timeline is optional — note it if they mention it.

The "About the user" block is what Jugaadu already knows (resume, settings, maybe a current goal). Don't ask for what it already answers. Confirm it in passing instead ("Your resume says you're a senior analyst — so PM would be a switch?").

How to talk:
- Ask at most 2 questions per turn, each with short suggested options so they can answer in a few words.
- Keep each turn under ~80 words. Plain text, no headings, no bullet walls.
- Warm and direct. No flattery, no filler.
- If the goal looks unrealistic (e.g. pay far above what their level usually gets), say so once, briefly and kindly, then go with what they decide.

When to propose: once the target role is known and at least three other points above are settled — or as soon as the user says something like "that's it" / "good enough" — call ${PROPOSE_GOAL_TOOL}. Put pay only in the pay fields. Write summary as one sentence in their own framing. Use empty lists / null for anything not discussed. After calling the tool, don't restate the goal in text — the user sees it as a card; at most add one short line like "Here's your goal — edit anything, then lock it in."

If a tool result says "Not locked yet", the user wants changes: fold in what they said and, once settled, call ${PROPOSE_GOAL_TOOL} again with the full updated goal. If a tool result starts with "LOCKED:", the goal is saved: acknowledge in one line, and only continue if they ask for more changes. If a tool result says "INVALID:", fix the listed problems and call the tool again.`;

const PROPOSE_GOAL_TOOL_DEF = {
  name: PROPOSE_GOAL_TOOL,
  description:
    "Propose the user's job-search goal as a structured card they can edit and lock. Call it once the target role and at least three other goal dimensions are settled, or when the user says they're done. Always send the COMPLETE goal, not a diff.",
  input_schema: PROPOSE_GOAL_INPUT_SCHEMA,
  // Stream the tool input as it's generated; we validate it ourselves below.
  eager_input_streaming: true,
};

// "reset": the request is being re-sent from scratch — drop any partial text
// shown for this attempt. "retry": a proposal was invalid and the model is
// fixing it; text already shown stays (it's persisted).
export type CoachEvent =
  | { type: "delta"; text: string }
  | { type: "proposal_start" }
  | { type: "reset" }
  | { type: "retry" };

export interface CoachTurnResult {
  // Messages to persist after the user's turn, in order (assistant turns, plus
  // an is_error tool_result when a proposal had to be retried).
  appended: Array<Pick<StoredMessage, "role" | "content"> & { meta: Record<string, unknown> }>;
  proposal: { tool_use_id: string; goal: GoalSpec } | null;
  refused: boolean;
}

const MAX_ATTEMPTS = 2;

function isToolJsonError(e: unknown): boolean {
  return (
    e instanceof Anthropic.AnthropicError &&
    !(e instanceof Anthropic.APIError) &&
    /Unable to parse tool parameter JSON/.test(e.message)
  );
}

async function streamOnce(
  snapshot: string,
  messages: Anthropic.MessageParam[],
  onEvent: (e: CoachEvent) => void,
): Promise<Anthropic.Beta.BetaMessage> {
  const params = {
    model: GOAL_MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
    // Auto-cache the growing conversation; the system blocks are stable per chat.
    cache_control: { type: "ephemeral" },
    system: [
      { type: "text", text: STATIC_SYSTEM },
      { type: "text", text: `# About the user\n${snapshot}` },
    ],
    tools: [PROPOSE_GOAL_TOOL_DEF],
    tool_choice: { type: "auto", disable_parallel_tool_use: true },
    messages,
    // Server-side refusal fallback. `fallbacks` and `eager_input_streaming`
    // postdate the pinned SDK's types, hence the cast below; the SDK forwards
    // unknown body fields as-is.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  } as unknown as Anthropic.Beta.MessageCreateParamsStreaming;

  const stream = client().beta.messages.stream(params);
  stream.on("text", (text) => onEvent({ type: "delta", text }));
  stream.on("streamEvent", (event) => {
    if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
      onEvent({ type: "proposal_start" });
    }
  });
  return stream.finalMessage();
}

// Run one coach turn against the full history (which already ends with the
// user's new message). Persisting is the caller's job.
export async function runCoachTurn({
  snapshot,
  history,
  onEvent,
}: {
  snapshot: string;
  history: StoredMessage[];
  onEvent: (e: CoachEvent) => void;
}): Promise<CoachTurnResult> {
  const messages: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
  const appended: CoachTurnResult["appended"] = [];
  const started = Date.now();
  let inTokens = 0;
  let outTokens = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let outcome: "ok" | "error" = "ok";
  let err: string | null = null;
  let jsonRetried = false;

  try {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      let msg: Anthropic.Beta.BetaMessage;
      try {
        msg = await streamOnce(snapshot, messages, onEvent);
      } catch (e) {
        // A malformed streamed tool input: re-send the same request once.
        // Typed API errors (rate limit, overload, 4xx) propagate.
        if (isToolJsonError(e) && !jsonRetried) {
          jsonRetried = true;
          onEvent({ type: "reset" });
          attempt--;
          continue;
        }
        throw e;
      }
      inTokens += msg.usage.input_tokens;
      cacheRead += msg.usage.cache_read_input_tokens ?? 0;
      cacheWrite += msg.usage.cache_creation_input_tokens ?? 0;
      outTokens += msg.usage.output_tokens;
      const meta = { model: msg.model, stop_reason: msg.stop_reason };

      // The whole fallback chain declined: discard the partial, save nothing.
      if (msg.stop_reason === "refusal") {
        return { appended: [], proposal: null, refused: true };
      }

      const content = sanitizeAssistantContent(
        msg.content as unknown as Array<{ type: string }>,
      ) as unknown as Anthropic.ContentBlockParam[];
      appended.push({ role: "assistant", content, meta });
      messages.push({ role: "assistant", content });

      const toolUse = content.find(
        (b): b is Anthropic.ToolUseBlockParam => b.type === "tool_use" && b.name === PROPOSE_GOAL_TOOL,
      );
      if (!toolUse) return { appended, proposal: null, refused: false };

      const v: ValidateResult =
        msg.stop_reason === "max_tokens"
          ? { ok: false, errors: ["the proposal was cut off"] }
          : validateGoalSpec(toolUse.input);
      if (v.ok) return { appended, proposal: { tool_use_id: toolUse.id, goal: v.goal }, refused: false };

      // Invalid proposal: answer it with an is_error result and let the model
      // fix it (once). The result is persisted either way so history stays valid.
      const errTurn = invalidProposalTurn(toolUse.id, v.errors);
      appended.push({ role: "user", content: errTurn, meta: { invalid_proposal: true } });
      messages.push({ role: "user", content: errTurn });
      onEvent({ type: "retry" });
    }
    return { appended, proposal: null, refused: false };
  } catch (e) {
    outcome = "error";
    err = String(e);
    throw e;
  } finally {
    await logAgentRun({
      agent_type: "goal:chat",
      model: GOAL_MODEL,
      input_tokens: inTokens,
      output_tokens: outTokens,
      latency_ms: Date.now() - started,
      outcome,
      error: err,
      meta: { turns: appended.length, cache_read: cacheRead, cache_write: cacheWrite },
    });
  }
}
