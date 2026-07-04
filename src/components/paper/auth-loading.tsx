"use client";

import { useEffect, useState } from "react";
import { PAPER_FONTS_V2 } from "./fonts";
import { TOKENS, RADII } from "./tokens";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { nameFromEmail, avatarBg, avatarInitial } from "./top-bar-logic";
import {
  AUTH_LOADING_MS,
  clearAuthLandingCookie,
  hasAuthLanding,
  settingUpLine,
} from "./auth-loading-logic";

// The mount effect consumes the one-shot cookie, so this latch carries the
// "we just landed from OAuth" fact across React strict mode's dev-only effect
// replay (mount → cleanup → mount), whose second pass finds the cookie gone.
// Reset when the overlay hides, so a later shell remount can't replay it.
let pendingLanding = false;

// Post-OAuth "Setting up your Desk, {first}…" interstitial (prototype lines
// 89–95): 44px avatar circle, Newsreader 20px headline, pulsing mono
// SIGNED IN WITH GOOGLE. Rendered as a fixed full-screen overlay so it covers
// whatever page the callback redirect lands on (Desk or onboarding) without
// disturbing that page's own hydration; it mounts itself only when the
// callback's one-shot landing cookie is present, and clears it immediately.
export function AuthLoadingOverlay() {
  const [show, setShow] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (hasAuthLanding(document.cookie)) {
      pendingLanding = true;
      document.cookie = clearAuthLandingCookie();
    }
    if (!pendingLanding) return;

    // Reveal on the next frame — SSR/hydration render nothing, so the first
    // client paint stays consistent and the overlay fades in right after.
    const raf = requestAnimationFrame(() => setShow(true));

    // Same name resolution the top bar uses: Google metadata, then the email
    // local-part. No profile fetch — first-timers don't have one yet.
    supabaseBrowser()
      .auth.getUser()
      .then(({ data }) => {
        const u = data?.user;
        if (!u) return;
        if (u.email) setEmail(u.email);
        const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
        const resolved =
          (typeof meta.full_name === "string" && meta.full_name.trim()) ||
          (typeof meta.name === "string" && meta.name.trim()) ||
          nameFromEmail(u.email);
        if (resolved) setName(resolved);
      })
      .catch(() => {});

    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => {
      pendingLanding = false;
      setShow(false);
    }, AUTH_LOADING_MS);
    return () => clearTimeout(t);
  }, [show]);

  if (!show) return null;

  const display = name || nameFromEmail(email);
  const bg = avatarBg(email || display || "you");
  const initial = avatarInitial(display || email || "");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: TOKENS.paper,
        color: TOKENS.ink,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
      }}
    >
      <div style={{ textAlign: "center", animation: "fadeUp .3s ease" }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: RADII.pill,
            background: bg,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: PAPER_FONTS_V2.sans,
            fontWeight: 500,
            fontSize: 17,
            lineHeight: 1,
            margin: "0 auto 16px",
          }}
        >
          {initial}
        </div>
        <div
          style={{
            fontFamily: PAPER_FONTS_V2.serif,
            fontWeight: 400,
            fontSize: 20,
            lineHeight: 1.4,
          }}
        >
          {settingUpLine(display)}
        </div>
        <div
          style={{
            fontFamily: PAPER_FONTS_V2.mono,
            fontWeight: 500,
            fontSize: 10.5,
            lineHeight: 1,
            color: TOKENS.faint,
            marginTop: 10,
            animation: "pulse 1.4s infinite",
          }}
        >
          SIGNED IN WITH GOOGLE
        </div>
      </div>
    </div>
  );
}
