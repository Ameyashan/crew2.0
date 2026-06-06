// @ts-nocheck — Settings v3 page (paper-craft port + real wiring)
"use client";

import { useEffect, useState } from "react";
import { PAPER_FONTS } from "@/components/paper/fonts";
import { usePaperTheme } from "@/components/paper/use-paper-theme";
import {
  Eyebrow,
  InkButton,
  PageHead,
  PaperCard,
} from "@/components/paper/primitives";
import { useIsMobile } from "@/lib/use-is-mobile";

const FOLLOWUP_OPTIONS = [
  { label: "3d", days: 3 },
  { label: "5d", days: 5 },
  { label: "7d", days: 7 },
  { label: "10d", days: 10 },
  { label: "never", days: 0 },
];

function daysToLabel(d) {
  if (d == null) return "5d";
  if (d === 0) return "never";
  const match = FOLLOWUP_OPTIONS.find((o) => o.days === d);
  return match?.label ?? `${d}d`;
}

// writing_samples is a `text` column, so an array written at onboarding comes
// back as a JSON-encoded string. Normalize to an array of non-empty samples.
function parseWritingSamples(raw) {
  if (Array.isArray(raw)) return raw.filter((s) => typeof s === "string" && s.trim());
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((s) => typeof s === "string" && s.trim());
    } catch {
      // not JSON — treat the whole string as a single sample
    }
    return [raw];
  }
  return [];
}

