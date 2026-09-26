// iCIMS adapter — the hosted career portals at {portal}.icims.com
// (careers-quest.icims.com, us-erac.icims.com, …). iCIMS has no public JSON
// listing API, so this reads the portal's own search pages:
//   GET https://{host}/jobs/search?ss=1&in_iframe=1&pr={page}   (0-based; ~20 cards/page)
// Each card carries title, link (/jobs/{id}/{slug}/job), a teaser and a
// "Location" field; dates and the full JD live only on the posting page's
// JSON-LD, which hydrateIcimsJob() reads lazily.
// Catalog slug = the portal host, e.g. "careers-quest.icims.com".
//
// Capped at ICIMS_MAX_PAGES (reported incomplete past it).
//
// Ported from career-ops providers/icims.mjs (MIT, © 2026 Santiago
// Fernández de Valderrama — see THIRD_PARTY_NOTICES.md).
//
// Relative imports only (universe/careers.ts + verify.ts run under plain Node).

import { str } from "../util.ts";
import { normalizeLocation } from "../normalize.ts";
import { decodeEntities, httpText, jsonLdJobPosting } from "./http.ts";
import type { NormalizedJob } from "@/lib/jobs/types";
import type { BoardFetch, WorkdayHydration } from "./workday.ts";

export const ICIMS_MAX_PAGES = 10;

const HOST_RE = /^[a-z0-9-]+\.icims\.com$/;
// iCIMS's own hosts, never a customer portal.
const NOT_PORTALS = new Set(["www", "careers", "community", "cdn", "developer", "help", "login", "api", "static"]);

export function isIcimsSlug(slug: string): boolean {
  const h = slug.trim().toLowerCase();
  return HOST_RE.test(h) && !NOT_PORTALS.has(h.split(".")[0]);
}

export function icimsSlugFromUrl(url: string): string | null {
  const m = url.match(/\b([a-z0-9-]+)\.icims\.com\b/i);
  if (!m) return null;
  const host = `${m[1].toLowerCase()}.icims.com`;
  return isIcimsSlug(host) ? host : null;
}

// "careers-quest" → "quest", "us-erac" → "erac": the portal label minus the
// conventional prefixes, for the ownership check.
export function icimsTenant(slug: string): string {
  return slug
    .toLowerCase()
    .split(".")[0]
    .replace(/^(careers|career|jobs|job|us|usa|external|ext|global|en)-/g, "")
    .replace(/-(careers|jobs|external|us)$/g, "");
}

const searchUrl = (host: string, page: number) => `https://${host}/jobs/search?ss=1&in_iframe=1&pr=${page}`;

// "US-TX-Abilene" → "Abilene, TX, United States"; anything else as given.
export function icimsLocation(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/^(US|USA)-([A-Z]{2})-(.+)$/);
  return m ? `${m[3].replace(/-/g, " ")}, ${m[2]}, United States` : raw;
}

const clean = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

export interface IcimsCard {
  id: string;
  title: string;
  url: string;
  location: string | null;
  teaser: string | null;
}

// Pure: job cards out of one search page. Links must stay on the portal host.
export function parseIcimsSearchPage(html: string, host: string): IcimsCard[] {
  const out: IcimsCard[] = [];
  for (const card of html.split("iCIMS_JobCardItem").slice(1)) {
    const href = card.match(/href="([^"]*\/jobs\/(\d+)\/[^"/]+\/job[^"]*)"/);
    if (!href) continue;
    let u: URL;
    try {
      u = new URL(decodeEntities(href[1]), `https://${host}`);
    } catch {
      continue;
    }
    if (u.hostname.toLowerCase() !== host) continue;
    const title = card.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/);
    if (!title || !clean(title[1])) continue;
    const loc = card.match(
      /field-label[^>]*>\s*Location\s*<\/span>[\s\S]*?<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/i,
    );
    const teaser = card.match(/class="[^"]*\bdescription\b[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    out.push({
      id: href[2],
      title: clean(title[1]),
      url: `https://${host}${u.pathname}`,
      location: loc ? clean(loc[1]) || null : null,
      teaser: teaser ? clean(teaser[1]) || null : null,
    });
  }
  return out;
}

// "Page 1 of 100" → 100 (null when the portal doesn't say).
export function icimsPageCount(html: string): number | null {
  const m = html.match(/Page\s+\d+\s+of\s+(\d+)/i);
  return m ? Number(m[1]) : null;
}

