// Low-level ATS fetch helpers (Module 1), factored out of src/lib/job-fetch.ts so
// the single-posting reader and the board-listing fetchers share one
// implementation. `getJson` swallows failures (best-effort, returns null);
// `fetchJson` throws on failure so the board fetchers + catalog validator can
// distinguish "board errored" from "board returned zero jobs".

export const ATS_FETCH_TIMEOUT_MS = 8000;
const DEFAULT_MAX_JD_CHARS = 12000;

// Best-effort JSON GET: null on any non-ok / network / abort. Used where a
// failure should silently fall back (the single-posting reader).
export async function getJson<T>(url: string): Promise<T | null> {
  try {
    return await fetchJson<T>(url);
  } catch {
    return null;
  }
}

// Best-effort JSON POST: null on any non-ok / network / abort. Used by the
// single-posting reader for boards that expose their posting behind a POST
// (Ashby's GraphQL endpoint), so a failure silently falls back like getJson.
export async function postJson<T>(url: string, body: unknown): Promise<T | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ATS_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Strict JSON GET: throws on non-ok status, network error, or timeout. Used by
// the board-listing fetchers so callers can isolate per-company errors and the
// catalog validator can treat an error differently from an empty board.
export async function fetchJson<T>(url: string): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ATS_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

// Narrow an unknown JSON field to a trimmed non-empty string, else null.
export function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

// ATS boards return JDs as entity-escaped HTML (Greenhouse: &lt;p&gt;…) or real
// HTML (Lever/Ashby). Decode structural entities, strip tags, flatten to plain
// text, and cap length.
export function htmlToText(raw: string, maxChars: number = DEFAULT_MAX_JD_CHARS): string {
  if (!raw) return "";
  let s = raw.replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&amp;/gi, "&");
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
    .slice(0, maxChars);
}

// "anthropic" → "Anthropic". Last-resort company name when an API omits a
// display name; the board/site slug is the company in practice.
export function slugToName(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Extract plain-text JD body from a stored raw_json blob, per ATS. Greenhouse
// stores escaped HTML in `content`; Lever has descriptionPlain (+ html
// fallback); Ashby has descriptionPlain (+ html fallback). Shared by the
// enrichment pass (visa inference) and the scorer (JD snippets).
export function jdText(
  ats: string,
  raw: Record<string, unknown> | null | undefined,
  maxChars: number = DEFAULT_MAX_JD_CHARS,
): string {
  const get = (k: string) => (raw && typeof raw[k] === "string" ? (raw[k] as string) : "");
  if (ats === "greenhouse") return htmlToText(get("content"), maxChars);
  if (ats === "lever") return (get("descriptionPlain") || htmlToText(get("description"), maxChars)).slice(0, maxChars);
  if (ats === "ashby") return (get("descriptionPlain") || htmlToText(get("descriptionHtml"), maxChars)).slice(0, maxChars);
  return "";
}

// Run `fn` over `items` with a bounded concurrency pool. Keeps public ATS calls
// polite and preserves per-item error isolation (fn is expected to catch its own
// errors and return a result object).
export async function mapPool<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}
