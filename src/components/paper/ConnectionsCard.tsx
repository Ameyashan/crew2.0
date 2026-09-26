"use client";

// Settings → LinkedIn connections. The user uploads LinkedIn's own
// Connections.csv export; it's parsed HERE in the browser (emails dropped) and
// only name / company / title / profile URL / connected-on are sent, in
// chunks. Powers "people you know at <company>" on the tracker and job pages.

import { useCallback, useEffect, useRef, useState } from "react";
import { PAPER_FONTS_V2 } from "@/components/paper/fonts";
import { TOKENS, RADII, SHADOWS } from "@/components/paper/tokens";
import { parseConnectionsCsv } from "@/lib/connections/csv";

// Must match IMPORT_CHUNK in src/lib/connections/store.ts.
const CHUNK = 4000;

interface Summary {
  count: number;
  imported_at: string | null;
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export function ConnectionsCard({ style }: { style?: React.CSSProperties }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(
    () =>
      fetch("/api/connections")
        .then((r) => r.json())
        .then((j) => !j.error && setSummary(j as Summary))
        .catch(() => undefined),
    [],
  );

  useEffect(() => {
    void load();
    // Deep links ("Import your LinkedIn connections →") land here.
    if (typeof window !== "undefined" && window.location.hash === "#connections") {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [load]);

  async function handleFile(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const parsed = parseConnectionsCsv(await file.text());
      if (parsed.error) throw new Error(parsed.error);
      if (!parsed.connections.length) throw new Error("No connections found in that file.");
      const rows = parsed.connections;
      for (let i = 0; i < rows.length; i += CHUNK) {
        setStatus(`Uploading ${Math.min(i + CHUNK, rows.length).toLocaleString()} of ${rows.length.toLocaleString()}…`);
        const res = await fetch("/api/connections", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ rows: rows.slice(i, i + CHUNK), first: i === 0, final: i + CHUNK >= rows.length }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || `upload failed: ${res.status}`);
      }
      setStatus(`Imported ${rows.length.toLocaleString()} connections.`);
      await load();
    } catch (e) {
      setStatus(null);
      setError(String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (busy || !window.confirm("Delete your imported LinkedIn connections from Jugaadu?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/connections", { method: "DELETE" });
      if (!res.ok) throw new Error(`delete failed: ${res.status}`);
      setStatus("Deleted.");
      await load();
    } catch (e) {
      setError(String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  }

  const imported = (summary?.count ?? 0) > 0;
  return (
    <div
      id="connections"
      ref={ref}
      style={{
        background: TOKENS.card,
        color: TOKENS.ink,
        border: `1px solid ${TOKENS.lineSoft}`,
        borderRadius: RADII.card,
        boxShadow: SHADOWS.card,
        padding: "20px 22px",
        scrollMarginTop: 16,
        ...style,
      }}
    >
      <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 20, marginBottom: 4 }}>LinkedIn connections</div>
      <p style={{ margin: "0 0 14px", fontFamily: PAPER_FONTS_V2.serif, fontStyle: "italic", fontSize: 14, color: TOKENS.muted }}>
        See who you already know at the companies you track — a warm intro beats a cold application.
      </p>

      <div
        style={{
          fontFamily: PAPER_FONTS_V2.mono,
          fontSize: 12,
          color: imported ? TOKENS.green : TOKENS.muted,
          marginBottom: 12,
        }}
      >
        {summary === null
          ? "…"
          : imported
            ? `${summary.count.toLocaleString()} connections · imported ${summary.imported_at ? fmtDate(summary.imported_at) : ""}`
            : "Not imported yet"}
      </div>

      <ol
        style={{
          margin: "0 0 14px",
          paddingLeft: 18,
          fontFamily: PAPER_FONTS_V2.sans,
          fontSize: 13,
          lineHeight: 1.7,
          color: TOKENS.inkSoft,
        }}
      >
        <li>
          On LinkedIn, open{" "}
          <a
            href="https://www.linkedin.com/mypreferences/d/download-my-data"
            target="_blank"
            rel="noreferrer"
            style={{ color: TOKENS.amber, textDecoration: "none" }}
          >
            Settings → Data privacy → Get a copy of your data ↗
          </a>
          , pick <em>Connections</em>, and request the archive.
        </li>
        <li>LinkedIn emails you a download link, usually within ~10 minutes.</li>
        <li>Unzip it and upload <code style={{ fontFamily: PAPER_FONTS_V2.mono }}>Connections.csv</code> here.</li>
      </ol>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 16px",
          background: TOKENS.cardWarm,
          border: `1px dashed ${TOKENS.dashed}`,
          borderRadius: RADII.panelTight,
          cursor: busy ? "wait" : "pointer",
        }}
      >
        <input
          type="file"
          accept=".csv,text/csv"
          style={{ display: "none" }}
          disabled={busy}
          onChange={(e) => {
            void handleFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <span
          style={{
            width: 30,
            height: 30,
            display: "grid",
            placeItems: "center",
            fontSize: 15,
            border: `1px solid ${TOKENS.line}`,
            borderRadius: RADII.pill,
            flexShrink: 0,
          }}
        >
          {busy ? "…" : "↑"}
        </span>
        <div>
          <div style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 13.5 }}>
            {busy ? status ?? "Reading…" : imported ? "Upload a fresh Connections.csv" : "Upload Connections.csv"}
          </div>
          <div style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 11, color: error ? TOKENS.red : TOKENS.muted, marginTop: 2 }}>
            {error || (!busy && status) || "Replaces any earlier import · email addresses are removed before upload"}
          </div>
        </div>
      </label>

      {imported && (
        <button
          type="button"
          onClick={clear}
          disabled={busy}
          style={{
            marginTop: 10,
            background: "transparent",
            border: "none",
            padding: 0,
            fontFamily: PAPER_FONTS_V2.sans,
            fontSize: 12,
            color: TOKENS.muted,
            cursor: busy ? "default" : "pointer",
          }}
        >
          Delete imported connections
        </button>
      )}
    </div>
  );
}
