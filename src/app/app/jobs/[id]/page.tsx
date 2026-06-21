"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PAPER_FONTS } from "@/components/paper/fonts";
import { usePaperTheme } from "@/components/paper/use-paper-theme";
import { PageHead, PaperCard, InkButton, Stamp } from "@/components/paper/primitives";
import { useIsMobile } from "@/lib/use-is-mobile";
import { startRun } from "@/lib/runs-store";
import { relativePosted, visaLabelFull, sizeLabel, scoreTier } from "@/lib/jobs/format";
import type { JobDetail } from "@/lib/jobs/types";

export default function JobDetailPage() {
  const { p } = usePaperTheme();
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
    scoreTier(s) === "high" ? p.leaf : scoreTier(s) === "mid" ? p.marigold : p.stamp;

  return (
    <div
      className="scroll"
      style={{ flex: 1, overflow: "auto", padding: isMobile ? "24px 16px 64px" : "48px 56px 80px" }}
    >
      <button
        onClick={() => router.push("/app/jobs")}
        style={{
          background: "transparent",
          border: "none",
          color: p.inkMute,
          fontFamily: PAPER_FONTS.mono,
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
        <PaperCard p={p} color={p.stamp} hardShadow>
          <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 20 }}>Couldn&apos;t load this job</div>
          <p style={{ fontFamily: PAPER_FONTS.mono, fontSize: 12, color: p.stamp, marginTop: 6 }}>{error}</p>
        </PaperCard>
      ) : !job ? (
        <p style={{ fontFamily: PAPER_FONTS.mono, fontSize: 13, color: p.inkMute }}>Loading…</p>
      ) : (
        <>
          <PageHead
            p={p}
            eyebrow={job.company}
            title={job.title}
            sub={job.reasons || undefined}
            right={<Stamp color={tierColor(job.score)} rotate={3}>{`${job.score} fit`}</Stamp>}
          />

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
                    fontFamily: PAPER_FONTS.mono,
                    fontSize: 11,
                    color: p.inkSoft,
                    border: `1px solid ${p.ink}24`,
                    padding: "4px 10px",
                    background: p.card,
                  }}
                >
                  {chip}
                </span>
              ))}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
            <InkButton p={p} size="lg" color={p.stamp} disabled={busy} onClick={runOutreach}>
              {busy ? "Starting…" : "Run outreach"} <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 16 }}>→</span>
            </InkButton>
            <InkButton p={p} kind="outline" disabled={busy} onClick={dismiss}>
              Dismiss
            </InkButton>
            <a href={job.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
              <InkButton p={p} kind="ghost">
                View original ↗
              </InkButton>
            </a>
          </div>

          {/* JD */}
          <PaperCard p={p}>
            <div
              style={{
                fontFamily: PAPER_FONTS.mono,
                fontSize: 10,
                color: p.inkMute,
                letterSpacing: ".16em",
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              The role
            </div>
            <div
              style={{
                fontFamily: PAPER_FONTS.serif,
                fontSize: 15,
                lineHeight: 1.6,
                color: p.ink,
                whiteSpace: "pre-wrap",
              }}
            >
              {job.description || "No description available from the source board. Open the original posting for details."}
            </div>
          </PaperCard>
        </>
      )}
    </div>
  );
}
