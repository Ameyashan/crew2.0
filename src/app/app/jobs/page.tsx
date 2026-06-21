"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PAPER_FONTS } from "@/components/paper/fonts";
import { usePaperTheme } from "@/components/paper/use-paper-theme";
import { PageHead, PaperCard, InkButton, Eyebrow, Stamp, Marginalia, PaperEmpty } from "@/components/paper/primitives";
import type { Palette } from "@/components/paper/palette";
import { useIsMobile } from "@/lib/use-is-mobile";
import { relativePosted, visaBadge, sizeLabel, scoreTier } from "@/lib/jobs/format";
import type { FeedItem } from "@/lib/jobs/types";

const CARD_COLORS = ["marigold", "leaf", "tea", "stamp"] as const;

function scoreColor(p: Palette, score: number): string {
  const tier = scoreTier(score);
  return tier === "high" ? p.leaf : tier === "mid" ? p.marigold : p.stamp;
}

function JobCard({
  p,
  item,
  color,
  onOpen,
}: {
  p: Palette;
  item: FeedItem;
  color: string;
  onOpen: () => void;
}) {
  const posted = relativePosted(item.posted_date, item.posted_date_approx);
  const visa = visaBadge(item.visa_confidence);
  const size = sizeLabel(item.company_size);
  const meta = [posted, item.location, item.compensation, size].filter(Boolean).join("  ·  ");

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
        background: p.card,
        border: `1.5px solid ${p.ink}`,
        boxShadow: `4px 4px 0 ${color}`,
        padding: "18px 20px",
        cursor: "pointer",
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 16,
        alignItems: "start",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Eyebrow p={p} en={item.company} color={p.stamp} />
          {item.is_new && (
            <span
              style={{
                fontFamily: PAPER_FONTS.mono,
                fontSize: 8.5,
                letterSpacing: ".14em",
                padding: "1px 6px",
                border: `1px solid ${p.stamp}`,
                color: p.stamp,
                whiteSpace: "nowrap",
              }}
            >
              NEW
            </span>
          )}
        </div>
        <div
          style={{
            fontFamily: PAPER_FONTS.display,
            fontSize: 22,
            color: p.ink,
            lineHeight: 1.1,
            marginTop: 4,
          }}
        >
          {item.title}
        </div>
        {meta && (
          <div
            style={{
              fontFamily: PAPER_FONTS.mono,
              fontSize: 11,
              color: p.inkMute,
              marginTop: 6,
              letterSpacing: ".02em",
            }}
          >
            {meta}
          </div>
        )}
        {item.reasons && (
          <div style={{ marginTop: 8 }}>
            <Marginalia p={p} rotate={-0.5}>
              {item.reasons}
            </Marginalia>
          </div>
        )}
        {visa && (
          <div
            style={{
              marginTop: 8,
              display: "inline-block",
              fontFamily: PAPER_FONTS.mono,
              fontSize: 10,
              letterSpacing: ".06em",
              color: p.leaf,
              border: `1px solid ${p.leaf}`,
              padding: "2px 8px",
            }}
          >
            ✓ {visa}
          </div>
        )}
      </div>
      <Stamp color={scoreColor(p, item.score)} rotate={3}>
        {item.score}
      </Stamp>
    </div>
  );
}

export default function JobsFeedPage() {
  const { p } = usePaperTheme();
  const isMobile = useIsMobile();
  const router = useRouter();
  const [jobs, setJobs] = useState<FeedItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyNew, setOnlyNew] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/jobs/feed${onlyNew ? "?filter=new" : ""}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j.error) {
          setError(j.error);
          setJobs([]);
        } else {
          setError(null);
          setJobs(Array.isArray(j.jobs) ? j.jobs : []);
        }
      })
      .catch((e) => {
        if (alive) setError(String(e?.message || e));
      });
    return () => {
      alive = false;
    };
  }, [onlyNew]);

  const total = jobs?.length ?? 0;
  const newCount = jobs?.filter((j) => j.is_new).length ?? 0;
  const summary =
    jobs === null
      ? "Gathering jobs that fit your interests…"
      : total === 0
        ? "Nothing matching your interests yet — set or broaden them to fill this up."
        : `${total} match${total === 1 ? "" : "es"}${newCount ? ` · ${newCount} new` : ""} · ranked by fit`;

  return (
    <div
      className="scroll"
      style={{ flex: 1, overflow: "auto", padding: isMobile ? "24px 16px 64px" : "48px 56px 80px" }}
    >
      <PageHead
        p={p}
        eyebrow="Jobs · picked for you"
        title="Today's jobs,"
        italic="picked for you."
        sub={summary}
        right={
          <InkButton p={p} kind="outline" size="sm" onClick={() => router.push("/app/jobs/preferences")}>
            Edit preferences
          </InkButton>
        }
      />

      {/* New-today toggle */}
      {jobs !== null && total > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {[
            { v: false, label: "All matches" },
            { v: true, label: "New today" },
          ].map((o) => {
            const active = onlyNew === o.v;
            return (
              <button
                key={o.label}
                onClick={() => setOnlyNew(o.v)}
                style={{
                  padding: "6px 14px",
                  fontFamily: PAPER_FONTS.mono,
                  fontSize: 12,
                  background: active ? p.ink : "transparent",
                  color: active ? p.paper : p.ink,
                  border: `1.5px solid ${p.ink}`,
                  cursor: "pointer",
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      )}

      {error ? (
        <PaperCard p={p} color={p.stamp} hardShadow>
          <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 20, color: p.ink }}>
            Couldn&apos;t load your feed
          </div>
          <p style={{ fontFamily: PAPER_FONTS.mono, fontSize: 12, color: p.stamp, marginTop: 6 }}>{error}</p>
        </PaperCard>
      ) : jobs === null ? (
        <PaperEmpty
          p={p}
          title="Warming up…"
          sub="We're scanning the boards that match your interests. New matches land here every morning — check back shortly."
        />
      ) : jobs.length === 0 ? (
        <PaperEmpty
          p={p}
          title={onlyNew ? "No new matches today" : "No matches yet"}
          sub={
            onlyNew
              ? "Nothing new since your last visit. Switch to All matches to see everything."
              : "Pick the sectors you care about and we'll fill this feed with roles that fit."
          }
        >
          {onlyNew ? (
            <InkButton p={p} color={p.marigold} onClick={() => setOnlyNew(false)}>
              See all matches
            </InkButton>
          ) : (
            <InkButton p={p} color={p.stamp} onClick={() => router.push("/app/jobs/preferences")}>
              Set your interests
            </InkButton>
          )}
        </PaperEmpty>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {jobs.map((item, i) => (
            <JobCard
              key={item.match_id || item.job_id}
              p={p}
              item={item}
              color={p[CARD_COLORS[i % CARD_COLORS.length]]}
              onOpen={() => router.push(`/app/jobs/${item.job_id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
