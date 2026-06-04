"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SidebarV3 } from "@/components/paper/sidebar";
import { usePaperTheme } from "@/components/paper/use-paper-theme";
import { PAPER_FONTS } from "@/components/paper/fonts";
import { useIsMobile } from "@/lib/use-is-mobile";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { p } = usePaperTheme();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // The drawer closes itself via `onNavigate` when a nav item is tapped (see
  // the SidebarV3 below), so there's no route-change effect to manage here.

  // Lock background scroll while the drawer is open.
  useEffect(() => {
    if (!isMobile || !drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isMobile, drawerOpen]);

  return (
    <div
      style={{
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        background: p.paper,
        color: p.ink,
        overflow: "hidden",
        fontFamily: PAPER_FONTS.sans,
      }}
    >
      {/* Mobile top bar with the menu trigger. */}
      {isMobile && (
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 16px",
            borderBottom: `1.5px solid ${p.ink}`,
            background: p.paperDeep,
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            style={{
              display: "grid",
              placeItems: "center",
              width: 40,
              height: 40,
              background: p.card,
              border: `1.5px solid ${p.ink}`,
              color: p.ink,
              fontSize: 20,
              lineHeight: 1,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            ≡
          </button>
          <Link
            href="/home"
            style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", color: "inherit" }}
          >
            <div
              style={{
                position: "relative",
                width: 28,
                height: 28,
                borderRadius: 6,
                background: p.stamp,
                color: p.paper,
                display: "grid",
                placeItems: "center",
                fontFamily: PAPER_FONTS.display,
                fontSize: 16,
                boxShadow: `2px 2px 0 ${p.ink}`,
              }}
            >
              J
            </div>
            <span style={{ fontFamily: PAPER_FONTS.display, fontSize: 22, color: p.ink }}>
              Jugaadu<span style={{ color: p.stamp }}>.</span>
            </span>
          </Link>
        </header>
      )}

      {/* Shell: fixed sidebar rail on desktop, single column on mobile. */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "252px 1fr",
          overflow: "hidden",
        }}
      >
        {!isMobile && <SidebarV3 p={p} />}
        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
          {children}
        </div>
      </div>

      {/* Mobile slide-in drawer + backdrop. */}
      {isMobile && (
        <>
          <div
            onClick={() => setDrawerOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,.45)",
              zIndex: 40,
              opacity: drawerOpen ? 1 : 0,
              pointerEvents: drawerOpen ? "auto" : "none",
              transition: "opacity .25s ease",
            }}
          />
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              bottom: 0,
              width: "min(280px, 82vw)",
              zIndex: 50,
              display: "flex",
              transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
              transition: "transform .25s ease",
              boxShadow: drawerOpen ? `4px 0 28px rgba(0,0,0,.28)` : "none",
            }}
          >
            <SidebarV3 p={p} style={{ flex: 1 }} onNavigate={() => setDrawerOpen(false)} />
          </div>
        </>
      )}
    </div>
  );
}
