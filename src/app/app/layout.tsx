import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { runWithUser } from "@/lib/user-context";
import { getProfile } from "@/lib/profile";
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
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/");

  const profile = await runWithUser(user.id, () => getProfile()).catch(() => null);
  if (!profile?.onboarded_at) redirect("/onboarding");

  return <AppShell>{children}</AppShell>;
}