export function icimsJob(host: string, c: IcimsCard, company: string): NormalizedJob {
  const loc = normalizeLocation(icimsLocation(c.location));
  return {
    ats: "icims",
    external_job_id: `${host}:${c.id}`,
    title: c.title,
    company,
    location_raw: loc.location_raw,
    city: loc.city,
    region: loc.region,
    country: loc.country,
    remote_type: loc.remote_type,
    compensation: null,
    posted_date: null,
    posted_date_approx: true,
    url: c.url,
    raw_json: { ...c, _icims: { host } } as Record<string, unknown>,
  };
}

export async function fetchIcimsBoardPaged(slug: string, companyName?: string): Promise<BoardFetch> {
  const host = slug.trim().toLowerCase();
  if (!isIcimsSlug(host)) throw new Error(`bad icims slug "${slug}" (want <portal>.icims.com)`);
  const company = companyName || icimsTenant(host);
  const cards: IcimsCard[] = [];
  let pages: number | null = null;
  let fetched = 0;
  for (let page = 0; page < ICIMS_MAX_PAGES; page++) {
    const html = await httpText(searchUrl(host, page));
    fetched++;
    if (pages === null) pages = icimsPageCount(html);
    const got = parseIcimsSearchPage(html, host);
    if (!got.length) break;
    cards.push(...got);
    if (pages !== null && page + 1 >= pages) break;
  }
  const seen = new Set<string>();
  const jobs: NormalizedJob[] = [];
  for (const c of cards) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    jobs.push(icimsJob(host, c, company));
  }
  return { jobs, complete: pages === null ? fetched < ICIMS_MAX_PAGES : fetched >= pages };
}

export async function fetchIcimsBoard(slug: string, companyName?: string): Promise<NormalizedJob[]> {
  return (await fetchIcimsBoardPaged(slug, companyName)).jobs;
}

// Ownership evidence: the portal's page title ("Job Listings at Quest") and
// the first card's teaser. Null when the portal lists nothing.
export async function icimsEvidence(slug: string): Promise<{ total: number; text: string } | null> {
  const host = slug.trim().toLowerCase();
  if (!isIcimsSlug(host)) return null;
  let html: string;
  try {
    html = await httpText(searchUrl(host, 0));
  } catch {
    return null;
  }
  const cards = parseIcimsSearchPage(html, host);
  if (!cards.length) return null;
  const pages = icimsPageCount(html) ?? 1;
  const title = html.match(/<title>([\s\S]*?)<\/title>/i);
  return {
    total: pages * cards.length,
    text: [title ? clean(title[1]) : "", cards[0].teaser ?? ""].join(" "),
  };
}

type Address = { addressLocality?: string; addressRegion?: string; addressCountry?: string | { name?: string } };

function ldLocation(node: Record<string, unknown>): string | null {
  const locs = Array.isArray(node.jobLocation) ? node.jobLocation : node.jobLocation ? [node.jobLocation] : [];
  for (const l of locs as Array<{ address?: Address }>) {
    const a = l?.address;
    if (!a) continue;
    const country = typeof a.addressCountry === "string" ? a.addressCountry : a.addressCountry?.name;
    const text = [a.addressLocality, a.addressRegion, country && /^(us|usa)$/i.test(country) ? "United States" : country]
      .filter(Boolean)
      .join(", ");
    if (text) return text;
  }
  return null;
}

// Posting page → JD (JSON-LD description), real posted date, location.
export async function hydrateIcimsJob(raw: Record<string, unknown>): Promise<WorkdayHydration | null> {
  const host = (raw._icims as { host?: string } | undefined)?.host ?? "";
  const url = str(raw.url);
  if (!isIcimsSlug(host) || !url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.hostname.toLowerCase() !== host) return null;
  let html: string;
  try {
    html = await httpText(`https://${host}${u.pathname}?in_iframe=1`);
  } catch {
    return null;
  }
  const node = jsonLdJobPosting(html);
  if (!node) return null;
  const posted = str(node.datePosted);
  const t = posted ? Date.parse(posted) : NaN;
  const loc = normalizeLocation(ldLocation(node) ?? icimsLocation(str(raw.location)));
  return {
    raw_json: { ...raw, jobDescription: str(node.description) ?? "", _hydrated: true },
    location_raw: loc.location_raw,
    city: loc.city,
    region: loc.region,
    country: loc.country,
    remote_type: loc.remote_type,
    posted_date: Number.isNaN(t) ? null : new Date(t).toISOString(),
    posted_date_approx: Number.isNaN(t),
  };
}
