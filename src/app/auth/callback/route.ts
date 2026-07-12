import { NextRequest, NextResponse } from "next/server";
import { trackServer } from "@/lib/analytics/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { getProfile } from "@/lib/profile";
import { runWithUser } from "@/lib/user-context";
import { AUTH_LANDING_COOKIE } from "@/components/paper/auth-loading-logic";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.clone();
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/app/compose";

  // The provider (or Supabase) can bounce back with ?error instead of a code —
  // the user declined consent, the provider rejected the request, etc. The proxy
  // forwards these here from the site root too. Surface them on the Desk rather
  // than silently landing the visitor there signed-out with no explanation.
  const providerError =
    url.searchParams.get("error_description") || url.searchParams.get("error");
  if (providerError && !code) {
    url.pathname = "/app/compose";
    url.search = `?auth_error=${encodeURIComponent(providerError)}`;
    return NextResponse.redirect(url);
  }

  // exchangeCodeForSession writes the session (sb-<ref>-auth-token…) cookies via
  // the client's setAll. We must land those on the *redirect response we return*
  // or the browser never receives the session and the user bounces back to the
  // Desk still signed-out.
  //
  // Why we can't lean on supabase-server.ts here: its setAll writes to the
  // next/headers cookie store and swallows failures, on the assumption the proxy
  // re-persists the session onto its own response (see proxy.ts). But the proxy's
  // matcher — ["/", "/app/:path*", "/onboarding/:path*"] — does NOT cover
  // /auth/callback, so there is no safety net on this route. Collect the cookies
  // as exchangeCodeForSession emits them and mirror every one onto `res` below,
  // exactly as the proxy does for its refresh.
  const pending: { name: string; value: string; options: CookieOptions }[] = [];

  let userId: string | null = null;
  let authUser: { created_at?: string; last_sign_in_at?: string } | null = null;
  if (code) {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
    const supabaseKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY",
      );
    }
    const sb = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        // The PKCE code-verifier cookie the browser client set when the OAuth
        // flow started rides in on this request; read it from there.
        getAll: () => req.cookies.getAll(),
        setAll: (toSet) => {
          for (const c of toSet) {
            // Keep the request in sync so the getProfile() read below sees the
            // fresh session, and stash the write to mirror onto the response.
            req.cookies.set(c.name, c.value);
            pending.push(c);
          }
        },
      },
    });
    const { data, error } = await sb.auth.exchangeCodeForSession(code);
    if (error) {
      // Surface the failure on the Desk rather than "/". The Desk is
      // anon-allowed, so the proxy neither bounces it back to the landing nor
      // strips the query (a redirect to "/" gets rewritten to /app/compose with
      // search cleared, swallowing the error); AuthErrorBanner reads the param
      // there and shows a retry prompt.
      url.pathname = "/app/compose";
      url.search = `?auth_error=${encodeURIComponent(error.message)}`;
      return NextResponse.redirect(url);
    }
    userId = data.user?.id ?? null;
    authUser = data.user
      ? {
          created_at: data.user.created_at,
          last_sign_in_at: data.user.last_sign_in_at,
        }
      : null;
  }

  // Route past the landing for returning users; send first-timers to onboarding.
  let target = next;
  try {
    const profile = userId
      ? await runWithUser(userId, () => getProfile())
      : null;
    if (!profile?.onboarded_at) target = "/onboarding";
    // Activation analytics: derive signup vs sign_in from the auth user itself,
    // not the (lazily-created) profile row — otherwise a user who signs in but
    // never finishes onboarding has no row and gets re-counted as a "signup" on
    // every login. Supabase stamps created_at ≈ last_sign_in_at only on the very
    // first session, so that window marks the true signup.
    if (userId) {
      await trackServer(isFirstLogin(authUser) ? "signup" : "sign_in", {}, { userId });
    }
  } catch {
    target = "/onboarding";
  }

  url.pathname = target;
  url.search = "";
  const res = NextResponse.redirect(url);
  // Persist the exchanged session onto the redirect the browser follows. Without
  // this the exchange succeeds server-side but the client has no cookie, so the
  // top bar's getUser() comes back empty and renders "Sign in".
  for (const { name, value, options } of pending) {
    res.cookies.set(name, value, options);
  }
  if (userId) {
    // One-shot signal for the client "Setting up your Desk…" interstitial
    // (AuthLoadingOverlay reads + clears it). Short-lived so a stale cookie
    // can't replay the interstitial on an unrelated later visit.
    res.cookies.set(AUTH_LANDING_COOKIE, "1", {
      path: "/",
      maxAge: 60,
      sameSite: "lax",
    });
  }
  return res;
}

// First sign-in vs a return visit, from the auth user's timestamps. Supabase
// sets last_sign_in_at ≈ created_at on the first session and bumps only
// last_sign_in_at thereafter, so a tight window between them means "brand new".
// Falls back to false (treat as a returning sign_in) when timestamps are absent.
function isFirstLogin(
  u: { created_at?: string; last_sign_in_at?: string } | null,
): boolean {
  const created = u?.created_at ? new Date(u.created_at).getTime() : NaN;
  const last = u?.last_sign_in_at ? new Date(u.last_sign_in_at).getTime() : NaN;
  if (!Number.isFinite(created) || !Number.isFinite(last)) return false;
  return Math.abs(last - created) < 5000; // within 5s → first session
}
