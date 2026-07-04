import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TOP_NAV,
  nameFromEmail,
  isNavActive,
  avatarBg,
  avatarInitial,
  crewChip,
  AVATAR_BG,
  type RunLite,
} from "./top-bar-logic.ts";

test("TOP_NAV is exactly Desk/Jobs/Story/People with Story→/app/resume", () => {
  assert.deepEqual(
    TOP_NAV.map((n) => n.label),
    ["Desk", "Jobs", "Story", "People"],
  );
  // Today / Settings / History are intentionally absent from the pill row.
  assert.equal(
    TOP_NAV.some((n) => ["Today", "Settings", "History"].includes(n.label)),
    false,
  );
  assert.equal(TOP_NAV.find((n) => n.id === "story")?.href, "/app/resume");
  assert.equal(TOP_NAV.find((n) => n.id === "desk")?.href, "/app/compose");
});

test("nameFromEmail titlecases the local-part on dot/underscore/dash", () => {
  assert.equal(nameFromEmail("ameya.shanbhag@gmail.com"), "Ameya Shanbhag");
  assert.equal(nameFromEmail("jane_doe@x.io"), "Jane Doe");
  assert.equal(nameFromEmail("a-b-c@x.io"), "A B C");
  assert.equal(nameFromEmail(""), "");
  assert.equal(nameFromEmail(null), "");
  assert.equal(nameFromEmail(undefined), "");
});

test("isNavActive matches on route prefix, incl. nested routes", () => {
  assert.equal(isNavActive("/app/jobs", "/app/jobs"), true);
  assert.equal(isNavActive("/app/jobs/123", "/app/jobs"), true);
  assert.equal(isNavActive("/app/compose", "/app/jobs"), false);
  assert.equal(isNavActive(null, "/app/jobs"), false);
  assert.equal(isNavActive(undefined, "/app/jobs"), false);
});

test("avatarBg is deterministic and drawn from the palette", () => {
  const a = avatarBg("ameya@gmail.com");
  assert.equal(a, avatarBg("ameya@gmail.com"));
  assert.ok(AVATAR_BG.includes(a));
  // Different seeds generally land on palette entries too.
  assert.ok(AVATAR_BG.includes(avatarBg("")));
  assert.ok(AVATAR_BG.includes(avatarBg("z")));
});

test("avatarInitial returns one uppercase glyph, with a fallback", () => {
  assert.equal(avatarInitial("Ameya Shanbhag"), "A");
  assert.equal(avatarInitial("  jane"), "J");
  assert.equal(avatarInitial(""), "?");
});

test("crewChip: null when nothing is running or errored", () => {
  assert.equal(crewChip([]), null);
  const done: RunLite[] = [{ stage: "done", kind: "job" }];
  assert.equal(crewChip(done), null);
});

test("crewChip: green 'crew running' while anything is working/parsing", () => {
  const runs: RunLite[] = [
    { stage: "done", kind: "job" },
    { stage: "working", kind: "job" },
  ];
  const chip = crewChip(runs);
  assert.deepEqual(chip, { tone: "active", label: "crew running", target: "/app/compose" });
});

test("crewChip: parsing counts as active too", () => {
  assert.equal(crewChip([{ stage: "parsing", kind: "person" }])?.tone, "active");
});

test("crewChip: amber 'needs you' when only errored runs remain", () => {
  const chip = crewChip([{ stage: "error", kind: "job" }]);
  assert.deepEqual(chip, { tone: "attention", label: "needs you", target: "/app/compose" });
});

test("crewChip: resume-only focus targets /app/resume", () => {
  assert.equal(crewChip([{ stage: "working", kind: "resume" }])?.target, "/app/resume");
  // A mixed active set still lands on compose (richest progress view).
  assert.equal(
    crewChip([
      { stage: "working", kind: "resume" },
      { stage: "working", kind: "job" },
    ])?.target,
    "/app/compose",
  );
  // Errored resume-only run also routes to resume.
  assert.equal(crewChip([{ stage: "error", kind: "resume" }])?.target, "/app/resume");
});

test("crewChip: active runs win over errored ones for tone and target", () => {
  const runs: RunLite[] = [
    { stage: "error", kind: "resume" },
    { stage: "working", kind: "job" },
  ];
  const chip = crewChip(runs);
  assert.equal(chip?.tone, "active");
  // Focus is the active (job) run, so compose — the errored resume is ignored for routing.
  assert.equal(chip?.target, "/app/compose");
});