// Pull the handle out of a stored LinkedIn URL (or accept a bare handle / URL).
function linkedinHandle(url) {
  if (!url) return "";
  const m = String(url).match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (m) return m[1];
  return String(url).replace(/^https?:\/\//, "").replace(/^www\./, "");
}

function SettingsV3({ p, t, setTweak, profile, saveProfile, reloadProfile }) {
  const isMobile = useIsMobile();
  const [savingFollowup, setSavingFollowup] = useState(false);
  const [editing, setEditing] = useState(null); // resume | linkedin | writing | goals
  const followupLabel = daysToLabel(profile?.followup_days);

  async function pickFollowup(label) {
    const opt = FOLLOWUP_OPTIONS.find((o) => o.label === label);
    if (!opt) return;
    setTweak("followup", label);
    setSavingFollowup(true);
    try {
      await saveProfile({ followup_days: opt.days });
    } finally {
      setSavingFollowup(false);
    }
  }

  const samples = parseWritingSamples(profile?.writing_samples);
  const connected = [
    {
      key: "resume",
      name: "Resume",
      sub: profile?.resume_filename
        ? `${profile.resume_filename}${profile.resume_text ? ` · ${profile.resume_text.length.toLocaleString()} chars` : ""}`
        : "Not yet uploaded",
      on: !!profile?.resume_text,
    },
    {
      key: "linkedin",
      name: "LinkedIn",
      sub: profile?.linkedin_url || "Not yet linked",
      on: !!profile?.linkedin_url,
    },
    {
      key: "writing",
      name: "Writing voice",
      sub: samples.length
        ? `${samples.length} sample${samples.length === 1 ? "" : "s"} learned`
        : "No samples on file yet",
      on: samples.length > 0,
    },
    {
      key: "goals",
      name: "Goals summary",
      sub: profile?.context_prompt
        ? `~ ${Math.round((profile.context_prompt.length || 0) / 5)} word self-summary on file`
        : "No goals summary yet",
      on: !!profile?.context_prompt,
    },
  ];

  return (
    <div className="scroll" style={{ flex: 1, overflow: "auto", padding: isMobile ? "24px 16px 64px" : "48px 56px 80px" }}>
      <PageHead
        p={p}
        eyebrow="Settings · you"
        title="Your crew,"
        italic="set up just for you."
        sub="The defaults shape every draft Jugaadu sends. Change anything; it takes effect from your next message."
      />
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12, marginTop: 8 }}>
        <PaperCard p={p} color={p.marigold} hardShadow>
          <Eyebrow p={p} en="Theme" />
          <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 22, marginTop: 4, marginBottom: 14 }}>
            Paper or ink mode
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { v: false, label: "Paper", sub: "cream · daylight" },
              { v: true, label: "Ink", sub: "midnight · for late nights" },
            ].map((o) => {
              const active = !!t.dark === o.v;
              return (
                <button
                  key={o.label}
                  onClick={() => setTweak("dark", o.v)}
                  style={{
                    flex: 1,
                    padding: "14px 14px",
                    textAlign: "left",
                    background: active ? p.ink : "transparent",
                    color: active ? p.paper : p.ink,
                    border: `2px solid ${p.ink}`,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 19 }}>{o.label}</div>
                  <div
                    style={{
                      fontFamily: PAPER_FONTS.mono,
                      fontSize: 10.5,
                      letterSpacing: ".06em",
                      opacity: 0.7,
                      marginTop: 2,
                    }}
                  >
                    {o.sub}
                  </div>
                </button>
              );
            })}
          </div>
        </PaperCard>

        <PaperCard p={p} color={p.leaf} hardShadow>
          <Eyebrow p={p} en="Followups" />
          <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 22, marginTop: 4, marginBottom: 10 }}>
            Nudge cadence{" "}
            {savingFollowup && (
              <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.inkMute }}>· saving</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {FOLLOWUP_OPTIONS.map((opt) => {
              const active = followupLabel === opt.label;
              return (
                <button
                  key={opt.label}
                  onClick={() => pickFollowup(opt.label)}
                  style={{
                    padding: "7px 14px",
                    fontFamily: PAPER_FONTS.mono,
                    fontSize: 13,
                    background: active ? p.ink : "transparent",
                    color: active ? p.paper : p.ink,
                    border: `1.5px solid ${p.ink}`,
                    cursor: "pointer",
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </PaperCard>

        <PaperCard p={p} color={p.tea} hardShadow style={{ gridColumn: "1 / -1" }}>
          <Eyebrow p={p} en="Connected" />
          <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 22, marginTop: 4, marginBottom: 4 }}>
            What Jugaadu reads
          </div>
          <p style={{ margin: "0 0 12px", fontFamily: PAPER_FONTS.serif, fontStyle: "italic", fontSize: 14, color: p.inkSoft }}>
            Update any of these whenever you like — changes apply to your next draft.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {connected.map((item) => (
              <ConnectedRow
                key={item.key}
                p={p}
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
        </PaperCard>
      </div>
    </div>
  );
}

function ConnectedRow({ p, item, open, onToggle, onClose, profile, saveProfile, reloadProfile }) {
  const { name, sub, on } = item;
  return (
    <div style={{ border: `1px solid ${p.ink}24` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px" }}>
        <span
          style={{
            width: 14,
            height: 14,
            background: on ? p.leaf : "transparent",
            border: `1px solid ${p.ink}`,
            display: "grid",
            placeItems: "center",
            color: p.paper,
            fontSize: 10,
            flexShrink: 0,
          }}
        >
          {on ? "✓" : ""}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: PAPER_FONTS.sans, fontSize: 13.5, color: p.ink }}>{name}</div>
          <div
            style={{
              fontFamily: PAPER_FONTS.mono,
              fontSize: 11,
              color: p.inkMute,
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
            padding: "5px 12px",
            fontFamily: PAPER_FONTS.mono,
            fontSize: 11,
            letterSpacing: ".06em",
            textTransform: "uppercase",
            background: open ? p.ink : "transparent",
            color: open ? p.paper : p.ink,
            border: `1.5px solid ${p.ink}`,
            cursor: "pointer",
          }}
        >
          {open ? "Close" : on ? "Update" : "Add"}
        </button>
      </div>
      {open && (
        <div style={{ padding: "12px 12px 14px", borderTop: `1px solid ${p.ink}14` }}>
          {item.key === "resume" && (
            <ResumeEditor p={p} reloadProfile={reloadProfile} onClose={onClose} />
          )}
          {item.key === "linkedin" && (
            <LinkedInEditor p={p} profile={profile} saveProfile={saveProfile} onClose={onClose} />
          )}
          {item.key === "writing" && (
            <WritingEditor p={p} profile={profile} saveProfile={saveProfile} onClose={onClose} />
          )}
          {item.key === "goals" && (
            <GoalsEditor p={p} profile={profile} saveProfile={saveProfile} onClose={onClose} />
          )}
        </div>
      )}
    </div>
  );
}

function EditorActions({ p, saving, onSave, onClose, saveLabel = "Save" }) {
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
      <InkButton p={p} size="sm" color={p.leaf} disabled={saving} onClick={onSave}>
        {saving ? "Saving…" : saveLabel}
      </InkButton>
      <InkButton p={p} kind="outline" size="sm" disabled={saving} onClick={onClose}>
        Cancel
      </InkButton>
    </div>
  );
}

function ResumeEditor({ p, reloadProfile, onClose }) {
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
          background: p.paper,
          border: `1.5px dashed ${p.ink}40`,
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
            border: `1.5px solid ${p.ink}`,
            borderRadius: 999,
            flexShrink: 0,
          }}
        >
          {uploading ? "…" : "↑"}
        </span>
        <div>
          <div style={{ fontFamily: PAPER_FONTS.sans, fontSize: 13.5, color: p.ink }}>
            {uploading ? "Parsing…" : "Click to upload a new resume"}
          </div>
          <div
            style={{
              fontFamily: PAPER_FONTS.mono,
              fontSize: 11,
              color: error ? p.stamp : p.inkMute,
              marginTop: 2,
            }}
          >
            {error || "PDF, DOCX, TXT · replaces what's on file"}
          </div>
        </div>
      </label>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <InkButton p={p} kind="outline" size="sm" disabled={uploading} onClick={onClose}>
          Done
        </InkButton>
      </div>
    </div>
  );
}

function LinkedInEditor({ p, profile, saveProfile, onClose }) {
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
          background: p.paper,
          border: `1.5px solid ${handle.trim() ? p.stamp : p.ink + "40"}`,
        }}
      >
        <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 13, color: p.inkMute }}>linkedin.com/in/</span>
        <input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="ameya-shanbhag"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: p.ink,
            fontFamily: PAPER_FONTS.mono,
            fontSize: 14,
          }}
        />
      </div>
      <EditorActions p={p} saving={saving} onSave={save} onClose={onClose} />
    </div>
  );
}

