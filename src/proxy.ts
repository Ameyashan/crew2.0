import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { isAnonAllowedPath } from "@/components/paper/run-view-logic";

// Edge routing + session refresh for the auth boundary.
//
//   /                        → /app/compose for EVERYONE (plan_2.md decision 2):
//                              the prototype's Desk is the landing experience, so
//                              signed-out visitors land on the try-before-sign-in
//                              Desk (blur gate) rather than the legacy marketing
//                              page, which stays reachable at /home.
//   /app/** and /onboarding  → / when there's no (valid) Supabase session,
//                              EXCEPT the try-before-sign-in Desk (/app/compose),
//                              which anonymous visitors may reach (Phase 4 blur
//                              gate). Every other /app route and /onboarding stay
//                              hard-gated; the /app layout re-checks server-side.
//
// Anonymous traffic stays zero-network: we only talk to Supabase when an
// auth-token cookie is present. When one is, getUser() validates it AND
// refreshes an expired access token, writing the rotated cookies onto the
// response — supabase-server.ts swallows cookie writes inside Server
// Components on the assumption that this proxy keeps the session fresh, so
// without this refresh, server-side auth silently rots after ~1 hour idle
// and users get bounced back to the landing page mid-session.
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // App Router layouts can't read the request path; forward it so the /app
  // layout can apply the same anon allow-list (see run-view-logic
  // .isAnonAllowedPath + src/app/app/layout.tsx). Derive a fresh, mutable
  // Headers each time (req.headers is immutable) that carries x-pathname plus
  // any cookies the caller has since set — the Supabase refresh below mutates
  // req.cookies, and new Headers(req.headers) picks those up.
  const forwardHeaders = () => {
    const h = new Headers(req.headers);
    h.set("x-pathname", pathname);
    return h;
  };

  // Match both the single cookie (sb-<ref>-auth-token) and the chunked
  // variants Supabase writes for large OAuth sessions (…-auth-token.0, .1, …)
  // — but NOT the PKCE sb-<ref>-auth-token-code-verifier cookie, which exists
  // the moment an OAuth flow *starts* and used to count a half-signed-in
  // visitor as authenticated.
  const hasAuthCookie = req.cookies
    .getAll()
    .some(
      (c) =>
        c.name.startsWith("sb-") &&
        c.name.includes("-auth-token") &&
        !c.name.includes("code-verifier"),
    );

  let res = NextResponse.next({ request: { headers: forwardHeaders() } });
  let signedIn = false;

  if (hasAuthCookie) {
    try {
      const supabase = createServerClient(
        (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL)!,
        (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY)!,
        {
          cookies: {
            getAll: () => req.cookies.getAll(),
            setAll: (toSet) => {
              // Mutate the request so downstream server code sees the fresh
              // tokens on THIS request, then rebuild the response and mirror
              // the cookies onto it for the browser.
              for (const { name, value } of toSet) req.cookies.set(name, value);
              res = NextResponse.next({ request: { headers: forwardHeaders() } });
              for (const { name, value, options } of toSet) res.cookies.set(name, value, options);
            },
          },
        },
      );
      const {
        data: { user },
      } = await supabase.auth.getUser();
      signedIn = !!user;
    } catch {
      // Auth server unreachable — fall back to cookie presence rather than
      // logging everyone out on a blip.
      signedIn = true;
    }
  }

  // Redirects must carry any freshly rotated auth cookies with them.
  const redirectPreservingCookies = (path: string) => {
    const url = req.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    const r = NextResponse.redirect(url);
    for (const c of res.cookies.getAll()) r.cookies.set(c);
    return r;
  };

  // The Desk is the landing experience for everyone (plan_2.md decision 2):
  // signed-in visitors get their returning Desk, signed-out visitors get the
  // try-before-sign-in Desk with the blur gate. The old marketing page lives
  // on at /home for anyone who still wants it.
  if (pathname === "/") {
    return redirectPreservingCookies("/app/compose");
  }

  const isProtected =
    pathname.startsWith("/app") || pathname.startsWith("/onboarding");
  // Anonymous visitors may reach only the try-before-sign-in Desk; everything
  // else protected still bounces to the landing page.
  if (isProtected && !signedIn && !isAnonAllowedPath(pathname)) {
    return redirectPreservingCookies("/");
  }

  return res;
}

export const config = {
  matcher: ["/", "/app/:path*", "/onboarding/:path*"],
};
