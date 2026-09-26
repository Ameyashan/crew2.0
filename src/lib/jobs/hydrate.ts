// Lazy JD hydration for boards whose listing API omits the description
// (Workday, Oracle, SmartRecruiters, Eightfold, iCIMS). Called by the
// enrichment pass (visa parse needs the JD) and by the scorer (JD snippets),
// on at most a batch of jobs each — never on a whole board — so a 300-posting
// board costs 300 detail calls spread over the jobs users actually reach.
// Mutates each job's raw_json in place (and the location/date columns on the
// job object) and persists the update.

import { supabaseAdmin } from "@/lib/supabase";
import { mapPool } from "@/lib/jobs/util";
import { hydrateWorkdayJob, type WorkdayHydration } from "@/lib/jobs/sources/workday";
import { hydrateOracleJob } from "@/lib/jobs/sources/oracle";
import { hydrateSmartRecruitersJob } from "@/lib/jobs/sources/smartrecruiters";
import { hydrateEightfoldJob } from "@/lib/jobs/sources/eightfold";
import { hydrateIcimsJob } from "@/lib/jobs/sources/icims";

const HYDRATORS: Record<string, (raw: Record<string, unknown>) => Promise<WorkdayHydration | null>> = {
  workday: hydrateWorkdayJob,
  oracle: hydrateOracleJob,
  smartrecruiters: hydrateSmartRecruitersJob,
  eightfold: hydrateEightfoldJob,
  icims: hydrateIcimsJob,
};

// Boards whose rows get their JD lazily — a re-fetch must not overwrite them.
export function isLazyHydrated(ats: string): boolean {
  return Object.hasOwn(HYDRATORS, ats);
}

const CONCURRENCY = 6;

export interface HydratableJob {
  id: string;
  ats: string;
  raw_json: Record<string, unknown>;
}

export function needsHydration(j: { ats: string; raw_json: Record<string, unknown> | null }): boolean {
  return isLazyHydrated(j.ats) && !(j.raw_json && j.raw_json._hydrated);
}

export async function hydrateJobs<T extends HydratableJob>(jobs: T[]): Promise<number> {
  const todo = jobs.filter(needsHydration);
  if (!todo.length) return 0;
  const sb = supabaseAdmin();
  let hydrated = 0;
  await mapPool(todo, CONCURRENCY, async (job) => {
    const h = await HYDRATORS[job.ats](job.raw_json).catch(() => null);
    if (!h) return;
    const update = {
      raw_json: h.raw_json,
      location_raw: h.location_raw,
      city: h.city,
      region: h.region,
      country: h.country,
      remote_type: h.remote_type,
      ...(h.posted_date ? { posted_date: h.posted_date, posted_date_approx: h.posted_date_approx } : {}),
    };
    const { error } = await sb.from("jobs").update(update).eq("id", job.id);
    if (error) return;
    Object.assign(job, update);
    hydrated++;
  });
  return hydrated;
}
