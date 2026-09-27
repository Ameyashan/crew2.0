// Pure pay-range parsing for job listings. Only Ashby exposes pay as a field;
// everywhere else it lives in the JD text ("The current base salary range for
// this role is between $95,000 - $120,000", per-region lists, "$45/hr"...).
// These helpers turn either into a normalized range so a goal's pay floor can
// be checked. Import-free for `node --test`.

export type CompCurrency = "USD" | "CAD" | "EUR" | "GBP";
export type CompPeriod = "year" | "month" | "hour";

export interface ParsedComp {
  currency: CompCurrency;
  period: CompPeriod;
  min: number; // as posted, in `period` units
  max: number;
  annual_min: number;
  annual_max: number;
}

const HOURS_PER_YEAR = 2080;
const ANNUAL_MIN = 15_000;
const ANNUAL_MAX = 5_000_000;

// A money amount: optional currency code/symbol, digits with thousands
// separators or decimals, optional k/m suffix.
const AMOUNT = String.raw`(US\$|USD\s?|CA\$|C\$|CAD\s?|\$|€|EUR\s?|£|GBP\s?)?\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s?([kKmM](?![a-z]))?`;
// "$255,653/year to $265,653/year": a per-period tag may sit on the first amount.
const PER = String.raw`(?:\s*(?:\/|per)\s*(?:year|yr|annum|hour|hr|month))?`;
const SEP = String.raw`${PER}\s*(?:-|–|—|to|and)\s*`;
const RANGE_RE = new RegExp(`${AMOUNT}${SEP}${AMOUNT}`, "g");
const SINGLE_RE = new RegExp(AMOUNT, "g");
const PAY_WORDS = /salary|base pay|pay range|pay scale|compensation|\bote\b|hourly rate|wage|annual(?:ized)? (?:base|pay)|pay transparency/i;

const KNOWN_CODES: Record<string, CompCurrency> = { USD: "USD", CAD: "CAD", EUR: "EUR", GBP: "GBP" };
// Other ISO codes that follow dollar-signed ranges in postings. Listed
// explicitly so an all-caps word after a range ("NYC: $114,500") isn't read
// as a currency.
const OTHER_CODES = new Set(["AUD", "SGD", "NZD", "HKD", "INR", "JPY", "CHF", "MXN", "BRL", "SEK", "NOK", "DKK", "PLN", "ZAR", "ILS", "CNY", "TWD", "KRW", "AED"]);

// Currency of a match at text[start, end). null = a currency we don't handle
// (S$, A$, "… AUD") — the hit is skipped rather than misread as dollars.
function currencyOf(sym: string | undefined, text: string, start: number, end: number): CompCurrency | null {
  const s = (sym ?? "").trim().toUpperCase();
  if (!s) return null;
  // A trailing ISO code wins: "$171,500 - $274,500 AUD".
  const code = /^\s*(?:\/\s*[a-z]+\s*)?([A-Z]{3})\b/.exec(text.slice(end, end + 16))?.[1];
  if (code && KNOWN_CODES[code]) return KNOWN_CODES[code];
  if (code && OTHER_CODES.has(code)) return null;
  if (s === "€" || s === "EUR") return "EUR";
  if (s === "£" || s === "GBP") return "GBP";
  if (s === "CA$" || s === "C$" || s === "CAD") return "CAD";
  if (s === "US$" || s === "USD") return "USD";
  // Bare "$" glued to letters is another dollar: S$, A$, HK$, NZ$, R$, MX$.
  if (/[A-Za-z]$/.test(text.slice(Math.max(0, start - 2), start))) return null;
  return /\bCAD\b|canadian dollars/i.test(text.slice(Math.max(0, start - 40), end + 40)) ? "CAD" : "USD";
}

function amountOf(num: string, suffix: string | undefined): number {
  const n = Number(num.replace(/,/g, ""));
  const s = (suffix ?? "").toLowerCase();
  return s === "k" ? n * 1_000 : s === "m" ? n * 1_000_000 : n;
}

