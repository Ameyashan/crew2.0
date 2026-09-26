// SmartRecruiters adapter — the public Posting API (zero-auth):
//   GET https://api.smartrecruiters.com/v1/companies/{company}/postings?limit=100&offset=n[&country=us]
//   GET https://api.smartrecruiters.com/v1/companies/{company}/postings/{id}
// Catalog slug = the company identifier (case-insensitive; stored lowercase),
// e.g. "servicenow", "boschgroup", "wise".
//
// The listing is US-filtered (country=us) when the company has US postings,
// capped at SR_MAX_JOBS, and carries no description — hydrateSmartRecruitersJob()
// fetches the JD lazily. Each posting names its company (`company.name`),
// which is what the ownership check compares.
//
// Ported from career-ops providers/smartrecruiters.mjs (MIT, © 2026 Santiago
// Fernández de Valderrama — see THIRD_PARTY_NOTICES.md).
//
// Relative imports only (universe/careers.ts + verify.ts run under plain Node).

import { str } from "../util.ts";
import { normalizeLocation } from "../normalize.ts";
import { httpJson } from "./http.ts";
import type { NormalizedJob } from "@/lib/jobs/types";
import type { BoardFetch, WorkdayHydration } from "./workday.ts";

const PAGE = 100;
export const SR_MAX_JOBS = 500;
const API = "https://api.smartrecruiters.com/v1/companies";

const SLUG_RE = /^[A-Za-z0-9_.-]{2,80}$/;

export function isSmartRecruitersSlug(slug: string): boolean {
  return SLUG_RE.test(slug.trim());
}

// jobs.smartrecruiters.com/{Company}[/…] or careers.smartrecruiters.com/{Company}.
export function smartRecruitersSlugFromUrl(url: string): string | null {
  const m = url.match(/\b(?:jobs|careers)\.smartrecruiters\.com\/([A-Za-z0-9_.-]+)/i);
  if (!m || /^(oneclick-ui|api|static|sr-jobs|embed|widget)$/i.test(m[1])) return null;
  return m[1];
}

interface SrPosting {
  id?: string;
  name?: string;
  releasedDate?: string;
  company?: { identifier?: string; name?: string };
  location?: {
    city?: string;
    region?: string;
    country?: string;
    remote?: boolean;
    hybrid?: boolean;
    fullLocation?: string;
  };
  typeOfEmployment?: { label?: string };
}

interface SrList {
  totalFound?: number;
  content?: SrPosting[];
}

const listUrl = (slug: string, offset: number, limit: number, us: boolean) =>
  `${API}/${encodeURIComponent(slug)}/postings?limit=${limit}&offset=${offset}${us ? "&country=us" : ""}`;

// Pure: one posting → NormalizedJob (null when it has no id or title).
export function smartRecruitersJob(slug: string, p: SrPosting, companyName?: string): NormalizedJob | null {
  const id = str(p.id);
  if (!id || !str(p.name)) return null;
  const l = p.location ?? {};
  const text = str(l.fullLocation) ?? ([l.city, l.region, l.country].filter(Boolean).join(", ") || null);
  const hint = l.remote ? "remote" : l.hybrid ? "hybrid" : null;
  const loc = normalizeLocation(text, hint);
  const ident = str(p.company?.identifier) ?? slug;
  const title = String(p.name).trim();
  const titleSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const released = str(p.releasedDate);
  const t = released ? Date.parse(released) : NaN;
  return {
    ats: "smartrecruiters",
    external_job_id: `${slug.toLowerCase()}:${id}`,
    title,
    company: companyName || str(p.company?.name) || slug,
    location_raw: loc.location_raw,
    city: loc.city,
    region: loc.region,
    country: loc.country ?? (l.country?.toLowerCase() === "us" ? "United States" : null),
    remote_type: loc.remote_type,
    compensation: null,
    posted_date: Number.isNaN(t) ? null : new Date(t).toISOString(),
    posted_date_approx: Number.isNaN(t),
    // The public page resolves by id; the title slug is cosmetic.
    url: `https://jobs.smartrecruiters.com/${encodeURIComponent(ident)}/${encodeURIComponent(id)}${titleSlug ? `-${titleSlug}` : ""}`,
    raw_json: { ...p, _sr: { company: slug } } as Record<string, unknown>,
  };
}

