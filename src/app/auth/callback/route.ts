import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getProfile } from "@/lib/profile";
import { runWithUser } from "@/lib/user-context";
import { AUTH_LANDING_COOKIE } from "@/components/paper/auth-loading-logic";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.clone();
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/app/compose";

  let userId: string | null = null;
  if (code) {
    const sb = await supabaseServer();
    const { data, error } = await sb.auth.exchangeCodeForSession(code);
    if (error) {
      url.pathname = "/";
      url.search = `?auth_error=${encodeURIComponent(error.message)}`;
      return NextResponse.redirect(url);
    }
    userId = data.user?.id ?? null;
  }

  // Route past the landing for returning users; send first-timers to onboarding.
  let target = next;
  try {
    const profile = userId
      ? await runWithUser(userId, () => getProfile())
      : null;
    if (!profile?.onboarded_at) target = "/onboarding";
  } catch {
    target = "/onboarding";
  }

  url.pathname = target;
  url.search = "";
  const res = NextResponse.redirect(url);
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
  if (target !== "/onboarding") {
    res.cookies.set("crew_onboarded", "1", {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }
  return res;
}
