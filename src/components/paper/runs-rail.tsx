"use client";

// The Desk's runs rail: a left column listing what the crew is doing right now,
// what needs a decision, and what it did before. Picking a row swaps the main
// pane to that run; "New run" brings the composer back — the runs keep going
// either way. On phones the same list slides in as a drawer.
//
// Presentation only: the sections are derived in desk-logic.ts
// (deskRailSections), and the page decides what selecting a row does.

import Link from "next/link";
import { TOKENS, RADII } from "./tokens";
import { PAPER_FONTS_V2 } from "./fonts";
import { fmtWhen, type RailRow, type RailSections } from "./desk-logic";

export const RAIL_WIDTH = 272;

// Hover washes (inline styles can't express :hover).
const RAIL_CSS = `
.rr-row:hover{background:${TOKENS.hoverWash}}
.rr-row[data-selected="true"]:hover{background:${TOKENS.card}}
.rr-new:hover{background:${TOKENS.inkSoft}!important}
.rr-all:hover{color:${TOKENS.ink}!important}
`;

const DOT: Record<string, string> = {
  running: TOKENS.gold,
  reconnecting: TOKENS.gold,
  ready: TOKENS.green,
  "needs-you": TOKENS.amber,
};

function StatusMark({ status }: { status: RailRow["status"] }) {
  const live = status === "running" || status === "reconnecting";
  if (status === "ready") {
    return <span aria-hidden style={{ color: TOKENS.green, fontSize: 11, width: 12, textAlign: "center" }}>✓</span>;
  }
  if (status === "needs-you") {
    return <span aria-hidden style={{ color: TOKENS.amber, fontSize: 12, fontWeight: 600, width: 12, textAlign: "center" }}>!</span>;
  }
  return (
    <span aria-hidden style={{ width: 12, display: "inline-flex", justifyContent: "center" }}>
      <span style={{
        width: 7, height: 7, borderRadius: "50%", background: DOT[status],
        animation: live ? "pulseDot 1.4s ease-in-out infinite" : undefined,
      }} />
    </span>
  );
}

function Row({ row, selected, onSelect }: { row: RailRow; selected: boolean; onSelect: (r: RailRow) => void }) {
  const live = row.source === "live" && (row.status === "running" || row.status === "reconnecting");
  const pct = row.stepsTotal ? Math.max(6, Math.round(((row.stepsDone || 0) / row.stepsTotal) * 100)) : 0;
  const meta = live
    ? (row.caption || (row.status === "reconnecting" ? "Reconnecting…" : "Working…"))
    : row.status === "needs-you"
      ? "needs you"
      : row.caption || fmtWhen(row.createdAt);
  return (
    <button
      type="button"
      className="rr-row"
      data-selected={selected}
      aria-current={selected ? "true" : undefined}
      onClick={() => onSelect(row)}
      title={row.title}
      style={{
        display: "flex", alignItems: "flex-start", gap: 9, width: "100%", textAlign: "left",
        padding: "9px 10px 9px 9px", border: "none", cursor: "pointer", borderRadius: 9,
        background: selected ? TOKENS.card : "transparent",
        boxShadow: selected ? `inset 2px 0 0 ${TOKENS.ink}, 0 0 0 1px ${TOKENS.lineSoft}` : "none",
        transition: "background .15s",
      }}
    >
      <span style={{ paddingTop: 4, display: "inline-flex" }}><StatusMark status={row.status} /></span>
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{
          fontFamily: PAPER_FONTS_V2.serif, fontSize: 14.5, lineHeight: 1.3,
          color: selected ? TOKENS.ink : TOKENS.inkSoft,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{row.title}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{
            flex: 1, minWidth: 0, fontFamily: PAPER_FONTS_V2.sans, fontSize: 11.5, lineHeight: 1.35,
            color: row.status === "needs-you" ? TOKENS.amber : TOKENS.muted,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{meta}</span>
          {live && row.stepsTotal ? (
            <span style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 10, color: TOKENS.faint2, whiteSpace: "nowrap" }}>
              {row.stepsDone}/{row.stepsTotal}
            </span>
          ) : null}
        </span>
        {live && row.stepsTotal ? (
          <span aria-hidden style={{ height: 2, borderRadius: 2, background: TOKENS.lineRow, overflow: "hidden", marginTop: 2 }}>
            <span style={{
              display: "block", height: "100%", width: `${pct}%`, background: TOKENS.gold,
              transition: "width .6s ease",
            }} />
          </span>
        ) : null}
      </span>
    </button>
  );
}

