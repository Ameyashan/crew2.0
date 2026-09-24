// Canonical match candidates for a job URL, so the extension's tab URL (the
// live application page) finds the job_applications row created when the user
// pasted the posting link into the Desk. The two routinely differ: query
// strings and tracking params, boards. vs job-boards. Greenhouse hosts, and the
// posting page vs its /application (Ashby) or /apply (Lever) sibling.
//
// Returns lowercase-host, no-trailing-slash URL strings; the first entry is the
// canonical form. Both sides of a comparison must go through canonicalJobUrls
// and match on ANY candidate.

export function canonicalJobUrls(raw: string): string[] {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return [];
  }

  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  let path = u.pathname.replace(/\/+$/, "");

  // Greenhouse embeds put the posting id in ?gh_jid= on the company's own
  // careers page; keep that id in the canonical form so it can match the
  // boards.greenhouse.io/…/jobs/{id} paste.
  const ghJid = u.searchParams.get("gh_jid");

  const out = new Set<string>();
  const add = (h: string, p: string) => {
    out.add(`https://${h}${p}`.toLowerCase());
  };

  if (/(^|\.)greenhouse\.io$/.test(host)) {
    // boards.greenhouse.io and job-boards.greenhouse.io serve the same
    // postings; the application form may live at /jobs/{id} on either.
    const p = path;
    add("boards.greenhouse.io", p);
    add("job-boards.greenhouse.io", p);
    // Greenhouse job ids are globally unique — a /jobs/{id} suffix alone is a
    // safe extra candidate for cross-host matches with differing org slugs.
    const m = p.match(/\/jobs\/(\d+)/);
    if (m) out.add(`gh:${m[1]}`);
    return [...out];
  }

  if (host === "jobs.ashbyhq.com") {
    // Posting: /{org}/{uuid} — application form: /{org}/{uuid}/application
    path = path.replace(/\/application$/, "");
    add(host, path);
    return [...out];
  }

  if (host === "jobs.lever.co") {
    // Posting: /{co}/{id} — form: /{co}/{id}/apply — confirmation: /{co}/{id}/thanks
    path = path.replace(/\/(apply|thanks)$/, "");
    add(host, path);
    return [...out];
  }

  if (ghJid) out.add(`gh:${ghJid}`);
  add(host, path);
  return [...out];
}

// True when any canonical candidate of `a` matches any of `b`.
export function jobUrlsMatch(a: string, b: string): boolean {
  const ca = canonicalJobUrls(a);
  if (!ca.length) return false;
  const cb = new Set(canonicalJobUrls(b));
  return ca.some((c) => cb.has(c));
}
