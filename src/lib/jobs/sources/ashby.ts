// Ashby board-listing adapter (Module 1).
// Endpoint: https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true
// publishedDate is reliable. isRemote gives an explicit remote signal.
// Compensation is exposed natively (compensationTierSummary string).

import { fetchJson, slugToName, str } from "@/lib/jobs/util";
import { normalizeLocation } from "@/lib/jobs/normalize";
import type { NormalizedJob } from "@/lib/jobs/types";

interface AshbyJob {
  id?: string;
  title?: string;
  location?: string;
  isRemote?: boolean;
  publishedDate?: string;
  publishedAt?: string;
  updatedAt?: string;
  jobUrl?: string;
  applyUrl?: string;
  compensation?: { compensationTierSummary?: string };
  compensationTierSummary?: string;
}

export async function fetchAshbyBoard(
  slug: string,
  companyName?: string,
): Promise<NormalizedJob[]> {
  const data = await fetchJson<{ jobs?: AshbyJob[] }>(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`,
  );
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
  const company = companyName || slugToName(slug);

  return jobs
    .filter((j) => j && str(j.id) && str(j.title) && str(j.jobUrl))
    .map((j) => {
      const loc = normalizeLocation(str(j.location), j.isRemote ? "remote" : null);
      const comp =
        str(j.compensation?.compensationTierSummary) || str(j.compensationTierSummary);
      return {
        ats: "ashby",
        external_job_id: String(j.id),
        title: String(j.title),
        company,
        location_raw: loc.location_raw,
        city: loc.city,
        region: loc.region,
        country: loc.country,
        remote_type: loc.remote_type,
        compensation: comp,
        posted_date: str(j.publishedDate) || str(j.publishedAt) || str(j.updatedAt),
        posted_date_approx: false,
        url: String(j.jobUrl),
        raw_json: j as Record<string, unknown>,
      } satisfies NormalizedJob;
    });
}
