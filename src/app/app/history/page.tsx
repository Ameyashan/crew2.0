// @ts-nocheck — repurposed run-history: "view all runs" + per-run detail (jugaadu reskin).
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PAPER_FONTS_V2 } from "@/components/paper/fonts";
import { TOKENS, RADII, SHADOWS } from "@/components/paper/tokens";
import {
  composeOutcomeChip,
  resumeRowChip,
  runDetailTitle,
  runDetailSubline,
  runOutcomeRows,
  runDownloadTiles,
  relativeWhen,
} from "@/components/paper/phase5-logic";
import { useIsMobile } from "@/lib/use-is-mobile";
import { hydrateRun } from "@/lib/runs-store";

type Filter = "all" | "compose" | "resume";

// Chip tone → token colors (shared by the feed rows and the detail view).
const TONE: Record<string, { color: string; bg: string }> = {
  done: { color: TOKENS.green, bg: TOKENS.greenBg },
  progress: { color: TOKENS.amber, bg: TOKENS.amberBg },
  attention: { color: TOKENS.amber, bg: TOKENS.amberBg },
  error: { color: TOKENS.red, bg: "#f6e9e6" },
};

function toneStyle(tone: string) {
  return TONE[tone] || TONE.done;
}

// Mono uppercase section label.
function MonoLabel({ children, color = TOKENS.muted, size = 10.5, style }) {
  return (
    <span
      style={{
        fontFamily: PAPER_FONTS_V2.mono,
        fontSize: size,
        fontWeight: 500,
        letterSpacing: ".12em",
        textTransform: "uppercase",
        color,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// Real résumé download (replicates the composer's util so the detail tiles work
// in place, without navigating away).
async function downloadResumeBlob(resume, fmt) {
  if (!resume) return;
  const dl = await fetch(`/api/resume/${fmt}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ resume }),
  });
  if (!dl.ok) throw new Error(`download failed: ${dl.status}`);
  const blob = await dl.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const base = (resume?.header?.full_name || "resume").replace(/[^\w.-]+/g, "_");
  const role = (resume?.meta?.target_role || "").replace(/[^\w.-]+/g, "_");
  a.download = [base, role || null].filter(Boolean).join("-").toLowerCase() + `.${fmt}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// The all-✓ step list shown on a completed run's detail.
function detailSteps(run: { kind?: string | null }) {
  if (run?.kind === "job") {
    return [
      "Read your input",
      "Resolved the opening",
      "Tailored your résumé",
      "Found the hiring manager",
      "Drafted your outreach",
    ];
  }
  return ["Read your input", "Verified the person", "Found contact details", "Drafted your outreach"];
}

function HistoryV3() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [composeRuns, setComposeRuns] = useState([]);
  const [resumeRuns, setResumeRuns] = useState([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  // The currently-open per-run detail (compose runs only). null = the list view.
  const [detail, setDetail] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [composeRes, resumeRes] = await Promise.all([
          fetch("/api/compose/history").then((r) => r.json()),
          fetch("/api/resume/history").then((r) => r.json()),
        ]);
        if (!alive) return;
        setComposeRuns(Array.isArray(composeRes?.runs) ? composeRes.runs : []);
        setResumeRuns(Array.isArray(resumeRes?.generations) ? resumeRes.generations : []);
      } catch (e) {
        if (alive) setError(String(e?.message || e));
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  const feed = useMemo(() => {
    const items: Array<{ key: string; agent: "compose" | "resume"; created_at: string; row: any }> = [];
    for (const r of composeRuns) {
      items.push({ key: `c:${r.id}`, agent: "compose", created_at: r.created_at, row: r });
    }
    for (const r of resumeRuns) {
      items.push({ key: `r:${r.id}`, agent: "resume", created_at: r.created_at, row: r });
    }
    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return items.filter((it) => filter === "all" || it.agent === filter);
  }, [composeRuns, resumeRuns, filter]);

  // Open a compose run's detail view in place (fetch full persisted run).
  async function openDetail(id: string) {
    setDetailLoading(id);
    setError(null);
    try {
      const res = await fetch(`/api/compose/history/${id}`);
      if (!res.ok) throw new Error(`load failed: ${res.status}`);
      const json = await res.json();
      if (!json?.run) throw new Error("run not found");
      setDetail(json.run);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setDetailLoading(null);
    }
  }

  // Send the run into the ephemeral store and jump to the composer, where the
  // full package card (regenerate / steer / Gmail) renders it.
  async function openInComposer(run: any) {
    setOpening(run.id);
    try {
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
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setOpening(null);
    }
  }

  function composeTitleRow(r: any): { eyebrow: string; title: string } {
    const t = runDetailTitle(r);
    return { eyebrow: t.company, title: t.title };
  }

  function resumeTitleRow(r: any): { eyebrow: string; title: string } {
    return {
      eyebrow: r.target_company || "—",
      title: r.target_role || (r.status === "in_flight" ? "Tailoring…" : "Tailored resume"),
    };
  }

  // ── Per-run detail view ────────────────────────────────────────────────────
  if (detail) {
    const { title, company } = runDetailTitle(detail);
    const rows = runOutcomeRows(detail);
    const tiles = runDownloadTiles(detail);
    const resume = detail?.output?.resume;
    return (
      <div
        className="scroll"
        style={{
          flex: 1,
          overflow: "auto",
          padding: isMobile ? "24px 16px 64px" : "40px 56px 80px",
          background: TOKENS.paper,
          color: TOKENS.ink,
        }}
      >
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <button
            onClick={() => setDetail(null)}
            style={{
              background: "transparent",
              border: "none",
              color: TOKENS.muted,
              fontFamily: PAPER_FONTS_V2.mono,
              fontSize: 12,
              letterSpacing: ".04em",
              cursor: "pointer",
              padding: 0,
              marginBottom: 22,
            }}
          >
            ← all runs
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <MonoLabel>{company}</MonoLabel>
            <span
              style={{
                padding: "3px 10px",
                borderRadius: RADII.pill,
                background: TOKENS.greenBg,
                color: TOKENS.green,
                fontFamily: PAPER_FONTS_V2.mono,
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: ".1em",
                textTransform: "uppercase",
              }}
            >
              Done
            </span>
          </div>
          <h1
            style={{
              margin: "6px 0 0",
              fontFamily: PAPER_FONTS_V2.serif,
              fontWeight: 400,
              fontSize: isMobile ? 26 : 30,
              lineHeight: 1.05,
              letterSpacing: "-.01em",
              color: TOKENS.ink,
            }}
          >
            {title}
          </h1>
          <div
            style={{
              marginTop: 8,
              fontFamily: PAPER_FONTS_V2.serif,
              fontStyle: "italic",
              fontSize: 15,
              color: TOKENS.muted,
            }}
          >
            {runDetailSubline(detail)}
          </div>

          {/* Steps — all done */}
          <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 10 }}>
            {detailSteps(detail).map((label, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: RADII.pill,
                    background: TOKENS.green,
                    color: TOKENS.paper,
                    display: "grid",
                    placeItems: "center",
                    fontSize: 11,
                    flexShrink: 0,
                  }}
                >
                  ✓
                </span>
                <span style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 14.5, color: TOKENS.ink }}>
                  {label}
                </span>
              </div>
            ))}
          </div>

          {/* WHAT CAME OF IT */}
          <div
            style={{
              marginTop: 28,
              background: TOKENS.card,
              border: `1px solid ${TOKENS.lineSoft}`,
              borderRadius: RADII.card,
              boxShadow: SHADOWS.card,
              padding: "20px 22px",
            }}
          >
            <MonoLabel>What came of it</MonoLabel>
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
              {rows.map((row, i) => {
                const ts = toneStyle(row.tone);
                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      justifyContent: "space-between",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 14, color: TOKENS.ink }}
                      >
                        {row.label}
                      </div>
                      <div
                        style={{
                          fontFamily: PAPER_FONTS_V2.mono,
                          fontSize: 11,
                          color: TOKENS.muted,
                          marginTop: 2,
                        }}
                      >
                        {row.detail}
                      </div>
                    </div>
                    <span
                      style={{
                        padding: "3px 10px",
                        borderRadius: RADII.pill,
                        background: ts.bg,
                        color: ts.color,
                        fontFamily: PAPER_FONTS_V2.mono,
                        fontSize: 10,
                        fontWeight: 500,
                        letterSpacing: ".08em",
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                      }}
                    >
                      ✓ done
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Download tiles */}
            {tiles.length > 0 && (
              <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
                {tiles.map((tile) => (
                  <button
                    key={tile.kind}
                    onClick={() => downloadResumeBlob(resume, tile.kind).catch(() => {})}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "10px 16px",
                      background: TOKENS.cardWarm,
                      border: `1px solid ${TOKENS.line}`,
                      borderRadius: RADII.panelTight,
                      color: TOKENS.ink,
                      fontFamily: PAPER_FONTS_V2.sans,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ fontFamily: PAPER_FONTS_V2.mono }}>↓</span> {tile.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginTop: 20 }}>
            <button
              onClick={() => openInComposer(detail)}
              disabled={opening === detail.id}
              style={{
                background: TOKENS.ink,
                color: TOKENS.paper,
                border: "none",
                borderRadius: RADII.button,
                padding: "10px 18px",
                fontFamily: PAPER_FONTS_V2.sans,
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {opening === detail.id ? "opening…" : "Open full run in composer →"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── List view — every run, everywhere ──────────────────────────────────────
  return (
    <div
      className="scroll"
      style={{
        flex: 1,
        overflow: "auto",
        padding: isMobile ? "24px 16px 64px" : "40px 56px 80px",
        background: TOKENS.paper,
        color: TOKENS.ink,
      }}
    >
      <div style={{ marginBottom: 20 }}>
        <MonoLabel>History · all your runs</MonoLabel>
        <h1
          style={{
            margin: "8px 0 0",
            fontFamily: PAPER_FONTS_V2.serif,
            fontWeight: 400,
            fontSize: isMobile ? 30 : 34,
            lineHeight: 1.05,
            letterSpacing: "-.01em",
            color: TOKENS.ink,
          }}
        >
          Every run, everywhere{" "}
          <span style={{ fontStyle: "italic", color: TOKENS.muted2 }}>you signed in.</span>
        </h1>
        <p
          style={{
            margin: "10px 0 0",
            fontFamily: PAPER_FONTS_V2.serif,
            fontStyle: "italic",
            fontSize: 15.5,
            lineHeight: 1.5,
            color: TOKENS.muted,
            maxWidth: 620,
          }}
        >
          Anything Jugaadu does — a tailored résumé, a screenshot the crew read, a person you reached
          out to — shows up here, on any device.
        </p>
      </div>

      {/* Filter chips */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <MonoLabel>Show:</MonoLabel>
        {(["all", "compose", "resume"] as Filter[]).map((k) => {
          const on = filter === k;
          return (
            <button
              key={k}
              onClick={() => setFilter(k)}
              style={{
                padding: "5px 14px",
                borderRadius: RADII.pill,
                cursor: "pointer",
                background: on ? TOKENS.ink : "transparent",
                color: on ? TOKENS.paper : TOKENS.ink,
                border: `1px solid ${on ? TOKENS.ink : TOKENS.line}`,
                fontFamily: PAPER_FONTS_V2.mono,
                fontSize: 11.5,
                letterSpacing: ".02em",
              }}
            >
              {k}
            </button>
          );
        })}
      </div>

      {error && (
        <div
          style={{
            marginTop: 16,
            padding: "10px 14px",
            background: TOKENS.card,
            border: `1px solid ${TOKENS.red}`,
            borderRadius: RADII.panelTight,
            color: TOKENS.red,
            fontFamily: PAPER_FONTS_V2.mono,
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
        {loading && (
          <div
            style={{
              padding: 24,
              textAlign: "center",
              fontFamily: PAPER_FONTS_V2.mono,
              fontSize: 12,
              color: TOKENS.muted,
            }}
          >
            reading the archive…
          </div>
        )}

        {!loading && feed.length === 0 && (
          <div
            style={{
              padding: "40px 24px",
              textAlign: "center",
              background: TOKENS.card,
              border: `1px solid ${TOKENS.lineSoft}`,
              borderRadius: RADII.card,
              boxShadow: SHADOWS.card,
            }}
          >
            <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 22, color: TOKENS.ink }}>
              No runs yet.
            </div>
            <div
              style={{
                marginTop: 8,
                fontFamily: PAPER_FONTS_V2.serif,
                fontStyle: "italic",
                fontSize: 14,
                color: TOKENS.muted,
              }}
            >
              Kick off something from the Desk and it&apos;ll land here — on every device you sign in
              on.
            </div>
          </div>
        )}

        {feed.map((it) => {
          const r = it.row;
          const meta = it.agent === "compose" ? composeTitleRow(r) : resumeTitleRow(r);
          const chip = it.agent === "compose" ? composeOutcomeChip(r.outcome) : resumeRowChip(r);
          const ts = toneStyle(chip.tone);
          const kindBadge =
            it.agent === "compose"
              ? r.kind === "job"
                ? "compose · job"
                : "compose · person"
              : "resume";

          return (
            <div
              key={it.key}
              style={{
                background: TOKENS.card,
                border: `1px solid ${TOKENS.lineSoft}`,
                borderRadius: RADII.card,
                boxShadow: SHADOWS.card,
                padding: "14px 18px",
                display: isMobile ? "flex" : "grid",
                gridTemplateColumns: "1fr auto auto auto",
                alignItems: "center",
                gap: 14,
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: 0, flex: isMobile ? "1 1 100%" : undefined }}>
                <MonoLabel size={10.5} style={{ letterSpacing: ".14em" }}>
                  {kindBadge} · {meta.eyebrow}
                </MonoLabel>
                <div
                  style={{
                    fontFamily: PAPER_FONTS_V2.serif,
                    fontSize: 19,
                    color: TOKENS.ink,
                    lineHeight: 1.15,
                    marginTop: 2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {meta.title}
                </div>
              </div>
              <span
                style={{
                  padding: "3px 10px",
                  borderRadius: RADII.pill,
                  background: ts.bg,
                  color: ts.color,
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
                {relativeWhen(it.created_at)}
              </span>
              {it.agent === "compose" ? (
                <button
                  onClick={() => openDetail(r.id)}
                  disabled={detailLoading === r.id}
                  style={{
                    background: "transparent",
                    color: TOKENS.ink,
                    border: `1px solid ${TOKENS.faint}`,
                    borderRadius: RADII.buttonTight,
                    padding: "7px 14px",
                    fontFamily: PAPER_FONTS_V2.sans,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  {detailLoading === r.id ? "opening…" : "View →"}
                </button>
              ) : (
                <button
                  onClick={() => router.push("/app/resume")}
                  style={{
                    background: "transparent",
                    color: TOKENS.ink,
                    border: `1px solid ${TOKENS.faint}`,
                    borderRadius: RADII.buttonTight,
                    padding: "7px 14px",
                    fontFamily: PAPER_FONTS_V2.sans,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Open →
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function HistoryPage() {
  return <HistoryV3 />;
}
