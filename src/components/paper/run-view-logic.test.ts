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
  RUN_AGENT_CHIPS,
  RUN_STEP_ORDER,
  buildRunSteps,
  STEP_ACTIVITY,
  stepActivityPhrase,
  runViewTitle,
  truncateIntent,
  normalizeCandidateKey,
  ANGLE_PILLS,
  CHANNEL_NAMES,
  SENT_CHANNEL_WORD,
  handoffCta,
  handoffQuestion,
  sentLine,
  sentSub,
  altsLabel,
  GATE_CHIP_LABEL,
  GATE_BUTTON_LABEL,
  GATE_FOOTNOTE,
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

// ── Steps list ───────────────────────────────────────────────────────────────
test("RUN_AGENT_CHIPS maps every pipeline step to a prototype chip", () => {
  assert.equal(RUN_AGENT_CHIPS.parse, "TRACKER");
  assert.equal(RUN_AGENT_CHIPS.resume, "RESUME");
  assert.equal(RUN_AGENT_CHIPS.person, "PERSON KHOJI");
  assert.equal(RUN_AGENT_CHIPS.email, "EMAIL WALLAH");
  assert.equal(RUN_AGENT_CHIPS.outreach, "OUTREACH");
  assert.equal(RUN_AGENT_CHIPS.application, "SAWAAL JAWAAB");
});

test("RUN_STEP_ORDER: job includes resume, person flow doesn't", () => {
  assert.deepEqual(RUN_STEP_ORDER.job, ["parse", "resume", "person", "email", "outreach", "application"]);
  assert.deepEqual(RUN_STEP_ORDER.person, ["parse", "person", "email", "outreach"]);
});

test("buildRunSteps: parsing → single active TRACKER row", () => {
  const rows = buildRunSteps({ stage: "parsing", kind: "job", progress: {} });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "parse");
  assert.equal(rows[0].state, "active");
  assert.equal(rows[0].title, "Parsing…");
  assert.equal(rows[0].agent, "TRACKER");
  // screenshot variant
  const shot = buildRunSteps({ stage: "parsing", kind: "job", screenshot: true });
  assert.equal(shot[0].title, "Reading your screenshot…");
});

test("buildRunSteps: working shows done rows, one active row, remaining steps pending", () => {
  const rows = buildRunSteps({
    stage: "working",
    kind: "person",
    progress: { person: 100, email: 40 },
  });
  assert.deepEqual(rows.map((r) => r.id), ["parse", "person", "email", "outreach"]);
  assert.deepEqual(rows.map((r) => r.state), ["done", "done", "active", "pending"]);
  assert.equal(rows[2].title, "Verifying emails…");
  // outreach (not started yet) is shown as a pending roadmap row, not hidden
  assert.equal(rows.find((r) => r.id === "outreach").state, "pending");
});

test("buildRunSteps: done marks every selected step done with real subs", () => {
  const rows = buildRunSteps({
    stage: "done",
    kind: "job",
    progress: { resume: 100, person: 100, email: 100, outreach: 100 },
    ats: { before: 61, after: 88 },
    peopleCount: 3,
    personLabel: "Anika Mehta",
    emailVerdict: "96% verified",
    draftCount: 3,
    questionCount: 2,
  });
  assert.equal(rows.length, 6);
  assert.ok(rows.every((r) => r.state === "done"));
  const resume = rows.find((r) => r.id === "resume");
  assert.equal(resume.title, "Resume woven from your Story");
  assert.match(resume.sub, /ATS 61 → 88/);
  const person = rows.find((r) => r.id === "person");
  assert.equal(person.title, "3 people found — ranked by who decides");
  assert.match(person.sub, /Anika Mehta first/);
  const email = rows.find((r) => r.id === "email");
  assert.match(email.sub, /96% verified/);
  const outreach = rows.find((r) => r.id === "outreach");
  assert.match(outreach.title, /email, LinkedIn, X/);
  const application = rows.find((r) => r.id === "application");
  assert.equal(application.title, "2 application questions found");
});

test("buildRunSteps: selectedAgents filters agent rows (parse always stays)", () => {
  const rows = buildRunSteps({
    stage: "done",
    kind: "person",
    progress: {},
    selectedAgents: ["person", "outreach"],
  });
  assert.deepEqual(rows.map((r) => r.id), ["parse", "person", "outreach"]);
});