function Section({ label, count, children }: { label: string; count?: number; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 18 }}>
      <div style={{
        fontFamily: PAPER_FONTS_V2.sans, fontSize: 10.5, fontWeight: 500, letterSpacing: ".12em",
        textTransform: "uppercase", color: TOKENS.faint, padding: "0 10px 6px",
      }}>
        {label}{typeof count === "number" ? <span style={{ color: TOKENS.faint2 }}> · {count}</span> : null}
      </div>
      {children}
    </div>
  );
}

export function RunsRail({
  sections,
  isSelected,
  onSelect,
  onNew,
  newActive,
  isMobile,
  open,
  onClose,
}: {
  sections: RailSections;
  isSelected: (row: RailRow) => boolean;
  onSelect: (row: RailRow) => void;
  onNew: () => void;
  newActive: boolean;
  isMobile: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const { running, attention, earlier } = sections;
  const empty = !running.length && !attention.length && !earlier.length;

  const body = (
    <nav aria-label="Runs" style={{
      width: RAIL_WIDTH, flexShrink: 0, boxSizing: "border-box", height: "100%",
      display: "flex", flexDirection: "column",
      background: TOKENS.paper, borderRight: `1px solid ${TOKENS.lineRow}`,
    }}>
      <style>{RAIL_CSS}</style>
      <div style={{ padding: "18px 14px 4px" }}>
        <button
          type="button"
          className="rr-new"
          onClick={onNew}
          aria-pressed={newActive}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            fontFamily: PAPER_FONTS_V2.sans, fontSize: 13, fontWeight: 500,
            color: TOKENS.paper, background: TOKENS.ink, border: "none",
            borderRadius: RADII.pill, padding: "10px 14px", cursor: "pointer", transition: "background .15s",
          }}
        >
          <span aria-hidden style={{ fontSize: 15, lineHeight: 1 }}>+</span> New run
        </button>
      </div>

      <div className="scroll" style={{ flex: 1, overflowY: "auto", padding: "0 8px 12px" }}>
        {running.length > 0 && (
          <Section label="Running now" count={running.length}>
            {running.map((r) => <Row key={r.key} row={r} selected={isSelected(r)} onSelect={onSelect} />)}
          </Section>
        )}
        {attention.length > 0 && (
          <Section label="Needs you" count={attention.length}>
            {attention.map((r) => <Row key={r.key} row={r} selected={isSelected(r)} onSelect={onSelect} />)}
          </Section>
        )}
        {earlier.length > 0 && (
          <Section label="Earlier">
            {earlier.map((r) => <Row key={r.key} row={r} selected={isSelected(r)} onSelect={onSelect} />)}
          </Section>
        )}
        {empty && (
          <div style={{
            margin: "22px 10px 0", fontFamily: PAPER_FONTS_V2.serif, fontStyle: "italic",
            fontSize: 14, lineHeight: 1.5, color: TOKENS.muted,
          }}>
            Runs show up here. Start two at once — they&apos;ll both keep going.
          </div>
        )}
      </div>

      <div style={{ borderTop: `1px solid ${TOKENS.lineRow}`, padding: "12px 18px 14px" }}>
        <Link href="/app/history" className="rr-all" style={{
          fontFamily: PAPER_FONTS_V2.sans, fontSize: 12.5, color: TOKENS.muted2, textDecoration: "none",
        }}>All history →</Link>
      </div>
    </nav>
  );

  if (!isMobile) return body;

  // Phones: a drawer over the main pane with a scrim behind it.
  return (
    <div aria-hidden={!open} style={{ position: "fixed", inset: 0, zIndex: 40, pointerEvents: open ? "auto" : "none" }}>
      <div onClick={onClose} style={{
        position: "absolute", inset: 0, background: "rgba(33,30,25,.28)",
        opacity: open ? 1 : 0, transition: "opacity .2s",
      }} />
      <div style={{
        position: "absolute", top: 0, bottom: 0, left: 0, maxWidth: "86vw",
        transform: open ? "none" : `translateX(-${RAIL_WIDTH + 10}px)`, transition: "transform .22s ease",
        boxShadow: open ? "0 10px 40px rgba(33,30,25,.18)" : "none",
      }}>
        {body}
      </div>
    </div>
  );
}
