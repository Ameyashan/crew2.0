import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { supabaseServer } from "@/lib/supabase-server";
import { runWithUser } from "@/lib/user-context";
import { getProfile } from "@/lib/profile";
import { isAnonAllowedPath } from "@/components/paper/run-view-logic";
import AppShell from "./app-shell";

export const runtime = "nodejs";
// Session-gated pages can't be statically prerendered — the gate reads the
// request's cookies, and building without Supabase env vars would fail the
// prerender pass anyway.
export const dynamic = "force-dynamic";

// Server-side gate for every /app/* page. The proxy's cookie check keeps
// anonymous traffic out cheaply, but only this layout validates the session
// and re-checks onboarding — the OAuth callback's redirect is one-shot, and
// users can land here without ever passing through it (client-side session
// pickup, stale bookmarks, the old "← landing" escape). Runs on entry, hard
// navigation, and refresh; client-side nav between /app pages skips it, which
// is fine for a gate.
//
// Phase 4 exception (signed-out blur gate): an anonymous GET may reach the Desk
// (/app/compose) so people can try a run before signing in. Every OTHER /app
// route stays hard-gated exactly as before, and all writes (API routes) are
// untouched. The path comes from middleware.ts via the x-pathname header.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    const pathname = (await headers()).get("x-pathname");
    if (isAnonAllowedPath(pathname)) {
      // Try-before-sign-in Desk: render the shell in its signed-out state (the
      // top bar and compose page resolve the empty session client-side). No
      // onboarding redirect — there's no account to onboard yet.
      return <AppShell>{children}</AppShell>;
    }
    redirect("/");
  }

  const profile = await runWithUser(user.id, () => getProfile()).catch(() => null);
  if (!profile?.onboarded_at) redirect("/onboarding");

  return <AppShell>{children}</AppShell>;
}
