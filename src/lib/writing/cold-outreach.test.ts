import { test } from "node:test";
import assert from "node:assert/strict";
import { coldOutreachGuide, OUTREACH_PRINCIPLES } from "./cold-outreach.ts";
import { lintAntiAi } from "./anti-ai.ts";

test("cold outreach: high-leverage-job-hunt rules are in every channel's guide", () => {
  for (const ch of ["email", "linkedin", "x_dm"] as const) {
    const g = coldOutreachGuide(ch);
    assert.match(g, /Name the gap, not your skills/);
    assert.match(g, /end on a question/);
    assert.match(g, /No mail-merge/);
    assert.match(g, /one true line/);
  }
  // Subject rule stays email-only.
  assert.match(coldOutreachGuide("email"), /Earn the open/);
  assert.doesNotMatch(coldOutreachGuide("x_dm"), /Earn the open/);
  assert.equal(new Set(OUTREACH_PRINCIPLES.map((p) => p.title)).size, OUTREACH_PRINCIPLES.length);
});

test("linter: mail-merge phrasing is flagged", () => {
  const hits = lintAntiAi("Would love to pick your brain and explore synergies. Can we touch base?").map((v) => v.match);
  assert.ok(hits.includes("pick your brain"));
  assert.ok(hits.includes("explore synergies"));
  assert.ok(hits.includes("touch base"));
});
