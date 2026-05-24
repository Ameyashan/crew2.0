import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getProfile } from "@/lib/profile";
import { runWithUser } from "@/lib/user-context";

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
  if (target !== "/onboarding") {
    res.cookies.set("crew_onboarded", "1", {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }
  return res;
}
