"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PAPER_FONTS_V2 } from "@/components/paper/fonts";
import { TOKENS, RADII } from "@/components/paper/tokens";
import { useIsMobile } from "@/lib/use-is-mobile";
import { startRun } from "@/lib/runs-store";
import { CompanyLogo } from "@/components/paper/CompanyLogo";
import { FollowButton } from "@/components/paper/FollowButton";
import {
  postedAgo,
  compDisplay,
  fitColors,
  visaChipLabel,
  visaChipColors,
  whyBullets,
  sourceHost,
} from "@/lib/jobs/format";
import type { JobDetail } from "@/lib/jobs/types";

export default function JobDetailPage() {
  const isMobile = useIsMobile();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [job, setJob] = useState<JobDetail | null>(null);
  const [following, setFollowing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [backHover, setBackHover] = useState(false);
  const [dismissHover, setDismissHover] = useState(false);
  const [applyHover, setApplyHover] = useState(false);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    fetch(`/api/jobs/${id}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j.error) setError(j.error);
        else {
          setJob(j.job);
          setFollowing(j.following === true);
        }
      })
      .catch((e) => alive && setError(String(e?.message || e)));
    return () => {
      alive = false;
    };
  }, [id]);

  async function runOutreach() {
    if (!job || busy) return;
    setBusy(true);
    try {
      // Mark the match, then hand off to the EXISTING Compose pipeline.
      const res = await fetch(`/api/jobs/${job.job_id}/outreach`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      const jobUrl = (j?.job_url as string) || job.url;
      startRun(jobUrl, { kind: "job" });
      router.push("/app/compose");
    } catch (e) {
      setError(String((e as Error)?.message || e));
      setBusy(false);
    }
  }

  async function dismiss() {
    if (!job || busy) return;
    setBusy(true);
    try {
      await fetch(`/api/jobs/${job.job_id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "dismissed" }),
      });
      router.push("/app/jobs");
    } catch {
      setBusy(false);
    }
  }

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
      <span
        role="button"
        tabIndex={0}
        onClick={() => router.push("/app/jobs")}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            router.push("/app/jobs");
          }
        }}
        onMouseEnter={() => setBackHover(true)}
        onMouseLeave={() => setBackHover(false)}
        style={{
          display: "inline-block",
          fontFamily: "system-ui, sans-serif",
          fontSize: 13,
          lineHeight: 1,
          color: backHover ? TOKENS.ink : TOKENS.muted,
          cursor: "pointer",
          marginBottom: 22,
        }}
      >
        ← All jobs
      </span>

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
            Couldn&apos;t load this job
          </div>
          <p style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 12, color: TOKENS.red, marginTop: 6 }}>{error}</p>
        </div>
      ) : !job ? (
        <p style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 13, color: TOKENS.muted }}>Loading…</p>
      ) : (
        (() => {
          const posted = postedAgo(job.posted_date, job.posted_date_approx);
          const comp = compDisplay(job.compensation);
          const fit = fitColors(job.score);
          const visaColors = visaChipColors(job.visa_confidence);
          const bullets = whyBullets(job.reasons);

          // The two actions, rendered near the top (header) so they're usable
          // without scrolling past the JD, and again inside the sticky rail on
          // desktop so they stay in reach while reading.
          const actions = (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <span
                role="button"
                tabIndex={0}
                aria-disabled={busy}
                onClick={runOutreach}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    runOutreach();
                  }
                }}
                onMouseEnter={() => setApplyHover(true)}
                onMouseLeave={() => setApplyHover(false)}
                style={{
                  fontFamily: "system-ui, sans-serif",
                  fontWeight: 500,
                  fontSize: 13,
                  lineHeight: 1,
                  color: TOKENS.paper,
                  background: applyHover ? TOKENS.inkSoft : TOKENS.ink,
                  borderRadius: RADII.button,
                  padding: "13px 20px",
                  cursor: busy ? "default" : "pointer",
                  opacity: busy ? 0.6 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                {busy ? "Starting…" : "Interested — run the crew →"}
              </span>
              <span
                role="button"
                tabIndex={0}
                aria-disabled={busy}
                onClick={dismiss}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    dismiss();
                  }
                }}
                onMouseEnter={() => setDismissHover(true)}
                onMouseLeave={() => setDismissHover(false)}
                style={{
                  fontFamily: "system-ui, sans-serif",
                  fontWeight: 500,
                  fontSize: 13,
                  lineHeight: 1,
                  color: dismissHover ? TOKENS.red : TOKENS.muted2,
                  border: `1px solid ${dismissHover ? "#d9b8ae" : TOKENS.line}`,
                  borderRadius: RADII.button,
                  padding: "12px 16px",
                  cursor: busy ? "default" : "pointer",
                  opacity: busy ? 0.6 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                Not for me
              </span>
            </div>
          );

          const whyCard = (
            <div
              style={{
                background: TOKENS.cardWarm,
                border: `1px solid ${TOKENS.amberLine}`,
                borderRadius: RADII.card,
                padding: "20px 22px",
              }}
            >
              <div
                style={{
                  fontFamily: PAPER_FONTS_V2.mono,
                  fontWeight: 500,
                  fontSize: 10,
                  lineHeight: 1,
                  letterSpacing: ".08em",
                  color: TOKENS.amber,
                  marginBottom: 12,
                }}
              >
                WHY IT MATTERS TO YOU
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  fontFamily: "system-ui, sans-serif",
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: TOKENS.inkSoft,
                }}
              >
                {bullets.length > 0 ? (
                  bullets.map((w, i) => (
                    <div key={i} style={{ display: "flex", gap: 9 }}>
                      <span style={{ color: TOKENS.amber, flex: "none" }}>→</span>
                      <span>{w}</span>
                    </div>
                  ))
                ) : (
                  <div style={{ display: "flex", gap: 9 }}>
                    <span style={{ color: TOKENS.amber, flex: "none" }}>→</span>
                    <span>Ranked into your feed by fit against your Story and stated interests.</span>
                  </div>
                )}
              </div>
            </div>
          );

          const crewPitch = (
            <p
              style={{
                margin: 0,
                fontFamily: PAPER_FONTS_V2.serif,
                fontStyle: "italic",
                fontSize: 13.5,
                lineHeight: 1.55,
                color: TOKENS.muted,
              }}
            >
              Interested? The crew runs the full apply: resume woven from your Story, likely hiring manager found,
              outreach drafted for every channel.
            </p>
          );

          const jdCard = (
            <div
              style={{
                background: TOKENS.card,
                border: `1px solid ${TOKENS.lineSoft}`,
                borderRadius: RADII.card,
                padding: "20px 22px",
              }}
            >
              <div
                style={{
                  fontFamily: PAPER_FONTS_V2.mono,
                  fontWeight: 500,
                  fontSize: 10,
                  lineHeight: 1,
                  letterSpacing: ".08em",
                  color: TOKENS.faint,
                  marginBottom: 12,
                }}
              >
                WHAT THE ROLE IS
              </div>
              <div
                style={{
                  fontFamily: "system-ui, sans-serif",
                  fontSize: 13.5,
                  lineHeight: 1.7,
                  color: TOKENS.inkSoft,
                  whiteSpace: "pre-wrap",
                }}
              >
                {job.description ||
                  "No description available from the source board. Open the original posting for the full details."}
              </div>
            </div>
          );

          return (
            <>
              {/* Header */}
              <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 6 }}>
                <CompanyLogo company={job.company} size={isMobile ? 40 : 48} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                    <span
                      style={{
                        fontFamily: PAPER_FONTS_V2.mono,
                        fontWeight: 500,
                        fontSize: 11,
                        lineHeight: 1,
                        letterSpacing: ".1em",
                        color: TOKENS.muted,
                      }}
                    >
                      {job.company}
                    </span>
                    {posted && (
                      <span
                        style={{ fontFamily: "system-ui, sans-serif", fontSize: 11, lineHeight: 1, color: TOKENS.faint }}
                      >
                        posted {posted}
                      </span>
                    )}
                    <span
                      style={{
                        fontFamily: PAPER_FONTS_V2.mono,
                        fontWeight: 500,
                        fontSize: 10,
                        lineHeight: 1,
                        color: visaColors.color,
                        background: visaColors.bg,
                        borderRadius: 4,
                        padding: "5px 8px",
                      }}
                    >
                      {visaChipLabel(job.visa_confidence)}
                    </span>
                    <div style={{ marginLeft: "auto", flex: "none" }}>
                      <FollowButton
                        companyId={job.company_id}
                        following={following}
                        onChange={(_id, f) => setFollowing(f)}
                      />
                    </div>
                  </div>
                  <div
                    style={{
                      fontFamily: PAPER_FONTS_V2.serif,
                      fontWeight: 400,
                      fontSize: 28,
                      lineHeight: 1.25,
                      letterSpacing: "-.01em",
                      color: TOKENS.ink,
                    }}
                  >
                    {job.title}
                  </div>
                  <div
                    style={{
                      fontFamily: "system-ui, sans-serif",
                      fontSize: 13,
                      lineHeight: 1.6,
                      color: TOKENS.muted,
                      marginTop: 8,
                    }}
                  >
                    {job.location ? `${job.location} · ` : ""}
                    <span style={{ color: comp.listed ? TOKENS.green : TOKENS.faint }}>{comp.label}</span>
                    {" · "}
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: TOKENS.amber, textDecoration: "none", cursor: "pointer" }}
                    >
                      {sourceHost(job.url)} ↗
                    </a>
                  </div>
                </div>
                <div
                  style={{
                    border: `1px solid ${fit.border}`,
                    color: fit.color,
                    borderRadius: RADII.button,
                    padding: "10px 13px",
                    textAlign: "center",
                    flex: "none",
                  }}
                >
                  <div style={{ fontFamily: PAPER_FONTS_V2.mono, fontWeight: 500, fontSize: 19, lineHeight: 1 }}>
                    {job.score}
                  </div>
                  <div
                    style={{
                      fontFamily: PAPER_FONTS_V2.mono,
                      fontWeight: 500,
                      fontSize: 8.5,
                      lineHeight: 1,
                      letterSpacing: ".1em",
                      marginTop: 4,
                    }}
                  >
                    FIT
                  </div>
                </div>
              </div>

              {/* Mobile: actions above the fold — no scrolling past the JD to
                  act. Desktop gets them in the sticky rail instead. */}
              {isMobile && <div style={{ marginTop: 18 }}>{actions}</div>}

              {isMobile ? (
                // Stacked: the short "why" card first, then the long JD.
                <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 22 }}>
                  {whyCard}
                  {jdCard}
                  {crewPitch}
                </div>
              ) : (
                // JD gets the reading column; the rail stays in view while the
                // JD scrolls, keeping the "why" and the actions in reach.
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1.6fr) minmax(280px, 1fr)",
                    gap: 14,
                    marginTop: 22,
                    alignItems: "start",
                  }}
                >
                  {jdCard}
                  <div style={{ position: "sticky", top: 16, display: "flex", flexDirection: "column", gap: 14 }}>
                    {whyCard}
                    <div
                      style={{
                        background: TOKENS.card,
                        border: `1px solid ${TOKENS.lineSoft}`,
                        borderRadius: RADII.card,
                        padding: "18px 22px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 14,
                      }}
                    >
                      {crewPitch}
                      {actions}
                    </div>
                  </div>
                </div>
              )}
            </>
          );
        })()
      )}
    </div>
  );
}
