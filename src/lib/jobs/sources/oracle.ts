// Oracle Recruiting Cloud (Fusion "Candidate Experience") adapter. Banks and
// large enterprises run their careers site on it — JPMorgan Chase, Goldman
// Sachs (behind higher.gs.com), American Express, Oracle. Every tenant exposes
// the same zero-auth REST API the site's own front end uses:
//   GET https://{host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions
//       ?onlyData=true&expand=…&finder=findReqs;siteNumber={site},limit=…,offset=…,sortBy=POSTING_DATES_DESC[,locationId=…]
//   GET https://{host}/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails
//       ?expand=all&onlyData=true&finder=ById;Id="{id}",siteNumber={site}
// Catalog slug format: "{host}/{siteNumber}", e.g.
// "jpmc.fa.oraclecloud.com/CX_1001", "hdpc.fa.us2.oraclecloud.com/LateralHiring".
//
// Like Workday: the listing is filtered to the US when the tenant exposes a
// "United States" location facet, capped at the newest ORACLE_MAX_JOBS (the
// board is then reported incomplete), and carries only a one-line summary —
// hydrateOracleJob() fetches the full JD lazily.
//
// Ported from career-ops providers/oraclecloud.mjs (MIT, © 2026 Santiago
// Fernández de Valderrama — see THIRD_PARTY_NOTICES.md).
//
// Relative imports only (universe/careers.ts + verify.ts run under plain Node).

import { str } from "../util.ts";
import { normalizeLocation } from "../normalize.ts";
import { httpJson } from "./http.ts";
import type { NormalizedJob } from "@/lib/jobs/types";
import type { BoardFetch, WorkdayHydration } from "./workday.ts";

const PAGE = 100;
export const ORACLE_MAX_JOBS = 300;

// <tenant>.fa[.<region>][.ocs].oraclecloud[1-99].com — a bounded host family,
// checked before every request so a slug can't point the fetcher elsewhere.
const ORACLE_HOST_RE = /^[a-z0-9-]+\.fa\.(?:[a-z0-9-]+\.)?(?:ocs\.)?oraclecloud(?:[1-9][0-9]?)?\.com$/i;

export interface OracleSlug {
  host: string;
  site: string;
}

export function parseOracleSlug(slug: string): OracleSlug | null {
  const m = slug.trim().match(/^([^/\s]+)\/([A-Za-z0-9_-]+)$/);
  if (!m || !ORACLE_HOST_RE.test(m[1])) return null;
  return { host: m[1].toLowerCase(), site: m[2] };
}

// ".../hcmUI/CandidateExperience/en/sites/CX_1001/job/123" → "host/CX_1001".
export function oracleSlugFromUrl(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!ORACLE_HOST_RE.test(u.hostname)) return null;
  const segs = u.pathname.split("/").filter(Boolean);
  const i = segs.indexOf("sites");
  const site = i !== -1 ? segs[i + 1] : null;
  if (!site || !/^[A-Za-z0-9_-]+$/.test(site)) return null;
  return `${u.hostname.toLowerCase()}/${site}`;
}

// The tenant label ("jpmc", "hdpc") — what the ownership check compares.
export function oracleTenant(slug: string): string {
  return parseOracleSlug(slug)?.host.split(".")[0] ?? "";
}

const api = (host: string) => `https://${host}/hcmRestApi/resources/latest`;

function listUrl(s: OracleSlug, offset: number, limit: number, opts: { locationId?: string; facets?: boolean }): string {
  // Finder grammar: `findReqs;key=val,key=val`. limit/offset go in BOTH the
  // finder and the query string — some tenants only honor one.
  const finder = [
    `siteNumber=${s.site}`,
    ...(opts.facets ? ["facetsList=LOCATIONS"] : []),
    `limit=${limit}`,
    "sortBy=POSTING_DATES_DESC",
    `offset=${offset}`,
    ...(opts.locationId ? [`locationId=${opts.locationId}`] : []),
  ].join(",");
  // `expand` is required: without requisitionList.* the list comes back empty.
  const expand = opts.facets ? "requisitionList.workLocation,locationsFacet" : "requisitionList.workLocation";
  return `${api(s.host)}/recruitingCEJobRequisitions?onlyData=true&expand=${encodeURIComponent(expand)}&finder=findReqs;${finder}&limit=${limit}&offset=${offset}`;
}

