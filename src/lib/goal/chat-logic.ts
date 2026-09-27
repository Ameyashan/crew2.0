// Pure helpers over the goal chat transcript. The transcript is stored as the
// exact Anthropic content blocks (goal_chat_messages.content) and is strictly
// append-only: we never rewrite an earlier turn, so thinking-block signatures
// and tool_use/tool_result pairing stay valid across requests. These helpers
// derive what the next user turn must carry and what the UI should show.
//
// Only type-only imports here (erased at runtime) so `node --test` can load it.

import type Anthropic from "@anthropic-ai/sdk";
import { validateGoalSpec, type GoalSpec } from "./goal-logic.ts";

export const PROPOSE_GOAL_TOOL = "propose_goal";
export const LOCKED_PREFIX = "LOCKED:";
export const NOT_LOCKED_NOTE = "Not locked yet — the user replied instead (see their message).";

export interface StoredMessage {
  seq: number;
  role: "user" | "assistant";
  content: Anthropic.ContentBlockParam[];
}

type Block = Anthropic.ContentBlockParam | { type: string; [k: string]: unknown };

function blocks(m: StoredMessage): Block[] {
  return Array.isArray(m.content) ? (m.content as Block[]) : [];
}

function isProposal(b: Block): b is Anthropic.ToolUseBlockParam {
  return b.type === "tool_use" && (b as Anthropic.ToolUseBlockParam).name === PROPOSE_GOAL_TOOL;
}

// The most recent propose_goal call that has no tool_result yet. Only the LAST
// assistant message can hold one: every later user turn answers it.
export function unansweredProposal(
  history: StoredMessage[],
): { tool_use_id: string; input: unknown } | null {
  const last = history[history.length - 1];
  if (!last || last.role !== "assistant") return null;
  const tu = blocks(last).filter(isProposal).pop();
  return tu ? { tool_use_id: tu.id, input: tu.input } : null;
}

// The proposal the UI should show as an open card (validated), if any.
export function pendingProposal(history: StoredMessage[]): { tool_use_id: string; goal: GoalSpec } | null {
  const p = unansweredProposal(history);
  if (!p) return null;
  const v = validateGoalSpec(p.input);
  return v.ok ? { tool_use_id: p.tool_use_id, goal: v.goal } : null;
}

// Content for the next user message. If the assistant's last turn proposed a
// goal the user didn't lock, its tool_use still needs a tool_result — and
// tool_result blocks must come first in the user turn.
export function buildUserTurn(history: StoredMessage[], text: string): Anthropic.ContentBlockParam[] {
  const p = unansweredProposal(history);
  const textBlock: Anthropic.TextBlockParam = { type: "text", text };
  if (!p) return [textBlock];
  return [{ type: "tool_result", tool_use_id: p.tool_use_id, content: NOT_LOCKED_NOTE }, textBlock];
}

// The user message appended when the goal is locked from a proposal card.
export function lockedTurn(toolUseId: string, goal: GoalSpec): Anthropic.ContentBlockParam[] {
  return [{ type: "tool_result", tool_use_id: toolUseId, content: `${LOCKED_PREFIX} ${JSON.stringify(goal)}` }];
}

// The user message appended when a proposal failed validation, so the model can
// retry within the same turn.
export function invalidProposalTurn(toolUseId: string, errors: string[]): Anthropic.ContentBlockParam[] {
  return [
    {
      type: "tool_result",
      tool_use_id: toolUseId,
      is_error: true,
      content: `INVALID: ${errors.join("; ")}. Fix these and call ${PROPOSE_GOAL_TOOL} again.`,
    },
  ];
}

// Server-side fallback hygiene: after a mid-output fallback, blocks the
// declined model produced before the final `fallback` marker (thinking,
// tool_use, unpaired server tool calls, unknown internal types) must not be
// echoed back. Text survives. The marker itself is an audit block — dropped.
// Without a fallback marker the content is returned untouched.
export function sanitizeAssistantContent(content: Block[]): Block[] {
  let boundary = -1;
  content.forEach((b, i) => {
    if (b.type === "fallback") boundary = i;
  });
  if (boundary < 0) return content;
  const before = content.slice(0, boundary).filter((b) => b.type === "text");
  const after = content.slice(boundary + 1).filter((b) => b.type !== "fallback");
  return [...before, ...after];
}

export type DisplayMessage =
  | { kind: "text"; role: "user" | "assistant"; text: string; seq: number }
  | { kind: "proposal"; goal: GoalSpec; tool_use_id: string; seq: number }
  | { kind: "locked"; seq: number };

// What the chat UI renders: user/assistant text, proposal cards, and a "goal
// locked" marker. Thinking, error retries and the NOT_LOCKED bookkeeping are
// hidden. Past (answered) proposals still render, as history.
export function toDisplayMessages(history: StoredMessage[]): DisplayMessage[] {
  const out: DisplayMessage[] = [];
  for (const m of history) {
    for (const b of blocks(m)) {
      if (b.type === "text") {
        const text = String((b as Anthropic.TextBlockParam).text ?? "").trim();
        if (text) out.push({ kind: "text", role: m.role, text, seq: m.seq });
      } else if (m.role === "assistant" && isProposal(b)) {
        const v = validateGoalSpec(b.input);
        if (v.ok) out.push({ kind: "proposal", goal: v.goal, tool_use_id: b.id, seq: m.seq });
      } else if (m.role === "user" && b.type === "tool_result") {
        const c = (b as Anthropic.ToolResultBlockParam).content;
        if (typeof c === "string" && c.startsWith(LOCKED_PREFIX)) out.push({ kind: "locked", seq: m.seq });
      }
    }
  }
  return out;
}

// Count of real user messages (typed text), for per-chat caps.
export function userTextTurns(history: StoredMessage[]): number {
  return history.filter((m) => m.role === "user" && blocks(m).some((b) => b.type === "text")).length;
}
