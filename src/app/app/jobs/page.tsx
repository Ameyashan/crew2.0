"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PAPER_FONTS_V2 } from "@/components/paper/fonts";
import { TOKENS, RADII } from "@/components/paper/tokens";
import { CompanyLogo } from "@/components/paper/CompanyLogo";
import { TrackerSetup, type SetupStep } from "@/components/jobs/TrackerSetup";
import { useIsMobile } from "@/lib/use-is-mobile";
import { postedAgo, compDisplay } from "@/lib/jobs/format";
import type { TrackerDTO, TrackerJob } from "@/lib/jobs/types";

// Jobs = a company tracker. The user names up to 15 companies; we keep their
// boards fresh and list the open roles whose titles fit, with anything first
// seen in the last 24h on top. No LLM on this page — the AI-ranked feed lives
// at /app/jobs/recommended and scores only on request.

function QuietPill({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontFamily: "system-ui, sans-serif",
        fontSize: 12,
        lineHeight: 1,
        color: TOKENS.muted2,
        background: "transparent",
        border: `1px solid ${TOKENS.line}`,
        borderRadius: RADII.button,
        padding: "9px 14px",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

function SectionLabel({ children, color, aside }: { children: ReactNode; color: string; aside?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "0 0 10px", flexWrap: "wrap" }}>
      <span
        style={{
          fontFamily: PAPER_FONTS_V2.mono,
          fontSize: 10.5,
          letterSpacing: ".1em",
          textTransform: "uppercase",
          color,
        }}
      >
        {children}
      </span>
      {aside && <span style={{ fontFamily: "system-ui, sans-serif", fontSize: 12, color: TOKENS.muted }}>{aside}</span>}
    </div>
  );
}

function JobRow({ job, first, onOpen }: { job: TrackerJob; first: boolean; onOpen: () => void }) {
  const [hover, setHover] = useState(false);
  const seen = postedAgo(job.first_seen_at, false);
  const comp = compDisplay(job.compensation);
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
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "11px 10px",
        borderTop: first ? "none" : `1px solid ${TOKENS.lineRow}`,
        borderRadius: RADII.buttonTight,
        background: hover ? TOKENS.hoverWash : "transparent",
        cursor: "pointer",
      }}
    >
      <CompanyLogo company={job.company} size={32} />
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
          {job.title}
        </div>
        <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 12, lineHeight: 1.5, color: TOKENS.muted }}>
          {job.company}
          {job.location ? ` · ${job.location}` : ""}
          {comp.listed && <span style={{ color: TOKENS.green }}>{` · ${comp.label}`}</span>}
          {seen ? ` · seen ${seen}` : ""}
        </div>
      </div>
      {job.is_new && (
        <span
          style={{
            fontFamily: PAPER_FONTS_V2.mono,
            fontWeight: 500,
            fontSize: 9.5,
            letterSpacing: ".08em",
            color: TOKENS.green,
            background: TOKENS.greenBg,
            borderRadius: 4,
            padding: "4px 7px",
            flex: "none",
          }}
        >
          NEW
        </span>
      )}
    </div>
  );
}

