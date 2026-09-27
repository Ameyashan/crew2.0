import { test } from "node:test";
import assert from "node:assert/strict";
import { specToForm, formToSpecInput, parseSseChunk, goalChips, toggleIn } from "./goal-view-logic.ts";
import { validateGoalSpec } from "../../lib/goal/goal-logic.ts";

const v = validateGoalSpec({
  summary: "Senior PM at a hedge fund, $200k+ base, NYC.",
  short_label: "Senior PM · hedge funds · $200k+",
  target_roles: ["Product Manager", "Senior Product Manager"],
  seniority: ["senior"],
  comp_floor_usd: 200000,
  comp_basis: "base",
  industries: ["hedge funds", "fintech"],
  company_sizes: [],
  locations: ["New York"],
  remote: "remote_ok",
  visa_required: null,
  target_companies: ["Citadel"],
  must_haves: ["data-heavy product", "small team"],
  dealbreakers: [],
  timeline: null,
});
assert.ok(v.ok);
const GOAL = v.goal;

test("form round-trips back to the same goal", () => {
  const out = validateGoalSpec(formToSpecInput(specToForm(GOAL), GOAL));
  assert.ok(out.ok);
  assert.deepEqual(out.goal, GOAL);
});

test("editing the floor clears a stale short_label so it's re-derived", () => {
  const f = { ...specToForm(GOAL), comp_floor: "250k" };
  const out = validateGoalSpec(formToSpecInput(f, GOAL));
  assert.ok(out.ok);
  assert.equal(out.goal.comp_floor_usd, 250000);
  assert.match(out.goal.short_label, /\$250k\+/);
});

test("a hand-edited label is kept even when other fields change", () => {
  const f = { ...specToForm(GOAL), comp_floor: "250k", short_label: "My PM hunt" };
  const out = validateGoalSpec(formToSpecInput(f, GOAL));
  assert.ok(out.ok);
  assert.equal(out.goal.short_label, "My PM hunt");
});

test("visa tri-state and blank floor map to nulls", () => {
  const f = { ...specToForm(GOAL), visa: "" as const, comp_floor: " " };
  const input = formToSpecInput(f);
  assert.equal(input.visa_required, null);
  assert.equal(input.comp_floor_usd, null);
  assert.equal(formToSpecInput({ ...f, visa: "yes" }).visa_required, true);
});

test("parseSseChunk handles split frames and bad JSON", () => {
  const a = parseSseChunk('data: {"type":"delta","text":"Hi"}\n\ndata: {"type":"de');
  assert.deepEqual(a.events, [{ type: "delta", text: "Hi" }]);
  const b = parseSseChunk(a.rest + 'lta","text":" there"}\n\ndata: nope\n\n');
  assert.deepEqual(b.events, [{ type: "delta", text: " there" }]);
  assert.equal(b.rest, "");
});

test("goalChips lists comp, industries, places and remote", () => {
  assert.deepEqual(goalChips(GOAL), ["$200k+ base", "hedge funds", "fintech", "New York", "Remote OK"]);
});

test("toggleIn adds and removes", () => {
  assert.deepEqual(toggleIn(["a"], "b"), ["a", "b"]);
  assert.deepEqual(toggleIn(["a", "b"], "a"), ["b"]);
});
