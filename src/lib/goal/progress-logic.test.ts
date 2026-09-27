import { test } from "node:test";
import assert from "node:assert/strict";
import {
  goalProgressModel,
  progressNudge,
  progressSummary,
  shouldSuggestRefine,
  formatMatchFeedback,
  REFINE_AFTER_DISMISSALS,
  type GoalProgressCounts,
} from "./progress-logic.ts";

const ZERO: GoalProgressCounts = {
  strong_matches: 0,
  applications: 0,
  submitted: 0,
  outreach_sent: 0,
  replies: 0,
  dismissed_since_lock: 0,
};

test("goalProgressModel lists the funnel in order", () => {
  const m = goalProgressModel({ ...ZERO, strong_matches: 12, applications: 3, submitted: 2, outreach_sent: 1 });
  assert.deepEqual(
    m.steps.map((s) => [s.id, s.count]),
    [
      ["strong_matches", 12],
      ["applications", 3],
      ["submitted", 2],
      ["outreach_sent", 1],
      ["replies", 0],
    ],
  );
  assert.equal(m.suggestRefine, false);
});

test("progressNudge picks the first gap", () => {
  assert.match(progressNudge(ZERO), /No strong matches yet/);
  assert.equal(progressNudge({ ...ZERO, strong_matches: 12 }), "12 strong matches and no applications yet — start with the top one.");
  assert.equal(progressNudge({ ...ZERO, strong_matches: 1 }), "1 strong match and no applications yet — start with the top one.");
  assert.match(progressNudge({ ...ZERO, strong_matches: 5, applications: 2 }), /^2 applications prepared/);
  assert.match(progressNudge({ ...ZERO, strong_matches: 5, applications: 3, submitted: 3 }), /reach a person/);
  assert.match(progressNudge({ ...ZERO, strong_matches: 5, applications: 3, submitted: 3, outreach_sent: 2 }), /follow up/);
  assert.match(progressNudge({ ...ZERO, applications: 3, submitted: 3, outreach_sent: 2, replies: 1 }), /^1 reply in/);
});

test("shouldSuggestRefine triggers at the dismissal threshold", () => {
  assert.equal(shouldSuggestRefine({ dismissed_since_lock: REFINE_AFTER_DISMISSALS - 1 }), false);
  assert.equal(shouldSuggestRefine({ dismissed_since_lock: REFINE_AFTER_DISMISSALS }), true);
});

test("progressSummary stays short", () => {
  assert.equal(progressSummary({ ...ZERO, strong_matches: 12 }), "12 strong matches");
  assert.equal(progressSummary({ ...ZERO, strong_matches: 1, applications: 2, replies: 1 }), "1 strong match · 2 applied · 1 reply");
});

test("formatMatchFeedback lists passed-on and pursued matches", () => {
  assert.equal(formatMatchFeedback([], []), "");
  const out = formatMatchFeedback(
    [
      { title: "PM, Lending", company: "JPMorgan" },
      { title: "PM, Payments", company: "Goldman Sachs" },
    ],
    [{ title: "Senior PM", company: "Citadel" }],
  );
  assert.match(out, /^Recent feedback on matches since this goal was locked:/);
  assert.match(out, /Passed on \(2\):\n- PM, Lending — JPMorgan\n- PM, Payments — Goldman Sachs/);
  assert.match(out, /Pursued \(1\):\n- Senior PM — Citadel/);
});
