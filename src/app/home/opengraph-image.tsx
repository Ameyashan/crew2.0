import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/site";

// Dynamic 1200×630 social card for the marketing page. Using next/og avoids
// committing a binary asset and keeps the card in code (the cofounder-seo agent
// can restyle it). Next auto-injects the og:image tag for this route segment.
export const alt = "Jugaadu — the personal OS for ambition";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f7f3e8",
          color: "#1a1a1a",
          padding: "72px",
          fontFamily: "serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 34, letterSpacing: 4, textTransform: "uppercase", color: "#a8631b" }}>
          {SITE_NAME} · जुगाड़ू
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 68, lineHeight: 1.05, fontWeight: 600, maxWidth: 980 }}>
            Jobs get filled before they&apos;re posted. Get there first.
          </div>
          <div style={{ fontSize: 32, color: "#4a4a4a", maxWidth: 900 }}>
            A crew of AI agents that runs your job hunt — the opening, the
            decision-maker, and a verified way in.
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#6b6b6b" }}>jugaadu.app</div>
      </div>
    ),
    { ...size },
  );
}
