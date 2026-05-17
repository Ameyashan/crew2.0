import { NextRequest, NextResponse } from "next/server";

// Returning users land on /app/compose instead of the marketing landing.
// Onboarding sets the `crew_onboarded=1` cookie on completion. We stay
// cookie-only so we don't make a DB call on every request — the real source
// of truth is user_profile.onboarded_at; the cookie is enough for routing UX.
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/" && req.cookies.get("crew_onboarded")?.value === "1") {
    const url = req.nextUrl.clone();
    url.pathname = "/app/compose";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