function detailUrl(s: OracleSlug, id: string): string {
  return `${api(s.host)}/recruitingCEJobRequisitionDetails?expand=all&onlyData=true&finder=ById;Id=%22${encodeURIComponent(id)}%22,siteNumber=${s.site}`;
}

export function oracleJobUrl(s: OracleSlug, id: string): string {
  return `https://${s.host}/hcmUI/CandidateExperience/en/sites/${s.site}/job/${encodeURIComponent(id)}`;
}

interface OracleReq {
  Id?: string | number;
  Title?: string;
  PostedDate?: string;
  PrimaryLocation?: string;
  PrimaryLocationCountry?: string;
  WorkplaceTypeCode?: string | null;
  ShortDescriptionStr?: string | null;
  ExternalURL?: string | null;
}

interface OracleListItem {
  TotalJobsCount?: number;
  requisitionList?: OracleReq[];
  locationsFacet?: Array<{ Id?: number | string; Name?: string; TotalCount?: number }>;
}

interface OracleList {
  items?: OracleListItem[];
}

const US_RE = /^(united states( of america)?|usa|us)$/i;

// The tenant's "United States" location facet id, or null (then unfiltered).
export function usLocationId(item: OracleListItem | undefined): string | null {
  const hit = (item?.locationsFacet ?? []).find((f) => US_RE.test((f.Name ?? "").trim()) && f.Id != null);
  return hit ? String(hit.Id) : null;
}

function remoteHint(code: string | null | undefined): NormalizedJob["remote_type"] | null {
  if (code === "ORA_REMOTE") return "remote";
  if (code === "ORA_HYBRID") return "hybrid";
  if (code === "ORA_ON_SITE" || code === "ORA_ONSITE") return "onsite";
  return null;
}

// Pure: one requisition → NormalizedJob (null when it has no id or title).
export function oracleJob(s: OracleSlug, r: OracleReq, company: string): NormalizedJob | null {
  const id = r.Id != null ? String(r.Id) : "";
  if (!id || !str(r.Title)) return null;
  const loc = normalizeLocation(str(r.PrimaryLocation), remoteHint(r.WorkplaceTypeCode));
  const posted = str(r.PostedDate);
  const t = posted ? Date.parse(posted) : NaN;
  return {
    ats: "oracle",
    external_job_id: `${s.host}:${id}`,
    title: String(r.Title).trim(),
    company,
    location_raw: loc.location_raw,
    city: loc.city,
    region: loc.region,
    country: loc.country,
    remote_type: loc.remote_type,
    compensation: null,
    posted_date: Number.isNaN(t) ? null : new Date(t).toISOString(),
    posted_date_approx: Number.isNaN(t),
    url: str(r.ExternalURL) ?? oracleJobUrl(s, id),
    raw_json: { ...r, _oracle: { host: s.host, site: s.site } } as Record<string, unknown>,
  };
}

export async function fetchOracleBoardPaged(slug: string, companyName?: string): Promise<BoardFetch> {
  const s = parseOracleSlug(slug);
  if (!s) throw new Error(`bad oracle slug "${slug}" (want host/siteNumber)`);
  const company = companyName || s.host.split(".")[0];

  // One facet-only probe finds the US filter; then walk newest-first.
  const probe = await httpJson<OracleList>(listUrl(s, 0, 1, { facets: true }));
  const locationId = usLocationId(probe.items?.[0]) ?? undefined;

  const reqs: OracleReq[] = [];
  let total: number | null = null;
  for (let offset = 0; offset < ORACLE_MAX_JOBS; offset += PAGE) {
    const page = await httpJson<OracleList>(listUrl(s, offset, PAGE, { locationId }));
    const item = page.items?.[0];
    if (total === null && typeof item?.TotalJobsCount === "number") total = item.TotalJobsCount;
    const got = item?.requisitionList ?? [];
    if (!got.length) break;
    reqs.push(...got);
    // A short page is NOT the end on every tenant (ORC filters rows
    // server-side); only stop early when the total says we're done.
    if (total !== null && offset + PAGE >= total) break;
  }

  const seen = new Set<string>();
  const jobs: NormalizedJob[] = [];
  for (const r of reqs) {
    const j = oracleJob(s, r, company);
    if (!j || seen.has(j.external_job_id)) continue;
    seen.add(j.external_job_id);
    if (locationId && !j.country) j.country = "United States";
    jobs.push(j);
  }
  return { jobs, complete: total !== null && reqs.length >= total };
}

