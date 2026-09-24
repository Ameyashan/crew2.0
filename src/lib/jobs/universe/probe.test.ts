import { test } from "node:test";
import assert from "node:assert/strict";
import { slugVariants, sameCompanyName, workdayBelongsTo } from "./probe.ts";

test("slug variants: joined, hyphenated, core words", () => {
  assert.deepEqual(slugVariants("Palantir Technologies").slice(0, 3), [
    "palantirtechnologies",
    "palantir-technologies",
    "palantir",
  ]);
  assert.ok(slugVariants("Lowe’s").includes("lowes"));
});

test("board names: same core name, not a prefix", () => {
  assert.ok(sameCompanyName("Databricks", "Databricks"));
  assert.ok(sameCompanyName("Databricks, Inc.", "Databricks"));
  assert.ok(sameCompanyName("Palantir Technologies", "Palantir"));
  assert.ok(sameCompanyName("Scale AI", "Scale"));
  assert.ok(sameCompanyName("Lucid Motors", "Lucid USA"));
  assert.ok(sameCompanyName("Abnormal", "Abnormal Security"));
  assert.ok(!sameCompanyName("Relativity Space", "Relativity"));
  assert.ok(!sameCompanyName("Figure Lending", "Figure"));
  assert.ok(!sameCompanyName("Trade Republic Customer Council", "Trade Republic"));
  assert.ok(!sameCompanyName("Vast Space", "VAST Data"));
});

test("workday ownership: tenant name, distinctive word, or the board's own text", () => {
  // Tenant is the company.
  assert.ok(workdayBelongsTo("walmart", "", "Walmart"));
  // Tenant contains a distinctive name word.
  assert.ok(workdayBelongsTo("microchiphr", "", "Microchip Technology"));
  // Opaque tenant, but the site names the company.
  assert.ok(workdayBelongsTo("globalhr", "Join RTX and help defend…", "RTX"));
  assert.ok(workdayBelongsTo("athene", "Apollo Global Management is a…", "Apollo Global Management"));
  assert.ok(workdayBelongsTo("citi", "", "Citigroup"));
  assert.ok(workdayBelongsTo("att", "", "AT&T"));
  assert.ok(workdayBelongsTo("pg", "Procter & Gamble brands…", "Procter & Gamble"));
  assert.ok(workdayBelongsTo("mdlz", "At Mondelēz International we…", "Mondelez International"));
  // Collisions: a live board that belongs to someone else.
  assert.ok(!workdayBelongsTo("pfg", "Pattison Food Group is Western Canada's…", "Performance Food Group"));
  assert.ok(!workdayBelongsTo("fca", "The Financial Conduct Authority regulates…", "FCA US (Stellantis)"));
  // A generic first word alone is not evidence.
  assert.ok(!workdayBelongsTo("xyz", "Strong performance culture", "Performance Food Group"));
});