test("buildRunSteps: thin story flavors resume + outreach rows", () => {
  const rows = buildRunSteps({
    stage: "done",
    kind: "job",
    progress: {},
    thin: true,
    ats: { after: 71 },
    // A thin run still drafts — thin means no Story to hook from, not no drafts.
    draftCount: 3,
  });
  const resume = rows.find((r) => r.id === "resume");
  assert.equal(resume.title, "Resume woven — but your Story is thin");
  assert.match(resume.sub, /add your resume/);
  const outreach = rows.find((r) => r.id === "outreach");
  assert.match(outreach.sub, /generic/);
});

test("buildRunSteps: outreach with zero drafts never claims it drafted", () => {
  const rows = buildRunSteps({
    stage: "done",
    kind: "job",
    progress: { person: 100, email: 100, outreach: 100 },
    peopleCount: 0,
    personLabel: null,
    draftCount: 0,
  });
  const outreach = rows.find((r) => r.id === "outreach");
  assert.equal(outreach.title, "No outreach drafted");
  assert.match(outreach.sub, /pick someone/i);
});

test("buildRunSteps: sourced-but-unconfirmed shortlist doesn't claim people were ranked", () => {
  // The dual screenshot dead-end: candidates were sourced (peopleCount) but
  // research confirmed nobody (no personLabel). The row must not read as a win.
  const rows = buildRunSteps({
    stage: "done",
    kind: "job",
    progress: { person: 100, email: 100, outreach: 100 },
    peopleCount: 4,
    personLabel: null,
    draftCount: 0,
  });
  const person = rows.find((r) => r.id === "person");
  assert.equal(person.title, "4 possible people — none confirmed yet");
  assert.doesNotMatch(person.title, /ranked by who decides/);
});

test("buildRunSteps: pulling flips the active resume row to the pull title", () => {
  const rows = buildRunSteps({
    stage: "working",
    kind: "job",
    progress: { resume: 10 },
    pulling: true,
    thin: true,
  });
  const resume = rows.find((r) => r.id === "resume");
  assert.equal(resume.state, "active");
  assert.equal(resume.title, "Choosing what to pull from your Story");
});

test("buildRunSteps: skipResume renders a skipped resume row and makes person the active step", () => {
  const rows = buildRunSteps({
    stage: "working",
    kind: "job",
    progress: {},
    skipResume: true,
  });
  const resume = rows.find((r) => r.id === "resume");
  assert.equal(resume.state, "skipped");
  assert.equal(resume.agent, "RESUME");
  assert.match(resume.title, /skipped resume/i);
  assert.match(resume.title, /hiring manager/i);
  // The skipped row must NOT consume the single active slot — person is active.
  const person = rows.find((r) => r.id === "person");
  assert.equal(person.state, "active");
  assert.equal(rows.filter((r) => r.state === "active").length, 1);
});

test("buildRunSteps: skipResume never falsely flips resume to done when the run completes", () => {
  const rows = buildRunSteps({
    stage: "done",
    kind: "job",
    progress: { person: 100, email: 100, outreach: 100 },
    skipResume: true,
  });
  const resume = rows.find((r) => r.id === "resume");
  assert.equal(resume.state, "skipped");
});

test("buildRunSteps: a stepError renders an error row and doesn't block later rows", () => {
  const rows = buildRunSteps({
    stage: "done",
    kind: "job",
    progress: { person: 100, email: 100, outreach: 100 },
    stepErrors: { resume: "resume branch failed" },
  });
  const resume = rows.find((r) => r.id === "resume");
  assert.equal(resume.state, "error");
  assert.equal(resume.sub, "resume branch failed");
  assert.equal(rows.filter((r) => r.state === "done").length, 5); // parse + 3 agents + application
});

test("buildRunSteps: done person step with nothing found says so honestly", () => {
  const rows = buildRunSteps({
    stage: "done",
    kind: "person",
    progress: {},
    peopleCount: 0,
    personLabel: null,
  });
  const person = rows.find((r) => r.id === "person");
  assert.equal(person.title, "No specific person pinned down");
  assert.match(person.sub, /LinkedIn or X link/);
});

