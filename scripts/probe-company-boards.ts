// Pre-verify job boards for the company universe (step 1 of the universe plan).
//
//   node scripts/probe-company-boards.ts            # probe entries not yet checked
//   node scripts/probe-company-boards.ts --force    # re-probe everything
//
// Reads data/company-universe.csv, folds it into universe entries
// (src/lib/jobs/universe/classify.ts), probes each entry's name against the
// public ATS APIs (src/lib/jobs/universe/probe.ts + workday.ts) and writes the
// verified boards to data/company-universe-boards.json — which
// scripts/build-company-universe.ts turns into the seed migration. Needs only
// outbound HTTPS: no app secrets. Resumable: existing results are kept unless
// --force.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { buildUniverse, parseUniverseCsv } from "../src/lib/jobs/universe/classify.ts";
import { findBoard, LARGE_MIN_JOBS } from "../src/lib/jobs/universe/probe.ts";

const CSV_PATH = new URL("../data/company-universe.csv", import.meta.url);
const OUT_PATH = new URL("../data/company-universe-boards.json", import.meta.url);
const CONCURRENCY = 12;

export interface ProbeResult {
  name: string;
  ats: string | null; // null = no verified board found
  slug: string | null;
  jobs: number;
  checked_at: string;
}

export interface ProbeFile {
  generated_at: string;
  results: Record<string, ProbeResult>; // keyed by universe match_key
}

function load(): ProbeFile {
  if (!existsSync(OUT_PATH)) return { generated_at: "", results: {} };
  return JSON.parse(readFileSync(OUT_PATH, "utf8")) as ProbeFile;
}

function save(file: ProbeFile) {
  const sorted: Record<string, ProbeResult> = {};
  for (const k of Object.keys(file.results).sort()) sorted[k] = file.results[k];
  writeFileSync(OUT_PATH, JSON.stringify({ generated_at: new Date().toISOString(), results: sorted }, null, 1) + "\n");
}

async function main() {
  const force = process.argv.includes("--force");
  const universe = buildUniverse(parseUniverseCsv(readFileSync(CSV_PATH, "utf8")));
  const file = load();
  const todo = universe.filter((e) => force || !file.results[e.match_key]);
  console.log(`universe: ${universe.length} entries, probing ${todo.length}`);

  let done = 0;
  let hits = 0;
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const e = todo[next++];
      const minJobs = e.size_bucket === "large" ? LARGE_MIN_JOBS : 1;
      const hit = await findBoard(e.name, { minJobs }).catch(() => null);
      file.results[e.match_key] = {
        name: e.name,
        ats: hit?.ats ?? null,
        slug: hit?.slug ?? null,
        jobs: hit?.jobs ?? 0,
        checked_at: new Date().toISOString(),
      };
      done++;
      if (hit) hits++;
      if (done % 50 === 0) {
        console.log(`  ${done}/${todo.length} probed, ${hits} boards`);
        save(file);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  save(file);

  const all = Object.values(file.results);
  const byAts: Record<string, number> = {};
  for (const r of all) byAts[r.ats ?? "none"] = (byAts[r.ats ?? "none"] ?? 0) + 1;
  console.log("done", byAts);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
