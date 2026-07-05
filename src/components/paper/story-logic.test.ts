import { test } from "node:test";
import assert from "node:assert/strict";
import {
  entryView,
  groupByTheme,
  storyIsEmpty,
  entryWhen,
  UNTAGGED_THEME,
} from "./story-logic.ts";

test("entryView maps status → the four prototype render branches", () => {
  assert.deepEqual(entryView({ id: "1", raw: "x", status: "raw" }), {
    isPending: false,
    isProposed: false,
    isPolished: false,
    hasBullet: false,
  });
  assert.deepEqual(entryView({ id: "2", raw: "x", status: "pending" }), {
    isPending: true,
    isProposed: false,
    isPolished: false,
    hasBullet: false,
  });
  assert.deepEqual(entryView({ id: "3", raw: "x", status: "proposed", bullet: "Led a team" }), {
    isPending: false,
    isProposed: true,
    isPolished: false,
    hasBullet: true,
  });
  assert.deepEqual(entryView({ id: "4", raw: "x", status: "polished", bullet: "Shipped it" }), {
    isPending: false,
    isProposed: false,
    isPolished: true,
    hasBullet: true,
  });
});

test("entryView: proposed/polished need an actual bullet to render", () => {
  // A proposed status with no bullet shouldn't paint the empty amber card.
  assert.equal(entryView({ id: "1", raw: "x", status: "proposed", bullet: "" }).isProposed, false);
  assert.equal(entryView({ id: "2", raw: "x", status: "proposed", bullet: null }).isProposed, false);
  assert.equal(entryView({ id: "3", raw: "x", status: "polished", bullet: "   " }).isPolished, false);
});

test("entryView defaults to raw when status is missing/unknown", () => {
  const v = entryView({ id: "1", raw: "x" });
  assert.deepEqual(v, { isPending: false, isProposed: false, isPolished: false, hasBullet: false });
});

test("groupByTheme buckets by tag, largest first, ties alphabetical, Other last", () => {
  const entries = [
    { id: "a", raw: "a", tags: ["growth", "sales"] },
    { id: "b", raw: "b", tags: ["growth"] },
    { id: "c", raw: "c", tags: ["design"] },
    { id: "d", raw: "d", tags: [] },
  ];
  const themes = groupByTheme(entries);
  assert.deepEqual(
    themes.map((t) => t.name),
    ["growth", "design", "sales", UNTAGGED_THEME],
  );
  // growth has 2 items (a + b), and is largest → first.
  assert.deepEqual(themes[0].items.map((e) => e.id), ["a", "b"]);
  // Untagged entry lands in the trailing "other" bucket.
  assert.deepEqual(themes[3].items.map((e) => e.id), ["d"]);
});

test("groupByTheme normalises tag case/whitespace and dedups within an entry", () => {
  const themes = groupByTheme([{ id: "a", raw: "a", tags: [" Growth ", "growth", "GROWTH"] }]);
  assert.equal(themes.length, 1);
  assert.equal(themes[0].name, "growth");
  assert.deepEqual(themes[0].items.map((e) => e.id), ["a"]);
});

test("groupByTheme preserves the caller's entry order within a theme", () => {
  const themes = groupByTheme([
    { id: "1", raw: "1", tags: ["infra"] },
    { id: "2", raw: "2", tags: ["infra"] },
    { id: "3", raw: "3", tags: ["infra"] },
  ]);
  assert.deepEqual(themes[0].items.map((e) => e.id), ["1", "2", "3"]);
});

test("groupByTheme tolerates empty / missing input", () => {
  assert.deepEqual(groupByTheme([]), []);
  assert.deepEqual(groupByTheme(null), []);
  assert.deepEqual(groupByTheme(undefined), []);
});

test("storyIsEmpty: entry count wins, else resume_text fallback", () => {
  // Has entries → not empty regardless of resume.
  assert.equal(storyIsEmpty(3, null), false);
  assert.equal(storyIsEmpty(1, { resume_text: "" }), false);
  // No entries → fall back to resume text.
  assert.equal(storyIsEmpty(0, { resume_text: "Senior PM…" }), false);
  assert.equal(storyIsEmpty(0, { resume_text: "" }), true);
  assert.equal(storyIsEmpty(0, null), true);
  // Unknown count (null/undefined) → resume fallback only.
  assert.equal(storyIsEmpty(null, { resume_text: "x" }), false);
  assert.equal(storyIsEmpty(undefined, null), true);
});

test("entryWhen renders deterministic day-granular relative times", () => {
  const now = new Date("2026-07-05T12:00:00Z").getTime();
  assert.equal(entryWhen(null, now), "");
  assert.equal(entryWhen("not-a-date", now), "");
  assert.equal(entryWhen("2026-07-05T09:00:00Z", now), "today");
  assert.equal(entryWhen("2026-07-04T09:00:00Z", now), "1d ago");
  assert.equal(entryWhen("2026-06-30T12:00:00Z", now), "5d ago");
  // ≥30 days → a locale date string, not "Nd ago".
  assert.notEqual(entryWhen("2026-01-01T12:00:00Z", now), "");
  assert.ok(!/ago/.test(entryWhen("2026-01-01T12:00:00Z", now)));
});
