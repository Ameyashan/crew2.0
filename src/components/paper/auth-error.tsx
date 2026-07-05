"use client";

import { useEffect, useState } from "react";
import { PAPER_FONTS_V2 } from "./fonts";
import { TOKENS, RADII, SHADOWS } from "./tokens";
import {
  AUTH_ERROR_MESSAGE,
  parseAuthError,
  stripAuthError,
} from "./auth-error-logic";

// The mount effect consumes the one-shot query param, so this latch carries the
// "we came back from a failed OAuth" fact across React strict mode's dev-only
// effect replay (mount → cleanup → mount), whose second pass finds the param
// already scrubbed. Mirrors AuthLoadingOverlay's `pendingLanding`.
let pendingError = false;

// Post-OAuth failure banner. The callback redirects to the Desk with
// ?auth_error=… when exchangeCodeForSession fails; without this the visitor just
// reappears on the Desk still signed-out with no idea why. On mount we read the
// param, strip it from the URL (so a refresh/share doesn't replay it), and show a
// dismissible banner. Rendered in the app shell so it covers whatever page the
// error redirect lands on. The raw Supabase message is intentionally not shown —
// it's meaningless to users and can leak flow internals; retrying is the fix.
export function AuthErrorBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (parseAuthError(window.location.search)) {
      pendingError = true;
      // Scrub the param immediately, preserving any others (e.g. next=…).
      const cleaned = stripAuthError(window.location.search);
      window.history.replaceState(
        null,
        "",
        window.location.pathname + cleaned + window.location.hash,
      );
    }
    if (!pendingError) return;
    setShow(true);
  }, []);

  if (!show) return null;

  const dismiss = () => {
    pendingError = false;
    setShow(false);
  };

  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        margin: "10px clamp(16px, 4vw, 44px) 0",
        padding: "10px 14px",
        background: TOKENS.card,
        border: `1px solid ${TOKENS.line}`,
        borderLeft: `3px solid ${TOKENS.red}`,
        borderRadius: RADII.button,
        boxShadow: SHADOWS.card,
        fontFamily: PAPER_FONTS_V2.sans,
        fontSize: 13,
        lineHeight: 1.35,
        color: TOKENS.ink,
        animation: "fadeUp .2s ease",
      }}
    >
      <span>{AUTH_ERROR_MESSAGE}</span>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          flexShrink: 0,
          border: "none",
          background: "transparent",
          color: TOKENS.muted,
          fontFamily: PAPER_FONTS_V2.sans,
          fontSize: 16,
          lineHeight: 1,
          cursor: "pointer",
          padding: "2px 4px",
        }}
      >
        ×
      </button>
    </div>
  );
}
