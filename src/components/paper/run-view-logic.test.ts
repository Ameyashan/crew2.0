import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runStatusChip,
  CHIP_TONE_COLORS,
  THIN_STORY,
  THIN_STORY_ENTRIES,
  isThinStory,
  hasGateableOutput,
  shouldBlurGate,
  gateSummary,
  ANON_ALLOWED_PATHS,
  isAnonAllowedPath,
  PENDING_RUN_KEY,
  serializePendingRun,
  parsePendingRun,
} from "./run-view-logic.ts";

// ── Status chip relabel ──────────────────────────────────────────────────────
test("runStatusChip maps the 4-state machine to RUNNING/DONE/NEEDS-YOU", () => {
  assert.deepEqual(runStatusChip("parsing"), { label: "RUNNING", tone: "running", pulse: true });
  assert.deepEqual(runStatusChip("working"), { label: "RUNNING", tone: "running", pulse: true });
  assert.deepEqual(runStatusChip("done"), { label: "DONE", tone: "done", pulse: false });
  assert.deepEqual(runStatusChip("error"), { label: "NEEDS YOU", tone: "attention", pulse: false });
});

test("runStatusChip: working + reconnecting swaps the label but stays a pulsing running chip", () => {
  const chip = runStatusChip("working", { reconnecting: true });
  assert.equal(chip.label, "RECONNECTING");
  assert.equal(chip.tone, "running");
  assert.equal(chip.pulse, true);
  // reconnecting only matters while working
  assert.equal(runStatusChip("done", { reconnecting: true }).label, "DONE");
});

test("runStatusChip: unknown/nullish stage degrades to a running chip", () => {
  assert.deepEqual(runStatusChip(undefined), { label: "RUNNING", tone: "running", pulse: true });
  assert.deepEqual(runStatusChip(null), { label: "RUNNING", tone: "running", pulse: true });
  assert.equal(runStatusChip("weird").tone, "running");
});

test("CHIP_TONE_COLORS: running & attention are amber, done is green", () => {
  assert.equal(CHIP_TONE_COLORS.running.color, "#8a6d2f");
  assert.equal(CHIP_TONE_COLORS.attention.color, "#8a6d2f");
  assert.equal(CHIP_TONE_COLORS.done.color, "#3d7a4f");
  // every tone provides color + bg + line
  for (const tone of ["running", "attention", "done"] as const) {
    const t = CHIP_TONE_COLORS[tone];
    assert.ok(t.color && t.bg && t.line);
  }
});

// ── Thin-Story states ────────────────────────────────────────────────────────
test("isThinStory is true only when storyIsEmpty is exactly true", () => {
  assert.equal(isThinStory(true), true);
  assert.equal(isThinStory(false), false);
  assert.equal(isThinStory(null), false);
  assert.equal(isThinStory(undefined), false);
});

test("THIN_STORY copy covers pull / ATS / people surfaces", () => {
  assert.equal(THIN_STORY.banner, "THIN STORY");
  assert.equal(THIN_STORY.atsHeader, "BUILT FROM A THIN STORY");
  assert.equal(THIN_STORY.cta, "Add resume");
  for (const k of ["pullNote", "atsNote", "atsNegative", "peopleWarn"] as const) {
    assert.ok(typeof THIN_STORY[k] === "string" && THIN_STORY[k].length > 0);
  }
});

test("THIN_STORY_ENTRIES is the two generic placeholder rows", () => {
  assert.equal(THIN_STORY_ENTRIES.length, 2);
  for (const e of THIN_STORY_ENTRIES) {
    assert.ok(e.title.length > 0 && e.why.length > 0);
  }
});

// ── Blur gate ────────────────────────────────────────────────────────────────
test("hasGateableOutput: done always, working only with a partial deliverable", () => {
  assert.equal(hasGateableOutput({ stage: "done" }, false), true);
  assert.equal(hasGateableOutput({ stage: "working" }, true), true);
  assert.equal(hasGateableOutput({ stage: "working" }, false), false);
  assert.equal(hasGateableOutput({ stage: "parsing" }, true), false);
  assert.equal(hasGateableOutput({ stage: "error" }, true), false);
  assert.equal(hasGateableOutput(null, true), false);
});

