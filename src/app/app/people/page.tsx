// @ts-nocheck — People tracker table + dossier (jugaadu reskin, Phase F)
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PAPER_FONTS_V2 } from "@/components/paper/fonts";
import { TOKENS, RADII, SHADOWS } from "@/components/paper/tokens";
import { InkButton2 } from "@/components/paper/primitives2";
import {
  personLastTouch,
  personNextStep,
  personStatusChip,
  interactionToStatus,
  trackerRowNeedsAction,
} from "@/components/paper/phase5-logic";
import { useIsMobile } from "@/lib/use-is-mobile";
import { hydrateRun } from "@/lib/runs-store";

// NEXT-column tint per kind (prototype lines 524): your move = ink, an automatic
// follow-up = muted, closed/cold = faint.
const NEXT_COLOR = { you: TOKENS.ink, auto: TOKENS.muted, closed: TOKENS.faint };

// Status chip colors per tone (prototype line 525): REPLIED green, SENT amber,
// HELD neutral.
const STATUS_STYLE = {
  replied: { color: TOKENS.green, bg: TOKENS.greenBg },
  sent: { color: TOKENS.amber, bg: TOKENS.amberBg },
  held: { color: TOKENS.muted, bg: TOKENS.chip },
};

const GRID_COLS = "2.2fr 1fr 1.1fr 1.3fr auto";

// ── Tracker table ────────────────────────────────────────────────────────────
function PeopleTable({ people, onOpen }) {
  const isMobile = useIsMobile();

  return (
    <div
      className="scroll"
      style={{
        flex: 1,
        overflow: "auto",
        background: TOKENS.paper,
        color: TOKENS.ink,
        padding: isMobile ? "28px 16px 60px" : "44px 44px 60px",
      }}
    >
      <div style={{ maxWidth: 920, margin: "0 auto", width: "100%" }}>
        <div
          style={{
            fontFamily: PAPER_FONTS_V2.serif,
            fontSize: 30,
            fontWeight: 400,
            lineHeight: 1.25,
            letterSpacing: "-.01em",
            marginBottom: 8,
          }}
        >
          People
        </div>
        <div
          style={{
            fontFamily: PAPER_FONTS_V2.sans,
            fontSize: 14,
            lineHeight: 1.7,
            color: TOKENS.muted,
            maxWidth: 540,
            marginBottom: 30,
          }}
        >
          Everyone you&apos;ve reached out to. The crew watches for replies and queues the
          follow-ups — you&apos;ll be nudged, not spammed.
        </div>

        {people === null ? (
          <div
            style={{
              padding: "40px 14px",
              fontFamily: PAPER_FONTS_V2.mono,
              fontSize: 12,
              color: TOKENS.muted,
              letterSpacing: ".04em",
            }}
          >
            loading the crew…
          </div>
        ) : people.length === 0 ? (
          <div
            style={{
              padding: "48px 32px",
              textAlign: "center",
              border: `1px dashed ${TOKENS.dashed}`,
              borderRadius: RADII.card,
              background: TOKENS.card,
            }}
          >
            <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 26, color: TOKENS.ink, lineHeight: 1.1 }}>
              No people yet.
            </div>
            <p
              style={{
                margin: "8px auto 0",
                maxWidth: 480,
                fontFamily: PAPER_FONTS_V2.serif,
                fontStyle: "italic",
                fontSize: 16,
                color: TOKENS.inkSoft,
                lineHeight: 1.4,
              }}
            >
              Send something from any run and the person lands here automatically.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: isMobile ? 640 : undefined }}>
              {/* Header row */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: GRID_COLS,
                  gap: 14,
                  padding: "0 14px 10px",
                  fontFamily: PAPER_FONTS_V2.mono,
                  fontSize: 10.5,
                  fontWeight: 500,
                  letterSpacing: ".08em",
                  color: TOKENS.faint,
                }}
              >
                <span>PERSON</span>
                <span>COMPANY</span>
                <span>LAST TOUCH</span>
                <span>NEXT</span>
                <span>STATUS</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column" }}>
                {people.map((p) => (
                  <PersonRow key={p.id} p={p} onOpen={() => onOpen(p.id)} />
                ))}
                <div style={{ borderTop: `1px solid ${TOKENS.lineRow}` }} />
              </div>
            </div>
          </div>
        )}

        <div
          style={{
            fontFamily: PAPER_FONTS_V2.sans,
            fontSize: 12,
            lineHeight: 1.6,
            color: TOKENS.faint,
            marginTop: 16,
          }}
        >
          Send something from any run and the person lands here automatically.
        </div>
      </div>
    </div>
  );
}

