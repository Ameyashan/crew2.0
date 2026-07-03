// @ts-nocheck — matches the loose-any style used across the rest of /app pages.
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PAPER_FONTS } from "@/components/paper/fonts";
import { usePaperTheme } from "@/components/paper/use-paper-theme";
import {
  Eyebrow,
  InkButton,
  PageHead,
  PaperEmpty,
  Stamp,
} from "@/components/paper/primitives";
import { useIsMobile } from "@/lib/use-is-mobile";
import { hydrateRun } from "@/lib/runs-store";

type Filter = "all" | "compose" | "resume";

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "1d ago";
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function HistoryV3({ p }) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [composeRuns, setComposeRuns] = useState([]);
  const [resumeRuns, setResumeRuns] = useState([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

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
        setResumeRuns(
          Array.isArray(resumeRes?.generations) ? resumeRes.generations : []
        );
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

  // Merge into a single feed sorted by created_at desc. Each entry keeps the
  // agent of origin so the row renders the right title + actions.
  const feed = useMemo(() => {
    const items: Array<{
      key: string;
      agent: "compose" | "resume";
      created_at: string;
      row: any;
    }> = [];
    for (const r of composeRuns) {
      items.push({ key: `c:${r.id}`, agent: "compose", created_at: r.created_at, row: r });
    }
    for (const r of resumeRuns) {
      items.push({ key: `r:${r.id}`, agent: "resume", created_at: r.created_at, row: r });
    }
    items.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return items.filter((it) => filter === "all" || it.agent === filter);
  }, [composeRuns, resumeRuns, filter]);

  async function openCompose(id: string) {
    setOpening(id);
    try {
      const res = await fetch(`/api/compose/history/${id}`);
      if (!res.ok) throw new Error(`load failed: ${res.status}`);
      const json = await res.json();
      const run = json?.run;
      if (!run) throw new Error("run not found");
      // Hydrate the ephemeral store with this persisted run, then send the user
      // to /app/compose where the existing PackageV3 card renders it and the
      // regenerate/steer/Gmail buttons keep working.
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

  function composeTitle(r: any): { eyebrow: string; title: string } {
    const person = r.person; // joined people row (may be null)
    if (r.kind === "job") {
      const parsed = r.output?.parsed;
      const role = parsed?.target_role || parsed?.role || "Job application";
      const company =
        parsed?.target_company || parsed?.company || personHost(r.input);
      return { eyebrow: company || "Job", title: role };
    }
    const name = person?.name || r.output?.person?.name || r.input;
    const company = person?.company || r.output?.person?.company || "";
    return { eyebrow: company || "Person", title: name };
  }

  function resumeTitle(r: any): { eyebrow: string; title: string } {
    return {
      eyebrow: r.target_company || "—",
      title:
        r.target_role ||
        (r.status === "in_flight" ? "Tailoring…" : "Tailored resume"),
    };
  }

  function outcomeChip(outcome: string | null | undefined): {
    label: string;
    color: string;
  } {
    if (outcome === "complete") return { label: "ready", color: p.leaf };
    if (outcome === "in_flight") return { label: "in progress…", color: p.stamp };
    if (outcome === "needs_disambiguation")
      return { label: "needs pick", color: p.marigoldDeep };
    return { label: "error", color: p.stamp };
  }

  return (
    <div
      className="scroll"
      style={{
        flex: 1,
        overflow: "auto",
        padding: isMobile ? "24px 16px 64px" : "40px 56px 80px",
        background: p.paper,
        color: p.ink,
      }}
    >
      <PageHead
        p={p}
        eyebrow="History · all your runs"
        title="Every run, everywhere "
        italic="you signed in."
        sub="Anything Jugaadu does — a tailored résumé, a screenshot the crew read, a person you reached out to — shows up here, on any device."
      />

      {/* Filter chips */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
        <span
          style={{
            fontFamily: PAPER_FONTS.mono,
            fontSize: 10.5,
            letterSpacing: ".16em",
            color: p.inkMute,
            textTransform: "uppercase",
          }}
        >
          Show:
        </span>
        {(["all", "compose", "resume"] as Filter[]).map((k) => {
          const on = filter === k;
          return (
            <button
              key={k}
              onClick={() => setFilter(k)}
              style={{
                padding: "5px 14px",
                borderRadius: 999,
                cursor: "pointer",
                background: on ? p.ink : "transparent",
                color: on ? p.paper : p.ink,
                border: `1.5px solid ${on ? p.ink : p.ink + "30"}`,
                fontFamily: PAPER_FONTS.mono,
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
            background: p.card,
            border: `1.5px solid ${p.stamp}`,
            color: p.stamp,
            fontFamily: PAPER_FONTS.mono,
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
              fontFamily: PAPER_FONTS.mono,
              fontSize: 12,
              color: p.inkMute,
            }}
          >
            reading the archive…
          </div>
        )}

        {!loading && feed.length === 0 && (
          <PaperEmpty
            p={p}
            hindi="अभी कुछ नहीं"
            title="No runs yet."
            sub="Kick off something from Compose or Resume and it'll land here — on every device you sign in on."
          />
        )}

        {feed.map((it) => {
          const r = it.row;
          const meta =
            it.agent === "compose" ? composeTitle(r) : resumeTitle(r);
          const chip =
            it.agent === "compose"
              ? outcomeChip(r.outcome)
              : r.status === "in_flight"
                ? { label: "in progress…", color: p.stamp }
                : r.status === "error"
                  ? { label: "error", color: p.stamp }
                  : { label: r.ats_score != null ? `ATS ${r.ats_score}` : "tailored", color: p.leaf };
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
                background: p.card,
                border: `1.5px solid ${p.ink}30`,
                padding: "14px 18px",
                display: isMobile ? "flex" : "grid",
                gridTemplateColumns: "1fr auto auto auto",
                alignItems: "center",
                gap: 14,
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: 0, flex: isMobile ? "1 1 100%" : undefined }}>
                <div
                  style={{
                    fontFamily: PAPER_FONTS.mono,
                    fontSize: 10.5,
                    letterSpacing: ".14em",
                    textTransform: "uppercase",
                    color: p.inkMute,
                  }}
                >
                  {kindBadge} · {meta.eyebrow}
                </div>
                <div
                  style={{
                    fontFamily: PAPER_FONTS.display,
                    fontSize: 19,
                    color: p.ink,
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
                  background: chip.color + "14",
                  color: chip.color,
                  fontFamily: PAPER_FONTS.mono,
                  fontSize: 11,
                  letterSpacing: ".04em",
                  whiteSpace: "nowrap",
                }}
              >
                {chip.label}
              </span>
              <span
                style={{
                  fontFamily: PAPER_FONTS.mono,
                  fontSize: 11,
                  color: p.inkMute,
                  letterSpacing: ".04em",
                  whiteSpace: "nowrap",
                }}
              >
                {fmtWhen(it.created_at)}
              </span>
              {it.agent === "compose" ? (
                <InkButton
                  p={p}
                  kind="outline"
                  size="sm"
                  onClick={() => openCompose(r.id)}
                  disabled={opening === r.id}
                >
                  {opening === r.id ? "opening…" : "Open →"}
                </InkButton>
              ) : (
                <InkButton
                  p={p}
                  kind="outline"
                  size="sm"
                  onClick={() => router.push("/app/resume")}
                >
                  Open →
                </InkButton>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function personHost(s: string | null | undefined): string {
  const t = (s || "").trim();
  if (!t) return "";
  try {
    return new URL(t.match(/^https?:\/\//) ? t : `https://${t}`).hostname.replace(
      /^www\./,
      ""
    );
  } catch {
    return t;
  }
}

export default function HistoryPage() {
  const { p } = usePaperTheme();
  return <HistoryV3 p={p} />;
}