test("shouldBlurGate: only when signed OUT and output exists", () => {
  assert.equal(shouldBlurGate({ signedIn: false, run: { stage: "done" }, hasPartial: false }), true);
  assert.equal(shouldBlurGate({ signedIn: true, run: { stage: "done" }, hasPartial: false }), false);
  assert.equal(shouldBlurGate({ signedIn: false, run: { stage: "parsing" }, hasPartial: false }), false);
  assert.equal(shouldBlurGate({ signedIn: false, run: { stage: "working" }, hasPartial: true }), true);
});

test("gateSummary is flow-specific", () => {
  assert.match(gateSummary("job"), /resume/i);
  assert.match(gateSummary("person"), /outreach/i);
  assert.ok(gateSummary("fuzzy").length > 0);
  assert.ok(gateSummary(undefined).length > 0);
});

// ── Anonymous route allow-list ───────────────────────────────────────────────
test("isAnonAllowedPath: only /app/compose (and nested), nothing else", () => {
  assert.deepEqual(ANON_ALLOWED_PATHS, ["/app/compose"]);
  assert.equal(isAnonAllowedPath("/app/compose"), true);
  assert.equal(isAnonAllowedPath("/app/compose/whatever"), true);
  assert.equal(isAnonAllowedPath("/app/jobs"), false);
  assert.equal(isAnonAllowedPath("/app/resume"), false);
  assert.equal(isAnonAllowedPath("/app/people"), false);
  assert.equal(isAnonAllowedPath("/app/settings"), false);
  assert.equal(isAnonAllowedPath("/app/composers"), false); // not a prefix hijack
  assert.equal(isAnonAllowedPath(null), false);
  assert.equal(isAnonAllowedPath(undefined), false);
});

// ── pendingRun persistence ───────────────────────────────────────────────────
test("serializePendingRun round-trips through parsePendingRun", () => {
  const raw = serializePendingRun(
    {
      input: "linkedin.com/in/maya",
      intent: "referral",
      kind: "person",
      providedEmail: true,
      selectedAgents: ["person", "email"],
      screenshotName: "dm.png",
    },
    1234,
  );
  const back = parsePendingRun(raw);
  assert.deepEqual(back, {
    input: "linkedin.com/in/maya",
    intent: "referral",
    kind: "person",
    providedEmail: true,
    selectedAgents: ["person", "email"],
    screenshotName: "dm.png",
    at: 1234,
  });
});

test("serializePendingRun fills sane defaults for a bare input", () => {
  const back = parsePendingRun(serializePendingRun({ input: "acme.com/jobs/1" }, 9));
  assert.equal(back.input, "acme.com/jobs/1");
  assert.equal(back.intent, "");
  assert.equal(back.kind, null);
  assert.equal(back.providedEmail, false);
  assert.deepEqual(back.selectedAgents, []);
  assert.equal(back.screenshotName, null);
  assert.equal(back.at, 9);
});

test("parsePendingRun rejects junk and empty runs", () => {
  assert.equal(parsePendingRun(null), null);
  assert.equal(parsePendingRun(""), null);
  assert.equal(parsePendingRun("not json"), null);
  assert.equal(parsePendingRun("[]"), null);
  // no input AND no screenshot → nothing to reconstruct
  assert.equal(parsePendingRun(JSON.stringify({ input: "   ", screenshotName: null })), null);
  // a screenshot-only run IS reconstructable
  assert.ok(parsePendingRun(JSON.stringify({ input: "", screenshotName: "shot.png" })));
});

test("parsePendingRun sanitizes bad field types", () => {
  const back = parsePendingRun(
    JSON.stringify({
      input: "x",
      intent: 42,
      kind: "banana",
      providedEmail: "yes",
      selectedAgents: ["email", 7, null, "person"],
      screenshotName: 5,
    }),
  );
  assert.equal(back.intent, "");
  assert.equal(back.kind, null);
  assert.equal(back.providedEmail, false);
  assert.deepEqual(back.selectedAgents, ["email", "person"]);
  assert.equal(back.screenshotName, null);
});

test("PENDING_RUN_KEY is a stable versioned key", () => {
  assert.equal(PENDING_RUN_KEY, "crew.pendingRun.v1");
});