function PersonRow({ p, onOpen }) {
  const last = personLastTouch(p);
  const next = personNextStep(p);
  const chip = personStatusChip(interactionToStatus(p.last_interaction_type));
  const chipStyle = STATUS_STYLE[chip.tone] || STATUS_STYLE.held;
  const needsAction = trackerRowNeedsAction(p);
  const name = p.name || "(unknown)";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      style={{
        display: "grid",
        gridTemplateColumns: GRID_COLS,
        gap: 14,
        padding: "16px 14px",
        borderTop: `1px solid ${TOKENS.lineRow}`,
        alignItems: "center",
        background: needsAction ? TOKENS.cardWarm : "transparent",
        cursor: "pointer",
        transition: "background .15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = TOKENS.hoverWash;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = needsAction ? TOKENS.cardWarm : "transparent";
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: PAPER_FONTS_V2.serif,
            fontWeight: 500,
            fontSize: 15,
            lineHeight: 1.3,
            color: TOKENS.ink,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {name}
        </div>
        {p.role && (
          <div
            style={{
              fontFamily: PAPER_FONTS_V2.sans,
              fontSize: 11.5,
              lineHeight: 1.5,
              color: TOKENS.muted,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {p.role}
          </div>
        )}
      </div>
      <span style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 13, color: TOKENS.inkSoft }}>
        {p.company || "—"}
      </span>
      <span style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 12.5, color: TOKENS.muted }}>
        {last}
      </span>
      <span
        style={{
          fontFamily: PAPER_FONTS_V2.sans,
          fontSize: 12.5,
          lineHeight: 1.4,
          color: NEXT_COLOR[next.tone] || TOKENS.muted,
        }}
      >
        {next.label}
      </span>
      <span
        style={{
          justifySelf: "start",
          fontFamily: PAPER_FONTS_V2.mono,
          fontSize: 10.5,
          fontWeight: 500,
          letterSpacing: ".02em",
          color: chipStyle.color,
          background: chipStyle.bg,
          borderRadius: 5,
          padding: "5px 8px",
          whiteSpace: "nowrap",
        }}
      >
        {chip.label}
      </span>
    </div>
  );
}

// ── Dossier (kept from the two-pane layout, reached via a row click) ──────────
function warmthColor(w) {
  return ({ warm: TOKENS.green, cool: TOKENS.muted2, cold: TOKENS.muted, new: TOKENS.red }[w]) || TOKENS.muted;
}

