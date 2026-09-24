import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeEmployerName } from "../h1b/normalize.ts";
import {
  parseUniverseCsv,
  buildUniverse,
  canonicalName,
  cleanDisplayName,
  orgTypeFor,
  sectorsForIndustry,
  sizeFor,
  universeBadges,
  FOLD_INTO,
  RENAME,
} from "./classify.ts";

const CSV = readFileSync(new URL("../../../../data/company-universe.csv", import.meta.url), "utf8");
const RAW = parseUniverseCsv(CSV);
const UNIVERSE = buildUniverse(RAW);
const byName = new Map(UNIVERSE.map((e) => [e.name, e]));

test("parses every sheet row", () => {
  assert.equal(RAW.length, 1367);
  const amazon = RAW[0];
  assert.equal(amazon.company, "Amazon");
  assert.equal(amazon.fortune500, true);
  assert.equal(amazon.topH1b, true);
  assert.equal(amazon.fortuneRank, 1);
  assert.equal(amazon.h1bApprovals, 12991);
  assert.equal(amazon.h1bEntities.length, 4);
});

test("every fold/rename key matches a real sheet row (catches normalizer drift)", () => {
  const keys = new Set(RAW.map((r) => normalizeEmployerName(r.company)));
  for (const k of [...Object.keys(FOLD_INTO), ...Object.keys(RENAME)]) {
    assert.ok(keys.has(k), `no sheet row normalizes to "${k}"`);
  }
});

test("every fold target is itself a sheet company or a shared canonical name", () => {
  const targets = new Set(Object.values(FOLD_INTO));
  for (const t of targets) assert.ok(byName.has(t), `fold target "${t}" missing from universe`);
});

test("subsidiaries fold into the parent, merging list flags + entities", () => {
  const cvs = byName.get("CVS Health");
  assert.ok(cvs);
  assert.ok(cvs.aliases.includes("Caremark"));
  assert.ok(cvs.aliases.includes("Aetna Resources"));
  assert.equal(cvs.in_fortune500, true);
  assert.equal(cvs.in_top_h1b, true);
  assert.ok(cvs.h1b_entities.length > 1);
  const pwc = byName.get("PwC");
  assert.ok(pwc && pwc.aliases.length === 4);
  const unh = byName.get("UnitedHealth Group");
  assert.ok(unh && unh.in_top_h1b, "Optum's H-1B listing lands on UnitedHealth");
  assert.equal(byName.get("Caremark"), undefined);
});

test("keys are unique and entries shrink by exactly the folds", () => {
  const keys = UNIVERSE.map((e) => e.match_key);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(UNIVERSE.length < RAW.length);
  assert.ok(UNIVERSE.length > 1300);
});

test("display names: dba, trailing punctuation, curated renames", () => {
  assert.equal(cleanDisplayName("Maplebear Inc dba Instacart"), "Instacart");
  assert.equal(cleanDisplayName("Infinite Computer Solutions,"), "Infinite Computer Solutions");
  assert.equal(canonicalName("T-mobile Usa,"), "T-Mobile");
  assert.equal(canonicalName("Mongodb"), "MongoDB");
  assert.equal(canonicalName("X.ai"), "xAI");
  assert.equal(canonicalName("Stripe"), "Stripe");
});

test("org types: staffing, academic, hospital, company", () => {
  assert.equal(byName.get("Tata Consultancy Services")?.org_type, "staffing");
  assert.equal(byName.get("Infosys")?.org_type, "staffing");
  assert.equal(byName.get("Cognizant Technology Solutions")?.org_type, "staffing");
  assert.equal(byName.get("Accenture")?.org_type, "company");
  assert.equal(byName.get("Deloitte")?.org_type, "company");
  assert.equal(byName.get("Harvard University")?.org_type, "academic");
  assert.equal(byName.get("Mayo Clinic")?.org_type, "hospital");
  assert.equal(byName.get("Anthropic")?.org_type, "company");
  assert.equal(orgTypeFor("Laboratory Corporation of America Holdings"), "company");
});

test("sectors from industry", () => {
  assert.deepEqual(sectorsForIndustry("Enterprise Tech", "company"), ["enterprise_saas"]);
  assert.deepEqual(sectorsForIndustry("Commercial Banks", "company"), ["fintech"]);
  assert.deepEqual(sectorsForIndustry("Internet Services and Retailing", "company"), ["ecommerce", "consumer"]);
  assert.deepEqual(sectorsForIndustry("Pharmaceuticals", "company"), ["healthcare"]);
  assert.deepEqual(sectorsForIndustry("Mining, Crude-Oil Production", "company"), []);
  assert.deepEqual(sectorsForIndustry(null, "hospital"), ["healthcare"]);
  assert.deepEqual(sectorsForIndustry("West Palm Beach", "company"), []);
});

test("size buckets", () => {
  assert.equal(sizeFor({ in_fortune500: true, valuation_busd: null }), "large");
  assert.equal(sizeFor({ in_fortune500: false, valuation_busd: 159 }), "large");
  assert.equal(sizeFor({ in_fortune500: false, valuation_busd: 8 }), "medium");
  assert.equal(sizeFor({ in_fortune500: false, valuation_busd: 1.2 }), "startup");
  assert.equal(sizeFor({ in_fortune500: false, valuation_busd: null }), null);
});

test("badges: strongest first, capped", () => {
  const amazon = byName.get("Amazon")!;
  assert.deepEqual(universeBadges(amazon), ["Fortune 500 #1", "Top-100 H-1B sponsor"]);
  const anthropic = byName.get("Anthropic")!;
  assert.deepEqual(universeBadges(anthropic), ["Top-500 H-1B sponsor", "Startup · $965B valuation"]);
  assert.deepEqual(universeBadges(null), []);
  assert.deepEqual(
    universeBadges({
      in_fortune500: false,
      in_top_startups: true,
      in_top_h1b: false,
      fortune_rank: null,
      startup_rank: 300,
      valuation_busd: 3.5,
      h1b_rank: null,
    }),
    ["Startup · $3.5B valuation"],
  );
});
