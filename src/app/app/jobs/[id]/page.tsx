"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PAPER_FONTS_V2 } from "@/components/paper/fonts";
import { TOKENS, RADII, SHADOWS } from "@/components/paper/tokens";
import { InkButton2 } from "@/components/paper/primitives2";
import { useIsMobile } from "@/lib/use-is-mobile";
import { startRun } from "@/lib/runs-store";
import { relativePosted, visaLabelFull, sizeLabel, scoreTier } from "@/lib/jobs/format";
import type { JobDetail } from "@/lib/jobs/types";

export default function JobDetailPage() {
  const isMobile = useIsMobile();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [job, setJob] = useState<JobDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    fetch(`/api/jobs/${id}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j.error) setError(j.error);
        else setJob(j.job);
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

  const tierColor = (s: number) =>
    scoreTier(s) === "high" ? TOKENS.green : scoreTier(s) === "mid" ? TOKENS.gold : TOKENS.red;

  return (
    <div
      className="scroll"
      style={{ flex: 1, overflow: "auto", padding: isMobile ? "24px 16px 64px" : "48px 56px 80px", background: TOKENS.paper }}
    >
      <button
        onClick={() => router.push("/app/jobs")}
        style={{
          background: "transparent",
          border: "none",
          color: TOKENS.muted,
          fontFamily: PAPER_FONTS_V2.mono,
          fontSize: 11,
          letterSpacing: ".1em",
          textTransform: "uppercase",
          cursor: "pointer",
          padding: 0,
          marginBottom: 18,
        }}
      >
        ← all jobs
      </button>

      {error ? (
        <div
          style={{
            background: TOKENS.card,
            border: `1px solid ${TOKENS.lineSoft}`,
            borderRadius: RADII.card,
            boxShadow: SHADOWS.card,
            padding: "20px 22px",
          }}
        >
          <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 20, color: TOKENS.ink }}>Couldn&apos;t load this job</div>
          <p style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 12, color: TOKENS.red, marginTop: 6 }}>{error}</p>
        </div>
      ) : !job ? (
        <p style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 13, color: TOKENS.muted }}>Loading…</p>
      ) : (
        <>
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
              <div
                style={{
                  fontFamily: PAPER_FONTS_V2.mono,
                  fontSize: 10.5,
                  color: TOKENS.muted,
                  letterSpacing: ".1em",
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                {job.company}
              </div>
              <h1
                style={{
                  margin: 0,
                  fontFamily: PAPER_FONTS_V2.serif,
                  fontWeight: 400,
                  fontSize: "clamp(40px, 4.8vw, 64px)",
                  lineHeight: 0.95,
                  letterSpacing: "-.02em",
                  color: TOKENS.ink,
                  textWrap: "balance",
                }}
              >
                {job.title}
              </h1>
              {job.reasons && (
                <p
                  style={{
                    margin: "14px 0 0",
                    fontFamily: PAPER_FONTS_V2.serif,
                    fontStyle: "italic",
                    fontSize: 18,
                    lineHeight: 1.45,
                    color: TOKENS.inkSoft,
                    maxWidth: 720,
                  }}
                >
                  {job.reasons}
                </p>
              )}
            </div>
            <div style={{ flexShrink: 0 }}>
              <span
                style={{
                  display: "inline-block",
                  fontFamily: PAPER_FONTS_V2.mono,
                  fontWeight: 600,
                  fontSize: 14,
                  letterSpacing: ".04em",
                  textTransform: "uppercase",
                  color: tierColor(job.score),
                  border: `1px solid ${tierColor(job.score)}`,
                  borderRadius: RADII.buttonTight,
                  padding: "7px 12px",
                  background: TOKENS.card,
                  whiteSpace: "nowrap",
                }}
              >
                {`${job.score} fit`}
              </span>
            </div>
          </div>

          {/* Meta strip */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
            {[
              relativePosted(job.posted_date, job.posted_date_approx),
              job.location,
              job.remote_type !== "unknown" ? job.remote_type : null,
              job.compensation,
              sizeLabel(job.company_size),
              visaLabelFull(job.visa_confidence),
            ]
              .filter(Boolean)
              .map((chip, i) => (
                <span
                  key={i}
                  style={{
                    fontFamily: PAPER_FONTS_V2.mono,
                    fontSize: 11,
                    color: TOKENS.inkSoft,
                    border: `1px solid ${TOKENS.line}`,
                    borderRadius: RADII.pill,
                    padding: "4px 12px",
                    background: TOKENS.card,
                  }}
                >
                  {chip}
                </span>
              ))}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
            <InkButton2 kind="solid" disabled={busy} onClick={runOutreach} style={{ padding: "12px 20px", fontSize: 15 }}>
              {busy ? "Starting…" : "Run outreach"} <span style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 16 }}>→</span>
            </InkButton2>
            <InkButton2 kind="outline" disabled={busy} onClick={dismiss} style={{ padding: "12px 20px", fontSize: 15 }}>
              Dismiss
            </InkButton2>
            <a href={job.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
              <InkButton2 kind="ghost" style={{ padding: "12px 20px", fontSize: 15 }}>
                View original ↗
              </InkButton2>
            </a>
          </div>

          {/* JD */}
          <div
            style={{
              background: TOKENS.card,
              border: `1px solid ${TOKENS.lineSoft}`,
              borderRadius: RADII.card,
              boxShadow: SHADOWS.card,
              padding: "20px 22px",
            }}
          >
            <div
              style={{
                fontFamily: PAPER_FONTS_V2.mono,
                fontSize: 10,
                color: TOKENS.muted,
                letterSpacing: ".1em",
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              The role
            </div>
            <div
              style={{
                fontFamily: PAPER_FONTS_V2.serif,
                fontSize: 15,
                lineHeight: 1.6,
                color: TOKENS.ink,
                whiteSpace: "pre-wrap",
              }}
            >
              {job.description || "No description available from the source board. Open the original posting for details."}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
