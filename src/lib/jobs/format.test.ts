import { test } from "node:test";
import assert from "node:assert/strict";
import {
  relativePosted,
  visaBadge,
  visaLabelFull,
  sizeLabel,
  scoreTier,
  fitTier,
  fitColors,
  visaKind,
  visaChipLabel,
  visaChipColors,
  filedCount,
  visaEvidenceLine,
  postedAgo,
  compDisplay,
  goalPhrase,
  whyBullets,
  sourceHost,
  companyDomain,
  companyMonogram,
  jobPassesFilters,
  filterJobs,
  diversifyByCompany,
  NO_FILTERS,
  type FeedFilters,
} from "./format.ts";
import type { VisaConfidence } from "@/lib/jobs/types";

const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const DAY = 86_400_000;

// ── Existing formatters still hold ───────────────────────────────────────────
test("relativePosted keeps the Posted/Updated verb", () => {
  assert.equal(relativePosted(iso(3 * DAY), false), "Posted 3d ago");
  assert.equal(relativePosted(iso(3 * DAY), true), "Updated 3d ago");
  assert.equal(relativePosted(null, false), null);
});

test("visaBadge / visaLabelFull / sizeLabel / scoreTier unchanged", () => {
  assert.equal(visaBadge("likely_sponsors"), "likely sponsors");
  assert.equal(visaBadge("unclear"), null);
  assert.equal(visaLabelFull("likely_sponsors"), "Likely sponsors visas");
  assert.equal(visaLabelFull(null), "Visa sponsorship unclear");
  assert.equal(sizeLabel("startup"), "startup");
  assert.equal(sizeLabel(null), null);
  assert.equal(scoreTier(80), "high");
  assert.equal(scoreTier(50), "mid");
  assert.equal(scoreTier(49), "low");
});

// ── FIT tiers (prototype thresholds 85 / 75) ─────────────────────────────────
test("fitTier uses the prototype's 85 / 75 thresholds", () => {
  assert.equal(fitTier(100), "strong");
  assert.equal(fitTier(85), "strong");
  assert.equal(fitTier(84), "fair");
  assert.equal(fitTier(75), "fair");
  assert.equal(fitTier(74), "weak");
  assert.equal(fitTier(0), "weak");
});

test("fitColors returns the exact prototype hex pairs per tier", () => {
  assert.deepEqual(fitColors(90), { color: "#3d7a4f", border: "#bcd6c2" });
  assert.deepEqual(fitColors(78), { color: "#8a6d2f", border: "#e6d5ab" });
  assert.deepEqual(fitColors(40), { color: "#8b8171", border: "#ddd5c4" });
});

// ── Visa chip (three states; verified + JD-parse share the green) ────────────
test("visaKind collapses the data model into three prototype states", () => {
  assert.equal(visaKind("sponsors_verified"), "sponsors");
  assert.equal(visaKind("likely_sponsors"), "sponsors");
  assert.equal(visaKind("unclear"), "tbd");
  assert.equal(visaKind(null), "tbd");
  assert.equal(visaKind("no_sponsorship"), "none");
});

test("visaChipLabel + visaChipColors match the prototype", () => {
  assert.equal(visaChipLabel("likely_sponsors"), "SPONSORS VISA");
  assert.equal(visaChipLabel("sponsors_verified"), "SPONSORS VISA");
  assert.equal(visaChipLabel("unclear"), "VISA · TBD");
  assert.equal(visaChipLabel(null), "VISA · TBD");
  assert.deepEqual(visaChipColors("likely_sponsors"), { color: "#3d7a4f", bg: "#e9f1e9" });
  assert.deepEqual(visaChipColors(null), { color: "#8a6d2f", bg: "#f4ecda" });
});

test("visaChipLabel carries the USCIS evidence when present", () => {
  const evidence = { recent_filed: 214, recent_fy: 2025, approval_rate: 0.96 };
  assert.equal(visaChipLabel("sponsors_verified", evidence), "SPONSORS · 214 FILED FY25");
  assert.equal(
    visaChipLabel("sponsors_verified", { recent_filed: 9483, recent_fy: 2025, approval_rate: null }),
    "SPONSORS · 9.5K FILED FY25",
  );
  // Evidence never upgrades a non-positive chip, and zero counts fall back.
  assert.equal(visaChipLabel("unclear", evidence), "VISA · TBD");
  assert.equal(visaChipLabel("sponsors_verified", { recent_filed: 0, recent_fy: 2025, approval_rate: null }), "SPONSORS VISA");
  assert.equal(visaChipLabel("sponsors_verified", null), "SPONSORS VISA");
});

