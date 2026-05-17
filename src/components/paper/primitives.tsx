"use client";

import type { CSSProperties, ReactNode } from "react";
import { PAPER_FONTS } from "./fonts";
import type { Palette } from "./palette";

type PProp = { p: Palette };

export function InkRule({ p, thick = 2, gap = 3, thin = 1 }: PProp & { thick?: number; gap?: number; thin?: number }) {
  return (
    <div>
      <div style={{ height: thick, background: p.ink }} />
      <div style={{ height: gap }} />
      <div style={{ height: thin, background: p.ink }} />
    </div>
  );
}

export function Stamp({
  children,
  color,
  rotate = -4,
  style,
}: {
  children: ReactNode;
  color: string;
  rotate?: number;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        display: "inline-block",
        border: `2px double ${color}`,
        color,
        padding: "4px 10px",
        fontFamily: PAPER_FONTS.mono,
        fontWeight: 700,
        letterSpacing: ".12em",
        fontSize: 10.5,
        textTransform: "uppercase",
        transform: `rotate(${rotate}deg)`,
        background: "rgba(255,255,255,.4)",
        borderRadius: 2,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function PageHead({
  p,
  eyebrow,
  title,
  italic,
  sub,
  right,
}: PProp & {
  eyebrow?: ReactNode;
  title: ReactNode;
  italic?: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 24,
        flexWrap: "wrap",
        marginBottom: 24,
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        {eyebrow && (
          <div
            style={{
              fontFamily: PAPER_FONTS.mono,
              fontSize: 11,
              color: p.stamp,
              letterSpacing: ".18em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            {eyebrow}
          </div>
        )}
        <h1
          style={{
            margin: 0,
            fontFamily: PAPER_FONTS.display,
            fontWeight: 400,
            fontSize: "clamp(40px, 4.8vw, 64px)",
            lineHeight: 0.95,
            letterSpacing: "-.02em",
            color: p.ink,
            textWrap: "balance",
          }}
        >
          {title}
          {italic ? (
            <>
              {" "}
              <span style={{ fontStyle: "italic", color: p.stamp }}>{italic}</span>
            </>
          ) : null}
        </h1>
        {sub && (
          <p
            style={{
              margin: "14px 0 0",
              fontFamily: PAPER_FONTS.serif,
              fontStyle: "italic",
              fontSize: 18,
              lineHeight: 1.45,
              color: p.inkSoft,
              maxWidth: 720,
            }}
          >
            {sub}
          </p>
        )}
      </div>
      {right && <div style={{ flexShrink: 0 }}>{right}</div>}
    </div>
  );
}

export function PaperCard({
  p,
  color,
  children,
  hardShadow = false,
  style,
  dashed = false,
}: PProp & {
  color?: string;
  children: ReactNode;
  hardShadow?: boolean;
  style?: CSSProperties;
  dashed?: boolean;
}) {
  return (
    <div
      style={{
        background: p.card,
        color: p.ink,
        border: `${dashed ? "1.5px dashed" : "1.5px solid"} ${p.ink}`,
        boxShadow: hardShadow ? `4px 4px 0 ${color || p.marigold}` : "none",
        padding: "20px 22px",
        position: "relative",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Eyebrow({
  p,
  hindi,
  en,
  color,
}: PProp & { hindi?: ReactNode; en: ReactNode; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
      {hindi && (
        <span
          style={{
            fontFamily: PAPER_FONTS.devan,
            fontWeight: 700,
            fontSize: 12,
            color: color || p.stamp,
            letterSpacing: ".02em",
          }}
        >
          {hindi}
        </span>
      )}
      <span
        style={{
          fontFamily: PAPER_FONTS.mono,
          fontSize: 10.5,
          color: color || p.stamp,
          letterSpacing: ".18em",
          textTransform: "uppercase",
        }}
      >
        {en}
      </span>
    </div>
  );
}

export function InkButton({
  p,
  children,
  onClick,
  color,
  size = "md",
  kind = "solid",
  disabled,
  style,
  type = "button",
}: PProp & {
  children: ReactNode;
  onClick?: () => void;
  color?: string;
  size?: "sm" | "md" | "lg";
  kind?: "solid" | "outline" | "ghost";
  disabled?: boolean;
  style?: CSSProperties;
  type?: "button" | "submit" | "reset";
}) {
  const big = size === "lg";
  const sm = size === "sm";
  const isOutline = kind === "outline";
  const isGhost = kind === "ghost";
  const shadow = `4px 4px 0 ${color || p.marigold}`;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: isOutline || isGhost ? "transparent" : color || p.ink,
        color: isOutline || isGhost ? p.ink : p.paper,
        border: isGhost ? "none" : `2px solid ${p.ink}`,
        padding: big ? "14px 22px" : sm ? "7px 12px" : "10px 16px",
        fontFamily: PAPER_FONTS.display,
        fontSize: big ? 19 : sm ? 13 : 15,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        boxShadow: kind === "solid" ? shadow : "none",
        transition: "transform .15s, box-shadow .15s",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        whiteSpace: "nowrap",
        ...style,
      }}
      onMouseDown={(e) => {
        if (kind === "solid") {
          e.currentTarget.style.transform = "translate(2px,2px)";
          e.currentTarget.style.boxShadow = `2px 2px 0 ${color || p.marigold}`;
        }
      }}
      onMouseUp={(e) => {
        if (kind === "solid") {
          e.currentTarget.style.transform = "";
          e.currentTarget.style.boxShadow = shadow;
        }
      }}
      onMouseLeave={(e) => {
        if (kind === "solid") {
          e.currentTarget.style.transform = "";
          e.currentTarget.style.boxShadow = shadow;
        }
      }}
    >
      {children}
    </button>
  );
}

export function Marginalia({
  p,
  children,
  rotate = -1,
  color,
  style,
}: PProp & { children: ReactNode; rotate?: number; color?: string; style?: CSSProperties }) {
  return (
    <span
      style={{
        fontFamily: PAPER_FONTS.caveat,
        fontSize: 20,
        color: color || p.tea,
        transform: `rotate(${rotate}deg)`,
        display: "inline-block",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function PaperEmpty({
  p,
  hindi,
  title,
  sub,
  children,
}: PProp & { hindi?: ReactNode; title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div
      style={{
        padding: "48px 32px",
        textAlign: "center",
        border: `1.5px dashed ${p.ink}40`,
        background: "transparent",
      }}
    >
      {hindi && (
        <div
          style={{
            fontFamily: PAPER_FONTS.devan,
            fontSize: 14,
            color: p.stamp,
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          {hindi}
        </div>
      )}
      <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 26, color: p.ink, lineHeight: 1.1 }}>
        {title}
      </div>
      {sub && (
        <p
          style={{
            margin: "8px auto 0",
            maxWidth: 480,
            fontFamily: PAPER_FONTS.serif,
            fontStyle: "italic",
            fontSize: 16,
            color: p.inkSoft,
            lineHeight: 1.4,
          }}
        >
          {sub}
        </p>
      )}
      {children && <div style={{ marginTop: 18 }}>{children}</div>}
    </div>
  );
}
