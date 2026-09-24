// Workday board-listing adapter. Most Fortune 500 employers host their careers
// site on Workday; every tenant exposes the same JSON "CXS" API the site's own
// front end uses:
//   POST https://{tenant}.{wdN}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs
//        {"appliedFacets":{}, "limit":20, "offset":n, "searchText":""}
//   GET  https://{tenant}.{wdN}.myworkdayjobs.com/wday/cxs/{tenant}/{site}{externalPath}
// Catalog slug format: "tenant/wdN/site" (e.g. "nvidia/wd5/NVIDIAExternalCareerSite").
//
// Differences from the Greenhouse/Lever/Ashby adapters:
//   * Pages are capped at 20 and big employers list thousands of postings, so
//     we take the newest MAX_JOBS (the API sorts newest-first) and report the
//     board as incomplete — the orchestrator then ages out unseen rows slowly
//     instead of deactivating everything past the cap.
//   * When the tenant exposes a country facet with a United States value, the
//     listing is filtered to US postings (the feed is US-focused; this also
//     keeps a 20k-posting board to what users can act on).
//   * The listing carries no description and only a relative "Posted N Days
//     Ago". hydrateWorkdayJob() fetches the detail (JD, real start date, all
//     locations) lazily — the enrichment pass calls it before reading the JD.

import { str } from "../util.ts";
import { normalizeLocation } from "../normalize.ts";
import type { NormalizedJob } from "@/lib/jobs/types";

const PAGE = 20;
export const WORKDAY_MAX_JOBS = 300;
const TIMEOUT_MS = 12_000;

export interface WorkdaySlug {
  tenant: string;
  wd: string; // "wd5"
  site: string;
}

export function parseWorkdaySlug(slug: string): WorkdaySlug | null {
  const m = slug.trim().match(/^([a-z0-9-]+)\/(wd\d+)\/([A-Za-z0-9_-]+)$/i);
  return m ? { tenant: m[1].toLowerCase(), wd: m[2].toLowerCase(), site: m[3] } : null;
}

export function workdayHost(s: WorkdaySlug): string {
  return `https://${s.tenant}.${s.wd}.myworkdayjobs.com`;
}