function periodOf(after: string): CompPeriod {
  const a = after.slice(0, 40).toLowerCase();
  if (/^\s*(?:\/|per|an|a)?\s*(?:hour|hr\b|hourly)/.test(a) || /^[^.$€£\d]{0,20}(?:per hour|\/hr|hourly)/.test(a)) return "hour";
  if (/^\s*(?:\/|per|a)?\s*(?:month|mo\b)/.test(a) || /^[^.$€£\d]{0,20}(?:per month|\/month|monthly)/.test(a)) return "month";
  return "year";
}

// "Pay Range for this position is $18.42 - $24.00." — no unit stated, but
// nobody posts a $24 salary: small un-suffixed amounts are hourly.
function impliedPeriod(stated: CompPeriod, max: number, suffix: string | undefined): CompPeriod {
  return stated === "year" && !suffix && max < 500 ? "hour" : stated;
}

function annualize(n: number, period: CompPeriod): number {
  return period === "hour" ? n * HOURS_PER_YEAR : period === "month" ? n * 12 : n;
}

function build(currency: CompCurrency, period: CompPeriod, a: number, b: number): ParsedComp | null {
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  const annual_min = Math.round(annualize(min, period));
  const annual_max = Math.round(annualize(max, period));
  if (annual_min < ANNUAL_MIN || annual_max > ANNUAL_MAX) return null;
  // "$1 - $200,000" style garbage: a real range isn't wider than 5x.
  if (annual_max > annual_min * 5) return null;
  return { currency, period, min, max, annual_min, annual_max };
}

interface Hit {
  comp: ParsedComp;
  index: number;
}

function rangeHits(text: string): Hit[] {
  const hits: Hit[] = [];
  for (const m of text.matchAll(RANGE_RE)) {
    const [, sym1, n1, k1, sym2, n2, k2] = m;
    // Need a currency marker on at least one side ("$95,000 - 120,000" is fine;
    // "5 - 10 years" is not).
    if (!sym1 && !sym2) continue;
    const currency = currencyOf(sym1 || sym2, text, m.index, m.index + m[0].length);
    if (!currency) continue;
    // "$200-270K": the suffix on the second number applies to both.
    const a = amountOf(n1, k1 || (!k1 && k2 && Number(n1.replace(/,/g, "")) < 1000 ? k2 : undefined));
    const b = amountOf(n2, k2);
    const period = impliedPeriod(periodOf(text.slice(m.index + m[0].length)), Math.max(a, b), k1 || k2);
    const comp = build(currency, period, a, b);
    if (comp) hits.push({ comp, index: m.index });
  }
  return hits;
}

function singleHits(text: string): Hit[] {
  const hits: Hit[] = [];
  for (const m of text.matchAll(SINGLE_RE)) {
    const [, sym, n, k] = m;
    if (!sym) continue;
    const currency = currencyOf(sym, text, m.index, m.index + m[0].length);
    if (!currency) continue;
    const v = amountOf(n, k);
    const period = impliedPeriod(periodOf(text.slice(m.index + m[0].length)), v, k);
    const comp = build(currency, period, v, v);
    if (comp) hits.push({ comp, index: m.index });
  }
  return hits;
}

// A currency range we deliberately skipped (AUD, SGD…): callers must not fall
// back to reading one end of it as a lone USD amount.
function sawCurrencyRange(text: string): boolean {
  return [...text.matchAll(RANGE_RE)].some((m) => m[1] || m[4]);
}

// Merge several ranges from one posting (regional lists) into the envelope.
// Only ranges in the first-seen currency count.
function envelope(hits: Hit[]): ParsedComp | null {
  if (!hits.length) return null;
  const { currency, period } = hits[0].comp;
  const same = hits.filter((h) => h.comp.currency === currency);
  const min = Math.min(...same.map((h) => h.comp.annual_min));
  const max = Math.max(...same.map((h) => h.comp.annual_max));
  const allSamePeriod = same.every((h) => h.comp.period === period);
  return {
    currency,
    period: allSamePeriod ? period : "year",
    min: allSamePeriod ? Math.min(...same.map((h) => h.comp.min)) : min,
    max: allSamePeriod ? Math.max(...same.map((h) => h.comp.max)) : max,
    annual_min: min,
    annual_max: max,
  };
}

