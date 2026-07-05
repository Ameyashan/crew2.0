import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FOLLOWUP_OPTIONS,
  daysToFollowupLabel,
  followupLabelToDays,
  parseWritingSamples,
  linkedinHandle,
  deriveConnectedRows,
  onboardingCompletedCount,
  onboardingSkipPatch,
  onboardingDonePatch,
  skipLeavesStoryThin,
  composeOutcomeChip,
  resumeRowChip,
  isRunDone,
  runDetailTitle,
  runDetailSubline,
  runOutcomeRows,
  runDownloadTiles,
  runDetailSteps,
  personStatusChip,
  personLastTouch,
  personNextStep,
  interactionToStatus,
  trackerRowNeedsAction,
  relativeWhen,
  truncate,
} from "./phase5-logic.ts";

// ── Follow-up cadence ────────────────────────────────────────────────────────
test("FOLLOWUP_OPTIONS covers the five cadences with 'never' == 0 days", () => {
  assert.deepEqual(
    FOLLOWUP_OPTIONS.map((o) => o.label),
    ["3d", "5d", "7d", "10d", "never"],
  );
  assert.equal(FOLLOWUP_OPTIONS.find((o) => o.label === "never")?.days, 0);
});

test("daysToFollowupLabel maps stored days back to a pill label", () => {
  assert.equal(daysToFollowupLabel(3), "3d");
  assert.equal(daysToFollowupLabel(10), "10d");
  assert.equal(daysToFollowupLabel(0), "never");
  // null/undefined defaults to the middle of the range
  assert.equal(daysToFollowupLabel(null), "5d");
  assert.equal(daysToFollowupLabel(undefined), "5d");
  // unknown positive value renders as "{d}d"
  assert.equal(daysToFollowupLabel(14), "14d");
});

test("followupLabelToDays is the inverse for known labels, null otherwise", () => {
  assert.equal(followupLabelToDays("7d"), 7);
  assert.equal(followupLabelToDays("never"), 0);
  assert.equal(followupLabelToDays("bogus"), null);
  assert.equal(followupLabelToDays(undefined), null);
  // round-trips
  for (const o of FOLLOWUP_OPTIONS) {
    assert.equal(daysToFollowupLabel(followupLabelToDays(o.label)), o.label);
  }
});

// ── Writing samples ──────────────────────────────────────────────────────────
test("parseWritingSamples handles arrays, JSON strings, plain strings, and junk", () => {
  assert.deepEqual(parseWritingSamples(["a", "b"]), ["a", "b"]);
  // drops empties / non-strings
  assert.deepEqual(parseWritingSamples(["a", "", "  ", 3, null]), ["a"]);
  // JSON-encoded array (the text-column round-trip)
  assert.deepEqual(parseWritingSamples('["x","y"]'), ["x", "y"]);
  // non-JSON string is a single sample
  assert.deepEqual(parseWritingSamples("just one"), ["just one"]);
  // empties
  assert.deepEqual(parseWritingSamples(""), []);
  assert.deepEqual(parseWritingSamples(null), []);
  assert.deepEqual(parseWritingSamples(undefined), []);
});

// ── LinkedIn handle ──────────────────────────────────────────────────────────
test("linkedinHandle extracts the handle from a URL or accepts a bare handle", () => {
  assert.equal(linkedinHandle("https://linkedin.com/in/ameya-shanbhag"), "ameya-shanbhag");
  assert.equal(linkedinHandle("https://www.linkedin.com/in/foo/?x=1"), "foo");
  assert.equal(linkedinHandle("ameya-shanbhag"), "ameya-shanbhag");
  assert.equal(linkedinHandle("https://ameya.example.com"), "ameya.example.com");
  assert.equal(linkedinHandle(null), "");
  assert.equal(linkedinHandle(""), "");
});

// ── Connected rows (Settings) ────────────────────────────────────────────────
test("deriveConnectedRows flags each capability from the profile", () => {
  const rows = deriveConnectedRows({
    resume_text: "x".repeat(1200),
    resume_filename: "cv.pdf",
    linkedin_url: "https://linkedin.com/in/foo",
    writing_samples: '["a","b"]',
    context_prompt: "y".repeat(50),
  });
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.equal(byKey.resume.on, true);
  assert.match(byKey.resume.sub, /cv\.pdf · 1,200 chars/);
  assert.equal(byKey.linkedin.on, true);
  assert.equal(byKey.writing.on, true);
  assert.equal(byKey.writing.sub, "2 samples learned");
  assert.equal(byKey.goals.on, true);
});

