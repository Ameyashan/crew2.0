// Lever board-listing adapter (Module 1).
// Endpoint: https://api.lever.co/v0/postings/{slug}?mode=json
// createdAt is a real epoch-ms timestamp -> reliable posted_date. workplaceType
// gives an explicit remote signal. Compensation usually absent -> null.

import { fetchJson, slugToName, str } from "@/lib/jobs/util";
import { normalizeLocation } from "@/lib/jobs/normalize";
import type { NormalizedJob, RemoteType } from "@/lib/jobs/types";

interface LeverPosting {
  id?: string;
  text?: string;
  createdAt?: number;
  hostedUrl?: string;
  applyUrl?: string;
  workplaceType?: string;
  categories?: { location?: string; allLocations?: string[] };
  descriptionPlain?: string;
  description?: string;
}

function remoteFromWorkplace(v: unknown): RemoteType | null {
  const s = typeof v === "string" ? v.toLowerCase() : "";
  if (s === "remote") return "remote";
  if (s === "hybrid") return "hybrid";
  if (s === "on-site" || s === "onsite") return "onsite";
  return null;
}

export async function fetchLeverBoard(
  slug: string,
  companyName?: string,
): Promise<NormalizedJob[]> {
  const data = await fetchJson<LeverPosting[]>(
    `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`,
  );
  const postings = Array.isArray(data) ? data : [];
  const company = companyName || slugToName(slug);

  return postings
    .filter((p) => p && str(p.id) && str(p.text))
    .map((p) => {
      const loc = normalizeLocation(str(p.categories?.location), remoteFromWorkplace(p.workplaceType));
      const posted =
        typeof p.createdAt === "number" && p.createdAt > 0
          ? new Date(p.createdAt).toISOString()
          : null;
      return {
        ats: "lever",
        external_job_id: String(p.id),
        title: String(p.text),
        company,
        location_raw: loc.location_raw,
        city: loc.city,
        region: loc.region,
        country: loc.country,
        remote_type: loc.remote_type,
        compensation: null,
        posted_date: posted,
        posted_date_approx: false,
        url: str(p.hostedUrl) || str(p.applyUrl) || "",
        raw_json: p as Record<string, unknown>,
      } satisfies NormalizedJob;
    })
    .filter((j) => j.url);
}
