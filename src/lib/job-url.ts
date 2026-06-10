// Job boards that gate their postings behind a login wall or aggressive bot
// detection. A plain fetch (or Claude's web_search) gets a login page, not the
// JD — so we can't parse them. Detect these up front and tell the user to use
// a public posting URL instead, rather than burning an API call on a fetch
// that's guaranteed to fail.
const AUTH_WALLED_HOSTS: { match: RegExp; label: string }[] = [
  { match: /(^|\.)linkedin\.com$/, label: "LinkedIn" },
  // LinkedIn's own link shortener. It 301s to the real posting, but a plain
  // fetch / web_search can't follow it into LinkedIn's login wall — and a
  // hiring post shared this way is really "a person announcing a role", which
  // belongs in the person flow, not the job-board flow.
  { match: /(^|\.)lnkd\.in$/, label: "LinkedIn" },
  { match: /(^|\.)glassdoor\.[a-z.]+$/, label: "Glassdoor" },
  { match: /(^|\.)indeed\.[a-z.]+$/, label: "Indeed" },
];

// Returns the brand label (e.g. "LinkedIn") when the URL points at a known
// auth-walled job board, otherwise null.
export function authWalledJobHost(url: string): string | null {
  let host: string;
  try {
    const u = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    host = new URL(u).hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const { match, label } of AUTH_WALLED_HOSTS) {
    if (match.test(host)) return label;
  }
  return null;
}
