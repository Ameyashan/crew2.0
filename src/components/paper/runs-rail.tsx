"use client";

// The Desk's runs rail: a left column listing what the crew is doing right now,
// what needs a decision, and what it did before. Picking a row swaps the main
// pane to that run; "New run" brings the composer back — the runs keep going
// either way. On phones the same list slides in as a drawer.
//
// On desktop the rail can be dragged wider (so long titles fit) and collapsed
// to a slim strip; both stick per browser.
//
// Presentation only: the sections are derived in desk-logic.ts
// (deskRailSections), and the page decides what selecting a row does.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { TOKENS, RADII } from "./tokens";
import { PAPER_FONTS_V2 } from "./fonts";
import { railRowMeta, type RailRow, type RailSections } from "./desk-logic";

export const RAIL_WIDTH = 272;
const RAIL_MIN = 220;
const RAIL_MAX = 520;
const RAIL_COLLAPSED = 56;
// Dragging this far past the minimum collapses the rail.
const COLLAPSE_SNAP = 70;
const RAIL_PREFS_KEY = "crew.runsRail.v1";

type RailPrefs = { width: number; collapsed: boolean };
const DEFAULT_PREFS: RailPrefs = { width: RAIL_WIDTH, collapsed: false };

const clampWidth = (w: number) => Math.round(Math.min(RAIL_MAX, Math.max(RAIL_MIN, w)));

// The rail's width + collapsed state live in localStorage, read through
// useSyncExternalStore so the server render (defaults) and the hydrated client
// agree, and other tabs pick up changes. `written` keeps this tab working when
// storage is blocked (private mode, quota).
let written: RailPrefs | null = null;
let cachedRaw: string | null | undefined;
let cachedPrefs: RailPrefs = DEFAULT_PREFS;
const listeners = new Set<() => void>();

function parsePrefs(raw: string | null): RailPrefs {
  try {
    const p = raw ? JSON.parse(raw) : null;
    return {
      width: typeof p?.width === "number" ? clampWidth(p.width) : RAIL_WIDTH,
      collapsed: p?.collapsed === true,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function getPrefs(): RailPrefs {
  if (written) return written;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(RAIL_PREFS_KEY);
  } catch {
    return DEFAULT_PREFS;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedPrefs = parsePrefs(raw);
  }
  return cachedPrefs;
}

function subscribePrefs(cb: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== RAIL_PREFS_KEY) return;
    written = null;
    cb();
  };
  listeners.add(cb);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function writePrefs(p: RailPrefs) {
  written = p;
  try {
    window.localStorage.setItem(RAIL_PREFS_KEY, JSON.stringify(p));
  } catch {
    // Storage blocked: `written` still carries it for this tab.
  }
  listeners.forEach((l) => l());
}

// Hover washes (inline styles can't express :hover).
const RAIL_CSS = `
.rr-row:hover{background:${TOKENS.hoverWash}}
.rr-row[data-selected="true"]:hover{background:${TOKENS.card}}
.rr-new:hover{background:${TOKENS.inkSoft}!important}
.rr-all:hover{color:${TOKENS.ink}!important}
.rr-icon:hover{background:${TOKENS.hoverWash}!important;color:${TOKENS.ink}!important}
.rr-handle:hover .rr-grip,.rr-handle:focus-visible .rr-grip,.rr-handle[data-dragging="true"] .rr-grip{background:${TOKENS.dashed2}}
`;

// A panel-with-sidebar glyph; the chevron points the way the rail will go.
function PanelIcon({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1.75" y="2.25" width="12.5" height="11.5" rx="2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6 2.5v11" stroke="currentColor" strokeWidth="1.2" />
      <path
        d={open ? "M10.5 6 8.75 8l1.75 2" : "M9 6l1.75 2L9 10"}
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

const ICON_BUTTON: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 34, height: 34, flexShrink: 0, borderRadius: RADII.button, cursor: "pointer",
  border: "none", background: "transparent", color: TOKENS.muted2, transition: "background .15s, color .15s",
};

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
  const meta = railRowMeta(row);
  return (
    <button
      type="button"
      className="rr-row"
      data-selected={selected}
      aria-current={selected ? "true" : undefined}
      onClick={() => onSelect(row)}
      title={`${row.title} — ${row.kindLabel}`}
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
          // Up to two lines before truncating — long role titles stay readable.
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          overflow: "hidden", overflowWrap: "anywhere",
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

// The drag strip on the rail's right edge. Arrow keys nudge it; double-click
// puts the default width back.
function ResizeHandle({
  width,
  onResize,
  onResizeEnd,
  onReset,
}: {
  width: number;
  onResize: (w: number) => void;
  onResizeEnd: (w: number) => void;
  onReset: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startX: number; startW: number; w: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startW: width, w: width };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    // Unclamped here so the parent can tell a collapse-snap from a narrow rail.
    d.w = d.startW + (e.clientX - d.startX);
    onResize(d.w);
  };
  const end = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setDragging(false);
    onResizeEnd(d.w);
  };

  // Keep the resize cursor and stop text selection while the pointer is
  // anywhere on the page, not just over the 8px strip.
  useEffect(() => {
    if (!dragging) return;
    const body = document.body.style;
    const prev = { cursor: body.cursor, userSelect: body.userSelect };
    body.cursor = "col-resize";
    body.userSelect = "none";
    return () => {
      body.cursor = prev.cursor;
      body.userSelect = prev.userSelect;
    };
  }, [dragging]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize runs sidebar"
      aria-valuemin={RAIL_MIN}
      aria-valuemax={RAIL_MAX}
      aria-valuenow={Math.round(width)}
      tabIndex={0}
      className="rr-handle"
      data-dragging={dragging}
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 48 : 16;
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          const w = clampWidth(width + (e.key === "ArrowRight" ? step : -step));
          onResize(w);
          onResizeEnd(w);
        }
      }}
      style={{
        position: "absolute", top: 0, bottom: 0, right: -4, width: 8, zIndex: 2,
        cursor: "col-resize", touchAction: "none", outline: "none",
        display: "flex", justifyContent: "center",
      }}
    >
      <span className="rr-grip" style={{ width: 2, height: "100%", background: "transparent", transition: "background .15s" }} />
    </div>
  );
}