test("deriveConnectedRows shows empty captions when nothing is on file", () => {
  const rows = deriveConnectedRows(null);
  assert.deepEqual(rows.map((r) => r.on), [false, false, false, false]);
  assert.equal(rows.find((r) => r.key === "resume")?.sub, "Not yet uploaded");
  assert.equal(rows.find((r) => r.key === "writing")?.sub, "No samples on file yet");
});

// ── Onboarding ───────────────────────────────────────────────────────────────
test("onboardingCompletedCount counts the five optional inputs", () => {
  assert.equal(
    onboardingCompletedCount({ resume: null, linkedin: "", samples: [], goals: "", interests: [] }),
    0,
  );
  assert.equal(
    onboardingCompletedCount({
      resume: { name: "cv.pdf" },
      linkedin: "foo",
      samples: ["a"],
      goals: "hello",
      interests: ["fintech"],
    }),
    5,
  );
  // whitespace-only doesn't count
  assert.equal(
    onboardingCompletedCount({ resume: null, linkedin: "   ", samples: [], goals: "  ", interests: [] }),
    0,
  );
});

test("onboardingSkipPatch marks onboarded and nothing else (the thin-Story path)", () => {
  const patch = onboardingSkipPatch();
  assert.deepEqual(patch, { onboarded: true });
  assert.equal(skipLeavesStoryThin(patch), true);
});

test("onboardingDonePatch builds the profile write, resume-full patch is not thin", () => {
  const patch = onboardingDonePatch({
    linkedin: " ameya ",
    samples: ["a", "b"],
    goals: "  my story  ",
    followup: "7d",
  });
  assert.equal(patch.linkedin_url, "https://linkedin.com/in/ameya");
  assert.deepEqual(patch.writing_samples, ["a", "b"]);
  assert.equal(patch.context_prompt, "my story");
  assert.equal(patch.followup_days, 7);
  assert.equal(patch.onboarded, true);
  // empty linkedin / samples / goals collapse to null
  const empty = onboardingDonePatch({ linkedin: "", samples: [], goals: "", followup: "never" });
  assert.equal(empty.linkedin_url, null);
  assert.equal(empty.writing_samples, null);
  assert.equal(empty.context_prompt, null);
  assert.equal(empty.followup_days, 0);
});

// ── History outcome chips ────────────────────────────────────────────────────
test("composeOutcomeChip maps run outcomes to labelled tones", () => {
  assert.deepEqual(composeOutcomeChip("complete"), { label: "ready", tone: "done" });
  assert.deepEqual(composeOutcomeChip("in_flight"), { label: "in progress…", tone: "progress" });
  assert.deepEqual(composeOutcomeChip("needs_disambiguation"), { label: "needs pick", tone: "attention" });
  assert.deepEqual(composeOutcomeChip("boom"), { label: "error", tone: "error" });
  assert.deepEqual(composeOutcomeChip(null), { label: "error", tone: "error" });
});

test("resumeRowChip prefers the ATS score for finished generations", () => {
  assert.deepEqual(resumeRowChip({ status: "complete", ats_score: 84 }), { label: "ATS 84", tone: "done" });
  assert.deepEqual(resumeRowChip({ status: "complete" }), { label: "tailored", tone: "done" });
  assert.deepEqual(resumeRowChip({ status: "in_flight" }), { label: "in progress…", tone: "progress" });
  assert.deepEqual(resumeRowChip({ status: "error" }), { label: "error", tone: "error" });
});

test("isRunDone recognises finished compose + resume runs", () => {
  assert.equal(isRunDone({ outcome: "complete" }), true);
  assert.equal(isRunDone({ outcome: "in_flight" }), false);
  assert.equal(isRunDone({ status: "done" }), true);
  assert.equal(isRunDone({ status: "in_flight" }), false);
  assert.equal(isRunDone({ status: "error" }), false);
  assert.equal(isRunDone(null), false);
});