export async function fetchOracleBoard(slug: string, companyName?: string): Promise<NormalizedJob[]> {
  return (await fetchOracleBoardPaged(slug, companyName)).jobs;
}

interface OracleDetail {
  Title?: string;
  ExternalDescriptionStr?: string | null;
  ExternalResponsibilitiesStr?: string | null;
  ExternalQualificationsStr?: string | null;
  CorporateDescriptionStr?: string | null;
  OrganizationDescriptionStr?: string | null;
  ExternalPostedStartDate?: string | null;
  PrimaryLocation?: string | null;
  WorkplaceTypeCode?: string | null;
  BusinessUnit?: string | null;
  LegalEmployer?: string | null;
  secondaryLocations?: Array<{ Name?: string }>;
  workLocation?: Array<{ LocationName?: string | null }>;
}

async function oracleDetail(s: OracleSlug, id: string): Promise<OracleDetail | null> {
  const d = await httpJson<{ items?: OracleDetail[] }>(detailUrl(s, id));
  return d.items?.[0] ?? null;
}

// Full JD HTML: description, then responsibilities / qualifications when the
// tenant splits them out.
function detailHtml(d: OracleDetail): string {
  return [d.ExternalDescriptionStr, d.ExternalResponsibilitiesStr, d.ExternalQualificationsStr]
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .join("\n");
}

// Ownership evidence for discovery: tenant hosts are opaque ("hdpc" is
// Goldman Sachs), so the board's own text must name the company. Returns the
// newest posting's full description + employer fields, or null when the board
// isn't live.
export async function oracleEvidence(slug: string): Promise<{ total: number; text: string } | null> {
  const s = parseOracleSlug(slug);
  if (!s) return null;
  let item: OracleListItem | undefined;
  try {
    item = (await httpJson<OracleList>(listUrl(s, 0, 1, {}))).items?.[0];
  } catch {
    return null;
  }
  const total = item?.TotalJobsCount ?? 0;
  const first = item?.requisitionList?.[0];
  if (total <= 0 || !first) return null;
  const parts = [first.Title ?? "", first.ShortDescriptionStr ?? ""];
  try {
    const d = first.Id != null ? await oracleDetail(s, String(first.Id)) : null;
    if (d) {
      parts.push(
        detailHtml(d),
        d.CorporateDescriptionStr ?? "",
        d.OrganizationDescriptionStr ?? "",
        d.BusinessUnit ?? "",
        d.LegalEmployer ?? "",
        ...(d.workLocation ?? []).map((w) => w.LocationName ?? ""),
      );
    }
  } catch {
    // detail is optional
  }
  return { total, text: parts.join(" ").replace(/<[^>]+>/g, " ") };
}

// Fetch a listing's detail: full JD into raw_json.jobDescription (what
// jdText() reads) + every location. Null when the posting can't be read.
export async function hydrateOracleJob(raw: Record<string, unknown>): Promise<WorkdayHydration | null> {
  const o = raw._oracle as OracleSlug | undefined;
  const id = raw.Id != null ? String(raw.Id) : "";
  if (!o?.host || !o.site || !id || !parseOracleSlug(`${o.host}/${o.site}`)) return null;
  let d: OracleDetail | null;
  try {
    d = await oracleDetail(o, id);
  } catch {
    return null;
  }
  if (!d) return null;
  const locs = [str(d.PrimaryLocation), ...(d.secondaryLocations ?? []).map((l) => str(l.Name))].filter(
    Boolean,
  ) as string[];
  const loc = normalizeLocation(locs[0] ?? str(raw.PrimaryLocation), remoteHint(d.WorkplaceTypeCode ?? null));
  const start = str(d.ExternalPostedStartDate);
  const t = start ? Date.parse(start) : NaN;
  return {
    raw_json: { ...raw, jobDescription: detailHtml(d), _hydrated: true },
    location_raw: locs.length ? locs.join(" / ") : loc.location_raw,
    city: loc.city,
    region: loc.region,
    country: loc.country,
    remote_type: loc.remote_type,
    posted_date: Number.isNaN(t) ? null : new Date(t).toISOString(),
    posted_date_approx: Number.isNaN(t),
  };
}
