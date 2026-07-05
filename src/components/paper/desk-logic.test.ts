import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SUGGESTION_PILLS,
  SAMPLE_SHOTS,
  FIRST_TIME_CARDS,
  validateScreenshot,
  imageFromClipboard,
  deriveStoryIsEmpty,
  storyNudgeKey,
  STORY_NUDGE_PREFIX,
  isFirstTime,
  deskHeadline,
  deskRunTitle,
  deskRunChips,
  deskEarlierRuns,
  fmtWhen,
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
} from "./desk-logic.ts";

test("SUGGESTION_PILLS are exactly the three prototype pills, each with a seed", () => {
  assert.deepEqual(
    SUGGESTION_PILLS.map((s) => s.label),
    ["Apply to a role", "Just a resume", "Find the right person"],
  );
  assert.ok(SUGGESTION_PILLS.every((s) => typeof s.fill === "string" && s.fill.length > 0));
});

test("SAMPLE_SHOTS covers job / hiring-manager / recruiter", () => {
  assert.deepEqual(SAMPLE_SHOTS.map((s) => s.kind), ["job", "manager", "recruiter"]);
});

test("FIRST_TIME_CARDS: three cards, each with chips and a composer seed", () => {
  assert.equal(FIRST_TIME_CARDS.length, 3);
  for (const c of FIRST_TIME_CARDS) {
    assert.ok(c.title.length > 0);
    assert.ok(Array.isArray(c.chips) && c.chips.length > 0);
    assert.ok(typeof c.fill === "string" && c.fill.length > 0);
  }
});

test("validateScreenshot accepts an allowed image and returns the composer shape", () => {
  const file = { type: "image/png", size: 200 * 1024, name: "shot.png" };
  const res = validateScreenshot(file);
  assert.equal(res.ok, true);
  assert.equal(res.error, null);
  assert.deepEqual(res.screenshot, { name: "shot.png", size: "200 KB", file });
});

test("validateScreenshot rejects a disallowed type", () => {
  const res = validateScreenshot({ type: "application/pdf", size: 1000, name: "a.pdf" });
  assert.equal(res.ok, false);
  assert.equal(res.error, "Use a PNG, JPG, WEBP, or GIF.");
  assert.equal(res.screenshot, null);
});

test("validateScreenshot rejects an oversized image", () => {
  const res = validateScreenshot({ type: "image/jpeg", size: MAX_IMAGE_BYTES + 1, name: "big.jpg" });
  assert.equal(res.ok, false);
  assert.equal(res.error, "Image must be under 5MB.");
});

test("validateScreenshot: missing file is a silent no-op (no error)", () => {
  const res = validateScreenshot(null);
  assert.equal(res.ok, false);
  assert.equal(res.error, null);
});

test("validateScreenshot honours custom allowedTypes / maxBytes", () => {
  const file = { type: "image/svg+xml", size: 10, name: "v.svg" };
  assert.equal(validateScreenshot(file).ok, false);
  assert.equal(validateScreenshot(file, { allowedTypes: ["image/svg+xml"] }).ok, true);
  assert.equal(validateScreenshot({ type: "image/png", size: 50, name: "x" }, { maxBytes: 10 }).ok, false);
});

test("ALLOWED_IMAGE_TYPES matches the composer's original picker set", () => {
  assert.deepEqual(ALLOWED_IMAGE_TYPES, ["image/jpeg", "image/png", "image/webp", "image/gif"]);
});

test("imageFromClipboard returns the first image item's file, else null", () => {
  const png = { name: "p.png" };
  const items = [
    { type: "text/plain", getAsFile: () => null },
    { type: "image/png", getAsFile: () => png },
  ];
  assert.equal(imageFromClipboard(items), png);
  assert.equal(imageFromClipboard([{ type: "text/html", getAsFile: () => ({}) }]), null);
  assert.equal(imageFromClipboard(null), null);
  assert.equal(imageFromClipboard(undefined), null);
});

test("deriveStoryIsEmpty: empty when no profile or no resume text", () => {
  assert.equal(deriveStoryIsEmpty(null), true);
  assert.equal(deriveStoryIsEmpty(undefined), true);
  assert.equal(deriveStoryIsEmpty({}), true);
  assert.equal(deriveStoryIsEmpty({ resume_text: "" }), true);
  assert.equal(deriveStoryIsEmpty({ resume_text: "   " }), true);
  assert.equal(deriveStoryIsEmpty({ resume_text: null }), true);
  assert.equal(deriveStoryIsEmpty({ resume_text: "Senior PM at Ramp…" }), false);
});

test("deriveStoryIsEmpty: a positive entry count wins over the resume fallback", () => {
  // Phase E — story_entries model. Any entries → not thin, even with no resume.
  assert.equal(deriveStoryIsEmpty(null, 3), false);
  assert.equal(deriveStoryIsEmpty({ resume_text: "" }, 1), false);
  // Zero / unknown count → the existing resume_text fallback still governs, so
  // accounts that onboarded before Story existed don't suddenly flip thin.
  assert.equal(deriveStoryIsEmpty({ resume_text: "Senior PM…" }, 0), false);
  assert.equal(deriveStoryIsEmpty({ resume_text: "" }, 0), true);
  assert.equal(deriveStoryIsEmpty(null, 0), true);
  assert.equal(deriveStoryIsEmpty({ resume_text: "x" }, undefined), false);
});

