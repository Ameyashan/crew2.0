// @ts-nocheck — Settings page (jugaadu reskin + real wiring)
"use client";

import { useEffect, useState } from "react";
import { PAPER_FONTS_V2 } from "@/components/paper/fonts";
import { TOKENS, RADII, SHADOWS } from "@/components/paper/tokens";
import {
  FOLLOWUP_OPTIONS,
  daysToFollowupLabel,
  followupLabelToDays,
  parseWritingSamples,
  linkedinHandle,
  deriveConnectedRows,
} from "@/components/paper/phase5-logic";
import { useIsMobile } from "@/lib/use-is-mobile";

// Uppercase IBM Plex Mono section label.
function MonoLabel({ children, color = TOKENS.muted, size = 10.5, style }) {
  return (
    <span
      style={{
        fontFamily: PAPER_FONTS_V2.mono,
        fontSize: size,
        fontWeight: 500,
        letterSpacing: ".12em",
        textTransform: "uppercase",
        color,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// White soft-shadow card surface.
function Card({ children, style }) {
  return (
    <div
      style={{
        background: TOKENS.card,
        color: TOKENS.ink,
        border: `1px solid ${TOKENS.lineSoft}`,
        borderRadius: RADII.card,
        boxShadow: SHADOWS.card,
        padding: "20px 22px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// Ink solid / outline button.
function InkButton({ children, onClick, kind = "solid", disabled, style }) {
  const solid = kind === "solid";
  const outline = kind === "outline";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: solid ? TOKENS.ink : "transparent",
        color: solid ? TOKENS.paper : TOKENS.ink,
        border: outline ? `1px solid ${TOKENS.faint}` : "1px solid transparent",
        borderRadius: RADII.buttonTight,
        padding: "7px 14px",
        fontFamily: PAPER_FONTS_V2.sans,
        fontSize: 13,
        fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        transition: "background .15s, border-color .15s",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function SettingsV3({ profile, saveProfile, reloadProfile }) {
  const isMobile = useIsMobile();
  const [savingFollowup, setSavingFollowup] = useState(false);
  const [editing, setEditing] = useState(null); // resume | linkedin | writing | goals
  const followupLabel = daysToFollowupLabel(profile?.followup_days);

  async function pickFollowup(label) {
    const days = followupLabelToDays(label);
    if (days == null) return;
    setSavingFollowup(true);
    try {
      await saveProfile({ followup_days: days });
    } finally {
      setSavingFollowup(false);
    }
  }

  const connected = deriveConnectedRows(profile);

  return (
    <div
      className="scroll"
      style={{
        flex: 1,
        overflow: "auto",
        padding: isMobile ? "24px 16px 64px" : "48px 56px 80px",
        background: TOKENS.paper,
        color: TOKENS.ink,
      }}
    >
      {/* Page header */}
      <div style={{ marginBottom: 22 }}>
        <MonoLabel>Settings · you</MonoLabel>
        <h1
          style={{
            margin: "8px 0 0",
            fontFamily: PAPER_FONTS_V2.serif,
            fontWeight: 400,
            fontSize: isMobile ? 30 : 34,
            lineHeight: 1.05,
            letterSpacing: "-.01em",
            color: TOKENS.ink,
          }}
        >
          Your crew,{" "}
          <span style={{ fontStyle: "italic", color: TOKENS.muted2 }}>set up just for you.</span>
        </h1>
        <p
          style={{
            margin: "10px 0 0",
            fontFamily: PAPER_FONTS_V2.serif,
            fontStyle: "italic",
            fontSize: 15.5,
            lineHeight: 1.5,
            color: TOKENS.muted,
            maxWidth: 560,
          }}
        >
          The defaults shape every draft Jugaadu sends. Change anything; it takes effect from your
          next message.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: 14,
        }}
      >
        <Card>
          <div
            style={{
              fontFamily: PAPER_FONTS_V2.serif,
              fontSize: 20,
              marginBottom: 12,
              color: TOKENS.ink,
            }}
          >
            Nudge cadence{" "}
            {savingFollowup && (
              <span style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 11, color: TOKENS.muted }}>
                · saving
              </span>
            )}
          </div>
          <p
            style={{
              margin: "0 0 12px",
              fontFamily: PAPER_FONTS_V2.serif,
              fontStyle: "italic",
              fontSize: 14,
              color: TOKENS.muted,
            }}
          >
            When someone doesn&apos;t reply, when should Jugaadu nudge?
          </p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {FOLLOWUP_OPTIONS.map((opt) => {
              const active = followupLabel === opt.label;
              return (
                <button
                  key={opt.label}
                  onClick={() => pickFollowup(opt.label)}
                  style={{
                    padding: "7px 14px",
                    fontFamily: PAPER_FONTS_V2.mono,
                    fontSize: 13,
                    borderRadius: RADII.pill,
                    background: active ? TOKENS.ink : "transparent",
                    color: active ? TOKENS.paper : TOKENS.ink,
                    border: `1px solid ${active ? TOKENS.ink : TOKENS.line}`,
                    cursor: "pointer",
                    transition: "background .15s, border-color .15s",
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </Card>

        <Card style={{ gridColumn: isMobile ? undefined : "1 / -1" }}>
          <div
            style={{
              fontFamily: PAPER_FONTS_V2.serif,
              fontSize: 20,
              marginBottom: 4,
              color: TOKENS.ink,
            }}
          >
            What Jugaadu reads
          </div>
          <p
            style={{
              margin: "0 0 14px",
              fontFamily: PAPER_FONTS_V2.serif,
              fontStyle: "italic",
              fontSize: 14,
              color: TOKENS.muted,
            }}
          >
            Update any of these whenever you like — changes apply to your next draft.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {connected.map((item) => (
              <ConnectedRow
                key={item.key}
                item={item}
                open={editing === item.key}
                onToggle={() => setEditing(editing === item.key ? null : item.key)}
                onClose={() => setEditing(null)}
                profile={profile}
                saveProfile={saveProfile}
                reloadProfile={reloadProfile}
              />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function ConnectedRow({ item, open, onToggle, onClose, profile, saveProfile, reloadProfile }) {
  const { name, sub, on } = item;
  return (
    <div
      style={{
        border: `1px solid ${TOKENS.lineInset}`,
        borderRadius: RADII.panelTight,
        background: TOKENS.cardWarm,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px" }}>
        <span
          style={{
            width: 16,
            height: 16,
            background: on ? TOKENS.green : "transparent",
            border: `1px solid ${on ? TOKENS.green : TOKENS.line}`,
            borderRadius: 5,
            display: "grid",
            placeItems: "center",
            color: TOKENS.paper,
            fontSize: 10,
            flexShrink: 0,
          }}
        >
          {on ? "✓" : ""}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 13.5, color: TOKENS.ink }}>
            {name}
          </div>
          <div
            style={{
              fontFamily: PAPER_FONTS_V2.mono,
              fontSize: 11,
              color: TOKENS.muted,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {sub}
          </div>
        </div>
        <button
          onClick={onToggle}
          style={{
            flexShrink: 0,
            padding: "6px 12px",
            borderRadius: RADII.buttonTight,
            background: open ? TOKENS.ink : "transparent",
            color: open ? TOKENS.paper : TOKENS.ink,
            border: `1px solid ${open ? TOKENS.ink : TOKENS.line}`,
            cursor: "pointer",
            fontFamily: PAPER_FONTS_V2.mono,
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: ".1em",
            textTransform: "uppercase",
          }}
        >
          {open ? "Close" : on ? "Update" : "Add"}
        </button>
      </div>
      {open && (
        <div style={{ padding: "12px 12px 14px", borderTop: `1px solid ${TOKENS.lineInset}` }}>
          {item.key === "resume" && <ResumeEditor reloadProfile={reloadProfile} onClose={onClose} />}
          {item.key === "linkedin" && (
            <LinkedInEditor profile={profile} saveProfile={saveProfile} onClose={onClose} />
          )}
          {item.key === "writing" && (
            <WritingEditor profile={profile} saveProfile={saveProfile} onClose={onClose} />
          )}
          {item.key === "goals" && (
            <GoalsEditor profile={profile} saveProfile={saveProfile} onClose={onClose} />
          )}
        </div>
      )}
    </div>
  );
}

function EditorActions({ saving, onSave, onClose, saveLabel = "Save" }) {
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
      <InkButton disabled={saving} onClick={onSave}>
        {saving ? "Saving…" : saveLabel}
      </InkButton>
      <InkButton kind="outline" disabled={saving} onClick={onClose}>
        Cancel
      </InkButton>
    </div>
  );
}

function ResumeEditor({ reloadProfile, onClose }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  async function handleFile(file) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/profile/resume", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `upload failed: ${res.status}`);
      await reloadProfile();
      onClose();
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 16px",
          background: TOKENS.card,
          border: `1px dashed ${TOKENS.dashed}`,
          borderRadius: RADII.panelTight,
          cursor: uploading ? "wait" : "pointer",
        }}
      >
        <input
          type="file"
          accept=".pdf,.docx,.txt"
          style={{ display: "none" }}
          disabled={uploading}
          onChange={(e) => handleFile(e.target.files?.[0])}
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
            color: TOKENS.ink,
          }}
        >
          {uploading ? "…" : "↑"}
        </span>
        <div>
          <div style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 13.5, color: TOKENS.ink }}>
            {uploading ? "Parsing…" : "Click to upload a new resume"}
          </div>
          <div
            style={{
              fontFamily: PAPER_FONTS_V2.mono,
              fontSize: 11,
              color: error ? TOKENS.red : TOKENS.muted,
              marginTop: 2,
            }}
          >
            {error || "PDF, DOCX, TXT · replaces what's on file"}
          </div>
        </div>
      </label>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <InkButton kind="outline" disabled={uploading} onClick={onClose}>
          Done
        </InkButton>
      </div>
    </div>
  );
}

function LinkedInEditor({ profile, saveProfile, onClose }) {
  const [handle, setHandle] = useState(() => linkedinHandle(profile?.linkedin_url));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const cleaned = linkedinHandle(handle.trim());
      await saveProfile({ linkedin_url: cleaned ? `https://linkedin.com/in/${cleaned}` : null });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "11px 14px",
          background: TOKENS.card,
          border: `1px solid ${handle.trim() ? TOKENS.green : TOKENS.line}`,
          borderRadius: RADII.panelTight,
        }}
      >
        <span style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 13, color: TOKENS.muted }}>
          linkedin.com/in/
        </span>
        <input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="ameya-shanbhag"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: TOKENS.ink,
            fontFamily: PAPER_FONTS_V2.mono,
            fontSize: 14,
          }}
        />
      </div>
      <EditorActions saving={saving} onSave={save} onClose={onClose} />
    </div>
  );
}

function WritingEditor({ profile, saveProfile, onClose }) {
  const [samples, setSamples] = useState(() => parseWritingSamples(profile?.writing_samples));
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  function add() {
    const v = draft.trim();
    if (!v || samples.length >= 3) return;
    setSamples([...samples, v]);
    setDraft("");
  }

  async function save() {
    setSaving(true);
    try {
      await saveProfile({ writing_samples: samples.length ? samples : null });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {samples.map((s, i) => (
        <div
          key={i}
          style={{
            padding: "10px 12px",
            background: TOKENS.card,
            border: `1px solid ${TOKENS.green}`,
            borderRadius: RADII.panelTight,
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
          }}
        >
          <span
            style={{
              fontFamily: PAPER_FONTS_V2.mono,
              fontSize: 10,
              color: TOKENS.green,
              letterSpacing: ".1em",
              flexShrink: 0,
              marginTop: 2,
            }}
          >
            #{String(i + 1).padStart(2, "0")}
          </span>
          <span
            style={{
              flex: 1,
              fontFamily: PAPER_FONTS_V2.serif,
              fontStyle: "italic",
              fontSize: 14,
              lineHeight: 1.5,
              color: TOKENS.ink,
            }}
          >
            &quot;{s}&quot;
          </span>
          <button
            onClick={() => setSamples(samples.filter((_, j) => j !== i))}
            style={{
              background: "transparent",
              border: "none",
              color: TOKENS.muted,
              fontSize: 16,
              cursor: "pointer",
              padding: 0,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      ))}
      {samples.length < 3 && (
        <>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Paste a real email, DM, or post you've sent."
            rows={3}
            style={{
              width: "100%",
              resize: "vertical",
              padding: "11px 14px",
              background: TOKENS.card,
              color: TOKENS.ink,
              border: `1px solid ${TOKENS.line}`,
              borderRadius: RADII.panelTight,
              fontFamily: PAPER_FONTS_V2.sans,
              fontSize: 13.5,
              lineHeight: 1.5,
              outline: "none",
            }}
          />
          <div>
            <button
              onClick={add}
              disabled={!draft.trim()}
              style={{
                padding: "7px 14px",
                background: draft.trim() ? TOKENS.ink : "transparent",
                color: draft.trim() ? TOKENS.paper : TOKENS.muted,
                border: `1px solid ${draft.trim() ? TOKENS.ink : TOKENS.line}`,
                borderRadius: RADII.buttonTight,
                fontFamily: PAPER_FONTS_V2.mono,
                fontSize: 12,
                cursor: draft.trim() ? "pointer" : "not-allowed",
              }}
            >
              + add sample
            </button>
          </div>
        </>
      )}
      <EditorActions saving={saving} onSave={save} onClose={onClose} />
    </div>
  );
}

function GoalsEditor({ profile, saveProfile, onClose }) {
  const [text, setText] = useState(profile?.context_prompt ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await saveProfile({ context_prompt: text.trim() || null });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste a short self-summary: who you are, what you're looking for, and how you like to communicate."
        rows={7}
        style={{
          width: "100%",
          resize: "vertical",
          padding: "12px 14px",
          background: TOKENS.card,
          color: TOKENS.ink,
          border: `1px solid ${text.trim() ? TOKENS.muted2 : TOKENS.line}`,
          borderRadius: RADII.panelTight,
          fontFamily: PAPER_FONTS_V2.sans,
          fontSize: 13.5,
          lineHeight: 1.5,
          outline: "none",
          minHeight: 120,
        }}
      />
      <EditorActions saving={saving} onSave={save} onClose={onClose} />
    </div>
  );
}

export default function SettingsPage() {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((j) => setProfile(j?.profile ?? null))
      .catch(() => {});
  }, []);

  async function reloadProfile() {
    try {
      const j = await fetch("/api/profile").then((r) => r.json());
      setProfile(j?.profile ?? null);
    } catch {
      // keep current state on failure
    }
  }

  async function saveProfile(patch) {
    const next = { ...(profile || {}), ...patch };
    setProfile(next);
    try {
      await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
    } catch {
      // optimistic — silently swallow
    }
  }

  return (
    <SettingsV3 profile={profile} saveProfile={saveProfile} reloadProfile={reloadProfile} />
  );
}