export async function fetchSmartRecruitersBoardPaged(slug: string, companyName?: string): Promise<BoardFetch> {
  if (!isSmartRecruitersSlug(slug)) throw new Error(`bad smartrecruiters slug "${slug}"`);
  // US postings when there are any; otherwise the whole board (parity with the
  // Greenhouse/Lever/Ashby boards, which aren't filtered either).
  let us = true;
  let first = await httpJson<SrList>(listUrl(slug, 0, PAGE, true));
  if (!first.totalFound) {
    us = false;
    first = await httpJson<SrList>(listUrl(slug, 0, PAGE, false));
  }
  const total = first.totalFound ?? 0;
  const postings: SrPosting[] = [...(first.content ?? [])];
  for (let offset = PAGE; offset < Math.min(total, SR_MAX_JOBS); offset += PAGE) {
    const got = (await httpJson<SrList>(listUrl(slug, offset, PAGE, us))).content ?? [];
    if (!got.length) break;
    postings.push(...got);
  }
  const seen = new Set<string>();
  const jobs: NormalizedJob[] = [];
  for (const p of postings) {
    const j = smartRecruitersJob(slug, p, companyName);
    if (!j || seen.has(j.external_job_id)) continue;
    seen.add(j.external_job_id);
    jobs.push(j);
  }
  return { jobs, complete: postings.length >= total };
}

export async function fetchSmartRecruitersBoard(slug: string, companyName?: string): Promise<NormalizedJob[]> {
  return (await fetchSmartRecruitersBoardPaged(slug, companyName)).jobs;
}

// Ownership evidence: postings carry the company's display name. Null when
// the board isn't live.
export async function smartRecruitersEvidence(
  slug: string,
): Promise<{ total: number; companyName: string; text: string } | null> {
  if (!isSmartRecruitersSlug(slug)) return null;
  try {
    const d = await httpJson<SrList>(listUrl(slug, 0, 1, false));
    const total = d.totalFound ?? 0;
    const p = d.content?.[0];
    if (total <= 0 || !p) return null;
    return { total, companyName: str(p.company?.name) ?? "", text: `${p.company?.name ?? ""} ${p.name ?? ""}` };
  } catch {
    return null;
  }
}

interface SrDetail {
  jobAd?: { sections?: Record<string, { title?: string; text?: string }> };
  location?: SrPosting["location"];
  releasedDate?: string;
}

// Detail → full JD (role first, then qualifications, extra info, company blurb).
export async function hydrateSmartRecruitersJob(raw: Record<string, unknown>): Promise<WorkdayHydration | null> {
  const sr = raw._sr as { company?: string } | undefined;
  const id = str(raw.id);
  if (!sr?.company || !id || !isSmartRecruitersSlug(sr.company)) return null;
  let d: SrDetail;
  try {
    d = await httpJson<SrDetail>(`${API}/${encodeURIComponent(sr.company)}/postings/${encodeURIComponent(id)}`);
  } catch {
    return null;
  }
  const sections = d.jobAd?.sections ?? {};
  const html = ["jobDescription", "qualifications", "additionalInformation", "companyDescription"]
    .map((k) => sections[k]?.text)
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .join("\n");
  const job = smartRecruitersJob(sr.company, { ...(raw as SrPosting), location: d.location ?? (raw as SrPosting).location });
  if (!job) return null;
  return {
    raw_json: { ...raw, jobDescription: html, _hydrated: true },
    location_raw: job.location_raw,
    city: job.city,
    region: job.region,
    country: job.country,
    remote_type: job.remote_type,
    posted_date: job.posted_date,
    posted_date_approx: job.posted_date_approx,
  };
}
