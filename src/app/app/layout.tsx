"use client";

import { SidebarV3 } from "@/components/paper/sidebar";
import { usePaperTheme } from "@/components/paper/use-paper-theme";
import { PAPER_FONTS } from "@/components/paper/fonts";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { p } = usePaperTheme();

  return (
    <div
      style={{
        height: "100vh",
        display: "grid",
        gridTemplateColumns: "252px 1fr",
        background: p.paper,
        color: p.ink,
        overflow: "hidden",
        fontFamily: PAPER_FONTS.sans,
      }}
    >
      <SidebarV3 p={p} />
      <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}
