import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

// Edge routing + session refresh for the auth boundary.
//
//   /                        → /app/compose for a signed-in visitor
//   /app/** and /onboarding  → / when there's no (valid) Supabase session
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

  let res = NextResponse.next({ request: { headers: req.headers } });
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
              res = NextResponse.next({ request: { headers: req.headers } });
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

  if (pathname === "/" && signedIn) {
    return redirectPreservingCookies("/app/compose");
  }

  const isProtected =
    pathname.startsWith("/app") || pathname.startsWith("/onboarding");
  if (isProtected && !signedIn) {
    return redirectPreservingCookies("/");
  }

  return res;
}

export const config = {
  matcher: ["/", "/app/:path*", "/onboarding/:path*"],
};
