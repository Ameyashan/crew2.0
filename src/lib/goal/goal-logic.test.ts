import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateGoalSpec,
  normalizeCompFloor,
  mapGoalLocations,
  goalToPrefsPatch,
  formatGoalBrief,
  formatGoalForScoring,
  deriveShortLabel,
  cleanList,
  formatCompFloor,
  PROPOSE_GOAL_INPUT_SCHEMA,
  type GoalSpec,
} from "./goal-logic.ts";

const RAW = {
  summary: "Senior PM role at a hedge fund or top fintech paying $200k+ base in NYC.",
  short_label: "Senior PM · hedge funds · $200k+",
  target_roles: ["Product Manager", "Senior Product Manager"],
  seniority: ["senior"],
  comp_floor_usd: 200000,
  comp_basis: "base",
  industries: ["hedge funds", "fintech"],
  company_sizes: ["large", "medium"],
  locations: ["New York"],
  remote: "remote_ok",
  visa_required: false,
  target_companies: ["Citadel", "Two Sigma"],
  must_haves: ["data-heavy product"],
  dealbreakers: ["pure sales roles"],
  timeline: "next 3 months",
};

function goal(overrides: Partial<GoalSpec> = {}): GoalSpec {
  const v = validateGoalSpec({ ...RAW, ...overrides });
  assert.ok(v.ok);
  return v.goal;
}

test("validateGoalSpec accepts a full goal and stamps v:1", () => {
  const v = validateGoalSpec(RAW);
  assert.ok(v.ok);
  assert.equal(v.goal.v, 1);
  assert.equal(v.goal.comp_floor_usd, 200000);
  assert.deepEqual(v.goal.target_roles, ["Product Manager", "Senior Product Manager"]);
});

test("validateGoalSpec requires summary and a target role", () => {
  const v = validateGoalSpec({ ...RAW, summary: " ", target_roles: [] });
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.errors.length, 2);
  assert.equal(validateGoalSpec(null).ok, false);
  assert.equal(validateGoalSpec([RAW]).ok, false);
});

test("validateGoalSpec drops unknown keys, bad enums, and dedupes lists", () => {
  const v = validateGoalSpec({
    ...RAW,
    evil: "x",
    seniority: ["senior", "wizard", "senior"],
    company_sizes: ["huge", "startup"],
    remote: "sometimes",
    visa_required: "yes",
    industries: ["Fintech", "fintech", "  ", "Hedge Funds"],
  });
  assert.ok(v.ok);
  assert.equal("evil" in v.goal, false);
  assert.deepEqual(v.goal.seniority, ["senior"]);
  assert.deepEqual(v.goal.company_sizes, ["startup"]);
  assert.equal(v.goal.remote, null);
  assert.equal(v.goal.visa_required, null);
  assert.deepEqual(v.goal.industries, ["Fintech", "Hedge Funds"]);
});

test("validateGoalSpec caps list lengths and accepts comma text", () => {
  const v = validateGoalSpec({ ...RAW, target_roles: "PM, TPM, APM, GPM, PMM, Director of Product, CPO" });
  assert.ok(v.ok);
  assert.equal(v.goal.target_roles.length, 6);
  assert.equal(cleanList(Array.from({ length: 30 }, (_, i) => `Co ${i}`), 15).length, 15);
});

test("validateGoalSpec rejects an out-of-range comp floor", () => {
  assert.equal(validateGoalSpec({ ...RAW, comp_floor_usd: 5 }).ok, false);
  assert.equal(validateGoalSpec({ ...RAW, comp_floor_usd: "lots" }).ok, false);
});

test("validateGoalSpec derives a short label when missing or blank", () => {
  const v = validateGoalSpec({ ...RAW, short_label: "" });
  assert.ok(v.ok);
  assert.equal(v.goal.short_label, "Senior Product Manager · hedge funds · $200k+");
  assert.ok(v.goal.short_label.length <= 48);
});

