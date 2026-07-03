// Shared input classification for compose. The page banner previews the flow
// (job / person / fuzzy) and the runs store picks which stream to hit — both
// must agree, so this is the single source of truth. Safe on client and server.

// Public ATS / job-board hosts whose URLs mean "job posting" even when the
// text contains none of the job words below (e.g. acme.recruitee.com/o/role).
// Hostname-suffix tests, not substring matches, so "recruitee" in prose or a
// path never false-positives.
const ATS_HOSTS: RegExp[] = [
  /(^|\.)greenhouse\.io$/,
  /(^|\.)lever\.co$/,
  /(^|\.)ashbyhq\.com$/,
  /(^|\.)workable\.com$/,
  /(^|\.)wellfound\.com$/,
  /(^|\.)builtin\.com$/,
  /(^|\.)myworkdayjobs\.com$/,
  /(^|\.)workday\.com$/,
  /(^|\.)recruitee\.com$/,
  /(^|\.)smartrecruiters\.com$/,
  /(^|\.)jobvite\.com$/,
  /(^|\.)icims\.com$/,
  /(^|\.)teamtailor\.com$/,
  /(^|\.)personio\.(de|com)$/,
  /(^|\.)breezy\.hr$/,
  /(^|\.)applytojob\.com$/, // JazzHR
  /(^|\.)bamboohr\.com$/,
  /(^|\.)pinpointhq\.com$/,
];

// Pull the hostnames out of anything URL-shaped in the text. Tolerates bare
// domains ("acme.recruitee.com/o/role") by prepending https:// for parsing.
function hostnames(text: string): string[] {
  const out: string[] = [];
  for (const token of (text || "").split(/\s+/)) {
    if (!token.includes(".")) continue;
    const candidate = /^https?:\/\//i.test(token) ? token : `https://${token}`;
    try {
      out.push(new URL(candidate).hostname.toLowerCase());
    } catch {
      // not a URL after all (e.g. "e.g." or a sentence fragment) — skip
    }
  }
  return out;
}

export function isJobBoardUrl(text: string): boolean {
  return hostnames(text).some((h) => ATS_HOSTS.some((re) => re.test(h)));
}

// Job postings and profile links resolve to a concrete target; everything
// else is treated as a fuzzy "describe a person" search.
export function classifyKind(s: string): "person" | "job" | "fuzzy" {
  const lo = (s || "").toLowerCase().trim();
  if (!lo) return "person";
  if (/\b(jobs?|careers?|hiring|posting|positions?)\b/.test(lo)) return "job";
  if (isJobBoardUrl(lo)) return "job";
  if (lo.includes("/jobs/") || lo.includes("/careers/") || lo.includes("careers.")) return "job";
  if (/(linkedin\.com\/in\/|x\.com\/|twitter\.com\/|github\.com\/)/.test(lo)) return "person";
  if (/^https?:\/\//.test(lo) || lo.includes(".com/") || lo.includes(".io/")) return "person";
  return "fuzzy";
}

// The store only distinguishes the two streams; fuzzy folds into person.
export function detectKind(s: string): "person" | "job" {
  return classifyKind(s) === "job" ? "job" : "person";
}