function WritingEditor({ p, profile, saveProfile, onClose }) {
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
            background: p.paper,
            border: `1.5px solid ${p.leaf}`,
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
          }}
        >
          <span
            style={{
              fontFamily: PAPER_FONTS.mono,
              fontSize: 10,
              color: p.leaf,
              letterSpacing: ".1em",
              flexShrink: 0,
              marginTop: 2,
            }}
          >
            #{String(i + 1).padStart(2, "0")}
          </span>
          <span style={{ flex: 1, fontFamily: PAPER_FONTS.serif, fontStyle: "italic", fontSize: 14, lineHeight: 1.5, color: p.ink }}>
            &quot;{s}&quot;
          </span>
          <button
            onClick={() => setSamples(samples.filter((_, j) => j !== i))}
            style={{ background: "transparent", border: "none", color: p.inkMute, fontSize: 16, cursor: "pointer", padding: 0, lineHeight: 1 }}
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
              background: p.paper,
              color: p.ink,
              border: `1.5px solid ${p.ink}30`,
              fontFamily: PAPER_FONTS.sans,
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
                background: draft.trim() ? p.ink : "transparent",
                color: draft.trim() ? p.paper : p.inkMute,
                border: `1.5px solid ${p.ink}`,
                fontFamily: PAPER_FONTS.mono,
                fontSize: 12,
                cursor: draft.trim() ? "pointer" : "not-allowed",
              }}
            >
              + add sample
            </button>
          </div>
        </>
      )}
      <EditorActions p={p} saving={saving} onSave={save} onClose={onClose} />
    </div>
  );
}

function GoalsEditor({ p, profile, saveProfile, onClose }) {
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
          background: p.paper,
          color: p.ink,
          border: `1.5px solid ${text.trim() ? p.tea : p.ink + "30"}`,
          fontFamily: PAPER_FONTS.sans,
          fontSize: 13.5,
          lineHeight: 1.5,
          outline: "none",
          minHeight: 120,
        }}
      />
      <EditorActions p={p} saving={saving} onSave={save} onClose={onClose} />
    </div>
  );
}

export default function SettingsPage() {
  const { p, t, setTweak } = usePaperTheme();
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    fetch("/api/profile").then((r) => r.json()).then((j) => setProfile(j?.profile ?? null)).catch(() => {});
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
    <SettingsV3
      p={p}
      t={t}
      setTweak={setTweak}
      profile={profile}
      saveProfile={saveProfile}
      reloadProfile={reloadProfile}
    />
  );
}