// A short pay string, e.g. Ashby's "$200K – $270K • Offers Equity" or
// "€2K – €3.7K per month". A lone amount counts ("$150,000").
export function parseComp(text: string | null | undefined): ParsedComp | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  const r = rangeHits(t);
  if (r.length) return r[0].comp;
  if (sawCurrencyRange(t)) return null;
  const s = singleHits(t);
  return s.length ? s[0].comp : null;
}

// Pay in free JD text. Ranges near a pay keyword win; otherwise any currency
// range. A lone amount only counts right after a pay keyword ("Salary: $150,000"),
// so "$1,000 learning stipend" and "raised $50M" never read as pay.
export function findCompInJd(text: string | null | undefined): ParsedComp | null {
  const t = (text ?? "").replace(/\s+/g, " ");
  if (!t) return null;
  const nearPay = (h: Hit) => PAY_WORDS.test(t.slice(Math.max(0, h.index - 160), h.index));
  const ranges = rangeHits(t);
  const keyed = ranges.filter(nearPay);
  if (keyed.length) return envelope(keyed);
  if (ranges.length) return envelope(ranges);
  if (sawCurrencyRange(t)) return null;
  const singles = singleHits(t).filter((h) => PAY_WORDS.test(t.slice(Math.max(0, h.index - 60), h.index)));
  return singles.length ? singles[0].comp : null;
}

export type CompFit = "meets" | "below" | "unknown";

// Does a posted range clear the goal's floor? Compares the TOP of the range
// (a candidate can negotiate toward it). A total-comp floor vs a posted range
// that's usually base: only call it below when the top is under 70% of the
// floor. Non-USD or unparsed pay is "unknown" — never filtered.
export function compVsFloor(
  comp: Pick<ParsedComp, "currency" | "annual_max"> | null,
  floorUsd: number | null,
  basis: "base" | "total" = "base",
): CompFit {
  if (!comp || floorUsd == null || comp.currency !== "USD") return "unknown";
  const bar = basis === "total" ? floorUsd * 0.7 : floorUsd;
  return comp.annual_max < bar ? "below" : "meets";
}

const SYMBOL: Record<CompCurrency, string> = { USD: "$", CAD: "C$", EUR: "€", GBP: "£" };

function money(n: number, sym: string, period: CompPeriod): string {
  if (period === "hour") return `${sym}${Number(n.toFixed(2))}`;
  if (n >= 1_000_000) return `${sym}${Number((n / 1_000_000).toFixed(2))}M`;
  if (n >= 1_000) return `${sym}${Number((n / 1_000).toFixed(1))}k`;
  return `${sym}${Math.round(n)}`;
}

// Compact display: "$106k–$145k", "€2k–€3.7k/mo", "$45–$60/hr".
export function formatCompRange(c: ParsedComp): string {
  const sym = SYMBOL[c.currency];
  const suffix = c.period === "hour" ? "/hr" : c.period === "month" ? "/mo" : "";
  const lo = money(c.min, sym, c.period);
  const hi = money(c.max, sym, c.period);
  return `${lo === hi ? lo : `${lo}–${hi}`}${suffix}`;
}

export interface CompColumns {
  comp_min_usd: number | null;
  comp_max_usd: number | null;
  comp_currency: CompCurrency | null;
  comp_period: CompPeriod | null;
  comp_label: string | null;
}

// jobs.comp_* values for a parse result (all null when no pay was found, so
// the row is still marked parsed). USD columns only for USD pay.
export function compColumns(c: ParsedComp | null): CompColumns {
  if (!c) return { comp_min_usd: null, comp_max_usd: null, comp_currency: null, comp_period: null, comp_label: null };
  const usd = c.currency === "USD";
  return {
    comp_min_usd: usd ? c.annual_min : null,
    comp_max_usd: usd ? c.annual_max : null,
    comp_currency: c.currency,
    comp_period: c.period,
    comp_label: formatCompRange(c),
  };
}

// The stored columns back as the shape compVsFloor takes.
export function storedComp(row: { comp_currency?: string | null; comp_max_usd?: number | null }): Pick<ParsedComp, "currency" | "annual_max"> | null {
  if (row.comp_currency !== "USD" || row.comp_max_usd == null) return null;
  return { currency: "USD", annual_max: row.comp_max_usd };
}
