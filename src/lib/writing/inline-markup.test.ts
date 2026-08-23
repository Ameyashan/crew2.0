import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInlineBold, stripInlineBold, sanitizeInlineBold } from "./inline-markup.ts";

test("parseInlineBold splits a bullet into plain and bold spans", () => {
  assert.deepEqual(
    parseInlineBold("Drove **automation from 65% to 97%** across teams."),
    [
      { text: "Drove ", bold: false },
      { text: "automation from 65% to 97%", bold: true },
      { text: " across teams.", bold: false },
    ],
  );
});

test("parseInlineBold handles two spans and a bolded lead phrase", () => {
  const spans = parseInlineBold("**Spearheaded Polaris**, cutting runtime to **20 seconds**.");
  assert.deepEqual(
    spans.filter((s) => s.bold).map((s) => s.text),
    ["Spearheaded Polaris", "20 seconds"],
  );
  assert.equal(spans[0].bold, true);
});

test("parseInlineBold drops an unmatched marker instead of printing it", () => {
  assert.deepEqual(parseInlineBold("Cut runtime **by half"), [
    { text: "Cut runtime by half", bold: false },
  ]);
});

test("parseInlineBold never lets a bold span cross a line break", () => {
  // An unterminated marker on one line must not swallow the next line.
  assert.deepEqual(parseInlineBold("first **line\nsecond** line"), [
    { text: "first line\nsecond line", bold: false },
  ]);
});

test("stripInlineBold returns plain text for the linter and the changelog", () => {
  assert.equal(
    stripInlineBold("Drove **automation from 65% to 97%** across teams."),
    "Drove automation from 65% to 97% across teams.",
  );
  assert.equal(stripInlineBold("no markup here"), "no markup here");
});

test("sanitizeInlineBold keeps at most two emphasis spans", () => {
  const out = sanitizeInlineBold("**a** and **b** and **c** and **d**");
  assert.equal(out, "**a** and **b** and c and d");
  assert.equal(parseInlineBold(out).filter((s) => s.bold).length, 2);
});

test("sanitizeInlineBold refuses to bold a whole fragment", () => {
  // Bolding everything is the same as bolding nothing, and it wrecks the page.
  assert.equal(sanitizeInlineBold("**Led two agile teams of 25+**"), "Led two agile teams of 25+");
});

test("sanitizeInlineBold drops emphasis with no word in it", () => {
  assert.equal(sanitizeInlineBold("shipped it **—** fast"), "shipped it — fast");
});

test("sanitizeInlineBold leaves clean copy untouched", () => {
  const s = "Cut delivery timelines by **17 days** by closing process gaps.";
  assert.equal(sanitizeInlineBold(s), s);
});

test("an asterisk in ordinary prose survives round-tripping", () => {
  assert.equal(stripInlineBold("rated 4.5 * out of 5"), "rated 4.5 * out of 5");
});
