// @ts-nocheck — Chrome extension connect page (settings idiom)
"use client";

import { useEffect, useState } from "react";
import { PAPER_FONTS_V2 } from "@/components/paper/fonts";
import { TOKENS, RADII, SHADOWS } from "@/components/paper/tokens";
import { useIsMobile } from "@/lib/use-is-mobile";

const EXTENSION_ID = process.env.NEXT_PUBLIC_EXTENSION_ID || "";

// Push the freshly minted token straight into the extension via
// externally_connectable messaging. Resolves false when the extension isn't
// installed / isn't this browser / the id isn't configured — the one-time code
// fallback covers those.
function sendTokenToExtension(token) {
  return new Promise((resolve) => {
    try {
      const runtime = typeof window !== "undefined" ? window.chrome?.runtime : null;
      if (!runtime?.sendMessage || !EXTENSION_ID) return resolve(false);
      runtime.sendMessage(EXTENSION_ID, { type: "jugaadu/connect", token }, (resp) => {
        // Swallow "no receiving end" errors — treated as not-installed.
        if (runtime.lastError) return resolve(false);
        resolve(Boolean(resp?.ok));
      });
      // sendMessage can hang if the SW never answers; don't wedge the UI.
      setTimeout(() => resolve(false), 3000);
    } catch {
      resolve(false);
    }
  });
}

export default function ExtensionSettingsPage() {
  const isMobile = useIsMobile();
  const [active, setActive] = useState(null); // {label, created_at, last_used_at} | null
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [oneTimeCode, setOneTimeCode] = useState(null);
  const [handshake, setHandshake] = useState(null); // "ok" | "manual" | null
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/ext/token")
      .then((r) => r.json())
      .then((j) => setActive(j?.active ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function connect() {
    setWorking(true);
    setOneTimeCode(null);
    setHandshake(null);
    try {
      const res = await fetch("/api/ext/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: navigator?.userAgent?.includes("Mac") ? "Chrome on Mac" : "Chrome" }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.token) throw new Error("mint failed");
      const delivered = await sendTokenToExtension(j.token);
      if (delivered) {
        setHandshake("ok");
      } else {
        // Extension not reachable — show the token once as a paste-in code.
        setOneTimeCode(j.token);
        setHandshake("manual");
      }
      setActive({ created_at: new Date().toISOString() });
    } catch {
      setHandshake(null);
    } finally {
      setWorking(false);
    }
  }

  async function disconnect() {
    setWorking(true);
    try {
      await fetch("/api/ext/token", { method: "DELETE" });
      setActive(null);
      setOneTimeCode(null);
      setHandshake(null);
    } finally {
      setWorking(false);
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(oneTimeCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  const mono = { fontFamily: PAPER_FONTS_V2.mono, fontSize: 12, color: TOKENS.muted };

  return (
    <div
      className="scroll"
      style={{
        flex: 1,
        overflow: "auto",
        padding: isMobile ? "24px 16px 64px" : "48px 56px 80px",
        background: TOKENS.paper,
        color: TOKENS.ink,
      }}
    >
      <div style={{ marginBottom: 22, maxWidth: 640 }}>
        <h1
          style={{
            margin: 0,
            fontFamily: PAPER_FONTS_V2.serif,
            fontWeight: 400,
            fontSize: isMobile ? 24 : 30,
            lineHeight: 1.25,
            letterSpacing: "-.01em",
          }}
        >
          Chrome extension
        </h1>
        <p
          style={{
            margin: "8px 0 0",
            fontFamily: PAPER_FONTS_V2.sans,
            fontSize: 14,
            lineHeight: 1.7,
            color: TOKENS.muted,
          }}
        >
          The Jugaadu extension fills job application forms on Greenhouse, Ashby, and Lever with
          the resume and answers your crew already tailored. You review every field and click
          Submit yourself.
        </p>
      </div>

      <div
        style={{
          background: TOKENS.card,
          border: `1px solid ${TOKENS.lineSoft}`,
          borderRadius: RADII.card,
          boxShadow: SHADOWS.card,
          padding: "20px 22px",
          maxWidth: 640,
        }}
      >
        {loading ? (
          <div style={mono}>Checking…</div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 99,
                  background: active ? TOKENS.green : TOKENS.line,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 14 }}>
                {active ? "Extension connected" : "Not connected"}
              </span>
              {active?.last_used_at && (
                <span style={mono}>
                  · last used {new Date(active.last_used_at).toLocaleDateString()}
                </span>
              )}
            </div>

            {handshake === "ok" && (
              <p style={{ ...mono, color: TOKENS.green, margin: "0 0 12px" }}>
                Connected — the extension picked up your token automatically.
              </p>
            )}

            {oneTimeCode && (
              <div
                style={{
                  border: `1px dashed ${TOKENS.dashed}`,
                  borderRadius: RADII.panelTight,
                  padding: "12px 14px",
                  marginBottom: 12,
                }}
              >
                <div style={{ ...mono, marginBottom: 6 }}>
                  Couldn&apos;t reach the extension directly. Open the Jugaadu extension popup and
                  paste this one-time code — it won&apos;t be shown again:
                </div>
                <div
                  style={{
                    fontFamily: PAPER_FONTS_V2.mono,
                    fontSize: 12,
                    wordBreak: "break-all",
                    color: TOKENS.ink,
                    marginBottom: 8,
                  }}
                >
                  {oneTimeCode}
                </div>
                <button
                  onClick={copyCode}
                  style={{
                    padding: "6px 12px",
                    background: TOKENS.ink,
                    color: TOKENS.paper,
                    border: "1px solid transparent",
                    borderRadius: RADII.buttonTight,
                    fontFamily: PAPER_FONTS_V2.mono,
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  {copied ? "Copied ✓" : "Copy code"}
                </button>
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={connect}
                disabled={working}
                style={{
                  padding: "8px 16px",
                  background: TOKENS.ink,
                  color: TOKENS.paper,
                  border: "1px solid transparent",
                  borderRadius: RADII.buttonTight,
                  fontFamily: PAPER_FONTS_V2.sans,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: working ? "wait" : "pointer",
                  opacity: working ? 0.6 : 1,
                }}
              >
                {working ? "Working…" : active ? "Reconnect (new token)" : "Connect extension"}
              </button>
              {active && (
                <button
                  onClick={disconnect}
                  disabled={working}
                  style={{
                    padding: "8px 16px",
                    background: "transparent",
                    color: TOKENS.ink,
                    border: `1px solid ${TOKENS.faint}`,
                    borderRadius: RADII.buttonTight,
                    fontFamily: PAPER_FONTS_V2.sans,
                    fontSize: 13,
                    cursor: working ? "wait" : "pointer",
                  }}
                >
                  Disconnect
                </button>
              )}
            </div>

            <p style={{ ...mono, margin: "14px 0 0", lineHeight: 1.6 }}>
              Reconnecting replaces the previous token, so an old machine stops working. The token
              only lets the extension read your application package and mark applications
              submitted — it can never change your profile or send outreach.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
