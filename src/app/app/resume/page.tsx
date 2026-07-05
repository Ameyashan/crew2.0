"use client";

import { useCallback, useEffect, useState } from "react";
import { PAPER_FONTS_V2 } from "@/components/paper/fonts";
import { TOKENS, RADII, SHADOWS } from "@/components/paper/tokens";
import { useIsMobile } from "@/lib/use-is-mobile";
import { STORY_VIEWS, storyWhen, groupByTheme, type StoryView } from "@/lib/story/logic";
import type { StoryEntry } from "@/lib/db/schema";

// Small mono tag chip (prototype line 394).
function TagChip({ name }: { name: string }) {
  return (
    <span
      style={{
        fontFamily: PAPER_FONTS_V2.mono,
        fontWeight: 500,
        fontSize: 10,
        lineHeight: 1,
        color: TOKENS.muted,
        background: TOKENS.chip,
        borderRadius: 4,
        padding: "4px 7px",
      }}
    >
      {name}
    </span>
  );
}

export default function StoryPage() {
  const isMobile = useIsMobile();
  const [entries, setEntries] = useState<StoryEntry[] | null>(null);
  const [view, setView] = useState<StoryView>("timeline");
  const [quickAdd, setQuickAdd] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // id currently in the inline edit card + its draft text
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const load = useCallback(() => {
    return fetch("/api/story")
      .then((r) => r.json())
      .then((j) => {
        if (j.error) setError(j.error);
        else setEntries(Array.isArray(j.entries) ? j.entries : []);
      })
      .catch((e) => setError(String(e?.message || e)));
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/story")
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j.error) setError(j.error);
        else setEntries(Array.isArray(j.entries) ? j.entries : []);
      })
      .catch((e) => {
        if (alive) setError(String(e?.message || e));
      });
    return () => {
      alive = false;
    };
  }, []);

  // Replace one entry in place by id (used as polish / lifecycle calls resolve).
  const replaceEntry = useCallback((next: StoryEntry) => {
    setEntries((prev) => (prev ? prev.map((e) => (e.id === next.id ? next : e)) : prev));
  }, []);

  // Log a raw entry, then kick the résumé agent to polish it into a proposal.
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
      const j = await r.json();
      if (j.error || !j.entry) {
        setError(j.error || "couldn't add");
        return;
      }
      const created = j.entry as StoryEntry;
      setEntries((prev) => [created, ...(prev ?? [])]);
      setQuickAdd("");
      polish(created.id);
    } catch (e) {
      setError(String((e as Error)?.message || e));
    } finally {
      setAdding(false);
    }
  }

  // Run the polish pass; on success the entry becomes `proposed`. On failure we
  // settle it to `raw` so it doesn't pulse "polishing…" forever.
  const polish = useCallback(
    async (id: string) => {
      try {
        const r = await fetch(`/api/story/${id}/polish`, { method: "POST" });
        const j = await r.json();
        if (j?.entry) replaceEntry(j.entry as StoryEntry);
        else throw new Error(j?.error || "polish failed");
      } catch {
        try {
          const r = await fetch(`/api/story/${id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "keep_raw" }),
          });
          const j = await r.json();
          if (j?.entry) replaceEntry(j.entry as StoryEntry);
        } catch {
          /* leave as-is; a reload will re-read server state */
        }
      }
    },
    [replaceEntry],
  );

  async function patchEntry(id: string, body: Record<string, unknown>) {
    const r = await fetch(`/api/story/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (j?.entry) replaceEntry(j.entry as StoryEntry);
    return j;
  }

  async function saveEdit(id: string) {
    const raw = editText.trim();
    if (!raw) return;
    await patchEntry(id, { raw });
    setEditingId(null);
  }

  async function deleteEntry(id: string) {
    setEntries((prev) => (prev ? prev.filter((e) => e.id !== id) : prev));
    setEditingId(null);
    try {
      await fetch(`/api/story/${id}`, { method: "DELETE" });
    } catch {
      load(); // resync if the delete didn't land
    }
  }

  function startEdit(e: StoryEntry) {
    setEditingId(e.id);
    setEditText(e.raw);
  }

  const total = entries?.length ?? 0;

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
      }}
    >
      {/* Header + segmented toggle */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, marginBottom: 8 }}>
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
          Your Story
        </div>
        <div style={{ display: "flex", gap: 2, background: TOKENS.chip, borderRadius: RADII.pill, padding: 3 }}>
          {STORY_VIEWS.map((v) => {
            const active = view === v.id;
            return (
              <span
                key={v.id}
                role="button"
                tabIndex={0}
                onClick={() => setView(v.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setView(v.id);
                  }
                }}
                style={{
                  fontFamily: "system-ui, sans-serif",
                  fontWeight: 500,
                  fontSize: 12,
                  lineHeight: 1,
                  padding: "7px 14px",
                  borderRadius: RADII.pill,
                  cursor: "pointer",
                  color: active ? TOKENS.ink : TOKENS.muted,
                  background: active ? TOKENS.card : "transparent",
                }}
              >
                {v.label}
              </span>
            );
          })}
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
        The living record behind every resume. Write it raw — the crew polishes each entry into resume-ready lines you
        approve.
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
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
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
          <span
            role="button"
            tabIndex={0}
            aria-disabled={adding || !quickAdd.trim()}
            onClick={addEntry}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                addEntry();
              }
            }}
            style={{
              fontFamily: "system-ui, sans-serif",
              fontWeight: 500,
              fontSize: 12,
              lineHeight: 1,
              color: TOKENS.paper,
              background: TOKENS.ink,
              borderRadius: RADII.buttonTight,
              padding: "9px 14px",
              cursor: adding || !quickAdd.trim() ? "default" : "pointer",
              opacity: adding || !quickAdd.trim() ? 0.5 : 1,
            }}
          >
            {adding ? "Adding…" : "Add to Story"}
          </span>
        </div>
      </div>

      {error && (
        <div
          style={{
            fontFamily: PAPER_FONTS_V2.mono,
            fontSize: 12,
            color: TOKENS.red,
            border: `1px solid ${TOKENS.red}`,
            borderRadius: RADII.panelTight,
            padding: "8px 12px",
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {entries === null ? (
        <div style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 13, color: TOKENS.muted }}>Loading your Story…</div>
      ) : total === 0 ? (
        <div
          style={{
            padding: "40px 32px",
            textAlign: "center",
            border: `1px dashed ${TOKENS.dashed}`,
            borderRadius: RADII.card,
          }}
        >
          <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 22, color: TOKENS.ink, lineHeight: 1.2 }}>
            Your Story is empty
          </div>
          <p
            style={{
              margin: "8px auto 0",
              maxWidth: 420,
              fontFamily: PAPER_FONTS_V2.serif,
              fontStyle: "italic",
              fontSize: 15,
              color: TOKENS.inkSoft,
              lineHeight: 1.5,
            }}
          >
            Log what you shipped above, or upload a resume in Settings and the crew will fill this in for you.
          </p>
        </div>
      ) : view === "timeline" ? (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {entries.map((e) => (
            <div key={e.id} style={{ borderTop: `1px solid ${TOKENS.lineRow}`, padding: "20px 0", animation: "fadeUp .3s ease" }}>
              {editingId === e.id ? (
                <div style={{ background: TOKENS.card, border: `1px solid ${TOKENS.line}`, borderRadius: RADII.panelTight, padding: "14px 16px" }}>
                  <textarea
                    value={editText}
                    onChange={(ev) => setEditText(ev.target.value)}
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
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={() => saveEdit(e.id)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          saveEdit(e.id);
                        }
                      }}
                      style={{ fontFamily: "system-ui, sans-serif", fontWeight: 500, fontSize: 12, color: TOKENS.paper, background: TOKENS.ink, borderRadius: 7, padding: "8px 13px", cursor: "pointer" }}
                    >
                      Save
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={() => setEditingId(null)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          setEditingId(null);
                        }
                      }}
                      style={{ fontFamily: "system-ui, sans-serif", fontWeight: 500, fontSize: 12, color: TOKENS.muted2, border: `1px solid ${TOKENS.line}`, borderRadius: 7, padding: "7px 12px", cursor: "pointer" }}
                    >
                      Cancel
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={() => deleteEntry(e.id)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          deleteEntry(e.id);
                        }
                      }}
                      style={{ marginLeft: "auto", fontFamily: "system-ui, sans-serif", fontSize: 12, color: TOKENS.red, cursor: "pointer" }}
                    >
                      delete
                    </span>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
                  <div style={{ flex: 1, fontFamily: PAPER_FONTS_V2.serif, fontSize: 17, lineHeight: 1.45, color: TOKENS.ink }}>
                    {e.raw}
                  </div>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={() => startEdit(e)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        startEdit(e);
                      }
                    }}
                    style={{ fontFamily: "system-ui, sans-serif", fontSize: 11.5, color: TOKENS.faint, cursor: "pointer", flex: "none" }}
                  >
                    edit
                  </span>
                  <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 11.5, color: TOKENS.faint, flex: "none" }}>
                    {storyWhen(e.created_at)}
                  </div>
                </div>
              )}

              {e.status === "pending" && (
                <div style={{ marginTop: 10, fontFamily: PAPER_FONTS_V2.mono, fontWeight: 500, fontSize: 11, lineHeight: 1, color: TOKENS.amber, animation: "pulse 1.4s infinite" }}>
                  resume agent is polishing this…
                </div>
              )}

              {e.status === "proposed" && e.bullet && (
                <div style={{ marginTop: 12, background: TOKENS.cardWarm, border: `1px solid ${TOKENS.amberLine}`, borderRadius: RADII.panelTight, padding: "14px 16px" }}>
                  <div style={{ fontFamily: PAPER_FONTS_V2.mono, fontWeight: 500, fontSize: 10, lineHeight: 1, letterSpacing: ".08em", color: TOKENS.amber, marginBottom: 8 }}>
                    RESUME-READY VERSION
                  </div>
                  <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 13.5, lineHeight: 1.55, color: TOKENS.ink }}>{e.bullet}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={() => patchEntry(e.id, { action: "approve" })}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          patchEntry(e.id, { action: "approve" });
                        }
                      }}
                      style={{ fontFamily: "system-ui, sans-serif", fontWeight: 500, fontSize: 12, color: TOKENS.paper, background: TOKENS.ink, borderRadius: 7, padding: "8px 13px", cursor: "pointer" }}
                    >
                      Approve
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={() => patchEntry(e.id, { action: "keep_raw" })}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          patchEntry(e.id, { action: "keep_raw" });
                        }
                      }}
                      style={{ fontFamily: "system-ui, sans-serif", fontWeight: 500, fontSize: 12, color: TOKENS.muted2, border: `1px solid ${TOKENS.line}`, borderRadius: 7, padding: "7px 12px", cursor: "pointer" }}
                    >
                      Keep it raw
                    </span>
                  </div>
                </div>
              )}

              {e.status === "polished" && e.bullet && (
                <div style={{ marginTop: 9, fontFamily: "system-ui, sans-serif", fontSize: 13, lineHeight: 1.55, color: TOKENS.muted2 }}>↳ {e.bullet}</div>
              )}

              {e.tags.length > 0 && (
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 10 }}>
                  {e.tags.map((t) => (
                    <TagChip key={t} name={t} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        // By theme
        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          {groupByTheme(entries).map((theme) => (
            <div key={theme.name}>
              <div
                style={{
                  fontFamily: "system-ui, sans-serif",
                  fontWeight: 500,
                  fontSize: 11,
                  lineHeight: 1,
                  letterSpacing: ".12em",
                  textTransform: "uppercase",
                  color: TOKENS.faint,
                  marginBottom: 10,
                }}
              >
                {theme.name}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {theme.items.map((e) => (
                  <div key={e.id} style={{ background: TOKENS.card, border: `1px solid ${TOKENS.lineSoft}`, borderRadius: RADII.panelTight, padding: "14px 18px" }}>
                    <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 15, lineHeight: 1.45, color: TOKENS.ink }}>{e.raw}</div>
                    {(e.status === "polished" || e.status === "proposed") && e.bullet && (
                      <div style={{ marginTop: 6, fontFamily: "system-ui, sans-serif", fontSize: 12.5, lineHeight: 1.5, color: TOKENS.muted }}>↳ {e.bullet}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
