import { NextRequest, NextResponse } from "next/server";

// Edge routing for the auth boundary. Cookie-only so there's no DB/network
// call on every request:
//   - sb-*-auth-token  → set by Supabase after Google OAuth (the real session)
//   - crew_onboarded=1 → set on onboarding completion (landing-skip UX hint)
//
//   /                        → /app/compose when the visitor is signed in
//   /app/** and /onboarding  → / when the visitor has no Supabase session
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Match both the single cookie (sb-<ref>-auth-token) and the chunked variants
  // Supabase writes for large OAuth sessions (…-auth-token.0, .1, …).
  const hasSupabaseAuth = req.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
  const hasOnboardedCookie = req.cookies.get("crew_onboarded")?.value === "1";

  if (pathname === "/" && (hasSupabaseAuth || hasOnboardedCookie)) {
    const url = req.nextUrl.clone();
    url.pathname = "/app/compose";
    return NextResponse.redirect(url);
  }

  const isProtected =
    pathname.startsWith("/app") || pathname.startsWith("/onboarding");
  if (isProtected && !hasSupabaseAuth) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/app/:path*", "/onboarding/:path*"],
};