function JobList({ jobs, onOpen }: { jobs: TrackerJob[]; onOpen: (id: string) => void }) {
  return (
    <div
      style={{
        background: TOKENS.card,
        border: `1px solid ${TOKENS.lineSoft}`,
        borderRadius: RADII.card,
        padding: "6px 8px",
      }}
    >
      {jobs.map((j, i) => (
        <JobRow key={j.job_id} job={j} first={i === 0} onOpen={() => onOpen(j.job_id)} />
      ))}
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

function rolesPhrase(terms: string[]): string {
  if (!terms.length) return "every role";
  const cap = (t: string) => t.replace(/\b[a-z]/g, (c) => c.toUpperCase());
  const named = terms.slice(0, 3).map(cap);
  return terms.length > 3 ? `${named.join(", ")} and more` : named.join(" / ");
}

export default function JobsTrackerPage() {
  const isMobile = useIsMobile();
  const router = useRouter();
  const [tracker, setTracker] = useState<TrackerDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  // null = showing the tracker; a step = showing setup at that step.
  const [editing, setEditing] = useState<SetupStep | null>(null);
  const [companyFilter, setCompanyFilter] = useState<string | null>(null);

  const load = useCallback(
    () =>
      fetch("/api/jobs/tracker")
        .then((r) => r.json())
        .then((j) => {
          if (j?.error) setError(j.error);
          else {
            setError(null);
            setTracker(j as TrackerDTO);
          }
        })
        .catch((e) => setError(String(e?.message || e))),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const companies = useMemo(() => tracker?.companies ?? [], [tracker]);
  const firstRun = tracker !== null && companies.length === 0;
  const setupStep: SetupStep | null = editing ?? (firstRun ? 0 : null);

  const visibleNew = useMemo(
    () => (tracker?.new_jobs ?? []).filter((j) => !companyFilter || j.company_id === companyFilter),
    [tracker, companyFilter],
  );
  const visibleOpen = useMemo(
    () => (tracker?.open_jobs ?? []).filter((j) => !companyFilter || j.company_id === companyFilter),
    [tracker, companyFilter],
  );
  const pending = companies.filter((c) => !c.last_checked_at).length;
  const open = (id: string) => router.push(`/app/jobs/${id}`);

  return (
    <div
      className="scroll"
      style={{
        flex: 1,
        overflow: "auto",
        maxWidth: 920,
        width: "100%",
        margin: "0 auto",
        boxSizing: "border-box",
        padding: isMobile ? "28px 18px 60px" : "44px 44px 60px",
        background: TOKENS.paper,
      }}
    >
      {error ? (
        <div
          style={{
            background: TOKENS.card,
            border: `1px solid ${TOKENS.lineSoft}`,
            borderRadius: RADII.card,
            padding: "20px 22px",
          }}
        >
          <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 20, color: TOKENS.ink }}>
            Couldn&apos;t load your tracker
          </div>
          <p style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 12, color: TOKENS.red, marginTop: 6 }}>{error}</p>
        </div>
      ) : tracker === null ? (
        <p style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 13, color: TOKENS.muted }}>Loading…</p>
      ) : setupStep !== null ? (
        <TrackerSetup
          // Remount per entry point so each "Edit" opens fresh at its step.
          key={`${setupStep}-${firstRun}`}
          initialStep={setupStep}
          tracked={companies}
          firstRun={firstRun}
          onDone={() => {
            setEditing(null);
            setCompanyFilter(null);
            void load();
          }}
        />
      ) : (
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
              Your company tracker
            </div>
            <div style={{ display: "flex", gap: 8, flex: "none", flexWrap: "wrap" }}>
              <QuietPill onClick={() => setEditing(2)}>Edit companies</QuietPill>
              <QuietPill onClick={() => setEditing(1)}>Roles &amp; location</QuietPill>
              <QuietPill onClick={() => router.push("/app/jobs/recommended")}>Recommended ✦</QuietPill>
            </div>
          </div>

          <div
            style={{
              fontFamily: "system-ui, sans-serif",
              fontSize: 14,
              lineHeight: 1.7,
              color: TOKENS.muted,
              maxWidth: 620,
              marginBottom: 20,
            }}
          >
            Watching {companies.length} {companies.length === 1 ? "company" : "companies"} for{" "}
            <em style={{ color: TOKENS.inkSoft }}>{rolesPhrase(tracker.role_terms)}</em>. We check their boards every
            few hours.
            {pending > 0 && ` First check for ${pending} new ${pending === 1 ? "company" : "companies"} lands within ~15 minutes.`}
          </div>

          {/* Company chips double as a filter. */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 26 }}>
            {companies.map((c) => {
              const active = companyFilter === c.company_id;
              return (
                <button
                  key={c.company_id}
                  type="button"
                  onClick={() => setCompanyFilter(active ? null : c.company_id)}
                  title={c.badges[0] ?? undefined}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    fontFamily: PAPER_FONTS_V2.mono,
                    fontSize: 11.5,
                    color: active ? TOKENS.paper : TOKENS.inkSoft,
                    background: active ? TOKENS.ink : TOKENS.card,
                    border: `1px solid ${active ? TOKENS.ink : TOKENS.line}`,
                    borderRadius: RADII.pill,
                    padding: "6px 11px",
                    cursor: "pointer",
                  }}
                >
                  {c.name}
                  <span style={{ color: active ? TOKENS.paper : c.new_count ? TOKENS.green : TOKENS.faint }}>
                    {c.new_count ? `+${c.new_count}` : c.last_checked_at ? c.open_count : "…"}
                  </span>
                </button>
              );
            })}
          </div>

          <SectionLabel
            color={TOKENS.green}
            aside={visibleNew.length ? `${visibleNew.length} role${visibleNew.length === 1 ? "" : "s"}` : undefined}
          >
            New in the last 24 hours
          </SectionLabel>
          {visibleNew.length ? (
            <JobList jobs={visibleNew} onOpen={open} />
          ) : (
            <QuietNote>
              Nothing new in the last 24 hours{companyFilter ? " here" : " at your companies"}.
              {visibleOpen.length ? " Here's what's open right now." : ""}
            </QuietNote>
          )}

          <div style={{ height: 28 }} />

          <SectionLabel color={TOKENS.muted2} aside={visibleOpen.length ? `${visibleOpen.length} open` : undefined}>
            Open now
          </SectionLabel>
          {visibleOpen.length ? (
            <JobList jobs={visibleOpen} onOpen={open} />
          ) : (
            <QuietNote>
              No other open {rolesPhrase(tracker.role_terms)} roles
              {companyFilter ? " here" : " at your companies"} right now. Add a role title or a few more companies to
              widen the net.
            </QuietNote>
          )}

          <div
            style={{
              fontFamily: "system-ui, sans-serif",
              fontSize: 12,
              lineHeight: 1.6,
              color: TOKENS.faint,
              marginTop: 22,
              textAlign: "center",
            }}
          >
            Tracking {companies.length} of {tracker.limit} · “new” means we first saw it on their board in the last 24
            hours
          </div>
        </>
      )}
    </div>
  );
}
