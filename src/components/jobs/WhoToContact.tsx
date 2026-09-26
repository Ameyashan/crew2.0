"use client";

// Job page → "Who to reach out to" (career-ops modes/contacto.md). On request
// it finds the likely hiring manager, a recruiter and a peer (web search +
// Apollo), flags anyone the user already knows, and writes a ≤300-char
// LinkedIn note for each. Per person: copy the note, open their LinkedIn, or
// "Draft outreach" through the Compose pipeline (research → email → drafts),
// or — for a connection — ask them for an intro (warm-intro run).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PAPER_FONTS_V2 } from "@/components/paper/fonts";
import { TOKENS, RADII } from "@/components/paper/tokens";
import { startRun, setFocusedRun } from "@/lib/runs-store";
import { track } from "@/lib/analytics/client";
import { warmIntroIntent } from "@/lib/writing/warm-intro";
import type { JobContact, JobContactsDTO } from "@/lib/jobs/contacts-logic";

const KIND_LABEL: Record<JobContact["kind"], string> = {
  hiring_manager: "LIKELY HIRING MANAGER",
  recruiter: "RECRUITER",
  peer: "ON THE TEAM",
  connection: "YOU KNOW THEM",
};

const eyebrow = {
  fontFamily: PAPER_FONTS_V2.mono,
  fontWeight: 500,
  fontSize: 10,
  lineHeight: 1,
  letterSpacing: ".08em",
} as const;