test("normalizeCompFloor reads thousands, k/m suffixes and $ text", () => {
  assert.equal(normalizeCompFloor(200), 200000);
  assert.equal(normalizeCompFloor(200000), 200000);
  assert.equal(normalizeCompFloor("200k"), 200000);
  assert.equal(normalizeCompFloor("$185,000"), 185000);
  assert.equal(normalizeCompFloor("1.2m"), 1200000);
  assert.equal(normalizeCompFloor("250k+"), 250000);
  assert.equal(normalizeCompFloor(null), null);
  assert.equal(normalizeCompFloor(""), null);
  assert.equal(normalizeCompFloor(-5), undefined);
  assert.equal(normalizeCompFloor(99_000_000), undefined);
});

test("formatCompFloor names the basis", () => {
  assert.equal(formatCompFloor({ comp_floor_usd: 200000, comp_basis: "base" }), "$200k+ base");
  assert.equal(formatCompFloor({ comp_floor_usd: 1500000, comp_basis: "total" }), "$1.5M+ total comp");
  assert.equal(formatCompFloor({ comp_floor_usd: null, comp_basis: "base" }), null);
});

test("mapGoalLocations maps only when every location is known", () => {
  assert.deepEqual(mapGoalLocations({ locations: ["New York", "SF Bay Area"], remote: null }), ["nyc", "sf"]);
  assert.deepEqual(mapGoalLocations({ locations: ["New York", "London"], remote: null }), []);
  assert.deepEqual(mapGoalLocations({ locations: ["NYC"], remote: "remote_ok" }), ["nyc", "remote"]);
  assert.deepEqual(mapGoalLocations({ locations: ["London"], remote: "remote_only" }), ["remote"]);
  assert.deepEqual(mapGoalLocations({ locations: [], remote: "remote_ok" }), []);
  assert.deepEqual(mapGoalLocations({ locations: ["Seattle, WA", "Bellevue"], remote: null }), ["seattle"]);
});

test("goalToPrefsPatch owns only goal columns and keeps visa null out", () => {
  const p = goalToPrefsPatch(goal());
  assert.deepEqual(p, {
    role_mode: "different",
    target_roles: ["Product Manager", "Senior Product Manager"],
    company_sizes: ["large", "medium"],
    locations: ["nyc", "remote"],
    visa_required: false,
  });
  const noVisa = goalToPrefsPatch(goal({ visa_required: null }));
  assert.equal("visa_required" in noVisa, false);
  assert.equal("interests" in noVisa, false);
});

test("formatGoalBrief never leaks comp or dealbreakers into outreach context", () => {
  const brief = formatGoalBrief(goal({ summary: "Senior PM at a hedge fund." }));
  assert.doesNotMatch(brief, /200/);
  assert.doesNotMatch(brief, /\$/);
  assert.doesNotMatch(brief, /pure sales/);
  assert.doesNotMatch(brief, /dealbreaker/i);
  assert.match(brief, /Citadel/);
  assert.match(brief, /Product Manager/);
});

test("formatGoalForScoring carries comp floor, dealbreakers and visa", () => {
  const s = formatGoalForScoring(goal({ visa_required: true }));
  assert.match(s, /Goal \(confirmed by candidate\)/);
  assert.match(s, /Pay floor: \$200k\+ base/);
  assert.match(s, /Dealbreakers: pure sales roles/);
  assert.match(s, /Needs visa sponsorship/);
});

test("deriveShortLabel does not double the level and trims to fit", () => {
  const g = goal();
  const label = deriveShortLabel({ ...g, target_roles: ["Senior Product Manager"] });
  assert.equal(label, "Senior Product Manager · hedge funds · $200k+");
  const long = deriveShortLabel({ ...g, target_roles: ["Principal Product Manager, Platform Infrastructure"], industries: ["quantitative hedge funds"] });
  assert.ok(long.length <= 48);
});

test("PROPOSE_GOAL_INPUT_SCHEMA lists every GoalSpec field except v", () => {
  const keys = Object.keys(goal()).filter((k) => k !== "v").sort();
  assert.deepEqual(Object.keys(PROPOSE_GOAL_INPUT_SCHEMA.properties).sort(), keys);
  assert.deepEqual([...PROPOSE_GOAL_INPUT_SCHEMA.required].sort(), keys);
});
