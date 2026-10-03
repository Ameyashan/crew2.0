"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PAPER_FONTS_V2 } from "@/components/paper/fonts";
import { TOKENS, RADII } from "@/components/paper/tokens";
import { CompanyLogo } from "@/components/paper/CompanyLogo";
import { relativeWhen } from "@/components/paper/phase5-logic";
import { JobCard } from "@/components/jobs/JobCard";
import { useJobFeed } from "@/components/jobs/use-job-feed";
import { hydrateRun, setFocusedRun, type PersistedComposeRun } from "@/lib/runs-store";
import { STAGE_LABEL, applicationsSummary, type ApplicationItem } from "@/lib/jobs/applications-logic";
import type { ActiveGoalDTO } from "@/components/goal/use-active-goal";

// The Jobs tab once a goal is locked: just two sections — the applications
// the crew has built, and opportunities ranked against the goal (the same
// scored feed as /app/jobs/recommended). The company tracker steps aside.

function QuietPill({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: "system-ui, sans-serif",
        fontSize: 12,
        lineHeight: 1,
        color: TOKENS.muted2,
        background: "transparent",
        border: `1px solid ${TOKENS.line}`,
        borderRadius: RADII.button,
        padding: "9px 14px",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : 1,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

function SectionLabel({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "0 0 10px", flexWrap: "wrap" }}>
      <span
        style={{
          fontFamily: PAPER_FONTS_V2.mono,
          fontSize: 10.5,
          letterSpacing: ".1em",
          textTransform: "uppercase",
          color: TOKENS.muted2,
        }}
      >
        {children}
      </span>
      {aside && <span style={{ fontFamily: "system-ui, sans-serif", fontSize: 12, color: TOKENS.muted }}>{aside}</span>}
    </div>
  );
}

function QuietNote({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: PAPER_FONTS_V2.serif,
        fontStyle: "italic",
        fontSize: 14.5,
        lineHeight: 1.5,
        color: TOKENS.muted2,
        border: `1px dashed ${TOKENS.dashed}`,
        borderRadius: RADII.card,
        padding: "16px 18px",
      }}
    >
      {children}
    </div>
  );
}

function StageChip({ stage }: { stage: ApplicationItem["stage"] }) {
  const done = stage !== "drafted";
  return (
    <span
      style={{
        fontFamily: PAPER_FONTS_V2.mono,
        fontWeight: 500,
        fontSize: 9.5,
        letterSpacing: ".08em",
        textTransform: "uppercase",
        color: done ? TOKENS.green : TOKENS.amber,
        background: done ? TOKENS.greenBg : TOKENS.amberBg,
        borderRadius: 4,
        padding: "4px 7px",
        whiteSpace: "nowrap",
        flex: "none",
      }}
    >
      {STAGE_LABEL[stage]}
    </span>
  );
}

function ApplicationRowView({
  app,
  first,
  opening,
  onOpen,
}: {
  app: ApplicationItem;
  first: boolean;
  opening: boolean;
  onOpen: (() => void) | null;
}) {
  const [hover, setHover] = useState(false);
  const when =
    app.stage === "drafted" || !app.submitted_at
      ? `prepared ${relativeWhen(app.created_at)}`
      : `submitted ${relativeWhen(app.submitted_at)}`;
  const details = [
    app.company,
    when,
    app.contact ? `contact: ${app.contact}` : null,
    app.questions ? `${app.answers} of ${app.questions} questions answered` : null,
  ].filter(Boolean);
  const clickable = !!onOpen && !opening;
  return (
    <div
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={clickable ? onOpen! : undefined}
      onKeyDown={(e) => {
        if (clickable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpen!();
        }
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={onOpen ? "Open the résumé, contact and draft the crew built" : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "11px 10px",
        borderTop: first ? "none" : `1px solid ${TOKENS.lineRow}`,
        borderRadius: RADII.buttonTight,
        background: hover && onOpen ? TOKENS.hoverWash : "transparent",
        cursor: clickable ? "pointer" : "default",
        opacity: opening ? 0.6 : 1,
      }}
    >
      <CompanyLogo company={app.company ?? app.role} size={32} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: PAPER_FONTS_V2.serif,
            fontSize: 16,
            lineHeight: 1.3,
            color: TOKENS.ink,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {opening ? "Opening…" : app.role}
        </div>
        <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 12, lineHeight: 1.5, color: TOKENS.muted }}>
          {details.join(" · ")}
          {app.job_url && (
            <>
              {" · "}
              <a
                href={app.job_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{ color: TOKENS.inkSoft, textDecoration: "none" }}
              >
                posting ↗
              </a>
            </>
          )}
        </div>
      </div>
      <StageChip stage={app.stage} />
    </div>
  );
}

