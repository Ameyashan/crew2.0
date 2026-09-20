import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeEmployerName,
  rollupStats,
  currentFiscalYear,
  isRecentTrackRecord,
  evidenceFromStats,
  visaScoreBoost,
  type FyRecord,
} from "./normalize.ts";

test("normalizeEmployerName collapses legal-name noise", () => {
  assert.equal(normalizeEmployerName("STRIPE, INC"), "stripe");
  assert.equal(normalizeEmployerName("Stripe"), "stripe");
  assert.equal(normalizeEmployerName("SCALE AI INC"), "scale ai");
  assert.equal(normalizeEmployerName("Datadog, Inc."), "datadog");
  assert.equal(normalizeEmployerName("THE GOLDMAN SACHS GROUP INC"), "goldman sachs");
  assert.equal(normalizeEmployerName("Procter & Gamble Co"), "procter and gamble");
  // Suffix stripping repeats but never empties a single-token name.
  assert.equal(normalizeEmployerName("ACME CORP LLC"), "acme");
  assert.equal(normalizeEmployerName("Inc"), "inc");
  // Ambiguous mid-name tokens are NOT stripped — LLM tier's job.
  assert.equal(normalizeEmployerName("Palantir Technologies Inc"), "palantir technologies");
});

const rec = (fy: number, ia = 0, id = 0, ca = 0, cd = 0): FyRecord => ({
  fiscal_year: fy,
  initial_approvals: ia,
  initial_denials: id,
  continuing_approvals: ca,
  continuing_denials: cd,
});

test("rollupStats aggregates rows per FY and computes the rollup", () => {
  const stats = rollupStats([
    rec(2024, 100, 5, 200, 10), // two worksites, same FY
    rec(2024, 50, 0, 30, 0),
    rec(2025, 80, 2, 120, 12),
  ]);
  assert.deepEqual(stats.by_fy["2024"], {
    initial_approvals: 150,
    initial_denials: 5,
    continuing_approvals: 230,
    continuing_denials: 10,
  });
  assert.equal(stats.last_filed_fy, 2025);
  assert.equal(stats.recent_filed, 80 + 2 + 120 + 12);
  // rate over the (≤3) filed FYs: approvals / all decisions
  const approvals = 150 + 230 + 80 + 120;
  const decisions = approvals + 5 + 10 + 2 + 12;
  assert.equal(stats.approval_rate, approvals / decisions);
});

test("rollupStats: zero-decision FYs don't count as filings; tiny samples get no rate", () => {
  const empty = rollupStats([rec(2024)]);
  assert.equal(empty.last_filed_fy, null);
  assert.equal(empty.recent_filed, 0);
  assert.equal(empty.approval_rate, null);

  const tiny = rollupStats([rec(2025, 2, 1)]);
  assert.equal(tiny.last_filed_fy, 2025);
  assert.equal(tiny.approval_rate, null); // 3 decisions < min sample
});

test("currentFiscalYear starts Oct 1", () => {
  assert.equal(currentFiscalYear(new Date("2026-08-23T00:00:00Z")), 2026);
  assert.equal(currentFiscalYear(new Date("2026-10-01T00:00:00Z")), 2027);
  assert.equal(currentFiscalYear(new Date("2026-09-30T23:59:59Z")), 2026);
});

test("isRecentTrackRecord / evidenceFromStats gate on the recent-FY window", () => {
  const now = new Date("2026-08-23T00:00:00Z"); // FY2026
  const current = rollupStats([rec(2025, 200, 4, 300, 6)]);
  assert.equal(isRecentTrackRecord(current, now), true);
  assert.deepEqual(evidenceFromStats(current, now), {
    recent_filed: 510,
    recent_fy: 2025,
    approval_rate: (200 + 300) / 510,
  });

  // FY2024 is exactly at the edge of the 2-FY window → still current.
  assert.equal(isRecentTrackRecord(rollupStats([rec(2024, 10, 0, 5, 0)]), now), true);
  // FY2019 filings are stale — history kept, chip falls back to JD-parse.
  const stale = rollupStats([rec(2019, 500, 10, 400, 20)]);
  assert.equal(isRecentTrackRecord(stale, now), false);
  assert.equal(evidenceFromStats(stale, now), null);
  assert.equal(evidenceFromStats(null, now), null);
});

test("visaScoreBoost orders verified > likely > everything else", () => {
  assert.equal(visaScoreBoost("sponsors_verified"), 6);
  assert.equal(visaScoreBoost("likely_sponsors"), 3);
  assert.equal(visaScoreBoost("unclear"), 0);
  assert.equal(visaScoreBoost("no_sponsorship"), 0);
  assert.equal(visaScoreBoost(null), 0);
});
