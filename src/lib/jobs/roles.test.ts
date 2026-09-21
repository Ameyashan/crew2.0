import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeRoleTitle, roleTitleTerms } from "./roles.ts";

test("normalizeRoleTitle splits camelCase and separators into a lowercase phrase", () => {
  assert.equal(normalizeRoleTitle("ProductManager"), "product manager");
  assert.equal(normalizeRoleTitle("product_manager"), "product manager");
  assert.equal(normalizeRoleTitle("Product-Manager"), "product manager");
  assert.equal(normalizeRoleTitle("  Data   Scientist "), "data scientist");
  assert.equal(normalizeRoleTitle("MLEngineer"), "mlengineer");
});

test("roleTitleTerms prefers explicit target roles in 'different' mode", () => {
  assert.deepEqual(roleTitleTerms("different", ["ProductManager"], "Business Analyst"), ["product manager"]);
});

test("roleTitleTerms falls back to the current role otherwise", () => {
  assert.deepEqual(roleTitleTerms("current", [], "Business Analyst"), ["business analyst"]);
  assert.deepEqual(roleTitleTerms(null, [], "Business Analyst"), ["business analyst"]);
  assert.deepEqual(roleTitleTerms("different", [], "Business Analyst"), ["business analyst"]);
});

test("roleTitleTerms dedupes and returns empty with no signal", () => {
  assert.deepEqual(roleTitleTerms("different", ["ProductManager", "product_manager"], null), ["product manager"]);
  assert.deepEqual(roleTitleTerms(null, [], null), []);
});

test("roleTitleTerms strips query-unsafe characters and drops too-short terms", () => {
  assert.deepEqual(roleTitleTerms("different", ["Product%Manager,(test)"], null), ["product manager test"]);
  // "pm" would substring-match "development" via ilike, so it is dropped.
  assert.deepEqual(roleTitleTerms("different", ["PM"], null), []);
});