export function GoalJobsView({ goal, isMobile }: { goal: ActiveGoalDTO; isMobile: boolean }) {
  const router = useRouter();
  const [apps, setApps] = useState<ApplicationItem[] | null>(null);
  const [appsError, setAppsError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const { jobs, total, belowBar, error, followedIds, onToggleFollow, refreshing, note, refresh, reranking } =
    useJobFeed(goal.finalized_at);
  const label = goal.goal.short_label;

  useEffect(() => {
    let alive = true;
    fetch("/api/jobs/applications")
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j?.error) setAppsError(j.error);
        else setApps(Array.isArray(j?.applications) ? j.applications : []);
      })
      .catch((e) => alive && setAppsError(String(e?.message || e)));
    return () => {
      alive = false;
    };
  }, []);

  // Rebuild the application's package (résumé, contact, draft) in the
  // composer from its persisted run — the same hand-off History uses.
  async function openPackage(runId: string) {
    setOpening(runId);
    try {
      const res = await fetch(`/api/compose/history/${runId}`);
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.run) throw new Error(`load failed: ${res.status}`);
      setFocusedRun(hydrateRun(j.run as PersistedComposeRun));
      router.push("/app/compose");
    } catch (e) {
      setAppsError(String((e as Error)?.message || e));
      setOpening(null);
    }
  }

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 8,
        }}
      >
        <div
          style={{
            fontFamily: PAPER_FONTS_V2.serif,
            fontWeight: 400,
            fontSize: 30,
            lineHeight: 1.25,
            letterSpacing: "-.01em",
            color: TOKENS.ink,
          }}
        >
          Your job search
        </div>
        <div style={{ display: "flex", gap: 8, flex: "none", flexWrap: "wrap" }}>
          <QuietPill onClick={refresh} disabled={refreshing}>
            {refreshing ? "Scoring…" : "Refresh"}
          </QuietPill>
          <QuietPill onClick={() => router.push("/app/goal")}>Edit goal</QuietPill>
        </div>
      </div>

      <div
        style={{
          fontFamily: "system-ui, sans-serif",
          fontSize: 14,
          lineHeight: 1.7,
          color: TOKENS.muted,
          maxWidth: 620,
          marginBottom: 26,
        }}
      >
        Working toward <em style={{ color: TOKENS.inkSoft }}>{label}</em>. Your applications, then the roles the crew
        ranked against that goal.
      </div>

      <SectionLabel aside={apps ? applicationsSummary(apps) : undefined}>Applications</SectionLabel>
      {appsError ? (
        <p style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 12, color: TOKENS.red, margin: "0 0 8px" }}>
          {appsError}
        </p>
      ) : null}
      {apps === null ? (
        !appsError && <p style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 13, color: TOKENS.muted }}>Loading…</p>
      ) : apps.length ? (
        <div
          style={{
            background: TOKENS.card,
            border: `1px solid ${TOKENS.lineSoft}`,
            borderRadius: RADII.card,
            padding: "6px 8px",
          }}
        >
          {apps.map((a, i) => (
            <ApplicationRowView
              key={a.id}
              app={a}
              first={i === 0}
              opening={!!a.run_id && opening === a.run_id}
              onOpen={a.run_id ? () => void openPackage(a.run_id!) : null}
            />
          ))}
        </div>
      ) : (
        <QuietNote>
          No applications yet. Open a role below and run the crew — it tailors your résumé and finds who to reach, and
          the application lands here.
        </QuietNote>
      )}

      <div style={{ height: 32 }} />

      <SectionLabel aside={total ? `${total} role${total === 1 ? "" : "s"} for your goal` : undefined}>
        Opportunities
      </SectionLabel>

      {note && (
        <div
          style={{
            fontFamily: PAPER_FONTS_V2.mono,
            fontSize: 12,
            color: TOKENS.ink,
            border: `1px solid ${TOKENS.amberLine}`,
            background: TOKENS.amberWash,
            borderRadius: RADII.panelTight,
            padding: "8px 12px",
            marginBottom: 12,
          }}
        >
          {note}
        </div>
      )}
      {belowBar && total > 0 && (
        <div
          style={{
            fontFamily: PAPER_FONTS_V2.serif,
            fontStyle: "italic",
            fontSize: 13.5,
            lineHeight: 1.5,
            color: TOKENS.muted2,
            border: `1px solid ${TOKENS.lineSoft}`,
            background: TOKENS.cardWarm,
            borderRadius: RADII.panelTight,
            padding: "10px 14px",
            marginBottom: 12,
          }}
        >
          Few roles clear the bar for this goal right now, so the closest matches are below too.
        </div>
      )}

      {error ? (
        <p style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 12, color: TOKENS.red }}>{error}</p>
      ) : jobs === null ? (
        <p style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 13, color: TOKENS.muted }}>Loading…</p>
      ) : total === 0 ? (
        <QuietNote>
          {refreshing
            ? "Scoring roles against your goal — this can take a minute or two…"
            : reranking
              ? `Re-ranking roles for “${label}”. They'll show up here on their own.`
              : "No roles ranked for this goal yet. Press Refresh and the crew will score what's open."}
        </QuietNote>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {jobs.map((item) => (
            <JobCard
              key={item.match_id || item.job_id}
              item={item}
              isMobile={isMobile}
              onOpen={() => router.push(`/app/jobs/${item.job_id}`)}
              following={!!item.company_id && followedIds.has(item.company_id)}
              onToggleFollow={onToggleFollow}
            />
          ))}
        </div>
      )}
    </>
  );
}