function SmallButton({ children, onClick, solid }: { children: React.ReactNode; onClick: () => void; solid?: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        fontFamily: PAPER_FONTS_V2.mono,
        fontSize: 11,
        color: solid || hover ? TOKENS.paper : TOKENS.ink,
        background: solid ? (hover ? TOKENS.inkSoft : TOKENS.ink) : hover ? TOKENS.ink : "transparent",
        border: `1px solid ${solid || hover ? TOKENS.ink : TOKENS.line}`,
        borderRadius: RADII.buttonTight,
        padding: "6px 10px",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

export function WhoToContact({ jobId, role, company, jobUrl }: { jobId: string; role: string; company: string; jobUrl: string }) {
  const router = useRouter();
  const [data, setData] = useState<JobContactsDTO | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  // A refresh is offered once the cached result is over an hour old (the
  // server's CONTACTS_REFRESH_MS); decided when the data arrives.
  const [stale, setStale] = useState(false);
  const accept = (dto: JobContactsDTO) => {
    setData(dto);
    setStale(Date.now() - Date.parse(dto.generated_at) > 60 * 60 * 1000);
  };

  useEffect(() => {
    let alive = true;
    fetch(`/api/jobs/${jobId}/contacts`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j?.contacts) accept(j.contacts as JobContactsDTO);
        setLoaded(true);
      })
      .catch(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [jobId]);

  async function find() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/contacts`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `lookup failed: ${res.status}`);
      accept(j.contacts as JobContactsDTO);
    } catch (e) {
      setError(String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function copy(c: JobContact) {
    if (!c.note) return;
    try {
      await navigator.clipboard.writeText(c.note);
      setCopied(c.key);
      setTimeout(() => setCopied((k) => (k === c.key ? null : k)), 1500);
      track("job_contact_action", { action: "copy_note", kind: c.kind });
    } catch {
      // clipboard blocked — the note is on screen to select by hand
    }
  }

  function draft(c: JobContact) {
    const picked = { name: c.name, role: c.role, company, linkedin: c.linkedin };
    const runId = c.connected
      ? startRun(c.linkedin || c.name, {
          kind: "person",
          intent: warmIntroIntent({ company, role }),
          picked,
          warmIntro: { company, role, job_url: jobUrl },
        })
      : startRun(c.linkedin || c.name, {
          kind: "person",
          intent: `About the ${role} role at ${company}.`,
          picked,
          jobContext: { role, company },
        });
    if (runId) setFocusedRun(runId);
    track("job_contact_action", { action: "draft", kind: c.connected ? "connection" : c.kind });
    router.push("/app/compose");
  }

  return (
    <div
      style={{
        background: TOKENS.card,
        border: `1px solid ${TOKENS.lineSoft}`,
        borderRadius: RADII.card,
        padding: "18px 22px",
      }}
    >
      <div style={{ ...eyebrow, color: TOKENS.faint, marginBottom: 12 }}>WHO TO REACH OUT TO</div>

      {!loaded ? null : !data ? (
        <>
          <p style={{ margin: "0 0 12px", fontFamily: "system-ui, sans-serif", fontSize: 13, lineHeight: 1.6, color: TOKENS.muted }}>
            Find the likely hiring manager, a recruiter and someone on the team at {company}, with a short LinkedIn note
            for each.
          </p>
          <SmallButton solid onClick={find}>
            {busy ? "Looking… (~30s)" : "Find people →"}
          </SmallButton>
        </>
      ) : !data.contacts.length ? (
        <p style={{ margin: 0, fontFamily: "system-ui, sans-serif", fontSize: 13, lineHeight: 1.6, color: TOKENS.muted }}>
          Couldn&apos;t find anyone we&apos;d stand behind for this role. The crew&apos;s full run (above) sources a hiring
          manager from the posting itself.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {data.contacts.map((c, i) => (
            <div key={c.key} style={{ padding: "12px 0", borderTop: i === 0 ? "none" : `1px solid ${TOKENS.lineRow}` }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={{ ...eyebrow, fontSize: 9.5, color: c.connected ? TOKENS.green : TOKENS.amber }}>
                  {c.connected && c.kind !== "connection" ? `${KIND_LABEL[c.kind]} · YOU KNOW THEM` : KIND_LABEL[c.kind]}
                </span>
                <span style={{ ...eyebrow, fontSize: 9, color: TOKENS.faint }}>
                  {c.sources.map((s) => (s === "web" ? "web" : s === "apollo" ? "apollo" : "connections")).join(" · ")}
                </span>
              </div>
              <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 14, color: TOKENS.ink, marginTop: 5 }}>
                {c.linkedin ? (
                  <a href={c.linkedin} target="_blank" rel="noreferrer" style={{ color: TOKENS.ink, textDecoration: "none" }}>
                    {c.name} <span style={{ color: TOKENS.faint }}>↗</span>
                  </a>
                ) : (
                  c.name
                )}
              </div>
              {(c.role || c.why) && (
                <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 12, lineHeight: 1.5, color: TOKENS.muted }}>
                  {[c.role, c.why].filter(Boolean).join(" · ")}
                </div>
              )}
              {c.note && (
                <div
                  style={{
                    marginTop: 8,
                    padding: "9px 11px",
                    background: TOKENS.cardWarm,
                    border: `1px solid ${TOKENS.lineInset}`,
                    borderRadius: RADII.panelTight,
                    fontFamily: "system-ui, sans-serif",
                    fontSize: 12.5,
                    lineHeight: 1.55,
                    color: TOKENS.inkSoft,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {c.note}
                  <div style={{ ...eyebrow, fontSize: 9, color: TOKENS.faint, marginTop: 6 }}>{c.note.length}/300</div>
                </div>
              )}
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                {c.note && <SmallButton onClick={() => copy(c)}>{copied === c.key ? "Copied ✓" : "Copy note"}</SmallButton>}
                <SmallButton onClick={() => draft(c)}>{c.connected ? "Ask for intro →" : "Draft outreach →"}</SmallButton>
              </div>
            </div>
          ))}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginTop: 6,
              fontFamily: "system-ui, sans-serif",
              fontSize: 11.5,
              color: TOKENS.faint,
              flexWrap: "wrap",
            }}
          >
            <span>
              Found {new Date(data.generated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              {data.apollo === "unavailable" ? " · Apollo not configured" : ""}
              {!data.connections_imported ? " · import LinkedIn connections to see who you know" : ""}
            </span>
            {stale && (
              <button
                type="button"
                onClick={find}
                disabled={busy}
                style={{ background: "transparent", border: "none", padding: 0, color: TOKENS.amber, cursor: "pointer", fontSize: 11.5 }}
              >
                {busy ? "Refreshing…" : "Refresh"}
              </button>
            )}
          </div>
        </div>
      )}
      {error && (
        <p style={{ margin: "10px 0 0", fontFamily: PAPER_FONTS_V2.mono, fontSize: 11.5, color: TOKENS.red }}>{error}</p>
      )}
    </div>
  );
}
