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
  return matchHost(url, AUTH_WALLED_HOSTS);
}

// Boards whose full job description sits behind a login, but which we can still
// act on once the user pastes the description. Unlike AUTH_WALLED_HOSTS (which
// are dead-ends — "use a public URL"), these get a paste-the-JD affordance and
// then run the whole crew off the pasted text.
//
// Work at a Startup (YC's board) is the canonical case: /jobs/{id} pages render
// the role client-side behind a login, so neither a plain fetch nor web_search
// can read them.
const PASTE_JD_HOSTS: { match: RegExp; label: string }[] = [
  { match: /(^|\.)workatastartup\.com$/, label: "Work at a Startup" },
];

// Returns the brand label (e.g. "Work at a Startup") when the URL points at a
// board we can't auto-read but CAN run off a pasted job description, else null.
export function pasteJdJobHost(url: string): string | null {
  return matchHost(url, PASTE_JD_HOSTS);
}

function matchHost(
  url: string,
  hosts: { match: RegExp; label: string }[],
): string | null {
  let host: string;
  try {
    const u = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    host = new URL(u).hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const { match, label } of hosts) {
    if (match.test(host)) return label;
  }
  return null;
}
