import { test } from "node:test";
import assert from "node:assert/strict";
import {
  unansweredProposal,
  pendingProposal,
  buildUserTurn,
  lockedTurn,
  sanitizeAssistantContent,
  toDisplayMessages,
  userTextTurns,
  NOT_LOCKED_NOTE,
  type StoredMessage,
} from "./chat-logic.ts";
import { validateGoalSpec } from "./goal-logic.ts";

const GOAL_INPUT = {
  summary: "PM at a hedge fund, $200k+ base.",
  short_label: "PM · hedge funds · $200k+",
  target_roles: ["Product Manager"],
  seniority: [],
  comp_floor_usd: 200000,
  comp_basis: "base",
  industries: ["hedge funds"],
  company_sizes: [],
  locations: [],
  remote: null,
  visa_required: null,
  target_companies: [],
  must_haves: [],
  dealbreakers: [],
  timeline: null,
};

const u = (seq: number, text: string): StoredMessage => ({ seq, role: "user", content: [{ type: "text", text }] });
const a = (seq: number, text: string): StoredMessage => ({ seq, role: "assistant", content: [{ type: "text", text }] });
const proposal = (seq: number, id = "tu_1"): StoredMessage => ({
  seq,
  role: "assistant",
  content: [
    { type: "thinking", thinking: "", signature: "sig" },
    { type: "text", text: "Here's what I heard." },
    { type: "tool_use", id, name: "propose_goal", input: GOAL_INPUT },
  ],
});

test("unansweredProposal finds a propose_goal on the last assistant turn only", () => {
  assert.equal(unansweredProposal([]), null);
  assert.equal(unansweredProposal([u(0, "hi"), a(1, "what role?")]), null);
  assert.deepEqual(unansweredProposal([u(0, "PM"), proposal(1)])?.tool_use_id, "tu_1");
  // Once the user replies, it's answered.
  assert.equal(unansweredProposal([u(0, "PM"), proposal(1), u(2, "add banks")]), null);
});

test("pendingProposal validates the proposed goal", () => {
  const p = pendingProposal([u(0, "PM"), proposal(1)]);
  assert.equal(p?.goal.comp_floor_usd, 200000);
  const bad: StoredMessage = {
    seq: 1,
    role: "assistant",
    content: [{ type: "tool_use", id: "tu_x", name: "propose_goal", input: { summary: "" } }],
  };
  assert.equal(pendingProposal([u(0, "PM"), bad]), null);
});

test("buildUserTurn answers an open proposal with tool_result FIRST", () => {
  assert.deepEqual(buildUserTurn([u(0, "hi"), a(1, "role?")], "PM"), [{ type: "text", text: "PM" }]);
  const turn = buildUserTurn([u(0, "PM"), proposal(1, "tu_9")], "also banks");
  assert.equal(turn.length, 2);
  assert.deepEqual(turn[0], { type: "tool_result", tool_use_id: "tu_9", content: NOT_LOCKED_NOTE });
  assert.deepEqual(turn[1], { type: "text", text: "also banks" });
});

test("sanitizeAssistantContent strips pre-fallback internals, keeps text", () => {
  const plain = [{ type: "text", text: "hi" }];
  assert.equal(sanitizeAssistantContent(plain), plain);
  const out = sanitizeAssistantContent([
    { type: "thinking", thinking: "", signature: "s1" },
    { type: "text", text: "Partial…" },
    { type: "tool_use", id: "t0", name: "propose_goal", input: {} },
    { type: "fallback", from: { model: "a" }, to: { model: "b" } },
    { type: "thinking", thinking: "", signature: "s2" },
    { type: "text", text: "continued" },
  ]);
  assert.deepEqual(
    out.map((b) => b.type),
    ["text", "thinking", "text"],
  );
});

test("toDisplayMessages hides thinking + bookkeeping, shows proposals and locks", () => {
  const goal = validateGoalSpec(GOAL_INPUT);
  assert.ok(goal.ok);
  const history: StoredMessage[] = [
    u(0, "PM job over 200k"),
    proposal(1, "tu_1"),
    { seq: 2, role: "user", content: buildUserTurn([u(0, "x"), proposal(1, "tu_1")], "add banks") },
    proposal(3, "tu_2"),
    { seq: 4, role: "user", content: lockedTurn("tu_2", goal.goal) },
  ];
  const d = toDisplayMessages(history);
  assert.deepEqual(
    d.map((m) => (m.kind === "text" ? `${m.role}:${m.text}` : m.kind)),
    [
      "user:PM job over 200k",
      "assistant:Here's what I heard.",
      "proposal",
      "user:add banks",
      "assistant:Here's what I heard.",
      "proposal",
      "locked",
    ],
  );
  assert.equal(userTextTurns(history), 2);
});
