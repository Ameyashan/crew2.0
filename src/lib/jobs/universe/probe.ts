// Deterministic board discovery for universe companies: try slug variants of
// the company name on the public Greenhouse / Lever / Ashby APIs and accept a
// board only if it (a) has at least one job and (b) plausibly belongs to THIS
// company — Greenhouse exposes the board's display name; Lever/Ashby don't, so
// we require the company's name to appear in a posting's text. That second
// check is what keeps "plume" or "arm" from binding to an unrelated company.
//
// Relative imports only: scripts/probe-company-boards.ts runs this under plain
// Node (type stripping) to pre-verify the whole list once, and the server
// resolver (universe/resolve.ts) reuses it for companies added later.

import { normalizeEmployerName } from "../h1b/normalize.ts";

export type ProbeAts = "greenhouse" | "lever" | "ashby";
export const PROBE_ATS: ProbeAts[] = ["greenhouse", "lever", "ashby"];

export interface BoardHit {
  ats: ProbeAts;
  slug: string;
  jobs: number;
}

const TIMEOUT_MS = 10_000;

async function getJson(url: string): Promise<unknown | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// The one stored form of a board slug, so the same board can't enter the
// catalog twice under different casing ("Ramp" / "ramp"): Greenhouse, Lever
// and Ashby tokens are case-insensitive → lowercase; Workday lowercases the
// tenant and wdN but keeps the site as published.
export function canonicalSlug(ats: string, slug: string): string {
  const s = slug.trim();
  if (ats === "workday") {
    const m = s.match(/^([^/]+)\/([^/]+)\/(.+)$/);
    return m ? `${m[1].toLowerCase()}/${m[2].toLowerCase()}/${m[3]}` : s;
  }
  return s.toLowerCase();
}

// Words that rarely appear in a board slug ("Palantir Technologies" → palantir).
const DROP_WORDS = new Set([
  "the", "technologies", "technology", "systems", "labs", "holdings", "group", "company",
  "corporation", "inc", "financial", "services", "platforms", "software", "solutions",
]);