test("buildRunSteps: single person found uses the name as the title", () => {
  const rows = buildRunSteps({
    stage: "done",
    kind: "person",
    progress: {},
    peopleCount: 1,
    personLabel: "Dev Raghavan",
    personSub: "Design manager · Razorpay",
  });
  const person = rows.find((r) => r.id === "person");
  assert.equal(person.title, "Dev Raghavan found");
  assert.equal(person.sub, "Design manager · Razorpay");
});

test("buildRunSteps: a re-pick re-running multiple steps keeps every row visible", () => {
  // The flicker bug: on a re-pick the résumé is still weaving (active) while
  // person/email/outreach reset below 100. The old single-active model hid the
  // reset rows behind the weaving résumé; now every in-flight row stays up.
  const rows = buildRunSteps({
    stage: "working",
    kind: "job",
    progress: { resume: 40, person: 100, email: 10, outreach: 10 },
  });
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(byId.resume.state, "active");
  assert.equal(byId.person.state, "done");
  assert.equal(byId.email.state, "active");
  assert.equal(byId.outreach.state, "active");
  // Nothing vanished — all four agent rows plus parse are present (application
  // detection sits at the end as a pending roadmap row).
  assert.deepEqual(rows.map((r) => r.id), ["parse", "resume", "person", "email", "outreach", "application"]);
});

test("buildRunSteps: résumé still weaving after the crew finishes stays the lone active row", () => {
  // The common job-run shape from the video: everything done, résumé weaving.
  const rows = buildRunSteps({
    stage: "working",
    kind: "job",
    progress: { resume: 30, person: 100, email: 100, outreach: 100 },
  });
  assert.equal(rows.filter((r) => r.state === "active").length, 1);
  assert.equal(rows.find((r) => r.id === "resume").state, "active");
});

test("buildRunSteps: nothing started yet lights the first step, rest pending", () => {
  const rows = buildRunSteps({ stage: "working", kind: "job", progress: {} });
  // Exactly one active row, and it's the résumé (job runs lead with resume).
  const active = rows.filter((r) => r.state === "active");
  assert.equal(active.length, 1);
  assert.equal(active[0].id, "resume");
  // The rest of the pipeline is visible as pending roadmap rows (no pop-in).
  assert.equal(rows.find((r) => r.id === "person").state, "pending");
  assert.equal(rows.find((r) => r.id === "email").state, "pending");
  assert.equal(rows.find((r) => r.id === "outreach").state, "pending");
});

test("buildRunSteps: queued steps render as pending while one is active", () => {
  // The reported scenario: résumé still weaving, person done, email/outreach
  // not yet started — the whole roadmap is on screen.
  const rows = buildRunSteps({ stage: "working", kind: "job", progress: { resume: 40, person: 100 } });
  assert.deepEqual(rows.map((r) => r.id), ["parse", "resume", "person", "email", "outreach", "application"]);
  assert.deepEqual(rows.map((r) => r.state), ["done", "active", "done", "pending", "pending", "pending"]);
  // Every pending row carries real copy.
  for (const r of rows.filter((x) => x.state === "pending")) {
    assert.ok(r.title.length > 0 && r.sub.length > 0, r.id);
  }
});

test("normalizeCandidateKey: trims, collapses whitespace, lowercases", () => {
  assert.equal(normalizeCandidateKey("  Yaoyuan   Liu "), "yaoyuan liu");
  assert.equal(normalizeCandidateKey("YAOYUAN LIU"), normalizeCandidateKey("Yaoyuan Liu"));
  assert.equal(normalizeCandidateKey(null), "");
  assert.equal(normalizeCandidateKey(undefined), "");
});

// ── Live agent activity ticker ───────────────────────────────────────────────
test("stepActivityPhrase: cycles a step's phrases and wraps", () => {
  const phrases = STEP_ACTIVITY.person;
  assert.ok(phrases.length > 1);
  assert.equal(stepActivityPhrase("person", 0), phrases[0]);
  assert.equal(stepActivityPhrase("person", 1), phrases[1]);
  assert.equal(stepActivityPhrase("person", phrases.length), phrases[0]); // wraps
});