test("storyNudgeKey is per-account and case/space-insensitive", () => {
  assert.equal(storyNudgeKey("Ameya@Gmail.com "), `${STORY_NUDGE_PREFIX}:ameya@gmail.com`);
  assert.notEqual(storyNudgeKey("a@x.io"), storyNudgeKey("b@x.io"));
  // No account resolved → a stable generic key (still namespaced).
  assert.equal(storyNudgeKey(""), STORY_NUDGE_PREFIX);
  assert.equal(storyNudgeKey(null), STORY_NUDGE_PREFIX);
  assert.equal(storyNudgeKey(undefined), STORY_NUDGE_PREFIX);
});

test("isFirstTime is true only with zero compose AND zero resume runs", () => {
  assert.equal(isFirstTime(0, 0), true);
  assert.equal(isFirstTime(1, 0), false);
  assert.equal(isFirstTime(0, 1), false);
  assert.equal(isFirstTime(2, 3), false);
});

test("deskHeadline: signed-out pitch / first-time welcome / returning prompt", () => {
  // Signed-out wins regardless of first-time state (prototype line 1302).
  assert.equal(deskHeadline(false, true, "Sam Sharma"), "A crew of agents for your job hunt.");
  assert.equal(deskHeadline(false, false, null), "A crew of agents for your job hunt.");
  // Signed-in first-time greets by first name only.
  assert.equal(deskHeadline(true, true, "Sam Sharma"), "Welcome, Sam.");
  assert.equal(deskHeadline(true, true, "  Priya  "), "Welcome, Priya.");
  // No resolved name yet → a bare welcome, never "Welcome, ."
  assert.equal(deskHeadline(true, true, null), "Welcome.");
  assert.equal(deskHeadline(true, true, "   "), "Welcome.");
  // Returning users get the standing prompt.
  assert.equal(deskHeadline(true, false, "Sam Sharma"), "What should the crew get done?");
  // Session still resolving (null) → returning prompt, no wrong-variant flash.
  assert.equal(deskHeadline(null, true, "Sam Sharma"), "What should the crew get done?");
});

test("deskRunTitle picks the right label per agent/kind", () => {
  assert.equal(
    deskRunTitle("compose", { kind: "job", output: { parsed: { target_role: "Staff PD" } } }),
    "Staff PD",
  );
  assert.equal(
    deskRunTitle("compose", { kind: "person", person: { name: "Anika Mehta" } }),
    "Anika Mehta",
  );
  assert.equal(
    deskRunTitle("compose", { kind: "person", input: "linkedin.com/in/maya" }),
    "linkedin.com",
  );
  assert.equal(deskRunTitle("resume", { target_role: "PM, Payments" }), "PM, Payments");
  assert.equal(deskRunTitle("resume", { status: "in_flight" }), "Tailoring…");
  assert.equal(deskRunTitle("resume", {}), "Tailored resume");
});

test("deskRunChips maps outcomes/status to labelled tones", () => {
  assert.deepEqual(deskRunChips("compose", { outcome: "complete" }), [{ label: "ready", tone: "done" }]);
  assert.deepEqual(deskRunChips("compose", { outcome: "in_flight" }), [{ label: "in progress", tone: "progress" }]);
  assert.deepEqual(deskRunChips("compose", { outcome: "needs_disambiguation" }), [{ label: "needs pick", tone: "attention" }]);
  assert.deepEqual(deskRunChips("compose", { outcome: "boom" }), [{ label: "error", tone: "error" }]);
  assert.deepEqual(deskRunChips("resume", { ats_score: 82 }), [{ label: "ATS 82", tone: "done" }]);
  assert.deepEqual(deskRunChips("resume", { status: "in_flight" }), [{ label: "in progress", tone: "progress" }]);
  assert.deepEqual(deskRunChips("resume", {}), [{ label: "tailored", tone: "done" }]);
});

test("deskEarlierRuns merges both sources, sorts newest-first, caps at limit", () => {
  const compose = [
    { id: "c1", created_at: "2026-07-01T10:00:00Z", kind: "job", outcome: "complete", output: { parsed: { target_role: "PD" } } },
    { id: "c2", created_at: "2026-07-03T10:00:00Z", kind: "person", outcome: "complete", person: { name: "Sara" } },
  ];
  const resume = [
    { id: "r1", created_at: "2026-07-02T10:00:00Z", target_role: "PM", ats_score: 77 },
  ];
  const rows = deskEarlierRuns(compose, resume, 4);
  assert.deepEqual(rows.map((r) => r.id), ["c2", "r1", "c1"]);
  assert.deepEqual(rows.map((r) => r.agent), ["compose", "resume", "compose"]);
  assert.equal(rows[0].title, "Sara");
  assert.equal(rows[1].chips[0].label, "ATS 77");

  const capped = deskEarlierRuns(compose, resume, 2);
  assert.equal(capped.length, 2);
  assert.deepEqual(capped.map((r) => r.id), ["c2", "r1"]);
});

test("deskEarlierRuns tolerates empty / missing inputs", () => {
  assert.deepEqual(deskEarlierRuns([], [], 4), []);
  assert.deepEqual(deskEarlierRuns(undefined, undefined, 4), []);
});

test("fmtWhen renders deterministic relative times against an injected now", () => {
  const now = new Date("2026-07-04T12:00:00Z").getTime();
  assert.equal(fmtWhen(null, now), "");
  assert.equal(fmtWhen("2026-07-04T11:59:40Z", now), "just now");
  assert.equal(fmtWhen("2026-07-04T11:30:00Z", now), "30m ago");
  assert.equal(fmtWhen("2026-07-04T09:00:00Z", now), "3h ago");
  assert.equal(fmtWhen("2026-07-03T12:00:00Z", now), "1d ago");
  assert.equal(fmtWhen("2026-06-29T12:00:00Z", now), "5d ago");
});
