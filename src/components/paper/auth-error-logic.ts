// Pure, render-free helpers for the post-OAuth error banner. Extracted from
// auth-error.tsx so they run under `node --test` — the component file imports
// React / next navigation and can't execute in that context. Same split the
// auth-loading interstitial uses (auth-loading-logic.ts): the component owns the
// side effects (reading the URL, stripping the param), these own the rules.
//
// The OAuth callback (src/app/auth/callback/route.ts) redirects to the Desk with
// ?auth_error=<supabase message> when exchangeCodeForSession fails. The Desk is
// anon-allowed, so — unlike a redirect to "/" — the proxy neither bounces it nor
// strips the query, and this banner can surface the failure instead of dropping
// the visitor back on the Desk with no explanation.

// The query-string key the callback sets on its error redirect.
export const AUTH_ERROR_PARAM = "auth_error";

// The line shown to the visitor. Deliberately generic + reassuring: raw Supabase
// messages ("invalid request: both auth code and code verifier should be
// non-empty") mean nothing to a user and can leak flow internals. Retrying is
// almost always the right next step, so the banner says so.
export const AUTH_ERROR_MESSAGE = "Sign-in didn't complete. Please try again.";

// Pull the raw auth_error value out of a location.search string
// ("?auth_error=…&next=…"). Returns the decoded message, or null when the param
// is absent or empty. Tolerant of a missing leading "?".
export function parseAuthError(
  search: string | null | undefined,
): string | null {
  if (!search) return null;
  const qs = search.startsWith("?") ? search.slice(1) : search;
  for (const pair of qs.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const key = eq === -1 ? pair : pair.slice(0, eq);
    if (key !== AUTH_ERROR_PARAM) continue;
    const raw = eq === -1 ? "" : pair.slice(eq + 1);
    let value = raw;
    try {
      value = decodeURIComponent(raw.replace(/\+/g, " "));
    } catch {
      // Malformed percent-encoding — fall back to the raw slice.
    }
    return value.trim() ? value : null;
  }
  return null;
}

// Rebuild a location.search string with the auth_error param removed, preserving
// every other param and order. Returns "" when nothing remains (so the caller
// can drop the "?" entirely). Used to scrub the URL after the banner mounts, so
// a refresh or a shared link doesn't replay the error.
export function stripAuthError(search: string | null | undefined): string {
  if (!search) return "";
  const qs = search.startsWith("?") ? search.slice(1) : search;
  const kept = qs
    .split("&")
    .filter((pair) => {
      if (!pair) return false;
      const eq = pair.indexOf("=");
      const key = eq === -1 ? pair : pair.slice(0, eq);
      return key !== AUTH_ERROR_PARAM;
    });
  return kept.length ? `?${kept.join("&")}` : "";
}
