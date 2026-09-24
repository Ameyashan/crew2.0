// Verify board guesses for universe employers the slug probe missed, and merge
// the verified ones into data/company-universe-boards.json (step 2 of the
// universe plan: Workday + non-obvious slugs).
//
//   node scripts/verify-board-guesses.ts path/to/guesses.json [more.json …]
//
// Guess file shape (keyed by universe match_key):
//   { "<match_key>": { "boards": [{ "ats": "workday", "slug": "tenant/wd5/Site" }, …],
//                      "careers_url": "https://…" | null } }
// Same trust rules as the server resolver (src/lib/jobs/universe/resolve.ts):
// every guess is checked against the live board — Greenhouse/Lever/Ashby must
// name the company, large employers need 20+ jobs — and the careers page is
// scanned for board links when no guess verifies. Then re-run
// scripts/build-company-universe.ts to regenerate the seed.

import { readFileSync, writeFileSync } from "node:fs";
import { buildUniverse, parseUniverseCsv } from "../src/lib/jobs/universe/classify.ts";
import { probeBoard, LARGE_MIN_JOBS, type ProbeAts } from "../src/lib/jobs/universe/probe.ts";
import { workdayJobCount, parseWorkdaySlug } from "../src/lib/jobs/sources/workday.ts";
import { discoverFromCareersPage } from "../src/lib/jobs/universe/careers.ts";

const CSV_PATH = new URL("../data/company-universe.csv", import.meta.url);
const BOARDS_PATH = new URL("../data/company-universe-boards.json", import.meta.url);
const CONCURRENCY = 10;

interface Attempt {
  ats: string;
  slug: string;
}
interface Guess {
  boards?: Attempt[];
  careers_url?: string | null;
}

async function verify(a: Attempt, name: string, minJobs: number): Promise<number | null> {
  let n: number | null = null;
  if (a.ats === "workday") n = parseWorkdaySlug(a.slug) ? await workdayJobCount(a.slug) : null;
  else if (a.ats === "greenhouse" || a.ats === "lever" || a.ats === "ashby")
    n = await probeBoard(a.ats as ProbeAts, a.slug, name).catch(() => null);
  return n && n >= minJobs ? n : null;
}

async function main() {
  const files = process.argv.slice(2);
  if (!files.length) throw new Error("usage: verify-board-guesses.ts guesses.json …");
  const guesses: Record<string, Guess> = {};
  for (const f of files) Object.assign(guesses, JSON.parse(readFileSync(f, "utf8")));

  const universe = buildUniverse(parseUniverseCsv(readFileSync(CSV_PATH, "utf8")));
  const byKey = new Map(universe.map((e) => [e.match_key, e]));
  const boards = JSON.parse(readFileSync(BOARDS_PATH, "utf8"));
  const todo = Object.entries(guesses).filter(([k]) => byKey.has(k) && !boards.results[k]?.ats);
  const unknown = Object.keys(guesses).filter((k) => !byKey.has(k));
  if (unknown.length) console.log(`ignoring ${unknown.length} unknown keys, e.g. ${unknown.slice(0, 5).join(", ")}`);
  console.log(`verifying ${todo.length} companies`);

  const stats: Record<string, number> = {};
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const [key, g] = todo[next++];
      const e = byKey.get(key)!;
      const minJobs = e.size_bucket === "large" ? LARGE_MIN_JOBS : 1;
      let found: { a: Attempt; n: number; via: string } | null = null;
      for (const a of g.boards ?? []) {
        const n = await verify(a, e.name, minJobs);
        if (n) {
          found = { a, n, via: "guess" };
          break;
        }
      }
      if (!found && g.careers_url) {
        for (const a of await discoverFromCareersPage(g.careers_url)) {
          const n = await verify(a, e.name, minJobs);
          if (n) {
            found = { a, n, via: "careers" };
            break;
          }
        }
      }
      const tag = found ? `${found.via}_${found.a.ats}` : "miss";
      stats[tag] = (stats[tag] ?? 0) + 1;
      if (found) {
        boards.results[key] = {
          ...(boards.results[key] ?? { name: e.name }),
          name: e.name,
          ats: found.a.ats,
          slug: found.a.slug,
          jobs: found.n,
          checked_at: new Date().toISOString(),
        };
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  writeFileSync(BOARDS_PATH, JSON.stringify(boards, null, 1) + "\n");
  console.log(stats);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
