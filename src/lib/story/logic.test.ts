import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STORY_STATUSES,
  isStoryStatus,
  STORY_VIEWS,
  storyWhen,
  groupByTheme,
  extractStorySeeds,
  MAX_SEED_ENTRIES,
} from "./logic.ts";

// ── Status guard ─────────────────────────────────────────────────────────────
test("STORY_STATUSES + isStoryStatus cover exactly the four states", () => {
  assert.deepEqual([...STORY_STATUSES], ["pending", "proposed", "polished", "raw"]);
  for (const s of STORY_STATUSES) assert.equal(isStoryStatus(s), true);
  assert.equal(isStoryStatus("approved"), false);
  assert.equal(isStoryStatus(null), false);
  assert.equal(isStoryStatus(3), false);
});

test("STORY_VIEWS is the timeline / themes toggle", () => {
  assert.deepEqual(
    STORY_VIEWS.map((v) => v.id),
    ["timeline", "themes"],
  );
  assert.deepEqual(
    STORY_VIEWS.map((v) => v.label),
    ["Timeline", "By theme"],
  );
});

// ── Relative when ────────────────────────────────────────────────────────────
test("storyWhen renders relative ages against an injected clock", () => {
  const now = Date.parse("2026-07-05T12:00:00Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();
  const DAY = 86_400_000;
  assert.equal(storyWhen(ago(0), now), "just now");
  assert.equal(storyWhen(ago(30 * 60_000), now), "just now"); // <1h
  assert.equal(storyWhen(ago(3 * 3_600_000), now), "3h ago");
  assert.equal(storyWhen(ago(DAY), now), "1d ago");
  assert.equal(storyWhen(ago(5 * DAY), now), "5d ago");
  assert.equal(storyWhen(ago(400 * DAY), now), new Date(now - 400 * DAY).toISOString().slice(0, 10));
  assert.equal(storyWhen(null, now), "");
  assert.equal(storyWhen("not-a-date", now), "");
});

// ── Theme grouping ───────────────────────────────────────────────────────────
test("groupByTheme buckets by tag, multi-tag entries repeat, untagged pinned last", () => {
  const entries = [
    { id: "a", tags: ["backend", "scale"] },
    { id: "b", tags: ["leadership"] },
    { id: "c", tags: [] },
    { id: "d", tags: ["backend"] },
  ];
  const themes = groupByTheme(entries);
  assert.deepEqual(
    themes.map((t) => t.name),
    ["backend", "leadership", "scale", "untagged"],
  );
  assert.deepEqual(
    themes.find((t) => t.name === "backend")!.items.map((e) => e.id),
    ["a", "d"],
  );
  assert.deepEqual(themes.find((t) => t.name === "scale")!.items.map((e) => e.id), ["a"]);
  assert.deepEqual(themes.find((t) => t.name === "untagged")!.items.map((e) => e.id), ["c"]);
});

test("groupByTheme returns [] for no entries and handles null tags", () => {
  assert.deepEqual(groupByTheme([]), []);
  const themes = groupByTheme([{ id: "x", tags: null }]);
  assert.deepEqual(themes.map((t) => t.name), ["untagged"]);
});

// ── Resume → seeds ───────────────────────────────────────────────────────────
const SAMPLE_RESUME = `Jane Doe
jane.doe@example.com · (415) 555-0199 · linkedin.com/in/janedoe

PROFESSIONAL EXPERIENCE

Staff Engineer, Ramp — 2021–present
• Led the billing migration that cut p95 latency by 40% across the platform.
• Mentored four engineers and ran the backend guild's weekly design reviews.
1. Shipped a fraud-detection service handling 2M events per day in real time.

SKILLS
Python, Go, PostgreSQL, Kubernetes

EDUCATION
B.S. Computer Science, UC Berkeley, 2017`;

test("extractStorySeeds pulls accomplishment lines, drops headers/contact/short lines", () => {
  const seeds = extractStorySeeds(SAMPLE_RESUME);
  assert.equal(
    seeds.includes("Led the billing migration that cut p95 latency by 40% across the platform."),
    true,
  );
  assert.equal(
    seeds.includes("Mentored four engineers and ran the backend guild's weekly design reviews."),
    true,
  );
  assert.equal(
    seeds.includes("Shipped a fraud-detection service handling 2M events per day in real time."),
    true,
  );
  // noise is excluded
  assert.equal(seeds.some((s) => s.includes("@example.com")), false);
  assert.equal(seeds.includes("PROFESSIONAL EXPERIENCE"), false);
  assert.equal(seeds.includes("SKILLS"), false);
  assert.equal(seeds.includes("Python, Go, PostgreSQL, Kubernetes"), true); // 4 words, reads like a line
  // bullet glyphs and numbering are stripped from the front
  assert.equal(seeds.every((s) => !/^[•·*\-\d]/.test(s)), true);
});

test("extractStorySeeds dedupes and caps at max", () => {
  assert.deepEqual(extractStorySeeds(null), []);
  assert.deepEqual(extractStorySeeds(""), []);
  const dupes = "Built the thing that scaled to a million users overnight.\n".repeat(5);
  assert.equal(extractStorySeeds(dupes).length, 1);
  const many = Array.from({ length: 30 }, (_, i) => `Built version ${i} of the platform that shipped to production.`).join("\n");
  assert.equal(extractStorySeeds(many).length, MAX_SEED_ENTRIES);
  assert.equal(extractStorySeeds(many, 3).length, 3);
});
