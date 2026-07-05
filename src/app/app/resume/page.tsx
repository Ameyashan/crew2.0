"use client";

// The Story page (Phase E of the jugaadu reskin) — prototype lines 338–421.
// "The living record behind every resume": raw notes the user logs, each polished
// by the resume agent into a resume-ready bullet the user approves. Resume
// *tailoring* now lives in the Desk-run flow; this route (still /app/resume, the
// "Story" nav pill) is the Story timeline + by-theme view + quick-add.

import { useCallback, useEffect, useState } from "react";
import { PAPER_FONTS_V2 } from "@/components/paper/fonts";
import { TOKENS, RADII, SHADOWS } from "@/components/paper/tokens";
import { useIsMobile } from "@/lib/use-is-mobile";
import { entryView, groupByTheme, entryWhen } from "@/components/paper/story-logic";

type StoryStatus = "raw" | "pending" | "proposed" | "polished";

interface Entry {
  id: string;
  raw: string;
  bullet: string | null;
  status: StoryStatus;
  tags: string[];
  created_at: string;
}

type View = "timeline" | "themes";

export default function StoryPage() {
  const isMobile = useIsMobile();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [view, setView] = useState<View>("timeline");
  const [quickAdd, setQuickAdd] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/story")
      .then((r) => {
        if (!r.ok) throw new Error(`load failed: ${r.status}`);
        return r.json();
      })
      .then((j) => {
        if (alive) setEntries(Array.isArray(j?.entries) ? j.entries : []);
      })
      .catch((e) => {
        if (alive) setError(String(e?.message || e));
      })
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Hand a raw entry to the resume agent. Shows the "…is polishing this" pending
  // line while in flight; reverts to raw if the agent can't produce a bullet.
  const polish = useCallback(async (id: string) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, status: "pending" } : e)));
    try {
      const r = await fetch(`/api/story/${id}/polish`, { method: "POST" });
      if (!r.ok) {
        setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, status: "raw" } : e)));
        return;
      }
      const j = await r.json();
      if (j?.entry) setEntries((prev) => prev.map((e) => (e.id === id ? j.entry : e)));
    } catch {
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, status: "raw" } : e)));
    }
  }, []);

  async function addEntry() {
    const raw = quickAdd.trim();
    if (!raw || adding) return;
    setAdding(true);
    setError(null);
    try {
      const r = await fetch("/api/story", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ raw }),
      });
      if (!r.ok) throw new Error(`add failed: ${r.status}`);
      const j = await r.json();
      if (j?.entry) {
        setQuickAdd("");
        setEntries((prev) => [j.entry, ...prev]);
        polish(j.entry.id);
      }
    } catch (e) {
      setError(String((e as Error)?.message || e));
    } finally {
      setAdding(false);
    }
  }

  async function patchEntry(id: string, body: Record<string, unknown>) {
    try {
      const r = await fetch(`/api/story/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`update failed: ${r.status}`);
      const j = await r.json();
      if (j?.entry) setEntries((prev) => prev.map((e) => (e.id === id ? j.entry : e)));
    } catch (e) {
      setError(String((e as Error)?.message || e));
    }
  }

  function startEdit(entry: Entry) {
    setEditingId(entry.id);
    setEditText(entry.raw);
  }
  async function saveEdit(id: string) {
    const raw = editText.trim();
    if (!raw) return;
    await patchEntry(id, { raw });
    setEditingId(null);
  }
  async function deleteEntry(id: string) {
    try {
      await fetch(`/api/story/${id}`, { method: "DELETE" });
      setEntries((prev) => prev.filter((e) => e.id !== id));
      if (editingId === id) setEditingId(null);
    } catch (e) {
      setError(String((e as Error)?.message || e));
    }
  }

  const themes = groupByTheme(entries);

  return (
    <div
      className="scroll"
      style={{
        flex: 1,
        overflow: "auto",
        maxWidth: 820,
        width: "100%",
        margin: "0 auto",
        boxSizing: "border-box",
        padding: isMobile ? "28px 18px 60px" : "44px 44px 60px",
        background: TOKENS.paper,
        color: TOKENS.ink,
      }}
    >
      {/* Head + segmented toggle */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 16,
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
          }}
        >
          Your Story
        </div>
        <div
          style={{
            display: "flex",
            gap: 2,
            background: TOKENS.chip,
            borderRadius: RADII.pill,
            padding: 3,
            flexShrink: 0,
          }}
        >
          <Toggle label="Timeline" active={view === "timeline"} onClick={() => setView("timeline")} />
          <Toggle label="By theme" active={view === "themes"} onClick={() => setView("themes")} />
        </div>
      </div>
      <div
        style={{
          fontFamily: "system-ui, sans-serif",
          fontSize: 14,
          lineHeight: 1.7,
          color: TOKENS.muted,
          maxWidth: 540,
          marginBottom: 26,
        }}
      >
        The living record behind every resume. Write it raw — the crew polishes each entry into
        resume-ready lines you approve.
      </div>

      {/* Quick-add */}
      <div
        style={{
          background: TOKENS.card,
          border: `1px solid ${TOKENS.line}`,
          borderRadius: RADII.card,
          boxShadow: SHADOWS.card,
          padding: "16px 20px 12px",
          marginBottom: 34,
        }}
      >
        <textarea
          value={quickAdd}
          onChange={(e) => setQuickAdd(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              addEntry();
            }
          }}
          placeholder="What did you do? Say it however it comes out…"
          rows={1}
          style={{
            width: "100%",
            border: "none",
            resize: "none",
            fontFamily: PAPER_FONTS_V2.serif,
            fontSize: 16,
            lineHeight: 1.5,
            background: "transparent",
            padding: 0,
            boxSizing: "border-box",
            color: TOKENS.ink,
            outline: "none",
            minHeight: 26,
          }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <button
            onClick={addEntry}
            disabled={!quickAdd.trim() || adding}
            style={{
              fontFamily: "system-ui, sans-serif",
              fontSize: 12,
              fontWeight: 500,
              color: TOKENS.paper,
              background: TOKENS.ink,
              border: "none",
              borderRadius: RADII.buttonTight,
              padding: "9px 14px",
              cursor: !quickAdd.trim() || adding ? "not-allowed" : "pointer",
              opacity: !quickAdd.trim() || adding ? 0.45 : 1,
            }}
          >
            Add to Story
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            marginBottom: 20,
            padding: "10px 14px",
            background: TOKENS.card,
            borderRadius: RADII.panelTight,
            border: `1px solid ${TOKENS.red}`,
            color: TOKENS.red,
            fontFamily: PAPER_FONTS_V2.mono,
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {loaded && entries.length === 0 && (
        <div
          style={{
            padding: "28px",
            textAlign: "center",
            border: `1px dashed ${TOKENS.dashed}`,
            borderRadius: RADII.card,
            background: TOKENS.cardWarm,
            fontFamily: PAPER_FONTS_V2.serif,
            fontStyle: "italic",
            fontSize: 15,
            color: TOKENS.muted2,
          }}
        >
          Nothing here yet. Log what you shipped above — or upload a resume in Settings and the crew
          fills this in.
        </div>
      )}

      {/* Timeline */}
      {view === "timeline" && entries.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {entries.map((e) => (
            <EntryRow
              key={e.id}
              entry={e}
              editing={editingId === e.id}
              editText={editText}
              onEditText={setEditText}
              onStartEdit={() => startEdit(e)}
              onCancelEdit={() => setEditingId(null)}
              onSaveEdit={() => saveEdit(e.id)}
              onDelete={() => deleteEntry(e.id)}
              onApprove={() => patchEntry(e.id, { status: "polished" })}
              onKeepRaw={() => patchEntry(e.id, { status: "raw", bullet: null })}
            />
          ))}
        </div>
      )}

      {/* By theme */}
      {view === "themes" && entries.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          {themes.map((th) => (
            <div key={th.name}>
              <div
                style={{
                  fontFamily: "system-ui, sans-serif",
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: ".12em",
                  textTransform: "uppercase",
                  color: TOKENS.faint,
                  marginBottom: 10,
                }}
              >
                {th.name}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {th.items.map((e) => {
                  const v = entryView(e);
                  return (
                    <div
                      key={e.id}
                      style={{
                        background: TOKENS.card,
                        border: `1px solid ${TOKENS.lineSoft}`,
                        borderRadius: RADII.panelTight,
                        padding: "14px 18px",
                      }}
                    >
                      <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 15, lineHeight: 1.45 }}>
                        {e.raw}
                      </div>
                      {v.isPolished && (
                        <div
                          style={{
                            marginTop: 6,
                            fontFamily: "system-ui, sans-serif",
                            fontSize: 12.5,
                            lineHeight: 1.5,
                            color: TOKENS.muted,
                          }}
                        >
                          ↳ {e.bullet}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Toggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        fontFamily: "system-ui, sans-serif",
        fontSize: 12,
        fontWeight: 500,
        lineHeight: 1,
        padding: "7px 14px",
        borderRadius: RADII.pill,
        cursor: "pointer",
        color: active ? TOKENS.ink : TOKENS.muted2,
        background: active ? TOKENS.card : "transparent",
      }}
    >
      {label}
    </span>
  );
}

function EntryRow({
  entry,
  editing,
  editText,
  onEditText,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onApprove,
  onKeepRaw,
}: {
  entry: Entry;
  editing: boolean;
  editText: string;
  onEditText: (v: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  onApprove: () => void;
  onKeepRaw: () => void;
}) {
  const v = entryView(entry);
  const tags = Array.isArray(entry.tags) ? entry.tags : [];

  return (
    <div
      style={{
        borderTop: `1px solid ${TOKENS.lineRow}`,
        padding: "20px 0",
        animation: "fadeUp .3s ease",
      }}
    >
      {editing ? (
        <div
          style={{
            background: TOKENS.card,
            border: `1px solid ${TOKENS.line}`,
            borderRadius: RADII.panelTight,
            padding: "14px 16px",
          }}
        >
          <textarea
            value={editText}
            onChange={(e) => onEditText(e.target.value)}
            rows={2}
            style={{
              width: "100%",
              border: "none",
              resize: "none",
              fontFamily: PAPER_FONTS_V2.serif,
              fontSize: 16,
              lineHeight: 1.5,
              background: "transparent",
              padding: 0,
              boxSizing: "border-box",
              color: TOKENS.ink,
              outline: "none",
            }}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
            <button
              onClick={onSaveEdit}
              style={{
                fontFamily: "system-ui, sans-serif",
                fontSize: 12,
                fontWeight: 500,
                color: TOKENS.paper,
                background: TOKENS.ink,
                border: "none",
                borderRadius: 7,
                padding: "8px 13px",
                cursor: "pointer",
              }}
            >
              Save
            </button>
            <button
              onClick={onCancelEdit}
              style={{
                fontFamily: "system-ui, sans-serif",
                fontSize: 12,
                fontWeight: 500,
                color: TOKENS.muted2,
                background: "transparent",
                border: `1px solid ${TOKENS.line}`,
                borderRadius: 7,
                padding: "7px 12px",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={onDelete}
              style={{
                marginLeft: "auto",
                fontFamily: "system-ui, sans-serif",
                fontSize: 12,
                color: TOKENS.red,
                background: "transparent",
                border: "none",
                cursor: "pointer",
              }}
            >
              delete
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
          <div style={{ flex: 1, fontFamily: PAPER_FONTS_V2.serif, fontSize: 17, lineHeight: 1.45 }}>
            {entry.raw}
          </div>
          <span
            onClick={onStartEdit}
            style={{
              fontFamily: "system-ui, sans-serif",
              fontSize: 11.5,
              color: TOKENS.faint,
              cursor: "pointer",
              flex: "none",
            }}
          >
            edit
          </span>
          <div
            style={{
              fontFamily: "system-ui, sans-serif",
              fontSize: 11.5,
              color: TOKENS.faint,
              flex: "none",
            }}
          >
            {entryWhen(entry.created_at)}
          </div>
        </div>
      )}

      {!editing && v.isPending && (
        <div
          style={{
            marginTop: 10,
            fontFamily: PAPER_FONTS_V2.mono,
            fontSize: 11,
            color: TOKENS.amber,
            animation: "pulse 1.4s infinite",
          }}
        >
          resume agent is polishing this…
        </div>
      )}

      {!editing && v.isProposed && (
        <div
          style={{
            marginTop: 12,
            background: TOKENS.cardWarm,
            border: `1px solid ${TOKENS.amberLine}`,
            borderRadius: RADII.panelTight,
            padding: "14px 16px",
          }}
        >
          <div
            style={{
              fontFamily: PAPER_FONTS_V2.mono,
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: ".08em",
              color: TOKENS.amber,
              marginBottom: 8,
            }}
          >
            RESUME-READY VERSION
          </div>
          <div
            style={{
              fontFamily: "system-ui, sans-serif",
              fontSize: 13.5,
              lineHeight: 1.55,
              color: TOKENS.ink,
            }}
          >
            {entry.bullet}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              onClick={onApprove}
              style={{
                fontFamily: "system-ui, sans-serif",
                fontSize: 12,
                fontWeight: 500,
                color: TOKENS.paper,
                background: TOKENS.ink,
                border: "none",
                borderRadius: 7,
                padding: "8px 13px",
                cursor: "pointer",
              }}
            >
              Approve
            </button>
            <button
              onClick={onKeepRaw}
              style={{
                fontFamily: "system-ui, sans-serif",
                fontSize: 12,
                fontWeight: 500,
                color: TOKENS.muted2,
                background: "transparent",
                border: `1px solid ${TOKENS.line}`,
                borderRadius: 7,
                padding: "7px 12px",
                cursor: "pointer",
              }}
            >
              Keep it raw
            </button>
          </div>
        </div>
      )}

      {!editing && v.isPolished && (
        <div
          style={{
            marginTop: 9,
            fontFamily: "system-ui, sans-serif",
            fontSize: 13,
            lineHeight: 1.55,
            color: TOKENS.muted2,
          }}
        >
          ↳ {entry.bullet}
        </div>
      )}

      {!editing && tags.length > 0 && (
        <div style={{ display: "flex", gap: 5, marginTop: 10, flexWrap: "wrap" }}>
          {tags.map((t) => (
            <span
              key={t}
              style={{
                fontFamily: PAPER_FONTS_V2.mono,
                fontSize: 10,
                fontWeight: 500,
                color: TOKENS.muted,
                background: TOKENS.chip,
                borderRadius: 4,
                padding: "4px 7px",
              }}
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