test("filedCount compacts chip numbers", () => {
  assert.equal(filedCount(214), "214");
  assert.equal(filedCount(999), "999");
  assert.equal(filedCount(1499), "1.5K");
  assert.equal(filedCount(9483), "9.5K");
  assert.equal(filedCount(12400), "12K");
});

test("visaEvidenceLine spells out the track record for the detail view", () => {
  assert.equal(
    visaEvidenceLine({ recent_filed: 214, recent_fy: 2025, approval_rate: 0.957 }),
    "214 H-1B petitions decided in FY2025 · 96% approved · USCIS Employer Data Hub",
  );
  assert.equal(
    visaEvidenceLine({ recent_filed: 1, recent_fy: 2024, approval_rate: null }),
    "1 H-1B petition decided in FY2024 · USCIS Employer Data Hub",
  );
  assert.equal(visaEvidenceLine(null), null);
  assert.equal(visaEvidenceLine({ recent_filed: 0, recent_fy: 2024, approval_rate: null }), null);
});

// ── postedAgo (bare relative, honest ~ for approx) ───────────────────────────
test("postedAgo drops the verb and marks approximate dates with ~", () => {
  assert.equal(postedAgo(iso(3 * DAY), false), "3d ago");
  assert.equal(postedAgo(iso(3 * DAY), true), "~3d ago");
  assert.equal(postedAgo(iso(30 * 60_000), false), "today"); // <1h
  assert.equal(postedAgo(iso(-1000), false), "just now"); // future clock skew
  assert.equal(postedAgo(iso(400 * DAY), false), "13mo ago");
  assert.equal(postedAgo(null, false), null);
});

// ── Compensation ─────────────────────────────────────────────────────────────
test("compDisplay flags listed vs undisclosed comp", () => {
  assert.deepEqual(compDisplay("$180k–$220k"), { label: "$180k–$220k", listed: true });
  assert.deepEqual(compDisplay("  "), { label: "comp undisclosed", listed: false });
  assert.deepEqual(compDisplay(null), { label: "comp undisclosed", listed: false });
});

// ── Goal phrase (sub-line italic) ────────────────────────────────────────────
test("goalPhrase joins the resolved sector labels, with fallback", () => {
  assert.equal(goalPhrase([]), "roles that fit your Story");
  assert.equal(goalPhrase(["AI / ML"]), "AI / ML roles");
  assert.equal(goalPhrase(["AI / ML", "Fintech"]), "AI / ML and Fintech roles");
  assert.equal(goalPhrase(["AI / ML", "Fintech", "Dev tools"]), "AI / ML, Fintech, and Dev tools roles");
});

// ── Why bullets ──────────────────────────────────────────────────────────────
test("whyBullets splits reasons into → bullets, single sentence stays one", () => {
  assert.deepEqual(whyBullets(null), []);
  assert.deepEqual(whyBullets("Strong systems-design match."), ["Strong systems-design match."]);
  assert.deepEqual(whyBullets("Design systems focus · product-led team · remote-friendly"), [
    "Design systems focus",
    "product-led team",
    "remote-friendly",
  ]);
  assert.deepEqual(whyBullets("A; B\nC"), ["A", "B", "C"]);
});

// ── Source host ──────────────────────────────────────────────────────────────
test("sourceHost extracts a clean host, falls back safely", () => {
  assert.equal(sourceHost("https://www.greenhouse.io/jobs/123"), "greenhouse.io");
  assert.equal(sourceHost("https://boards.lever.co/acme"), "boards.lever.co");
  assert.equal(sourceHost("not a url"), "source");
  assert.equal(sourceHost(null), "source");
});

// ── Company logo helpers ─────────────────────────────────────────────────────
test("companyDomain guesses a slug domain, drops suffixes, falls back safely", () => {
  assert.equal(companyDomain("Robinhood"), "robinhood.com");
  assert.equal(companyDomain("Y Combinator"), "ycombinator.com");
  assert.equal(companyDomain("Goldman Sachs"), "goldmansachs.com");
  assert.equal(companyDomain("Acme, Inc."), "acme.com");
  assert.equal(companyDomain(""), null);
  assert.equal(companyDomain(null), null);
});

test("companyMonogram returns the first letter, uppercased, with a fallback", () => {
  assert.equal(companyMonogram("Anthropic"), "A");
  assert.equal(companyMonogram("openai"), "O");
  assert.equal(companyMonogram("  stripe"), "S");
  assert.equal(companyMonogram("—"), "?");
  assert.equal(companyMonogram(null), "?");
});

