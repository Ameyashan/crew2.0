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
  const out = [
    words.join(""),
    words.join("-"),
    core.join(""),
    core.join("-"),
    words.join("_"),
  ];
  return [...new Set(out)].filter((s) => s.length >= 2);
}

// Does a board-reported display name refer to the same company? Compare the
// normalized token sequences: equal, or one is a whole-token prefix of the
// other ("Databricks" vs "Databricks Inc", "Ramp" vs "Ramp Business").
export function sameCompanyName(a: string, b: string): boolean {
  const ta = normalizeEmployerName(a).split(" ").filter(Boolean);
  const tb = normalizeEmployerName(b).split(" ").filter(Boolean);
  if (!ta.length || !tb.length) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return short.every((w, i) => long[i] === w) || ta.join("") === tb.join("");
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
