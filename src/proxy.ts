import { NextRequest, NextResponse } from "next/server";

// Returning users land on /app/compose instead of the marketing landing.
// We check for either:
//   - the Supabase auth-token cookie (set after Google OAuth), or
//   - the `crew_onboarded=1` cookie set by onboarding completion.
// Pure cookie checks keep this edge-safe — no DB calls on every request.
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname !== "/") return NextResponse.next();

  const hasOnboardedCookie = req.cookies.get("crew_onboarded")?.value === "1";
  const hasSupabaseAuth = req.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token"));

  if (hasOnboardedCookie || hasSupabaseAuth) {
    const url = req.nextUrl.clone();
    url.pathname = "/app/compose";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
