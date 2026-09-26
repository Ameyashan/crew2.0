// Eightfold AI adapter — branded career sites for large enterprises (Micron,
// Bayer, PepsiCo, Autodesk, …). Each tenant serves one of two zero-auth JSON
// APIs from {tenant}.eightfold.ai:
//   legacy: GET /api/apply/v2/jobs?domain={d}&start=n&num=10[&location=…]
//           GET /api/apply/v2/jobs/{id}?domain={d}            (JD: job_description)
//   PCSX:   GET /api/pcsx/search?domain={d}&start=n&num=10[&location=…]
//           GET /api/pcsx/position_details?position_id={id}&domain={d}&hl=en  (JD: data.jobDescription)
// A tenant answers one and 403s the other ("Not authorized for PCSX" / "PCSX
// is not enabled"), so we try legacy first and fall back on a 403.
// Catalog slug format: "{tenant}/{domain}", e.g. "micron/micron.com".
//
// Pages are server-capped at 10 rows, so the listing is US-filtered
// (location=United States) and capped at EIGHTFOLD_MAX_JOBS; the JD is
// fetched lazily by hydrateEightfoldJob().
//
// Ported from career-ops providers/eightfold.mjs (MIT, © 2026 Santiago
// Fernández de Valderrama — see THIRD_PARTY_NOTICES.md), plus the PCSX API.
//
// Relative imports only (universe/careers.ts + verify.ts run under plain Node).

import { str } from "../util.ts";
import { normalizeLocation } from "../normalize.ts";
import { HttpError, httpJson, sleep } from "./http.ts";
import type { NormalizedJob } from "@/lib/jobs/types";
import type { BoardFetch, WorkdayHydration } from "./workday.ts";

const PAGE = 10;
export const EIGHTFOLD_MAX_JOBS = 200;
const PAGE_DELAY_MS = 150;
const US = "United States";

type EfApi = "v2" | "pcsx";

export interface EightfoldSlug {
  tenant: string;
  domain: string;
}

const TENANT_RE = /^[a-z0-9-]{2,60}$/;
const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export function parseEightfoldSlug(slug: string): EightfoldSlug | null {
  const [tenant, domain] = slug.trim().toLowerCase().split("/");
  return tenant && domain && TENANT_RE.test(tenant) && DOMAIN_RE.test(domain) ? { tenant, domain } : null;
}

// https://{tenant}.eightfold.ai/careers[?domain=x.com] → "tenant/x.com"
// (the domain defaults to "{tenant}.com" — most tenants use their own .com).
export function eightfoldSlugFromUrl(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const m = u.hostname.toLowerCase().match(/^([a-z0-9-]+)\.eightfold\.ai$/);
  if (!m || /^(www|app|api|cdn|static)$/.test(m[1])) return null;
  const domain = (u.searchParams.get("domain") ?? `${m[1]}.com`).toLowerCase();
  return parseEightfoldSlug(`${m[1]}/${domain}`) ? `${m[1]}/${domain}` : null;
}

const host = (s: EightfoldSlug) => `https://${s.tenant}.eightfold.ai`;

function listUrl(api: EfApi, s: EightfoldSlug, start: number, num: number, us: boolean): string {
  const q = new URLSearchParams({ domain: s.domain, start: String(start), num: String(num) });
  if (us) q.set("location", US);
  return api === "v2" ? `${host(s)}/api/apply/v2/jobs?${q}` : `${host(s)}/api/pcsx/search?${q}`;
}

interface EfPosition {
  id?: number | string;
  name?: string;
  posting_name?: string;
  location?: string;
  locations?: string[];
  t_create?: number;
  t_update?: number;
  postedTs?: number;
  creationTs?: number;
  canonicalPositionUrl?: string;
  positionUrl?: string;
  publicUrl?: string;
  work_location_option?: string;
  workLocationOption?: string;
}

interface EfPage {
  positions: EfPosition[];
  count: number | null;
}

async function listPage(api: EfApi, s: EightfoldSlug, start: number, num: number, us: boolean): Promise<EfPage> {
  if (api === "v2") {
    const d = await httpJson<{ positions?: EfPosition[]; count?: number }>(listUrl(api, s, start, num, us));
    return { positions: d.positions ?? [], count: typeof d.count === "number" ? d.count : null };
  }
  const d = await httpJson<{ data?: { positions?: EfPosition[]; count?: number } }>(listUrl(api, s, start, num, us));
  return { positions: d.data?.positions ?? [], count: typeof d.data?.count === "number" ? d.data.count : null };
}

// Which API this tenant serves, with its first page. A 403 on legacy means
// PCSX (and vice versa); anything else is a real failure.
async function firstPage(s: EightfoldSlug, num: number, us: boolean): Promise<{ api: EfApi; page: EfPage }> {
  try {
    return { api: "v2", page: await listPage("v2", s, 0, num, us) };
  } catch (e) {
    if (!(e instanceof HttpError) || e.status !== 403) throw e;
  }
  return { api: "pcsx", page: await listPage("pcsx", s, 0, num, us) };
}

const secToIso = (v: unknown): string | null => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null;
};

function workOption(v: string | undefined): NormalizedJob["remote_type"] | null {
  const s = (v ?? "").toLowerCase();
  if (s.includes("remote")) return "remote";
  if (s.includes("hybrid")) return "hybrid";
  if (s.includes("onsite") || s.includes("on-site")) return "onsite";
  return null;
}

