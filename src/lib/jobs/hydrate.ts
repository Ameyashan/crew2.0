// Lazy JD hydration for boards whose listing API omits the description
// (Workday). Called by the enrichment pass (visa parse needs the JD) and by the
// scorer (JD snippets), on at most a batch of jobs each — never on a whole
// board — so a 300-posting Workday board costs 300 detail calls spread over
// the jobs users actually reach. Mutates each job's raw_json in place (and the
// location/date columns on the job object) and persists the update.

import { supabaseAdmin } from "@/lib/supabase";
import { mapPool } from "@/lib/jobs/util";
import { hydrateWorkdayJob } from "@/lib/jobs/sources/workday";

const CONCURRENCY = 6;

export interface HydratableJob {
  id: string;
  ats: string;
  raw_json: Record<string, unknown>;
}

export function needsHydration(j: { ats: string; raw_json: Record<string, unknown> | null }): boolean {
  return j.ats === "workday" && !(j.raw_json && j.raw_json._hydrated);
}

export async function hydrateJobs<T extends HydratableJob>(jobs: T[]): Promise<number> {
  const todo = jobs.filter(needsHydration);
  if (!todo.length) return 0;
  const sb = supabaseAdmin();
  let hydrated = 0;
  await mapPool(todo, CONCURRENCY, async (job) => {
    const h = await hydrateWorkdayJob(job.raw_json).catch(() => null);
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
