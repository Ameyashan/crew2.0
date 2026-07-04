// Pure, render-free helpers for the post-OAuth "Setting up your Desk…"
// interstitial (prototype lines 89–95). Extracted from auth-loading.tsx so they
// run under `node --test` — the component file imports React and the Supabase
// browser client and can't execute in that context.

// The OAuth callback (src/app/auth/callback/route.ts) sets this short-lived
// cookie on its redirect; the client overlay reads it once, clears it, and
// shows the interstitial. A cookie (rather than a query param) survives the
// callback's own redirect chain — e.g. callback → /app/compose → the /app
// layout's onboarding redirect.
export const AUTH_LANDING_COOKIE = "crew_auth_landing";

// How long the interstitial stays up. "Brief" per the prototype — long enough
// to read the line, short enough to never feel like a real loading wall.
export const AUTH_LOADING_MS = 1600;

// True when the callback's landing cookie is present in a document.cookie /
// Cookie-header style string.
export function hasAuthLanding(cookies: string | null | undefined): boolean {
  if (!cookies) return false;
  return cookies.split(";").some((pair) => {
    const eq = pair.indexOf("=");
    if (eq === -1) return false;
    return pair.slice(0, eq).trim() === AUTH_LANDING_COOKIE && pair.slice(eq + 1).trim() === "1";
  });
}

// document.cookie assignment string that expires the landing cookie, so the
// interstitial shows exactly once per sign-in.
export function clearAuthLandingCookie(): string {
  return `${AUTH_LANDING_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

// "Ameya Shanbhag" → "Ameya". Empty/whitespace-only input → "".
export function firstNameOf(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

// The interstitial headline. Prototype: `Setting up your Desk, {{ userFirst }}…`;
// drop the name clause entirely while it's still resolving.
export function settingUpLine(name: string | null | undefined): string {
  const first = firstNameOf(name);
  return first ? `Setting up your Desk, ${first}…` : "Setting up your Desk…";
}
