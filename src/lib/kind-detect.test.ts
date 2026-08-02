import { test } from "node:test";
import assert from "node:assert/strict";

import { classifyKind, detectKind, firstUrl } from "./kind-detect.ts";

test("prose 'find me people…' is NOT a job even when it says 'hiring'", () => {
  // The exact shape that used to misroute to Apply: the word "hiring" appears,
  // but there's no posting link — this is a people search.
  const q =
    "Can you find me people at Macy's who would be hiring for business analyst " +
    "supply chain roles? Like someone in inventory management, transportation analytics";
  assert.equal(classifyKind(q), "fuzzy");
  assert.equal(detectKind(q), "person");
});

test("job keywords still route to job when a real link is present", () => {
  assert.equal(classifyKind("Apply to this job: https://acme.com/roles/123"), "job");
  assert.equal(classifyKind("hiring — acme.com/careers/eng"), "job");
});

test("board / careers URLs stay job regardless of keywords", () => {
  assert.equal(classifyKind("https://boards.greenhouse.io/acme/jobs/456"), "job");
  assert.equal(classifyKind("acme.recruitee.com/o/analyst"), "job");
  assert.equal(classifyKind("https://acme.com/careers/analyst"), "job");
});

test("profile links stay person", () => {
  assert.equal(classifyKind("https://linkedin.com/in/maya-rao"), "person");
});

test("firstUrl extracts a link but returns null for plain prose", () => {
  assert.equal(firstUrl("find me people at Macy's who are hiring"), null);
  assert.equal(firstUrl("Apply to this job: https://acme.com/x"), "https://acme.com/x");
  // Bare domains get a scheme so the apply flow can fetch them.
  assert.equal(firstUrl("acme.recruitee.com/o/role"), "https://acme.recruitee.com/o/role");
  // A possessive with no dot/slash must never be mistaken for a host.
  assert.equal(firstUrl("Macy's supply chain team"), null);
});