// ── Feed filters ─────────────────────────────────────────────────────────────
const job = (o: Partial<Parameters<typeof jobPassesFilters>[0]> = {}) => ({
  visa_confidence: null as VisaConfidence | null,
  remote_type: "onsite",
  compensation: null as string | null,
  location: null as string | null,
  ...o,
});

test("NO_FILTERS lets everything through", () => {
  assert.equal(jobPassesFilters(job(), NO_FILTERS), true);
});

test("sponsorsVisa filter keeps verified + likely sponsors", () => {
  const f: FeedFilters = { ...NO_FILTERS, sponsorsVisa: true };
  assert.equal(jobPassesFilters(job({ visa_confidence: "sponsors_verified" }), f), true);
  assert.equal(jobPassesFilters(job({ visa_confidence: "likely_sponsors" }), f), true);
  assert.equal(jobPassesFilters(job({ visa_confidence: "unclear" }), f), false);
  assert.equal(jobPassesFilters(job({ visa_confidence: "no_sponsorship" }), f), false);
  assert.equal(jobPassesFilters(job({ visa_confidence: null }), f), false);
});

test("remote filter keeps remote + hybrid, drops onsite/unknown", () => {
  const f: FeedFilters = { ...NO_FILTERS, remote: true };
  assert.equal(jobPassesFilters(job({ remote_type: "remote" }), f), true);
  assert.equal(jobPassesFilters(job({ remote_type: "hybrid" }), f), true);
  assert.equal(jobPassesFilters(job({ remote_type: "onsite" }), f), false);
  assert.equal(jobPassesFilters(job({ remote_type: "unknown" }), f), false);
});

test("compListed filter keeps only jobs with real comp text", () => {
  const f: FeedFilters = { ...NO_FILTERS, compListed: true };
  assert.equal(jobPassesFilters(job({ compensation: "$200k" }), f), true);
  assert.equal(jobPassesFilters(job({ compensation: "  " }), f), false);
  assert.equal(jobPassesFilters(job({ compensation: null }), f), false);
});

test("location filter matches by case-insensitive substring, remote by work-type", () => {
  const f: FeedFilters = { ...NO_FILTERS, location: "san francisco" };
  assert.equal(jobPassesFilters(job({ location: "San Francisco, CA" }), f), true);
  assert.equal(jobPassesFilters(job({ location: "Bengaluru, India" }), f), false);
  assert.equal(jobPassesFilters(job({ location: null }), f), false);
  // Free-text substring works.
  assert.equal(
    jobPassesFilters(job({ location: "Bengaluru, India" }), { ...NO_FILTERS, location: "benga" }),
    true,
  );
  // "Remote" also honors remote/hybrid jobs whose location string omits the word.
  const remoteFilter: FeedFilters = { ...NO_FILTERS, location: "Remote" };
  assert.equal(jobPassesFilters(job({ remote_type: "remote", location: null }), remoteFilter), true);
  assert.equal(jobPassesFilters(job({ remote_type: "hybrid", location: "Austin" }), remoteFilter), true);
  assert.equal(jobPassesFilters(job({ remote_type: "onsite", location: "Austin" }), remoteFilter), false);
});

test("filters compose (AND) and filterJobs applies across a list", () => {
  const f: FeedFilters = { ...NO_FILTERS, sponsorsVisa: true, remote: true, compListed: true };
  const good = job({ visa_confidence: "likely_sponsors", remote_type: "remote", compensation: "$200k" });
  const bad = job({ visa_confidence: "likely_sponsors", remote_type: "onsite", compensation: "$200k" });
  assert.equal(jobPassesFilters(good, f), true);
  assert.equal(jobPassesFilters(bad, f), false);
  assert.deepEqual(filterJobs([good, bad], f), [good]);
  assert.equal(filterJobs([good, bad], NO_FILTERS).length, 2);
});

test("diversifyByCompany caps a flooding company and appends its overflow at the tail", () => {
  const items = [
    { company: "Databricks", id: 1 },
    { company: "Databricks", id: 2 },
    { company: "Databricks", id: 3 },
    { company: "Stripe", id: 4 },
    { company: "databricks", id: 5 }, // company match is case-insensitive
    { company: "Figma", id: 6 },
  ];
  const out = diversifyByCompany(items, 2);
  assert.deepEqual(
    out.map((x) => x.id),
    [1, 2, 4, 6, 3, 5],
  );
});

test("diversifyByCompany keeps order when nothing exceeds the cap", () => {
  const items = [
    { company: "A", id: 1 },
    { company: "B", id: 2 },
    { company: "A", id: 3 },
  ];
  assert.deepEqual(diversifyByCompany(items, 2), items);
  // Non-positive cap disables the reshuffle entirely.
  assert.deepEqual(diversifyByCompany(items, 0), items);
});
