"use client";

// New "paper" primitives for the jugaadu reskin — soft cards, thin 1px borders,
// gentle shadows, no hard offset shadows. These consume the flat token object in
// tokens.ts (not the legacy palette/theme hook). Added ALONGSIDE the old
// primitives.tsx; consumed by the reskinned pages (e.g. jobs preferences,
// people) while the legacy routes keep using primitives.tsx.

import type { CSSProperties, ReactNode } from "react";
import { PAPER_FONTS_V2 } from "./fonts";
import { RADII, SHADOWS, TOKENS } from "./tokens";

// A resting or elevated surface. Thin 1px border, 14px radius by default.
export function Card({
  children,
  elevated = false,
  warm = false,
  style,
}: {
  children: ReactNode;
  elevated?: boolean;
  warm?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: warm ? TOKENS.cardWarm : TOKENS.card,
        color: TOKENS.ink,
        border: `1px solid ${TOKENS.lineSoft}`,
        borderRadius: RADII.card,
        boxShadow: elevated ? SHADOWS.elevated : SHADOWS.card,
        padding: "20px 22px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// UPPERCASE mono section label / chip text (IBM Plex Mono).
export function MonoLabel({
  children,
  color,
  size = 10.5,
  style,
}: {
  children: ReactNode;
  color?: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        fontFamily: PAPER_FONTS_V2.mono,
        fontSize: size,
        fontWeight: 500,
        letterSpacing: ".1em",
        textTransform: "uppercase",
        color: color ?? TOKENS.muted,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// Rounded neutral chip / pill.
export function Chip({
  children,
  bg = TOKENS.chip,
  color = TOKENS.muted2,
  style,
}: {
  children: ReactNode;
  bg?: string;
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: bg,
        color,
        borderRadius: RADII.pill,
        padding: "4px 10px",
        fontFamily: PAPER_FONTS_V2.mono,
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: ".08em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// Ink solid / outline / ghost button. No hard offset shadow.
export function InkButton2({
  children,
  onClick,
  kind = "solid",
  size = "md",
  disabled,
  type = "button",
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: "solid" | "outline" | "ghost";
  size?: "sm" | "md";
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  style?: CSSProperties;
}) {
  const sm = size === "sm";
  const isSolid = kind === "solid";
  const isOutline = kind === "outline";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: isSolid ? TOKENS.ink : "transparent",
        color: isSolid ? TOKENS.paper : TOKENS.ink,
        border: isOutline ? `1px solid ${TOKENS.faint}` : "1px solid transparent",
        borderRadius: RADII.button,
        padding: sm ? "7px 12px" : "9px 16px",
        fontFamily: PAPER_FONTS_V2.sans,
        fontSize: 13,
        fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        transition: "background .15s, border-color .15s",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// Thin horizontal row divider.
export function Divider({ style }: { style?: CSSProperties }) {
  return <div style={{ height: 1, background: TOKENS.lineRow, ...style }} />;
}
