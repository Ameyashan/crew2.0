import { test } from "node:test";
import assert from "node:assert/strict";
import { parseComp, findCompInJd, compVsFloor, formatCompRange, compColumns, storedComp } from "./comp.ts";

// Real shapes pulled from the jobs table (Ashby field + Workday/Greenhouse JDs).

test("parseComp: Ashby compensation strings", () => {
  const a = parseComp("$200K – $270K • Offers Equity");
  assert.deepEqual(
    a && { c: a.currency, lo: a.annual_min, hi: a.annual_max },
    { c: "USD", lo: 200000, hi: 270000 },
  );
  assert.equal(parseComp("$141,000 – $161,850 • Offers Equity • Offers Bonus • 15% Annual Salary")?.annual_max, 161850);
  assert.equal(parseComp("€90K – €160K • Offers Equity")?.currency, "EUR");
  assert.equal(parseComp("£106K – £150K • Offers Equity")?.currency, "GBP");
  const monthly = parseComp("€2K – €3.7K per month • Offers Bonus");
  assert.equal(monthly?.period, "month");
  assert.equal(monthly?.annual_max, 44400);
  assert.equal(parseComp("$40K – $50K")?.annual_min, 40000);
  assert.equal(parseComp("$150,000")?.annual_max, 150000);
  assert.equal(parseComp(""), null);
  assert.equal(parseComp("Competitive"), null);
});

test("parseComp: shared suffix, hourly, and CAD", () => {
  assert.equal(parseComp("$200-270K")?.annual_min, 200000);
  const hourly = parseComp("$45 - $60 per hour");
  assert.equal(hourly?.period, "hour");
  assert.equal(hourly?.annual_max, 60 * 2080);
  assert.equal(parseComp("$120,000 - $140,000 CAD")?.currency, "CAD");
  assert.equal(parseComp("$150K – $200K AUD"), null);
  assert.equal(parseComp("A$150K – A$200K"), null);
});

test("findCompInJd: Workday base-range sentence", () => {
  const c = findCompInJd("…benefits. The current base salary range for this role is between $95,000 - $120,000. Actual pay…");
  assert.equal(c?.annual_min, 95000);
  assert.equal(c?.annual_max, 120000);
});

test("findCompInJd: '/year to' form and regional lists envelope", () => {
  assert.equal(findCompInJd("Salary Range: $255,653/ year to $265,653/ year #LI-DNI")?.annual_max, 265653);
  const regional = findCompInJd(
    "Pay ranges in the following regions are expected to be as follows: Colorado: $100,500 to $124,000 NYC: $114,500 to $141,500 Washington State: $110,000 to $135,000",
  );
  assert.equal(regional?.annual_min, 100500);
  assert.equal(regional?.annual_max, 141500);
});

test("findCompInJd: Greenhouse pay-range spans after htmlToText (em dash)", () => {
  const c = findCompInJd("Annual salary range(s) for this role $275,000 — $420,000 USD");
  assert.equal(c?.annual_max, 420000);
});

test("findCompInJd ignores non-pay dollar amounts", () => {
  assert.equal(findCompInJd("We raised $50M from top investors and offer a $1,000 learning stipend."), null);
  assert.equal(findCompInJd("Requires 5 - 10 years of experience."), null);
  // A lone amount right after a pay keyword counts.
  assert.equal(findCompInJd("Expected Salary Range $75,000 plus bonus")?.annual_min, 75000);
});

test("live samples: decimals, monthly, unlabeled hourly, foreign dollars", () => {
  assert.equal(findCompInJd("Salary Range: $89,800.00 - $112,200.00")?.annual_max, 112200);
  const monthly = findCompInJd("The salary pay range for this position is $12,000.00 - $18,000.00 monthly. This is");
  assert.equal(monthly?.period, "month");
  assert.equal(monthly?.annual_max, 216000);
  assert.equal(findCompInJd("Compensation $60,000 - 100,000/year, based on performance")?.annual_min, 60000);
  const hourly = findCompInJd("Pay Range for this position is $18.42 - $24.00.");
  assert.equal(hourly?.period, "hour");
  assert.equal(hourly?.annual_max, Math.round(24 * 2080));
  assert.equal(findCompInJd("Compensation Range: $19.25–$28.85/hr. Actual pay may vary")?.period, "hour");
  assert.equal(findCompInJd("salary range between $192,500.00 - $269,400.00 USD + incentive")?.annual_max, 269400);
  assert.equal(findCompInJd("salary range between S$194,900.00 - S$331,200.00 SGD"), null);
  assert.equal(findCompInJd("salary range between $171,500.00 - $274,500.00 AUD"), null);
  assert.equal(findCompInJd("Compensation: $70,000 to $120,000")?.annual_max, 120000);
});

test("compVsFloor compares the top of the range, lenient for total comp", () => {
  const c = parseComp("$150K – $170K");
  assert.equal(compVsFloor(c, 200000, "base"), "below");
  assert.equal(compVsFloor(c, 160000, "base"), "meets");
  // $170k base top vs $200k total floor: 170k ≥ 140k → plausibly meets.
  assert.equal(compVsFloor(c, 200000, "total"), "meets");
  assert.equal(compVsFloor(c, 300000, "total"), "below");
  assert.equal(compVsFloor(null, 200000), "unknown");
  assert.equal(compVsFloor(c, null), "unknown");
  assert.equal(compVsFloor(parseComp("€90K – €160K"), 100000), "unknown");
});

test("formatCompRange", () => {
  assert.equal(formatCompRange(parseComp("$106,000 - $145,000")!), "$106k–$145k");
  assert.equal(formatCompRange(parseComp("€2K – €3.7K per month")!), "€2k–€3.7k/mo");
  assert.equal(formatCompRange(parseComp("$45 - $60 per hour")!), "$45–$60/hr");
  assert.equal(formatCompRange(parseComp("$150,000")!), "$150k");
});

test("compColumns / storedComp round-trip, USD columns only for USD", () => {
  const cols = compColumns(parseComp("$106,000 - $145,000"));
  assert.deepEqual(cols, { comp_min_usd: 106000, comp_max_usd: 145000, comp_currency: "USD", comp_period: "year", comp_label: "$106k–$145k" });
  assert.equal(compVsFloor(storedComp(cols), 200000), "below");
  const eur = compColumns(parseComp("€90K – €160K"));
  assert.equal(eur.comp_max_usd, null);
  assert.equal(storedComp(eur), null);
  assert.equal(compColumns(null).comp_label, null);
});
