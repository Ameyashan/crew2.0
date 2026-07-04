"use client";

import { TopBar } from "@/components/paper/top-bar";
import { TOKENS } from "@/components/paper/tokens";
import { PAPER_FONTS_V2 } from "@/components/paper/fonts";

// App chrome for every /app/* page: a single column with the top bar (wordmark,
// nav pills, live-runs chip, account popover) above a scrollable content area.
// This replaces the old 252px `SidebarV3` left rail — nav now lives in the bar,
// which wraps its pills under the wordmark at narrow widths, so no separate
// mobile drawer is needed.
export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        background: TOKENS.paper,
        color: TOKENS.ink,
        overflow: "hidden",
        fontFamily: PAPER_FONTS_V2.sans,
      }}
    >
      <TopBar />
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minWidth: 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}
