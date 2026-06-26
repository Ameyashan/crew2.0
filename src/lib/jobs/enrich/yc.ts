// Company-size enrichment source (Module 3). Builds a name -> size bucket map
// from the public YC company metadata endpoint, cached for the process. Used to
// fill jobs.company_size for companies the catalog has no curated size_bucket
// for (mostly startups). Best-effort: any failure yields an empty map and the
// enrichment pass just leaves company_size null.

import { getJson } from "@/lib/jobs/util";
import type { SizeBucket } from "@/lib/jobs/types";

interface YcCompany {
  name?: string;
  team_size?: number | string | null;
}

let _cache: Map<string, SizeBucket> | null = null;

function bucketFromTeamSize(v: unknown): SizeBucket | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseInt(v, 10) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 50) return "startup";
  if (n < 1000) return "medium";
  return "large";
}

export async function getYcSizeMap(): Promise<Map<string, SizeBucket>> {
  if (_cache) return _cache;
  const map = new Map<string, SizeBucket>();
  try {
    const maxPages = 6;
    for (let page = 1; page <= maxPages; page++) {
      const data = await getJson<{ companies?: YcCompany[]; totalPages?: number }>(
        `https://api.ycombinator.com/v0.1/companies?page=${page}`,
      );
      const companies = Array.isArray(data?.companies) ? data!.companies : [];
      if (!companies.length) break;
      for (const c of companies) {
        const name = typeof c.name === "string" ? c.name.toLowerCase().trim() : "";
        if (!name) continue;
        const size = bucketFromTeamSize(c.team_size);
        if (size) map.set(name, size);
      }
      const total = typeof data?.totalPages === "number" ? data!.totalPages : maxPages;
      if (page >= total) break;
    }
  } catch {
    // best-effort
  }
  _cache = map;
  return map;
}
