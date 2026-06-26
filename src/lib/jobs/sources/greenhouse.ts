// Greenhouse board-listing adapter (Module 1).
// Endpoint: https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true
// Listing carries only updated_at (no created/published), so posted_date is
// flagged approximate. Compensation is not exposed -> null.

import { fetchJson, slugToName, str } from "@/lib/jobs/util";
import { normalizeLocation } from "@/lib/jobs/normalize";
import type { NormalizedJob } from "@/lib/jobs/types";

interface GhJob {
  id?: number;
  title?: string;
  updated_at?: string;
  absolute_url?: string;
  content?: string;
  location?: { name?: string };
}

export async function fetchGreenhouseBoard(
  slug: string,
  companyName?: string,
): Promise<NormalizedJob[]> {
  const data = await fetchJson<{ jobs?: GhJob[] }>(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`,
  );
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
  const company = companyName || slugToName(slug);

  return jobs
    .filter((j) => j && j.id != null && str(j.title) && str(j.absolute_url))
    .map((j) => {
      const loc = normalizeLocation(str(j.location?.name));
      return {
        ats: "greenhouse",
        external_job_id: String(j.id),
        title: String(j.title),
        company,
        location_raw: loc.location_raw,
        city: loc.city,
        region: loc.region,
        country: loc.country,
        remote_type: loc.remote_type,
        compensation: null,
        posted_date: str(j.updated_at),
        posted_date_approx: true,
        url: String(j.absolute_url),
        raw_json: j as Record<string, unknown>,
      } satisfies NormalizedJob;
    });
}
