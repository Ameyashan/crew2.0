// Direct readers for the ATS boards that expose a public JSON API for a single
// posting (Greenhouse, Lever). Handing Claude a bare job URL and asking it to
// web_search for the posting is unreliable for numeric ATS URLs — the model can
// land on a *different* opening at the same company (e.g. "Design Engineer,
// Claude" instead of the "Product Manager, Human Data Platform" the URL points
// to). When the URL is a known ATS, fetch the exact posting straight from the
// source so the resume tailor and the job-meta parser read the right job.
//
// Everything here is best-effort: any failure returns null and the callers fall
// back to the existing web_search path, so this can only improve accuracy.

export interface FetchedJob {
  title: string | null; // the role title exactly as posted
  company: string | null; // hiring company (slug-derived when the API omits it)
  team: string | null; // department/team the role sits in, if the API exposes it
  location: string | null;
  text: string; // plain-text JD body
  source: "greenhouse" | "lever";
  url: string;
}

const FETCH_TIMEOUT_MS = 8000;
const MAX_JD_CHARS = 12000;

export async function fetchAtsPosting(url: string): Promise<FetchedJob | null> {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  try {
    if (host.endsWith("greenhouse.io")) return await fetchGreenhouse(u);
    if (host.endsWith("lever.co")) return await fetchLever(u);
  } catch {
    return null;
  }
  return null;
}

// https://job-boards.greenhouse.io/{board}/jobs/{id}
// https://boards.greenhouse.io/{board}/jobs/{id}
// → https://boards-api.greenhouse.io/v1/boards/{board}/jobs/{id}
async function fetchGreenhouse(u: URL): Promise<FetchedJob | null> {
  const parts = u.pathname.split("/").filter(Boolean);
  const jobsIdx = parts.indexOf("jobs");
  if (jobsIdx < 1) return null;
  const board = parts[0];
  const id = (parts[jobsIdx + 1] ?? "").replace(/[^0-9]/g, "");
  if (!board || !id) return null;

  const data = await getJson<{
    title?: unknown;
    content?: unknown;
    company_name?: unknown;
    departments?: { name?: unknown }[];
    location?: { name?: unknown };
  }>(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs/${id}`);
  if (!data) return null;
  const text = htmlToText(typeof data.content === "string" ? data.content : "");
  if (!text) return null;
  return {
    title: typeof data.title === "string" ? data.title : null,
    company:
      (typeof data.company_name === "string" && data.company_name) || slugToName(board),
    team: str(data.departments?.[0]?.name),
    location: str(data.location?.name),
    text,
    source: "greenhouse",
    url: u.toString(),
  };
}

// https://jobs.lever.co/{site}/{id} → https://api.lever.co/v0/postings/{site}/{id}
async function fetchLever(u: URL): Promise<FetchedJob | null> {
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const site = parts[0];
  const id = parts[1];
  if (!site || !id) return null;

  const data = await getJson<{
    text?: unknown;
    description?: unknown;
    descriptionPlain?: unknown;
    categories?: { team?: unknown; department?: unknown; location?: unknown };
  }>(`https://api.lever.co/v0/postings/${encodeURIComponent(site)}/${encodeURIComponent(id)}`);
  if (!data) return null;
  const text =
    (typeof data.descriptionPlain === "string" && data.descriptionPlain.trim()) ||
    htmlToText(typeof data.description === "string" ? data.description : "");
  if (!text) return null;
  return {
    title: typeof data.text === "string" ? data.text : null,
    company: slugToName(site),
    team: str(data.categories?.team) ?? str(data.categories?.department),
    location: str(data.categories?.location),
    text,
    source: "lever",
    url: u.toString(),
  };
}

async function getJson<T>(url: string): Promise<T | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: ctrl.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Narrow an unknown JSON field to a trimmed non-empty string, else null.
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

// Greenhouse returns the JD as entity-escaped HTML (&lt;p&gt;…&lt;/p&gt;); Lever
// returns real HTML. Decode the structural entities first so the tag stripper
// sees actual markup, then flatten to readable plain text.
function htmlToText(raw: string): string {
  if (!raw) return "";
  let s = raw
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
  s = s
    .replace(/<\s*(script|style)[\s\S]*?<\/\s*\1\s*>/gi, " ")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6]|tr|ul|ol)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&#39;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&[a-z]+;/gi, " ");
  return s
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_JD_CHARS);
}

// "anthropic" → "Anthropic". A last-resort company name when the API doesn't
// carry a display name; the board/site slug is the company in practice.
function slugToName(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
