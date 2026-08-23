import { test } from "node:test";
import assert from "node:assert/strict";
import { lintAntiAi, stripEmDashes } from "./anti-ai.ts";

const kinds = (s: string) => lintAntiAi(s).map((v) => v.kind);

// The wordlist rule only ever caught abstract participles ("…, underscoring our
// commitment"). Real resume padding sounds concrete, so these are the cases that
// matter. All three are lifted from a real resume.
test("flags a trailing '-ing' clause that carries no figure", () => {
  assert.ok(
    kinds("Led two agile teams in end-to-end delivery, driving execution through backlog refinement.")
      .includes("participle-ending"),
  );
  assert.ok(
    kinds("Consolidated fragmented tools into a platform, achieving record-high user engagement.")
      .includes("participle-ending"),
  );
});

test("looks at the LAST clause, not the first", () => {
  // The tail banks its number early, then pads. Checking only the first clause
  // would call this clean.
  assert.ok(
    kinds(
      "Launched an analytics dashboard, improving processing speed by 20% through parallel processing and enabling real-time decision-making.",
    ).includes("participle-ending"),
  );
});

test("a trailing clause with a real figure earns its place", () => {
  assert.deepEqual(
    kinds("Prototyped a Python scenario engine, cutting runtime from 45 minutes to under 20 seconds."),
    [],
  );
});

test("'including' and friends introduce a list, not padding", () => {
  assert.deepEqual(
    kinds("Owned reporting across three regions, including North America, EMEA and APAC."),
    [],
  );
});

test("a bullet that ends on its result is clean", () => {
  assert.deepEqual(
    kinds("Drove reporting automation from 65% to 97% and cut delivery timelines by 17 days."),
    [],
  );
});

test("still catches the original tells", () => {
  assert.ok(kinds("Shipped it, underscoring our commitment to quality.").includes("participle-ending"));
  assert.ok(kinds("Rebuilt the pipeline — it was slow.").includes("em-dash"));
  assert.ok(kinds("We leverage AI to do this.").includes("word"));
});

test("stripEmDashes keeps numeric ranges but commas the rest", () => {
  assert.equal(
    stripEmDashes("a competitive differentiator—achieving record engagement"),
    "a competitive differentiator, achieving record engagement",
  );
  assert.equal(stripEmDashes("introduced dashboards, standups—to deliver"), "introduced dashboards, standups, to deliver");
  assert.equal(stripEmDashes("2021—2024"), "2021 – 2024");
  assert.equal(stripEmDashes("no dashes at all"), "no dashes at all");
});
