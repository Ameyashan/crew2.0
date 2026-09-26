// Careers-page discovery: fetch an employer's own careers page and pull any
// job-board link out of its HTML (a "Search jobs" button pointing at
// homedepot.wd5.myworkdayjobs.com/CareerDepot, an embedded Greenhouse board,
// an Oracle Candidate Experience site, …). Catches boards whose slug/site name nobody would guess. Best-effort:
// many careers pages render client-side and expose nothing, which is fine —
// every attempt returned here is still verified live before it's trusted.
//
// Relative imports only (runs under plain Node in scripts/ too).

import { workdaySlugFromUrl } from "../sources/workday.ts";
import { oracleSlugFromUrl } from "../sources/oracle.ts";
import { smartRecruitersSlugFromUrl } from "../sources/smartrecruiters.ts";
import { eightfoldSlugFromUrl } from "../sources/eightfold.ts";
import { icimsSlugFromUrl } from "../sources/icims.ts";

export interface CareersAttempt {
  ats: "greenhouse" | "lever" | "ashby" | "workday" | "oracle" | "smartrecruiters" | "eightfold" | "icims";
  slug: string;
}

const TIMEOUT_MS = 12_000;
const MAX_BYTES = 3_000_000;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

// Board links in page HTML, most specific first. Pure — exported for tests.
export function boardLinksIn(html: string): CareersAttempt[] {
  const out: CareersAttempt[] = [];
  const seen = new Set<string>();
  const add = (ats: CareersAttempt["ats"], slug: string | null | undefined) => {
    if (!slug) return;
    const key = `${ats}:${slug.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ats, slug });
  };
  for (const m of html.matchAll(/https?:\/\/[a-z0-9-]+\.wd\d+\.myworkdayjobs\.com\/[^\s"'<>)]*/gi)) {
    add("workday", workdaySlugFromUrl(m[0]));
  }
  for (const m of html.matchAll(/(?:job-boards|boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-z0-9_-]+)/gi)) {
    if (!/^(embed|v1)$/i.test(m[1])) add("greenhouse", m[1].toLowerCase());
  }
  for (const m of html.matchAll(/boards-api\.greenhouse\.io\/v1\/boards\/([a-z0-9_-]+)/gi)) add("greenhouse", m[1].toLowerCase());
  for (const m of html.matchAll(/jobs\.lever\.co\/([a-z0-9_-]+)/gi)) add("lever", m[1].toLowerCase());
  for (const m of html.matchAll(/jobs\.ashbyhq\.com\/([A-Za-z0-9_.-]+)/gi)) {
    if (!/^(api|embed)$/i.test(m[1])) add("ashby", m[1]);
  }
  for (const m of html.matchAll(
    /https?:\/\/[a-z0-9-]+\.fa\.(?:[a-z0-9-]+\.)?(?:ocs\.)?oraclecloud\d{0,2}\.com\/hcmUI\/CandidateExperience\/[^\s"'<>)]*/gi,
  )) {
    add("oracle", oracleSlugFromUrl(m[0]));
  }
  for (const m of html.matchAll(/(?:jobs|careers)\.smartrecruiters\.com\/[A-Za-z0-9_.-]+/gi)) {
    add("smartrecruiters", smartRecruitersSlugFromUrl(m[0]));
  }
  for (const m of html.matchAll(/https?:\/\/[a-z0-9-]+\.eightfold\.ai\/careers[^\s"'<>)]*/gi)) {
    add("eightfold", eightfoldSlugFromUrl(m[0].replace(/&amp;/g, "&")));
  }
  for (const m of html.matchAll(/https?:\/\/[a-z0-9-]+\.icims\.com\/jobs\b/gi)) {
    add("icims", icimsSlugFromUrl(m[0]));
  }
  return out.slice(0, 8);
}

export async function discoverFromCareersPage(url: string | null): Promise<CareersAttempt[]> {
  if (!url || !/^https?:\/\//i.test(url)) return [];
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: ctrl.signal,
    });
    // The final URL after redirects can itself be the board.
    const direct = boardLinksIn(res.url);
    if (!res.ok) return direct;
    const html = (await res.text()).slice(0, MAX_BYTES);
    const links = boardLinksIn(html);
    return [...direct, ...links.filter((l) => !direct.some((d) => d.ats === l.ats && d.slug === l.slug))];
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}
