import { test } from "node:test";
import assert from "node:assert/strict";
import { roleCore, mergeContacts, sortContacts, linkedinKey, type JobContact } from "./contacts-logic.ts";

const c = (p: Partial<JobContact>): JobContact => ({
  key: p.name ?? "x",
  kind: "peer",
  name: "x",
  role: null,
  linkedin: null,
  why: null,
  sources: ["web"],
  connected: false,
  note: null,
  ...p,
});

test("roleCore strips level words, team suffixes and parentheticals", () => {
  assert.equal(roleCore("Senior Software Engineer II, Payments (Remote)"), "software engineer");
  assert.equal(roleCore("Staff Product Manager - Growth"), "product manager");
  assert.equal(roleCore("Vice President, Quantitative Strategist"), "vice president");
  assert.equal(roleCore("Data Scientist"), "data scientist");
});

test("linkedin handle key", () => {
  assert.equal(linkedinKey("https://www.linkedin.com/in/Priya-R/?x=1"), "priya-r");
  assert.equal(linkedinKey(null), null);
});

test("merge collapses the same person across sources and keeps connected", () => {
  const merged = mergeContacts([
    [c({ name: "Priya Raman", kind: "hiring_manager", linkedin: "https://linkedin.com/in/priyaraman", sources: ["web"] })],
    [c({ name: "Priya Raman", kind: "hiring_manager", role: "Director", sources: ["apollo"] })],
    [c({ name: "priya raman", kind: "connection", connected: true, sources: ["connections"] })],
    [c({ name: "Dan Lee", kind: "recruiter", sources: ["apollo"] })],
  ]);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged[0].sources, ["web", "apollo", "connections"]);
  assert.equal(merged[0].connected, true);
  assert.equal(merged[0].role, "Director");
  const sorted = sortContacts([c({ name: "P", kind: "peer" }), c({ name: "R", kind: "recruiter" }), c({ name: "K", kind: "peer", connected: true })]);
  assert.deepEqual(sorted.map((x) => x.name), ["K", "R", "P"]);
});

test("clampNote keeps notes under LinkedIn's 300-char cap at a clean boundary", async () => {
  const { clampNote } = await import("./contacts-logic.ts");
  assert.equal(clampNote("short"), "short");
  const long = "I led the payments rebuild at Acme and cut failures by 40%. ".repeat(6) + "Would you be open to a quick question about the team?";
  const out = clampNote(long);
  assert.ok(out.length <= 300);
  assert.ok(out.endsWith("."));
  const words = clampNote("word ".repeat(100));
  assert.ok(words.length <= 300 && words.endsWith("…"));
});
