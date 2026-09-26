import { test } from "node:test";
import assert from "node:assert/strict";
import { titleWords, titleFilterOr, titleMatches, isNewListing, BASELINE_GRACE_MS } from "./tracker-match.ts";

test("titleWords drops stop words, single letters and unsafe characters", () => {
  assert.deepEqual(titleWords("head of product"), ["head", "product"]);
  assert.deepEqual(titleWords("ml engineer"), ["ml", "engineer"]);
  assert.deepEqual(titleWords("c++ developer"), ["c++", "developer"]);
  assert.deepEqual(titleWords("r&d (lead), x"), ["rd", "lead"]);
  assert.deepEqual(titleWords("product product manager"), ["product", "manager"]);
});

test("titleFilterOr ANDs a term's words and ORs the terms", () => {
  assert.equal(titleFilterOr(["designer"]), "title.ilike.%designer%");
  assert.equal(
    titleFilterOr(["product manager", "designer"]),
    "and(title.ilike.%product%,title.ilike.%manager%),title.ilike.%designer%",
  );
  assert.equal(titleFilterOr([]), null);
  assert.equal(titleFilterOr(["of"]), null);
});

test("titleMatches is order-free and anchored to word starts", () => {
  const pm = ["product manager"];
  assert.equal(titleMatches("Senior Product Manager", pm), true);
  assert.equal(titleMatches("Manager, Product (Payments)", pm), true);
  assert.equal(titleMatches("Product Designer", pm), false);
  assert.equal(titleMatches("Engineering Manager", ["engineer"]), true);
  assert.equal(titleMatches("Maintenance Technician", ["ai"]), false);
  assert.equal(titleMatches("AI Researcher", ["ai"]), true);
  assert.equal(titleMatches("Staff ML Engineer", ["software engineer", "ml engineer"]), true);
});

test("titleMatches with no usable terms passes every title", () => {
  assert.equal(titleMatches("Anything", []), true);
  assert.equal(titleMatches("Anything", ["of"]), true);
});

test("isNewListing excludes old rows and the company's initial import", () => {
  const now = Date.parse("2026-09-26T12:00:00Z");
  const since = now - 86_400_000;
  const baseline = "2026-09-20T00:00:00Z";
  assert.equal(isNewListing("2026-09-26T10:00:00Z", since, baseline), true);
  assert.equal(isNewListing("2026-09-24T10:00:00Z", since, baseline), false);
  // Company first fetched an hour ago: its whole board was imported together.
  const freshBase = "2026-09-26T11:00:00Z";
  assert.equal(isNewListing("2026-09-26T11:00:05Z", since, freshBase), false);
  const later = new Date(Date.parse(freshBase) + BASELINE_GRACE_MS + 1).toISOString();
  assert.equal(isNewListing(later, since, freshBase), true);
  assert.equal(isNewListing("2026-09-26T10:00:00Z", since, null), true);
});