// Pull "tenant/wdN/site" out of any Workday careers URL (careers-page links,
// pasted URLs). The site segment follows an optional locale ("/en-US/").
export function workdaySlugFromUrl(url: string): string | null {
  const m = url.match(/([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([A-Za-z0-9_-]+)/);
  if (!m) return null;
  const site = m[3];
  if (/^(wday|login|job|jobs|search)$/i.test(site)) return null;
  return `${m[1].toLowerCase()}/${m[2].toLowerCase()}/${site}`;
}

async function wdFetch<T>(url: string, body?: unknown): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

interface WdFacetValue {
  descriptor?: string;
  id?: string;
  facetParameter?: string;
  values?: WdFacetValue[];
}

interface WdFacet {
  facetParameter?: string;
  values?: WdFacetValue[];
}

interface WdPosting {
  title?: string;
  externalPath?: string;
  locationsText?: string;
  postedOn?: string;
  bulletFields?: string[];
}

interface WdListResponse {
  total?: number;
  jobPostings?: WdPosting[];
  facets?: WdFacet[];
}

const US_RE = /^(united states( of america)?|usa|us)$/i;

// Find a country facet value for the US, at any nesting depth. Returns the
// appliedFacets entry to send, or null when the tenant has no such facet
// (then the listing is left unfiltered).
export function usCountryFacet(facets: WdFacet[] | undefined): Record<string, string[]> | null {
  const walk = (param: string | undefined, values: WdFacetValue[] | undefined): Record<string, string[]> | null => {
    for (const v of values ?? []) {
      if (param && /country/i.test(param) && v.id && US_RE.test((v.descriptor ?? "").trim())) {
        return { [param]: [v.id] };
      }
      if (v.values?.length) {
        const hit = walk(v.facetParameter ?? param, v.values);
        if (hit) return hit;
      }
    }
    return null;
  };
  for (const f of facets ?? []) {
    const hit = walk(f.facetParameter, f.values);
    if (hit) return hit;
  }
  return null;
}

// "Posted Today" / "Posted Yesterday" / "Posted 3 Days Ago" / "Posted 30+ Days Ago".
export function postedOnToIso(postedOn: string | null | undefined, now: Date = new Date()): string | null {
  const s = (postedOn ?? "").toLowerCase();
  if (!s) return null;
  let days: number | null = null;
  if (/today/.test(s)) days = 0;
  else if (/yesterday/.test(s)) days = 1;
  else {
    const m = s.match(/(\d+)\+?\s*days?\s*ago/);
    if (m) days = Number(m[1]);
  }
  if (days == null) return null;
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

// Workday tenants commonly write locations country-first ("US, CA, Santa
// Clara", "USA - Texas - Austin"); the shared normalizer assumes city-first.
// Reorder the US country-first shape, else defer to normalizeLocation.
export function workdayLocation(text: string | null, remoteHint?: NormalizedJob["remote_type"] | null) {
  const base = normalizeLocation(text, remoteHint);
  if (!text) return base;
  const parts = text.split(/\s*(?:,|\s-\s)\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3 && /^(us|usa|united states( of america)?)$/i.test(parts[0])) {
    return { ...base, country: "United States", region: parts[1], city: parts.slice(2).join(", ").replace(/\s*\(\+\d+ more\)$/, "") };
  }
  return base;
}

// Listing-level location: "US, CA, Santa Clara" as given, or — for the
// "4 Locations" summary — the first location from the posting's path segment.
export function listingLocation(p: WdPosting): string | null {
  const text = str(p.locationsText);
  const many = text?.match(/^(\d+)\s+locations?$/i);
  if (text && !many) return text;
  const seg = (p.externalPath ?? "").split("/")[2];
  // "US-CA-Santa-Clara" → "US, CA, Santa Clara" (country-state-city), else
  // just de-hyphenate.
  const us = seg?.match(/^(US|USA)-([A-Z]{2})-(.+)$/);
  const first = us ? `${us[1]}, ${us[2]}, ${us[3].replace(/-+/g, " ")}` : seg ? seg.replace(/-+/g, " ").trim() : null;
  if (!first) return text;
  return many ? `${first} (+${Number(many[1]) - 1} more)` : first;
}

export interface BoardFetch {
  jobs: NormalizedJob[];
  complete: boolean; // false when the board had more postings than we took
}

export async function fetchWorkdayBoardPaged(slug: string, companyName?: string): Promise<BoardFetch> {
  const s = parseWorkdaySlug(slug);
  if (!s) throw new Error(`bad workday slug "${slug}" (want tenant/wdN/site)`);
  const host = workdayHost(s);
  const listUrl = `${host}/wday/cxs/${s.tenant}/${s.site}/jobs`;
  const company = companyName || s.tenant;

  const first = await wdFetch<WdListResponse>(listUrl, { appliedFacets: {}, limit: PAGE, offset: 0, searchText: "" });
  const us = usCountryFacet(first.facets);
  let page = first;
  if (us) page = await wdFetch<WdListResponse>(listUrl, { appliedFacets: us, limit: PAGE, offset: 0, searchText: "" });
  const total = page.total ?? 0;

  const postings: WdPosting[] = [...(page.jobPostings ?? [])];
  for (let offset = PAGE; offset < Math.min(total, WORKDAY_MAX_JOBS); offset += PAGE) {
    const next = await wdFetch<WdListResponse>(listUrl, {
      appliedFacets: us ?? {},
      limit: PAGE,
      offset,
      searchText: "",
    });
    const got = next.jobPostings ?? [];
    if (!got.length) break;
    postings.push(...got);
  }

  const now = new Date();
  const seen = new Set<string>();
  const jobs: NormalizedJob[] = [];
  for (const p of postings) {
    const path = str(p.externalPath);
    if (!path || !str(p.title)) continue;
    const id = `${s.tenant}:${path}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const loc = workdayLocation(listingLocation(p));
    jobs.push({
      ats: "workday",
      external_job_id: id,
      title: String(p.title),
      company,
      location_raw: loc.location_raw,
      city: loc.city,
      region: loc.region,
      country: loc.country ?? (us ? "United States" : null),
      remote_type: loc.remote_type,
      compensation: null,
      posted_date: postedOnToIso(p.postedOn, now),
      posted_date_approx: true,
      url: `${host}/${s.site}${path}`,
      raw_json: { ...p, _wd: { tenant: s.tenant, wd: s.wd, site: s.site } } as Record<string, unknown>,
    });
  }
  return { jobs, complete: postings.length >= total };
}

export async function fetchWorkdayBoard(slug: string, companyName?: string): Promise<NormalizedJob[]> {
  return (await fetchWorkdayBoardPaged(slug, companyName)).jobs;
}

// Cheap liveness check for discovery: does the board answer with ≥1 posting?
export async function workdayJobCount(slug: string): Promise<number | null> {
  const s = parseWorkdaySlug(slug);
  if (!s) return null;
  try {
    const d = await wdFetch<WdListResponse>(`${workdayHost(s)}/wday/cxs/${s.tenant}/${s.site}/jobs`, {
      appliedFacets: {},
      limit: 1,
      offset: 0,
      searchText: "",
    });
    return (d.total ?? 0) > 0 ? (d.total as number) : null;
  } catch {
    return null;
  }
}

// Ownership evidence for discovery: Workday tenant names collide across
// employers ("pfg" is Pattison Food Group, not Performance Food Group), so a
// live board alone doesn't prove it's the company we want. Returns the site's
// sidebar branding text plus one posting's title + description, for a name
// check (probe.ts: workdayBelongsTo). Null when the board isn't live.
export async function workdayEvidence(slug: string): Promise<{ total: number; text: string } | null> {
  const s = parseWorkdaySlug(slug);
  if (!s) return null;
  const base = `${workdayHost(s)}/wday/cxs/${s.tenant}/${s.site}`;
  let list: WdListResponse;
  try {
    list = await wdFetch<WdListResponse>(`${base}/jobs`, { appliedFacets: {}, limit: 1, offset: 0, searchText: "" });
  } catch {
    return null;
  }
  const total = list.total ?? 0;
  if (total <= 0) return null;
  const parts: string[] = [];
  try {
    const side = await wdFetch<Array<{ altText?: string; text?: string }>>(`${base}/sidebar`);
    for (const item of Array.isArray(side) ? side : []) parts.push(item.altText ?? "", item.text ?? "");
  } catch {
    // sidebar is optional
  }
  const path = list.jobPostings?.[0]?.externalPath;
  if (path) {
    try {
      const d = await wdFetch<WdDetail>(`${base}${path}`);
      parts.push(d.jobPostingInfo?.title ?? "", d.jobPostingInfo?.jobDescription ?? "");
    } catch {
      // detail is optional
    }
  }
  const text = parts
    .join(" ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/gi, "&") // "P&amp;G" must survive as "P&G" for the name check
    .replace(/&[a-z#0-9]+;/gi, " ");
  return { total, text };
}

interface WdDetail {
  jobPostingInfo?: {
    title?: string;
    jobDescription?: string;
    location?: string;
    additionalLocations?: string[];
    startDate?: string;
    timeType?: string;
    remoteType?: string;
    country?: { descriptor?: string };
    externalUrl?: string;
  };
}

export interface WorkdayHydration {
  raw_json: Record<string, unknown>;
  location_raw: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  remote_type: NormalizedJob["remote_type"];
  posted_date: string | null;
  posted_date_approx: boolean;
}

// Fetch a listing's detail and return the columns to update. raw_json gains
// jobDescription (what jdText() reads) and a _hydrated marker so it's fetched
// once. Returns null when the posting can't be read (closed, network).
export async function hydrateWorkdayJob(raw: Record<string, unknown>): Promise<WorkdayHydration | null> {
  const wd = raw._wd as WorkdaySlug | undefined;
  const path = str(raw.externalPath);
  if (!wd?.tenant || !wd.wd || !wd.site || !path) return null;
  let d: WdDetail;
  try {
    d = await wdFetch<WdDetail>(`${workdayHost(wd)}/wday/cxs/${wd.tenant}/${wd.site}${path}`);
  } catch {
    return null;
  }
  const info = d.jobPostingInfo;
  if (!info) return null;
  const locs = [str(info.location), ...(info.additionalLocations ?? []).map(str)].filter(Boolean) as string[];
  const remoteHint = /remote/i.test(info.remoteType ?? "") ? "remote" : /hybrid/i.test(info.remoteType ?? "") ? "hybrid" : null;
  // City/region/country from the primary location; location_raw keeps them all.
  const loc = workdayLocation(locs[0] ?? str(raw.locationsText), remoteHint);
  const start = str(info.startDate);
  return {
    raw_json: {
      ...raw,
      jobDescription: info.jobDescription ?? "",
      _hydrated: true,
    },
    location_raw: locs.length ? locs.join(" / ") : loc.location_raw,
    city: loc.city,
    region: loc.region,
    country: str(info.country?.descriptor) ?? loc.country,
    remote_type: loc.remote_type,
    posted_date: start ? new Date(start).toISOString() : null,
    posted_date_approx: !start,
  };
}