// Ordered, deduped slug guesses for a company name.
export function slugVariants(name: string): string[] {
  const words = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (!words.length) return [];
  const core = words.filter((w) => !DROP_WORDS.has(w));
  // "AT&T" → "att", "M&T Bank" → "mtbank": the ampersand simply dropped.
  const amp = name
    .toLowerCase()
    .replace(/[’'&]/g, "")
    .replace(/[^a-z0-9]+/g, "");
  const out = [
    words.join(""),
    words.join("-"),
    core.join(""),
    core.join("-"),
    words.join("_"),
    amp,
  ];
  return [...new Set(out)].filter((s) => s.length >= 2);
}

// Words a company adds to or drops from its name without becoming a
// different company ("Scale" / "Scale AI", "Lucid USA" / "Lucid Motors").
const DESCRIPTORS = new Set([
  "ai", "io", "hq", "health", "bank", "security", "motors", "aerospace", "enterprise", "careers",
  "digital", "biosciences", "bio", "card", "software", "private", "se", "usa", "us", "films",
  "therapeutics", "robotics", "energy", "capital", "financial", "global", "app", "3d",
]);

// Does a board-reported display name refer to the same company? Compare the
// core words (corporate suffixes and filler like "technologies" dropped):
// equal, or one extends the other only by descriptor words ("Scale AI" =
// "Scale", "Sword Health" = "Sword"). "Relativity Space" ≠ "Relativity" and
// "Figure Lending" ≠ "Figure": a prefix alone is not the same company.
export function sameCompanyName(a: string, b: string): boolean {
  const core = (s: string) =>
    normalizeEmployerName(s)
      .split(" ")
      .filter((w) => w && !DROP_WORDS.has(w));
  const ca = core(a);
  const cb = core(b);
  if (!ca.length || !cb.length) return false;
  if (ca.join("") === cb.join("")) return true;
  const [short, long] = ca.length <= cb.length ? [ca, cb] : [cb, ca];
  if (!short.every((w, i) => long[i] === w)) {
    // Also tolerate a descriptor on BOTH sides ("Abnormal Security" / "Abnormal AI").
    const sa = ca.filter((w) => !DESCRIPTORS.has(w)).join("");
    const sb = cb.filter((w) => !DESCRIPTORS.has(w)).join("");
    return !!sa && sa === sb;
  }
  return long.slice(short.length).every((w) => DESCRIPTORS.has(w));
}

// The token a posting must mention for a Lever/Ashby board to count as this
// company's: the first normalized word (≥3 chars), else the joined name.
function nameToken(name: string): string {
  const words = normalizeEmployerName(name).split(" ").filter(Boolean);
  const first = words[0] ?? "";
  return first.length >= 3 ? first : words.join("");
}

function mentions(textBlob: string, name: string): boolean {
  const tok = nameToken(name);
  if (!tok) return false;
  const re = new RegExp(`(^|[^a-z0-9])${tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
  return re.test(textBlob);
}

type Jsonish = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : "");

// Probe one (ats, slug). Returns the job count when the board is live AND
// looks like `name`'s board; null otherwise.
export async function probeBoard(ats: ProbeAts, slug: string, name: string): Promise<number | null> {
  const enc = encodeURIComponent(slug);
  if (ats === "greenhouse") {
    const board = (await getJson(`https://boards-api.greenhouse.io/v1/boards/${enc}`)) as Jsonish | null;
    if (!board || !sameCompanyName(s(board.name), name)) return null;
    const jobs = (await getJson(`https://boards-api.greenhouse.io/v1/boards/${enc}/jobs`)) as Jsonish | null;
    const n = Array.isArray(jobs?.jobs) ? (jobs!.jobs as unknown[]).length : 0;
    return n > 0 ? n : null;
  }
  if (ats === "lever") {
    const data = await getJson(`https://api.lever.co/v0/postings/${enc}?mode=json`);
    if (!Array.isArray(data) || !data.length) return null;
    const sample = (data as Jsonish[])
      .slice(0, 5)
      .map((j) => [s(j.descriptionPlain), s(j.additionalPlain), s(j.text)].join(" "))
      .join(" ");
    return mentions(sample, name) ? data.length : null;
  }
  const data = (await getJson(`https://api.ashbyhq.com/posting-api/job-board/${enc}`)) as Jsonish | null;
  const jobs = Array.isArray(data?.jobs) ? (data!.jobs as Jsonish[]) : [];
  if (!jobs.length) return null;
  const sample = jobs
    .slice(0, 5)
    .map((j) => [s(j.descriptionPlain), s(j.title)].join(" "))
    .join(" ");
  return mentions(sample, name) ? jobs.length : null;
}

// A Fortune-500-scale employer with a handful of postings on a startup ATS is
// almost always a name collision ("Post Holdings" → ashby:post, 4 jobs), so
// large employers must clear a higher job-count bar.
export const LARGE_MIN_JOBS = 20;

const GENERIC = new Set([
  "global", "national", "american", "united", "general", "first", "international", "health", "energy",
  "financial", "capital", "group", "systems", "services", "technologies", "technology", "solutions",
  "performance", "food", "foods", "insurance", "bank", "partners", "industries", "brands", "mutual",
]);

// Does a live Workday board belong to `name`? Trusted outright when the
// tenant is the company's name (a slug variant) or a distinctive name word
// ("microchiphr" ⊃ "microchip", "stellantis"). Otherwise the board's own text
// (sidebar branding + a posting, see workday.ts: workdayEvidence) must name
// the company: its first two words, or its single distinctive word.
// Fold accents ("Mondelēz") and "&" ("Procter & Gamble") so names and board
// text compare on the same footing.
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ");

export function workdayBelongsTo(tenant: string, evidence: string, name: string): boolean {
  const t = tenant.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (slugVariants(name).some((v) => v.replace(/[^a-z0-9]/g, "") === t)) return true;
  const words = normalizeEmployerName(fold(name))
    .split(" ")
    .filter((w) => w && !DROP_WORDS.has(w));
  const distinctive = words.filter((w) => w.length >= 5 && !GENERIC.has(w));
  // Tenant contains a distinctive word ("microchiphr") or is a 4+ char
  // prefix of one ("citi" → "citigroup").
  if (distinctive.some((w) => t.startsWith(w) || t.endsWith(w) || (t.length >= 4 && w.startsWith(t)))) return true;
  const hay = ` ${fold(evidence).replace(/[^a-z0-9]+/g, " ")} `;
  const phrase = words.slice(0, 2).join(" ");
  if (words.length >= 2 && hay.includes(` ${phrase} `)) return true;
  // Single-word names ("RTX", "Walmart") must appear as a whole word.
  if (words.length === 1 && words[0].length >= 3 && hay.includes(` ${words[0]} `)) return true;
  return distinctive.some((w) => hay.includes(` ${w} `));
}

// Try every slug variant on each ATS (ATS-major order) and return the first
// verified board with at least `minJobs` postings, or null.
export async function findBoard(
  name: string,
  opts?: { ats?: ProbeAts[]; minJobs?: number },
): Promise<BoardHit | null> {
  const slugs = slugVariants(name);
  const minJobs = opts?.minJobs ?? 1;
  for (const a of opts?.ats ?? PROBE_ATS) {
    for (const slug of slugs) {
      const n = await probeBoard(a, slug, name);
      if (n && n >= minJobs) return { ats: a, slug, jobs: n };
    }
  }
  return null;
}
