import { test } from "node:test";
import assert from "node:assert/strict";
import { trackHeader, dateRange } from "./display.ts";

const entry = { role: "Product Manager", start: "Aug 2019", end: "Aug 2021" };

test("a lone stint drops dates that just repeat the employer's tenure", () => {
  const h = trackHeader(entry, { title: "Agile Product Lead", start: "Aug 2019", end: "Aug 2021", bullets: [] }, true);
  assert.equal(h.dates, "");
  assert.equal(h.title, "Agile Product Lead");
  assert.equal(h.show, true);
});

test("a lone stint drops a title prefix that repeats the employer's role", () => {
  const h = trackHeader(entry, { title: "Product Manager, Agile Product Lead", start: "Aug 2019", end: "Aug 2021", bullets: [] }, true);
  assert.equal(h.title, "Agile Product Lead");
  assert.equal(h.dates, "");
});

test("a lone stint identical to the employer line renders no header at all", () => {
  const h = trackHeader(entry, { title: "Product Manager", start: "Aug 2019", end: "Aug 2021", bullets: [] }, true);
  assert.deepEqual(h, { title: "", dates: "", show: false });
});

test("a lone stint that genuinely differs keeps its dates", () => {
  // Someone who spent part of a tenure on one thing still needs the range shown.
  const h = trackHeader(entry, { title: "Agile Product Lead", start: "Jan 2020", end: "Aug 2021", bullets: [] }, true);
  assert.equal(h.dates, "Jan 2020 – Aug 2021");
});

test("a multi-stint employer always keeps every stint's dates", () => {
  // Here the dates ARE the point: they're what turns three blocks into a
  // progression rather than three unrelated things.
  const h = trackHeader(entry, { title: "Product Manager", start: "Aug 2019", end: "Aug 2021", bullets: [] }, false);
  assert.equal(h.title, "Product Manager");
  assert.equal(h.dates, "Aug 2019 – Aug 2021");
  assert.equal(h.show, true);
});

test("dateRange joins only what exists", () => {
  assert.equal(dateRange("2021", "Present"), "2021 – Present");
  assert.equal(dateRange(undefined, "2019"), "2019");
  assert.equal(dateRange(), "");
});