function PersonDetailV3({ person, go, onBack, onDeleted }) {
  const router = useRouter();
  const [detail, setDetail] = useState(null);
  const [opening, setOpening] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  useEffect(() => {
    if (!person?.id) return;
    let cancelled = false;
    fetch(`/api/people/${person.id}`).then((r) => r.json()).then((j) => {
      if (!cancelled) setDetail(j);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [person?.id]);

  async function doDelete() {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/people/${person.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || `delete failed: ${res.status}`);
      }
      onDeleted?.(person.id);
    } catch (e) {
      setDeleteError(String(e?.message || e));
      setDeleting(false);
    }
  }

  const workflows = detail?.workflows || [];
  const nextFollowup = detail?.nextFollowup || null;

  async function openWorkflow(id) {
    setOpening(id);
    try {
      const res = await fetch(`/api/compose/history/${id}`);
      if (!res.ok) throw new Error(`load failed: ${res.status}`);
      const json = await res.json();
      const run = json?.run;
      if (!run) throw new Error("run not found");
      hydrateRun({
        id: run.id,
        kind: run.kind,
        input: run.input,
        intent: run.intent,
        outcome: run.outcome,
        error: run.error,
        created_at: run.created_at,
        output: run.output,
        screenshot: run.screenshot,
      });
      router.push("/app/compose");
    } catch {
      setOpening(null);
    }
  }

  return (
    <div
      className="scroll"
      style={{
        flex: 1,
        overflow: "auto",
        background: TOKENS.paper,
        color: TOKENS.ink,
        padding: "40px 44px 80px",
      }}
    >
      <div style={{ maxWidth: 920, margin: "0 auto", width: "100%" }}>
        <button
          onClick={onBack}
          style={{
            background: "transparent",
            border: "none",
            color: TOKENS.muted,
            fontFamily: PAPER_FONTS_V2.sans,
            fontSize: 13,
            cursor: "pointer",
            padding: 0,
            marginBottom: 18,
          }}
        >
          ← All people
        </button>

        <div style={{ display: "flex", alignItems: "flex-start", gap: 22, marginBottom: 24, flexWrap: "wrap" }}>
          <div
            style={{
              width: 90,
              height: 90,
              background: TOKENS.gold,
              color: TOKENS.paper,
              display: "grid",
              placeItems: "center",
              borderRadius: RADII.pill,
              boxShadow: SHADOWS.card,
              fontFamily: PAPER_FONTS_V2.serif,
              fontSize: 30,
              flexShrink: 0,
            }}
          >
            {person.initials}
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div
              style={{
                fontFamily: PAPER_FONTS_V2.mono,
                fontSize: 10.5,
                fontWeight: 500,
                color: warmthColor(person.warmth),
                letterSpacing: ".1em",
                textTransform: "uppercase",
              }}
            >
              {`Last touch · ${person.last}`}
            </div>
            <h1
              style={{
                margin: "4px 0 6px",
                fontFamily: PAPER_FONTS_V2.serif,
                fontSize: 40,
                lineHeight: 1,
                color: TOKENS.ink,
                fontWeight: 400,
                letterSpacing: "-.02em",
              }}
            >
              {person.name}
            </h1>
            <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontStyle: "italic", fontSize: 17, color: TOKENS.inkSoft }}>
              {[person.role, person.co].filter(Boolean).join(" at ")}
            </div>
            <div
              style={{
                display: "flex",
                gap: 18,
                marginTop: 12,
                flexWrap: "wrap",
                fontFamily: PAPER_FONTS_V2.mono,
                fontSize: 11,
                color: TOKENS.muted,
                letterSpacing: ".04em",
              }}
            >
              {person.email && <span>✉ {person.email}</span>}
              <span>status: {person.status}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
            <InkButton2
              onClick={() =>
                go("compose", {
                  input: person.email || [person.name, person.co].filter(Boolean).join(" at "),
                })
              }
            >
              Reach out again →
            </InkButton2>
            {!confirmDelete && (
              <InkButton2 kind="outline" onClick={() => setConfirmDelete(true)}>
                Delete
              </InkButton2>
            )}
          </div>
        </div>

        {confirmDelete && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              marginBottom: 24,
              padding: "12px 16px",
              background: TOKENS.card,
              border: `1px solid ${TOKENS.red}`,
              borderRadius: RADII.panel,
              boxShadow: SHADOWS.card,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontFamily: PAPER_FONTS_V2.serif, fontStyle: "italic", fontSize: 15, color: TOKENS.ink }}>
              Really delete {person.name}? This removes their drafts, timeline, and follow-ups. Past
              compose runs stay in History.
            </span>
            <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
              <InkButton2 size="sm" onClick={doDelete} disabled={deleting} style={{ background: TOKENS.red, color: TOKENS.paper }}>
                {deleting ? "deleting…" : "Yes, delete"}
              </InkButton2>
              <InkButton2 kind="outline" size="sm" onClick={() => { setConfirmDelete(false); setDeleteError(null); }} disabled={deleting}>
                Keep
              </InkButton2>
            </div>
            {deleteError && (
              <span style={{ flexBasis: "100%", fontFamily: PAPER_FONTS_V2.mono, fontSize: 11, color: TOKENS.red }}>
                {deleteError}
              </span>
            )}
          </div>
        )}

        {/* facts strip */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 28 }}>
          {(extractFacts(detail) || []).map((f) => (
            <span
              key={f}
              style={{
                padding: "4px 12px",
                background: TOKENS.card,
                border: `1px solid ${TOKENS.line}`,
                color: TOKENS.ink,
                borderRadius: RADII.pill,
                fontFamily: PAPER_FONTS_V2.sans,
                fontSize: 12,
              }}
            >
              {f}
            </span>
          ))}
        </div>

        {nextFollowup && (() => {
          const due = new Date(nextFollowup.due_at);
          const diff = due.getTime() - Date.now();
          const days = Math.round(diff / 86400000);
          const overdue = diff < 0;
          const when = overdue
            ? `overdue · ${Math.abs(days)}d`
            : days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
          const color = overdue ? TOKENS.red : days <= 2 ? TOKENS.amber : TOKENS.green;
          const dateLabel = due.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          return (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                marginBottom: 28,
                padding: "12px 16px",
                background: TOKENS.card,
                border: `1px solid ${color}`,
                borderRadius: RADII.panel,
                boxShadow: SHADOWS.card,
              }}
            >
              <span
                style={{
                  fontFamily: PAPER_FONTS_V2.mono,
                  fontSize: 10.5,
                  fontWeight: 500,
                  letterSpacing: ".14em",
                  textTransform: "uppercase",
                  color,
                }}
              >
                ● Next followup
              </span>
              <span style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 18, color: TOKENS.ink, lineHeight: 1 }}>
                {when}
              </span>
              <span style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 11, color: TOKENS.muted, letterSpacing: ".04em" }}>
                {dateLabel}
                {nextFollowup.draft?.subject ? ` · ${nextFollowup.draft.subject}` : ""}
              </span>
            </div>
          );
        })()}

        <div
          style={{
            fontFamily: PAPER_FONTS_V2.mono,
            fontSize: 10.5,
            fontWeight: 500,
            color: TOKENS.muted,
            letterSpacing: ".1em",
            textTransform: "uppercase",
          }}
        >
          {`Workflows · ${workflows.length}`}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
          {workflows.length === 0 && (
            <div
              style={{
                padding: "14px 18px",
                background: TOKENS.card,
                border: `1px dashed ${TOKENS.dashed}`,
                borderRadius: RADII.panel,
                fontFamily: PAPER_FONTS_V2.mono,
                fontSize: 12,
                color: TOKENS.muted,
                letterSpacing: ".04em",
              }}
            >
              No workflows yet for this person.
            </div>
          )}
          {workflows.map((w) => {
            const chip = workflowOutcome(w.outcome);
            const title = workflowTitle(w);
            return (
              <div
                key={w.id}
                style={{
                  background: TOKENS.card,
                  border: `1px solid ${TOKENS.lineSoft}`,
                  borderRadius: RADII.panel,
                  boxShadow: SHADOWS.card,
                  padding: "14px 18px",
                  // On phones the fixed 4-col grid squeezes the title to a few
                  // characters; drop to a wrapping flex row (matching the run
                  // history rows) so the title takes a full line and the chip /
                  // time / button reflow beneath it.
                  display: isMobile ? "flex" : "grid",
                  gridTemplateColumns: "1fr auto auto auto",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 14,
                }}
              >
                <div style={{ minWidth: 0, flex: isMobile ? "1 1 100%" : undefined }}>
                  <div
                    style={{
                      fontFamily: PAPER_FONTS_V2.mono,
                      fontSize: 10.5,
                      fontWeight: 500,
                      letterSpacing: ".14em",
                      textTransform: "uppercase",
                      color: TOKENS.muted,
                    }}
                  >
                    compose · {w.kind}
                  </div>
                  <div
                    style={{
                      fontFamily: PAPER_FONTS_V2.serif,
                      fontSize: 17,
                      color: TOKENS.ink,
                      lineHeight: 1.15,
                      marginTop: 2,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {title}
                  </div>
                </div>
                <span
                  style={{
                    padding: "3px 10px",
                    background: chip.bg,
                    color: chip.color,
                    borderRadius: RADII.pill,
                    fontFamily: PAPER_FONTS_V2.mono,
                    fontSize: 11,
                    letterSpacing: ".04em",
                    whiteSpace: "nowrap",
                  }}
                >
                  {chip.label}
                </span>
                <span
                  style={{
                    fontFamily: PAPER_FONTS_V2.mono,
                    fontSize: 11,
                    color: TOKENS.muted,
                    letterSpacing: ".04em",
                    whiteSpace: "nowrap",
                  }}
                >
                  {relTime(new Date(w.created_at))}
                </span>
                <InkButton2 kind="outline" size="sm" onClick={() => openWorkflow(w.id)} disabled={opening === w.id}>
                  {opening === w.id ? "opening…" : "Open →"}
                </InkButton2>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function workflowOutcome(outcome) {
  if (outcome === "complete") return { label: "ready", color: TOKENS.green, bg: TOKENS.greenBg };
  if (outcome === "in_flight") return { label: "in progress…", color: TOKENS.amber, bg: TOKENS.amberBg };
  if (outcome === "needs_disambiguation") return { label: "needs pick", color: TOKENS.amber, bg: TOKENS.amberBg };
  return { label: "error", color: TOKENS.red, bg: TOKENS.chip };
}

function workflowTitle(w) {
  const out = w.output || {};
  if (w.kind === "job") {
    const parsed = out.parsed || {};
    const role = parsed.target_role || parsed.role || "Job application";
    return w.intent ? `${role} · ${w.intent}` : role;
  }
  const summary = out.person?.name || out.summary || w.intent || w.input;
  return summary || "Compose run";
}

function relTime(d) {
  const diff = Date.now() - d.getTime();
  const day = 86400000;
  if (diff < day) {
    const h = Math.max(1, Math.round(diff / 3600000));
    return `today · ${h}h ago`;
  }
  const days = Math.round(diff / day);
  return `${days}d ago`;
}

function extractFacts(detail) {
  if (!detail) return ["loading…"];
  const facts = [];
  const e = detail.person?.enrichment || {};
  if (typeof e.title === "string") facts.push(e.title);
  if (typeof e.tenure === "string") facts.push(e.tenure);
  if (Array.isArray(e.signals)) for (const s of e.signals.slice(0, 3)) if (typeof s === "string") facts.push(s);
  if (typeof e.location === "string") facts.push(e.location);
  if (!facts.length && detail.person?.company) facts.push(`works at ${detail.person.company}`);
  if (!facts.length) facts.push("no enrichment on file yet");
  return facts;
}

// Adapt a raw people-list row into the shape the dossier renders.
function adaptPerson(row) {
  const name = row.name || "(unknown)";
  const initials =
    name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "·";
  const recent = row.last_interaction ? new Date(row.last_interaction) : null;
  const last = recent ? recent.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
  const type = row.last_interaction_type;
  let warmth = "new";
  let status = "queued";
  if (type === "replied") {
    warmth = "warm";
    status = "replied";
  } else if (type === "sent") {
    warmth = recent && Date.now() - recent.getTime() > 14 * 86400000 ? "cold" : "cool";
    status = "awaiting";
  } else if (type === "drafted") {
    status = "queued";
  }
  return {
    id: row.id,
    name,
    role: row.role || "",
    co: row.company || "",
    initials,
    last,
    warmth,
    status,
    email: row.email || "",
  };
}

export default function PeoplePage() {
  const router = useRouter();
  const [people, setPeople] = useState(null); // null = loading
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    fetch("/api/people")
      .then((r) => r.json())
      .then((j) => setPeople(Array.isArray(j?.people) ? j.people : []))
      .catch(() => setPeople([]));
  }, []);

  const go = (r, seed) => {
    if (seed?.input) router.push(`/app/compose?seed=${encodeURIComponent(seed.input)}`);
    else router.push(`/app/${r}`);
  };

  const selected = selectedId && Array.isArray(people)
    ? people.find((p) => p.id === selectedId)
    : null;

  if (selected) {
    return (
      <PersonDetailV3
        key={selected.id}
        person={adaptPerson(selected)}
        go={go}
        onBack={() => setSelectedId(null)}
        onDeleted={(id) => {
          setPeople((prev) => (Array.isArray(prev) ? prev.filter((x) => x.id !== id) : prev));
          setSelectedId(null);
        }}
      />
    );
  }

  return <PeopleTable people={people} onOpen={(id) => setSelectedId(id)} />;
}