test("stepActivityPhrase: unknown step narrates nothing", () => {
  assert.equal(stepActivityPhrase("nope", 0), "");
  assert.equal(stepActivityPhrase("parse", -1), STEP_ACTIVITY.parse[STEP_ACTIVITY.parse.length - 1]);
});

test("STEP_ACTIVITY: every pipeline agent has phrases", () => {
  for (const id of ["parse", "resume", "person", "email", "outreach", "application"]) {
    assert.ok(Array.isArray(STEP_ACTIVITY[id]) && STEP_ACTIVITY[id].length > 0, id);
    for (const p of STEP_ACTIVITY[id]) assert.ok(typeof p === "string" && p.length > 0);
  }
});

// ── Run title ────────────────────────────────────────────────────────────────
test("runViewTitle: job with parsed role/company", () => {
  assert.equal(
    runViewTitle({ kind: "job", role: "Staff Product Designer", company: "Stripe" }),
    "Apply — Staff Product Designer, Stripe",
  );
  assert.equal(runViewTitle({ kind: "job", role: "Staff PD" }), "Apply — Staff PD");
  assert.equal(
    runViewTitle({ kind: "job", fallback: "stripe.com" }),
    "Apply — stripe.com",
  );
});

test("runViewTitle: person flow uses Reach/Find", () => {
  assert.equal(
    runViewTitle({ kind: "person", personName: "Anika Mehta", company: "Stripe" }),
    "Reach — Anika Mehta, Stripe",
  );
  assert.equal(
    runViewTitle({ kind: "person", fallback: "design leads at Razorpay" }),
    "Find — design leads at Razorpay",
  );
  assert.equal(runViewTitle({ kind: "person" }), "Find — your request");
});

test("truncateIntent caps long inputs with an ellipsis", () => {
  assert.equal(truncateIntent("short"), "short");
  const long = "x".repeat(100);
  const t = truncateIntent(long, 64);
  assert.equal(t.length, 64);
  assert.ok(t.endsWith("…"));
});

// ── Angle pills ──────────────────────────────────────────────────────────────
test("ANGLE_PILLS are the prototype's three inline pills with directives", () => {
  assert.deepEqual(ANGLE_PILLS.map((a) => a.label), ["warmer", "shorter", "lead with metrics"]);
  for (const a of ANGLE_PILLS) assert.ok(a.directive.length > 20);
});

// ── Handoff / sent copy ──────────────────────────────────────────────────────
test("channel naming: CTA says Gmail, sent line says email", () => {
  assert.equal(CHANNEL_NAMES.email, "Gmail");
  assert.equal(SENT_CHANNEL_WORD.email, "email");
  assert.equal(handoffCta("email"), "Open in Gmail →");
  assert.equal(handoffCta("linkedin"), "Open in LinkedIn →");
  assert.equal(handoffCta("x"), "Open in X →");
  assert.equal(handoffQuestion("email"), "Opened Gmail in a new tab.");
});

test("sentLine / sentSub personalize when a first name exists", () => {
  assert.equal(
    sentLine("Anika", "email"),
    "Sent to Anika via email. The crew takes it from here.",
  );
  assert.equal(sentLine(null, "x"), "Sent. The crew takes it from here.");
  assert.match(sentSub("Anika"), /^Anika is in your tracker/);
  assert.match(sentSub(null), /^They is in your tracker|^They/);
});

test("altsLabel toggles between count and hide", () => {
  assert.equal(altsLabel(false, 3), "3 more patterns if this bounces ▸");
  assert.equal(altsLabel(false, 1), "1 more pattern if this bounces ▸");
  assert.equal(altsLabel(true, 3), "hide alternate patterns ▾");
});

// ── Gate copy ────────────────────────────────────────────────────────────────
test("gate copy: signed-out + tense-neutral (fires mid-run, not only when done)", () => {
  // The gate drops the moment the first deliverable lands, so it must not claim
  // the crew has "finished".
  assert.match(GATE_CHIP_LABEL.toLowerCase(), /signed out/);
  assert.doesNotMatch(GATE_CHIP_LABEL.toLowerCase(), /finished|done/);
  assert.equal(GATE_BUTTON_LABEL, "Continue with Google");
  assert.ok(GATE_FOOTNOTE.startsWith("Free"));
});
