"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface Person {
  id: string;
  name: string;
  email: string | null;
}
interface Draft {
  id: string;
  channel: string;
  subject: string | null;
  body: string;
}
interface FollowupRow {
  id: string;
  due_at: string;
  person: Person;
  draft: Draft | null;
}
interface ReviewRow {
  interaction_id: string;
  sent_at: string;
  person: Person;
  draft: Draft | null;
}

export default function TodayPage() {
  const [due, setDue] = useState<FollowupRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [digestBadge, setDigestBadge] = useState<{ pending_followups: number; pending_reviews: number; generated_at: string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/today");
    const j = await r.json();
    setDue(j.due ?? []);
    setReviews(j.reviews ?? []);
    setDigestBadge(j.last_digest ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Combined keyboard navigable list = due + reviews
  const items = useMemo(() => {
    return [
      ...due.map((d, i) => ({ kind: "due" as const, key: `due-${d.id}`, due: d, idx: i })),
      ...reviews.map((r, i) => ({ kind: "review" as const, key: `rev-${r.interaction_id}`, review: r, idx: i })),
    ];
  }, [due, reviews]);

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (!items.length) return;
      if (e.key === "j") {
        setActiveIdx((i) => Math.min(items.length - 1, i + 1));
      } else if (e.key === "k") {
        setActiveIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        setOpenIdx((cur) => (cur === activeIdx ? null : activeIdx));
      } else if (e.key === "r" || e.key === "n") {
        const item = items[activeIdx];
        if (item?.kind === "review") {
          markReview(item.review.interaction_id, e.key === "r" ? "replied" : "no_reply");
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, activeIdx]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  async function markReview(interaction_id: string, outcome: "replied" | "no_reply") {
    await fetch("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interaction_id, outcome }),
    });
    await refresh();
    setActiveIdx((i) => Math.max(0, Math.min(items.length - 2, i)));
  }

  async function markFollowupSent(id: string) {
    await fetch(`/api/followup/${id}/sent`, { method: "POST" });
    await refresh();
  }

  function copyAndOpen(d: Draft, person: Person) {
    navigator.clipboard.writeText(d.body).catch(() => {});
    if (d.channel === "email") {
      const to = person.email ?? "";
      const subject = encodeURIComponent(d.subject ?? "");
      const body = encodeURIComponent(d.body);
      window.open(`mailto:${to}?subject=${subject}&body=${body}`, "_blank");
    }
  }

  return (
    <div className="space-y-8" ref={containerRef}>
      <div className="flex items-baseline justify-between">
        <h1
          className="text-3xl"
          style={{ fontFamily: "var(--font-newsreader)" }}
        >
          Today
        </h1>
        <p className="text-xs text-[color:var(--color-ink-muted)]">
          <kbd className="font-mono">j</kbd>/<kbd className="font-mono">k</kbd> move ·{" "}
          <kbd className="font-mono">r</kbd>/<kbd className="font-mono">n</kbd> reply ·{" "}
          <kbd className="font-mono">↵</kbd> open
        </p>
      </div>

      {digestBadge && (
        <div className="rounded-md border border-[color:var(--color-line)] bg-white/40 px-3 py-2 text-xs text-[color:var(--color-ink-muted)]">
          Last digest {new Date(digestBadge.generated_at).toLocaleString()} —{" "}
          {digestBadge.pending_followups} followups · {digestBadge.pending_reviews} to review
        </div>
      )}

      <Section title={`Followups due (${due.length})`} empty={loading ? "…" : "Nothing due."}>
        {due.map((d, i) => {
          const idx = i;
          const open = openIdx === idx && activeIdx === idx;
          const active = activeIdx === idx;
          return (
            <Row key={d.id} active={active} onClick={() => setActiveIdx(idx)}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{d.person.name}</div>
                  <div className="text-xs text-[color:var(--color-ink-muted)]">
                    due {timeAgo(d.due_at)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (d.draft) copyAndOpen(d.draft, d.person);
                    }}
                    disabled={!d.draft}
                    className="rounded bg-[color:var(--color-ink)] px-3 py-1 text-xs text-white disabled:opacity-40"
                  >
                    Copy & open
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      markFollowupSent(d.id);
                    }}
                    className="rounded border border-[color:var(--color-line)] px-3 py-1 text-xs"
                  >
                    Mark sent
                  </button>
                </div>
              </div>
              {open && d.draft && (
                <DraftPreview draft={d.draft} />
              )}
            </Row>
          );
        })}
      </Section>

      <Section
        title={`Conversations needing review (${reviews.length})`}
        empty={loading ? "…" : "Inbox zero. Nice."}
      >
        {reviews.map((r, i) => {
          const idx = due.length + i;
          const open = openIdx === idx && activeIdx === idx;
          const active = activeIdx === idx;
          return (
            <Row key={r.interaction_id} active={active} onClick={() => setActiveIdx(idx)}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{r.person.name}</div>
                  <div className="text-xs text-[color:var(--color-ink-muted)] truncate">
                    {timeAgo(r.sent_at)} · {(r.draft?.body ?? "").slice(0, 70)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      markReview(r.interaction_id, "replied");
                    }}
                    className="rounded bg-[color:var(--color-clay)] px-3 py-1 text-xs text-white"
                  >
                    Replied
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      markReview(r.interaction_id, "no_reply");
                    }}
                    className="rounded border border-[color:var(--color-line)] px-3 py-1 text-xs"
                  >
                    No reply
                  </button>
                </div>
              </div>
              {open && r.draft && <DraftPreview draft={r.draft} />}
            </Row>
          );
        })}
      </Section>
    </div>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const has = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <section className="space-y-2">
      <h2 className="text-sm uppercase tracking-wide text-[color:var(--color-ink-muted)]">
        {title}
      </h2>
      {has ? (
        <div className="rounded-lg border border-[color:var(--color-line)] divide-y divide-[color:var(--color-line)] bg-white/40">
          {children}
        </div>
      ) : (
        <p className="text-sm text-[color:var(--color-ink-muted)] italic">{empty}</p>
      )}
    </section>
  );
}

function Row({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={onClick}
      className={`px-4 py-3 cursor-pointer ${active ? "row-active bg-[color:var(--color-cream-50)]" : ""}`}
    >
      {children}
    </div>
  );
}

function DraftPreview({ draft }: { draft: Draft }) {
  return (
    <div className="mt-3 rounded-md border border-[color:var(--color-line)] bg-white/60 p-3 text-sm whitespace-pre-wrap">
      {draft.subject && (
        <div className="mb-2 text-[color:var(--color-ink-muted)] text-xs">
          Subject: {draft.subject}
        </div>
      )}
      {draft.body}
    </div>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(Math.abs(ms) / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  const d = Math.round(h / 24);
  return `${d}d`;
}