// Pure: one position → NormalizedJob (null when it has no id or title).
export function eightfoldJob(s: EightfoldSlug, api: EfApi, p: EfPosition, company: string): NormalizedJob | null {
  const id = p.id != null ? String(p.id) : "";
  const title = str(p.name) ?? str(p.posting_name);
  if (!id || !title) return null;
  const locs = [...new Set([str(p.location), ...(p.locations ?? []).map(str)].filter(Boolean) as string[])];
  const loc = normalizeLocation(locs[0] ?? null, workOption(p.work_location_option ?? p.workLocationOption));
  const posted = secToIso(p.t_create ?? p.postedTs ?? p.creationTs ?? p.t_update);
  const rel = str(p.positionUrl);
  const url =
    [str(p.canonicalPositionUrl), str(p.publicUrl)].find((u) => u && /^https:\/\//i.test(u)) ??
    (rel && rel.startsWith("/") ? `${host(s)}${rel}` : `${host(s)}/careers/job/${encodeURIComponent(id)}`);
  return {
    ats: "eightfold",
    external_job_id: `${s.tenant}:${id}`,
    title: title.trim(),
    company,
    location_raw: locs.length ? locs.join(" / ") : null,
    city: loc.city,
    region: loc.region,
    country: loc.country,
    remote_type: loc.remote_type,
    compensation: null,
    posted_date: posted,
    posted_date_approx: !posted,
    url,
    raw_json: { ...p, _ef: { tenant: s.tenant, domain: s.domain, api } } as Record<string, unknown>,
  };
}

export async function fetchEightfoldBoardPaged(slug: string, companyName?: string): Promise<BoardFetch> {
  const s = parseEightfoldSlug(slug);
  if (!s) throw new Error(`bad eightfold slug "${slug}" (want tenant/domain)`);
  const company = companyName || s.tenant;

  const { api, page: first } = await firstPage(s, PAGE, true);
  const total = first.count ?? first.positions.length;
  const positions = [...first.positions];
  for (let start = PAGE; start < Math.min(total, EIGHTFOLD_MAX_JOBS); start += PAGE) {
    await sleep(PAGE_DELAY_MS);
    const { positions: got } = await listPage(api, s, start, PAGE, true);
    if (!got.length) break;
    positions.push(...got);
    if (got.length < PAGE) break;
  }
  const seen = new Set<string>();
  const jobs: NormalizedJob[] = [];
  for (const p of positions) {
    const j = eightfoldJob(s, api, p, company);
    if (!j || seen.has(j.external_job_id)) continue;
    seen.add(j.external_job_id);
    jobs.push(j);
  }
  return { jobs, complete: positions.length >= total };
}

export async function fetchEightfoldBoard(slug: string, companyName?: string): Promise<NormalizedJob[]> {
  return (await fetchEightfoldBoardPaged(slug, companyName)).jobs;
}

async function positionJd(s: EightfoldSlug, api: EfApi, id: string): Promise<string | null> {
  if (api === "v2") {
    const d = await httpJson<{ job_description?: string }>(
      `${host(s)}/api/apply/v2/jobs/${encodeURIComponent(id)}?domain=${encodeURIComponent(s.domain)}`,
    );
    return str(d.job_description);
  }
  const d = await httpJson<{ data?: { jobDescription?: string } }>(
    `${host(s)}/api/pcsx/position_details?position_id=${encodeURIComponent(id)}&domain=${encodeURIComponent(s.domain)}&hl=en`,
  );
  return str(d.data?.jobDescription);
}

// Ownership evidence: the tenant's domain plus the newest posting's JD (which
// nearly always names the employer). Null when the board isn't live.
export async function eightfoldEvidence(slug: string): Promise<{ total: number; text: string } | null> {
  const s = parseEightfoldSlug(slug);
  if (!s) return null;
  let api: EfApi;
  let page: EfPage;
  try {
    ({ api, page } = await firstPage(s, 1, false));
  } catch {
    return null;
  }
  const total = page.count ?? page.positions.length;
  const p = page.positions[0];
  if (total <= 0 || !p) return null;
  const parts = [s.domain.split(".")[0], str(p.name) ?? ""];
  try {
    if (p.id != null) parts.push((await positionJd(s, api, String(p.id))) ?? "");
  } catch {
    // JD is optional
  }
  return { total, text: parts.join(" ").replace(/<[^>]+>/g, " ") };
}

export async function hydrateEightfoldJob(raw: Record<string, unknown>): Promise<WorkdayHydration | null> {
  const ef = raw._ef as (EightfoldSlug & { api?: EfApi }) | undefined;
  const s = ef ? parseEightfoldSlug(`${ef.tenant}/${ef.domain}`) : null;
  const id = raw.id != null ? String(raw.id) : "";
  if (!s || !id) return null;
  let jd: string | null;
  try {
    jd = await positionJd(s, ef?.api === "pcsx" ? "pcsx" : "v2", id);
  } catch {
    return null;
  }
  const job = eightfoldJob(s, ef?.api === "pcsx" ? "pcsx" : "v2", raw as EfPosition, "");
  if (!job) return null;
  return {
    raw_json: { ...raw, jobDescription: jd ?? "", _hydrated: true },
    location_raw: job.location_raw,
    city: job.city,
    region: job.region,
    country: job.country,
    remote_type: job.remote_type,
    posted_date: job.posted_date,
    posted_date_approx: job.posted_date_approx,
  };
}
