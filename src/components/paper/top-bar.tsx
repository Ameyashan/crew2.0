"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PAPER_FONTS_V2 } from "./fonts";
import { TOKENS, RADII, SHADOWS } from "./tokens";
import { supabaseBrowser, signInWithGoogle } from "@/lib/supabase-browser";
import { useRuns, useFocusedRun, setFocusedRun } from "@/lib/runs-store";
import { TOP_NAV, nameFromEmail, isNavActive, avatarBg, avatarInitial, crewChip } from "./top-bar-logic";
import { serializePendingRun, PENDING_RUN_KEY } from "./run-view-logic";

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();

  // Live agent runs (compose + resume share the module store), so "what's still
  // working" is visible from every screen — same activeRuns/runsTarget logic the
  // old sidebar used, factored into `crewChip`.
  const runs = useRuns();
  const chip = crewChip(runs);
  // The run the chip should reopen full-screen on the Desk — newest live (or, if
  // none, errored) non-resume run. Mirrors crewChip's focus selection so the chip
  // and the run screen agree on which run is "the crew running".
  const chipRunId = useMemo(() => {
    const live = runs.filter(
      (r) => r.kind !== "resume" && (r.stage === "working" || r.stage === "parsing"),
    );
    const attention = runs.filter((r) => r.kind !== "resume" && r.stage === "error");
    const pool = live.length ? live : attention;
    return pool[0]?.id ?? null; // runs are newest-first
  }, [runs]);
  // Hide the chip while the run it points to is already taking over the Desk
  // (prototype hides "crew running" on the run screen). Still shows on every
  // other route so it's the way back.
  const focusedRunId = useFocusedRun();
  const onRunScreen = !!focusedRunId && isNavActive(pathname, "/app/compose");

  // Session probe: /app/* is server-gated to signed-in users, but the bar also
  // renders its signed-out variant for the (future) signed-out Desk. `null` =
  // still resolving, so we don't flash the wrong variant on first paint.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Prefer the name saved on the profile; fall back to the signed-in account
    // (Google metadata or the email) so we never refer to a logged-in user as "Guest".
    fetch("/api/profile")
      .then((r) => r.json())
      .then((j) => {
        const fromProfile =
          typeof j?.profile?.full_name === "string" ? j.profile.full_name.trim() : "";
        if (!cancelled && fromProfile) setName(fromProfile);
      })
      .catch(() => {});

    supabaseBrowser()
      .auth.getUser()
      .then(({ data }) => {
        if (cancelled) return;
        const u = data?.user;
        setSignedIn(!!u);
        if (!u) return;
        if (u.email) setEmail(u.email);
        const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
        const fallback =
          (typeof meta.full_name === "string" && meta.full_name.trim()) ||
          (typeof meta.name === "string" && meta.name.trim()) ||
          nameFromEmail(u.email);
        // Don't override a name already resolved from the profile.
        setName((prev) => prev ?? (fallback || null));
      })
      .catch(() => {
        if (!cancelled) setSignedIn(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Account popover open/close, with click-outside + Escape to dismiss.
  const [acctOpen, setAcctOpen] = useState(false);
  const acctRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!acctOpen) return;
    const onDown = (e: MouseEvent) => {
      if (acctRef.current && !acctRef.current.contains(e.target as Node)) setAcctOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAcctOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [acctOpen]);

  const displayName = name || nameFromEmail(email) || "Your account";
  const initial = avatarInitial(displayName);
  const bg = useMemo(() => avatarBg(email || displayName), [email, displayName]);

  async function signOut() {
    setAcctOpen(false);
    try {
      await supabaseBrowser().auth.signOut();
    } catch {
      // ignore — we redirect regardless so the session view clears.
    }
    // Full navigation so the server gate re-runs and the signed-out Desk renders.
    window.location.href = "/";
  }

  const isSignedOut = signedIn === false;

  // A signed-out visitor gets one run that lives only in the in-memory store
  // (anon runs persist nothing). While they're viewing it full-screen, the
  // wordmark must NOT clear the focus — that would strand the run with no way
  // back (the "crew running" chip is signed-in only). Keep them on it; the only
  // forward path is signing in, which replays the run unlocked.
  const lockWordmark = isSignedOut && !!focusedRunId;

  // Stash the run the signed-out visitor is looking at before the OAuth hop, so
  // signing in from the top bar (not just the blur gate) re-opens it unlocked on
  // return — mirrors BlurGateOverlay's sign-in. sessionStorage survives the
  // same-origin OAuth + onboarding redirect; the module run-store does not.
  function stashFocusedAnonRun() {
    if (typeof window === "undefined") return;
    const run = focusedRunId ? runs.find((r) => r.id === focusedRunId) : null;
    if (!run || !run.input) return;
    try {
      sessionStorage.setItem(
        PENDING_RUN_KEY,
        serializePendingRun({
          input: run.input,
          intent: run.intent || "",
          kind: run.kind ?? null,
          providedEmail: !!run.providedEmail,
          selectedAgents: Array.isArray(run.selectedAgents) ? run.selectedAgents : [],
          screenshotName: run.screenshot?.name ?? null,
        }),
      );
    } catch {
      /* private mode — degrade to a fresh Desk after sign-in */
    }
  }

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        rowGap: 10,
        padding: "20px clamp(16px, 4vw, 44px) 0",
        flexShrink: 0,
        background: TOKENS.paper,
        color: TOKENS.ink,
      }}
    >
      {/* Wordmark → Desk (clear any focused run so the composer shows) */}
      <Link
        href="/app/compose"
        onClick={(e) => {
          // Don't let a signed-out visitor navigate out of their live run.
          if (lockWordmark) {
            e.preventDefault();
            return;
          }
          setFocusedRun(null);
        }}
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          textDecoration: "none",
          color: "inherit",
          cursor: lockWordmark ? "default" : "pointer",
        }}
      >
        <span style={{ fontFamily: PAPER_FONTS_V2.serif, fontWeight: 500, fontSize: 21, lineHeight: 1 }}>
          Jugaadu
        </span>
        <span
          style={{
            fontFamily: PAPER_FONTS_V2.serif,
            fontWeight: 400,
            fontSize: 11,
            lineHeight: 1,
            color: TOKENS.faint2Alt,
          }}
        >
          जुगाडू
        </span>
      </Link>

      {/* Right cluster */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          rowGap: 8,
          fontFamily: PAPER_FONTS_V2.sans,
          fontSize: 13,
        }}
      >
        {!isSignedOut &&
          TOP_NAV.map((n) => {
            const active = isNavActive(pathname, n.match);
            return (
              <Link
                key={n.id}
                href={n.href}
                onClick={n.id === "desk" ? () => setFocusedRun(null) : undefined}
                style={{
                  padding: "8px 12px",
                  borderRadius: RADII.pill,
                  textDecoration: "none",
                  fontSize: 13,
                  // Prototype navOn: ink text on the chip wash, weight 400 both
                  // states — NOT inverted ink-bg/paper-text.
                  fontWeight: 400,
                  color: active ? TOKENS.ink : TOKENS.muted2,
                  background: active ? TOKENS.chip : "transparent",
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                  transition: "color .15s, background .15s",
                }}
              >
                {n.label}
              </Link>
            );
          })}

        {/* Live-runs chip: green while working, amber when something needs eyes.
            Reopens the run full-screen on the Desk (matches the prototype). */}
        {!isSignedOut && chip && !onRunScreen && (
          <button
            onClick={() => {
              if (chip.target === "/app/compose" && chipRunId) setFocusedRun(chipRunId);
              router.push(chip.target);
            }}
            style={{
              marginLeft: 10,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
              border: "none",
              fontFamily: PAPER_FONTS_V2.mono,
              fontWeight: 500,
              fontSize: 10.5,
              lineHeight: 1,
              borderRadius: RADII.pill,
              padding: "7px 11px",
              color: chip.tone === "active" ? TOKENS.green : TOKENS.amber,
              background: chip.tone === "active" ? TOKENS.greenBg : TOKENS.amberBg,
              animation: "pulse 2s infinite",
            }}
          >
            ● {chip.label}
          </button>
        )}

        {isSignedOut && (
          <button
            onClick={() => {
              stashFocusedAnonRun();
              signInWithGoogle("/app/compose").catch((e) => console.error("Sign-in failed", e));
            }}
            style={{
              marginLeft: 10,
              cursor: "pointer",
              border: "none",
              fontFamily: PAPER_FONTS_V2.sans,
              fontWeight: 500,
              fontSize: 13,
              lineHeight: 1,
              color: TOKENS.paper,
              background: TOKENS.ink,
              borderRadius: RADII.pill,
              padding: "9px 16px",
            }}
          >
            Sign in
          </button>
        )}

        {/* Account avatar + popover */}
        {!isSignedOut && (
          <div ref={acctRef} style={{ position: "relative", marginLeft: 10, display: "flex" }}>
            <button
              onClick={() => setAcctOpen((o) => !o)}
              title={email ?? undefined}
              aria-haspopup="menu"
              aria-expanded={acctOpen}
              aria-label="Account"
              style={{
                width: 30,
                height: 30,
                borderRadius: RADII.pill,
                background: bg,
                color: "#fff",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: PAPER_FONTS_V2.sans,
                fontWeight: 500,
                fontSize: 12,
                lineHeight: 1,
                cursor: "pointer",
              }}
            >
              {initial}
            </button>

            {acctOpen && (
              <div
                role="menu"
                style={{
                  position: "absolute",
                  top: 38,
                  right: 0,
                  width: 228,
                  background: TOKENS.card,
                  border: `1px solid ${TOKENS.line}`,
                  borderRadius: RADII.panel,
                  boxShadow: SHADOWS.popover,
                  padding: "10px 16px",
                  zIndex: 40,
                  textAlign: "left",
                  animation: "fadeUp .2s ease",
                }}
              >
                <Link
                  href="/app/settings"
                  role="menuitem"
                  onClick={() => setAcctOpen(false)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    textDecoration: "none",
                    fontFamily: PAPER_FONTS_V2.sans,
                    fontSize: 12.5,
                    lineHeight: 1,
                    color: TOKENS.ink,
                    cursor: "pointer",
                    padding: "4px 0",
                  }}
                >
                  Settings
                </Link>
                <div style={{ height: 1, background: TOKENS.line, margin: "8px 0" }} />
                <button
                  onClick={signOut}
                  role="menuitem"
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    border: "none",
                    background: "transparent",
                    fontFamily: PAPER_FONTS_V2.sans,
                    fontSize: 12.5,
                    lineHeight: 1,
                    color: TOKENS.muted,
                    cursor: "pointer",
                    padding: "4px 0",
                  }}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