// ── Run-history detail derivation ────────────────────────────────────────────
test("runDetailTitle reads the role/company for a job run", () => {
  const t = runDetailTitle({
    kind: "job",
    output: { parsed: { target_role: "Staff PM", target_company: "Acme" } },
  });
  assert.deepEqual(t, { title: "Staff PM", company: "Acme" });
});

test("runDetailTitle falls back to the person name for a person run", () => {
  const t = runDetailTitle({ kind: "person", person: { name: "Dana Rao", company: "Foo Inc" } });
  assert.deepEqual(t, { title: "Dana Rao", company: "Foo Inc" });
  // no company → generic "Person"
  assert.equal(runDetailTitle({ kind: "person", input: "someone" }).company, "Person");
});

test("runDetailSubline renders 'from … · when' and truncates long intents", () => {
  const now = new Date("2026-07-04T12:00:00Z").getTime();
  const line = runDetailSubline(
    { intent: "reach out to the hiring manager", created_at: "2026-07-04T10:00:00Z" },
    now,
  );
  assert.match(line, /^from “reach out to the hiring manager” · 2h ago$/);
  const longLine = runDetailSubline({ intent: "x".repeat(100), created_at: null }, now);
  assert.ok(longLine.length < 80);
  assert.ok(longLine.includes("…"));
});

test("runOutcomeRows surfaces every deliverable the run produced", () => {
  const rows = runOutcomeRows({
    kind: "job",
    output: {
      resume: { header: {} },
      ats_score: 88,
      drafts: [{}, {}, {}],
      person: { name: "Sam Lee" },
      enrichment: { email: "sam@acme.com" },
    },
  });
  const labels = rows.map((r) => r.label);
  assert.ok(labels.includes("Tailored résumé"));
  assert.ok(labels.includes("Outreach drafted"));
  assert.ok(labels.includes("Person found"));
  assert.equal(rows.find((r) => r.label === "Tailored résumé")?.detail, "ATS 88");
  assert.equal(rows.find((r) => r.label === "Outreach drafted")?.detail, "3 drafts across channels");
  assert.equal(rows.find((r) => r.label === "Person found")?.detail, "Sam Lee · email verified");
  assert.ok(rows.every((r) => r.tone === "done"));
});

test("runOutcomeRows always returns at least one row", () => {
  const rows = runOutcomeRows({ kind: "job", output: null });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].label, "Application prepared");
  assert.equal(runOutcomeRows({ kind: "person", output: {} })[0].label, "Run completed");
});

test("runDownloadTiles offers PDF + Word only when a résumé exists", () => {
  assert.deepEqual(runDownloadTiles({ output: { resume: { header: {} } } }), [
    { label: "PDF", kind: "pdf" },
    { label: "Word", kind: "docx" },
  ]);
  assert.deepEqual(runDownloadTiles({ output: {} }), []);
  assert.deepEqual(runDownloadTiles({ output: null }), []);
});

// ── Run-detail steps (History) ───────────────────────────────────────────────
test("runDetailSteps tags each step with its agent chip", () => {
  const job = runDetailSteps({ kind: "job" });
  assert.deepEqual(
    job.map((s) => s.agent),
    ["TRACKER", "RESUME", "PERSON KHOJI", "EMAIL WALLAH", "OUTREACH"],
  );
  assert.ok(job.every((s) => s.title && s.sub));
  // A person run skips the résumé step.
  const person = runDetailSteps({ kind: "person" });
  assert.deepEqual(
    person.map((s) => s.agent),
    ["TRACKER", "PERSON KHOJI", "EMAIL WALLAH", "OUTREACH"],
  );
  // Unknown kind falls back to the person flow.
  assert.equal(runDetailSteps(null).length, 4);
});

// ── People tracker ───────────────────────────────────────────────────────────
test("personLastTouch labels the latest interaction with a relative age", () => {
  const now = new Date("2026-07-04T12:00:00Z").getTime();
  assert.equal(
    personLastTouch({ last_interaction_type: "replied", last_interaction: "2026-07-03T12:00:00Z" }, now),
    "reply · 1d ago",
  );
  assert.equal(
    personLastTouch({ last_interaction_type: "sent", last_interaction: "2026-06-30T12:00:00Z" }, now),
    "sent · 4d ago",
  );
  assert.equal(personLastTouch({ last_interaction_type: "sent", last_interaction: null }, now), "—");
});