// The collapsed rail: expand, new run, and a mark per run that's live or needs
// a decision — enough to jump back in without opening the whole list.
function CollapsedRail({
  sections,
  isSelected,
  onSelect,
  onNew,
  onExpand,
}: {
  sections: RailSections;
  isSelected: (row: RailRow) => boolean;
  onSelect: (row: RailRow) => void;
  onNew: () => void;
  onExpand: () => void;
}) {
  const active = [...sections.running, ...sections.attention];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "14px 0", height: "100%", boxSizing: "border-box" }}>
      <button type="button" className="rr-icon" onClick={onExpand} aria-label="Expand runs sidebar" title="Expand sidebar" style={ICON_BUTTON}>
        <PanelIcon open={false} />
      </button>
      <button
        type="button"
        className="rr-new"
        onClick={onNew}
        aria-label="New run"
        title="New run"
        style={{
          ...ICON_BUTTON, color: TOKENS.paper, background: TOKENS.ink, borderRadius: RADII.pill,
          fontSize: 17, lineHeight: 1, marginTop: 4,
        }}
      >+</button>
      {active.length > 0 && (
        <div style={{ width: 24, height: 1, background: TOKENS.lineRow, margin: "8px 0 4px" }} />
      )}
      <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
        {active.map((r) => (
          <button
            key={r.key}
            type="button"
            className="rr-icon"
            onClick={() => onSelect(r)}
            aria-label={`${r.title} — ${railRowMeta(r)}`}
            aria-current={isSelected(r) ? "true" : undefined}
            title={`${r.title} — ${railRowMeta(r)}`}
            style={{
              ...ICON_BUTTON,
              background: isSelected(r) ? TOKENS.card : "transparent",
              boxShadow: isSelected(r) ? `0 0 0 1px ${TOKENS.lineSoft}` : "none",
            }}
          >
            <StatusMark status={r.status} />
          </button>
        ))}
      </div>
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

  // Width + collapsed state (desktop only). While dragging, the live width is
  // local and only saved when the drag ends.
  const prefs = useSyncExternalStore(subscribePrefs, getPrefs, () => DEFAULT_PREFS);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const width = dragWidth ?? prefs.width;
  const collapsed = prefs.collapsed;

  const setCollapsed = useCallback((c: boolean) => {
    writePrefs({ ...getPrefs(), collapsed: c });
  }, []);
  const onResize = useCallback((w: number) => setDragWidth(clampWidth(w)), []);
  const onResizeEnd = useCallback((w: number) => {
    setDragWidth(null);
    // Dragged well past the minimum: fold it away, but keep a usable width for
    // when it comes back.
    if (w < RAIL_MIN - COLLAPSE_SNAP) writePrefs({ width: RAIL_MIN, collapsed: true });
    else writePrefs({ width: clampWidth(w), collapsed: false });
  }, []);
  const onReset = useCallback(() => writePrefs({ width: RAIL_WIDTH, collapsed: false }), []);

  const railWidth = isMobile ? RAIL_WIDTH : collapsed ? RAIL_COLLAPSED : width;

  const list = (
    <>
      <div style={{ padding: "18px 14px 4px", display: "flex", alignItems: "center", gap: 6 }}>
        <button
          type="button"
          className="rr-new"
          onClick={onNew}
          aria-pressed={newActive}
          style={{
            flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            fontFamily: PAPER_FONTS_V2.sans, fontSize: 13, fontWeight: 500,
            color: TOKENS.paper, background: TOKENS.ink, border: "none",
            borderRadius: RADII.pill, padding: "10px 14px", cursor: "pointer", transition: "background .15s",
          }}
        >
          <span aria-hidden style={{ fontSize: 15, lineHeight: 1 }}>+</span> New run
        </button>
        {!isMobile && (
          <button
            type="button"
            className="rr-icon"
            onClick={() => setCollapsed(true)}
            aria-label="Collapse runs sidebar"
            title="Collapse sidebar"
            style={ICON_BUTTON}
          >
            <PanelIcon open />
          </button>
        )}
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
    </>
  );

  const body = (
    <nav aria-label="Runs" style={{
      width: railWidth, flexShrink: 0, boxSizing: "border-box", height: "100%",
      position: "relative", display: "flex", flexDirection: "column",
      background: TOKENS.paper, borderRight: `1px solid ${TOKENS.lineRow}`,
      transition: dragWidth != null ? "none" : "width .2s ease",
    }}>
      <style>{RAIL_CSS}</style>
      {!isMobile && collapsed ? (
        <CollapsedRail
          sections={sections}
          isSelected={isSelected}
          onSelect={onSelect}
          onNew={onNew}
          onExpand={() => setCollapsed(false)}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", minWidth: 0, overflow: "hidden" }}>
          {list}
        </div>
      )}
      {!isMobile && !collapsed && (
        <ResizeHandle width={width} onResize={onResize} onResizeEnd={onResizeEnd} onReset={onReset} />
      )}
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
