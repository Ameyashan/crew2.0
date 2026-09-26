// Shared HTTP for the enterprise board adapters (Oracle, SmartRecruiters,
// Eightfold, iCIMS). These hosts sit behind WAFs that are friendlier to a
// browser-like User-Agent, and every request pins its host up front and
// refuses redirects, so a slug can never steer a fetch somewhere else.
//
// Relative imports only: universe/careers.ts and universe/verify.ts run under
// plain Node in scripts/ too.

const TIMEOUT_MS = 12_000;
export const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

export class HttpError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(status: number, url: string, body: string = "") {
    super(`HTTP ${status} for ${url}`);
    this.status = status;
    this.body = body;
  }
}

interface RequestOpts {
  method?: "GET" | "POST";
  body?: unknown;
  accept?: string;
}

async function request(url: string, opts: RequestOpts = {}): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: opts.method ?? (opts.body ? "POST" : "GET"),
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: opts.accept ?? "application/json",
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      redirect: "error",
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new HttpError(res.status, url, body.slice(0, 300));
    }
    return res;
  } finally {
    clearTimeout(t);
  }
}

// Strict: throws HttpError on a non-ok status, and on network error / timeout.
export async function httpJson<T>(url: string, opts?: RequestOpts): Promise<T> {
  return (await (await request(url, opts)).json()) as T;
}

export async function httpText(url: string): Promise<string> {
  return (await request(url, { accept: "text/html,application/xhtml+xml" })).text();
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Minimal entity decode for titles/locations scraped out of HTML.
export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

// schema.org JobPosting nodes from a page's JSON-LD blocks (bare object, array,
// or @graph document).
export function jsonLdJobPosting(html: string): Record<string, unknown> | null {
  for (const [, raw] of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    const nodes = Array.isArray(data)
      ? data
      : Array.isArray((data as { "@graph"?: unknown[] })?.["@graph"])
        ? (data as { "@graph": unknown[] })["@graph"]
        : [data];
    for (const n of nodes) {
      if (n && typeof n === "object" && (n as Record<string, unknown>)["@type"] === "JobPosting") {
        return n as Record<string, unknown>;
      }
    }
  }
  return null;
}