test("personNextStep tints the next move by kind", () => {
  const now = new Date("2026-07-04T12:00:00Z").getTime();
  assert.deepEqual(personNextStep({ last_interaction_type: "replied" }, now), {
    label: "you: your move",
    tone: "you",
  });
  assert.deepEqual(personNextStep({ last_interaction_type: "drafted" }, now), {
    label: "draft held",
    tone: "auto",
  });
  // Sent with a queued follow-up → dated auto-followup, muted.
  const withFu = personNextStep(
    { last_interaction_type: "sent", next_followup_due: "2026-07-10T12:00:00Z" },
    now,
  );
  assert.match(withFu.label, /^auto follow-up · /);
  assert.equal(withFu.tone, "auto");
  // Sent recently, no follow-up → still awaiting.
  assert.deepEqual(
    personNextStep({ last_interaction_type: "sent", last_interaction: "2026-07-02T12:00:00Z" }, now),
    { label: "auto follow-up queued", tone: "auto" },
  );
  // Sent long ago, no follow-up → closed / cold.
  assert.deepEqual(
    personNextStep({ last_interaction_type: "sent", last_interaction: "2026-06-01T12:00:00Z" }, now),
    { label: "closed", tone: "closed" },
  );
  // No interaction → dash.
  assert.deepEqual(personNextStep({ last_interaction_type: null }, now), { label: "—", tone: "closed" });
});

test("interactionToStatus maps interaction types onto chip statuses", () => {
  assert.equal(interactionToStatus("replied"), "replied");
  assert.equal(interactionToStatus("sent"), "awaiting");
  assert.equal(interactionToStatus("drafted"), "queued");
  assert.equal(interactionToStatus(null), "queued");
  // round-trips through the chip
  assert.equal(personStatusChip(interactionToStatus("replied")).label, "REPLIED");
  assert.equal(personStatusChip(interactionToStatus("sent")).label, "SENT");
});

test("trackerRowNeedsAction flags replied rows for highlight", () => {
  assert.equal(trackerRowNeedsAction({ last_interaction_type: "replied" }), true);
  assert.equal(trackerRowNeedsAction({ last_interaction_type: "sent" }), false);
  assert.equal(trackerRowNeedsAction({ last_interaction_type: null }), false);
});

test("personStatusChip maps statuses to REPLIED/SENT/HELD tones", () => {
  assert.deepEqual(personStatusChip("replied"), { label: "REPLIED", tone: "replied" });
  assert.deepEqual(personStatusChip("awaiting"), { label: "SENT", tone: "sent" });
  assert.deepEqual(personStatusChip("sent"), { label: "SENT", tone: "sent" });
  assert.deepEqual(personStatusChip("queued"), { label: "HELD", tone: "held" });
  assert.deepEqual(personStatusChip("drafted"), { label: "HELD", tone: "held" });
  // unknown → uppercased, held tone
  assert.deepEqual(personStatusChip("mystery"), { label: "MYSTERY", tone: "held" });
  assert.equal(personStatusChip(null).tone, "held");
});

// ── Shared helpers ───────────────────────────────────────────────────────────
test("relativeWhen renders human-friendly ages with an injectable now", () => {
  const now = new Date("2026-07-04T12:00:00Z").getTime();
  assert.equal(relativeWhen("2026-07-04T11:59:40Z", now), "just now");
  assert.equal(relativeWhen("2026-07-04T11:30:00Z", now), "30m ago");
  assert.equal(relativeWhen("2026-07-04T09:00:00Z", now), "3h ago");
  assert.equal(relativeWhen("2026-07-03T12:00:00Z", now), "1d ago");
  assert.equal(relativeWhen("2026-07-01T12:00:00Z", now), "3d ago");
  assert.equal(relativeWhen(null, now), "");
  assert.equal(relativeWhen("not-a-date", now), "");
});

test("truncate trims to a max with an ellipsis", () => {
  assert.equal(truncate("short", 10), "short");
  assert.equal(truncate("  padded  ", 10), "padded");
  assert.equal(truncate("this is quite long", 10), "this is q…");
  assert.ok(truncate("this is quite long", 10).length <= 10);
});
