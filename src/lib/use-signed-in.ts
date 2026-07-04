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

export function useSignedIn(): SignedInState {
  const [signedIn, setSignedIn] = useState<SignedInState>(null);
  useEffect(() => {
    let cancelled = false;
    supabaseBrowser()
      .auth.getSession()
      .then(({ data }) => {
        if (!cancelled) setSignedIn(!!data?.session);
      })
      .catch(() => {
        if (!cancelled) setSignedIn(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return signedIn;
}
