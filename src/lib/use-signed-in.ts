"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

// Lightweight signed-in probe. Lifted verbatim from the local copy in
// src/app/page.tsx so the run view's blur gate and the landing CTAs share one
// implementation (Phase 4 of the jugaadu reskin).
//
// Returns `null` while the session is still being resolved, then a boolean.
// Callers that only need "is this definitely signed in" can treat null as false;
// the blur gate needs the tri-state so it doesn't flash the gate over a
// signed-in user's outputs before the session check resolves.
export type SignedInState = boolean | null;

// The minimal account shape the chrome needs. Derived from the LOCAL session
// (getSession, cookie-backed) — never getUser(), whose network round-trip to the
// auth server can come back empty on a blip or lose a race with the proxy's
// refresh-token rotation, which is exactly how a freshly signed-in visitor got
// stranded on a Desk that still said "Sign in".
export type SessionUser = { email: string | null; name: string | null } | null;

function nameFromMetadata(user: {
  user_metadata?: Record<string, unknown> | null;
} | null | undefined): string | null {
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const full = typeof meta.full_name === "string" ? meta.full_name.trim() : "";
  if (full) return full;
  const name = typeof meta.name === "string" ? meta.name.trim() : "";
  return name || null;
}

// Reactive session probe. Resolves the current session from cookies once, then
// stays live via onAuthStateChange — so a sign-in that lands AFTER mount (the
// post-OAuth redirect is the case that matters) flips the UI without a manual
// reload, and a getSession hiccup can self-correct instead of latching.
export function useSessionUser(): { signedIn: SignedInState; user: SessionUser } {
  const [state, setState] = useState<{ signedIn: SignedInState; user: SessionUser }>({
    signedIn: null,
    user: null,
  });

  useEffect(() => {
    let cancelled = false;
    const sb = supabaseBrowser();

    const apply = (session: { user?: unknown } | null | undefined) => {
      if (cancelled) return;
      const u = (session?.user ?? null) as {
        email?: string | null;
        user_metadata?: Record<string, unknown> | null;
      } | null;
      setState({
        signedIn: !!session,
        user: u ? { email: u.email ?? null, name: nameFromMetadata(u) } : null,
      });
    };

    sb.auth
      .getSession()
      .then(({ data }) => apply(data?.session ?? null))
      .catch(() => {
        if (!cancelled) setState({ signedIn: false, user: null });
      });

    // Fires INITIAL_SESSION on subscribe, then SIGNED_IN / SIGNED_OUT /
    // TOKEN_REFRESHED — keeps the chrome correct without re-mounting.
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => apply(session));

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  return state;
}

export function useSignedIn(): SignedInState {
  return useSessionUser().signedIn;
}
