// @ts-nocheck — Settings v3 page (paper-craft port + real wiring)
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PAPER_FONTS } from "@/components/paper/fonts";
import { usePaperTheme } from "@/components/paper/use-paper-theme";
import {
  Eyebrow,
  InkButton,
  PageHead,
  PaperCard,
} from "@/components/paper/primitives";

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

function SettingsV3({ p, t, setTweak, profile, saveProfile, onBack }) {
  const [savingFollowup, setSavingFollowup] = useState(false);
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

  const connected = [
    {
      name: "Resume",
      sub: profile?.resume_filename
        ? `${profile.resume_filename}${profile.resume_text ? ` · ${profile.resume_text.length.toLocaleString()} chars` : ""}`
        : "Not yet uploaded",
      on: !!profile?.resume_text,
    },
    {
      name: "LinkedIn",
      sub: profile?.linkedin_url || "Not yet linked",
      on: !!profile?.linkedin_url,
    },
    {
      name: "Writing voice",
      sub: profile?.writing_samples
        ? `${Array.isArray(profile.writing_samples) ? profile.writing_samples.length : 0} samples learned`
        : "No samples on file yet",
      on: Array.isArray(profile?.writing_samples) && profile.writing_samples.length > 0,
    },
    {
      name: "Goals summary",
      sub: profile?.context_prompt
        ? `~ ${Math.round((profile.context_prompt.length || 0) / 5)} word self-summary on file`
        : "No goals summary yet",
      on: !!profile?.context_prompt,
    },
  ];

  return (
    <div className="scroll" style={{ flex: 1, overflow: "auto", padding: "48px 56px 80px" }}>
      <PageHead
        p={p}
        eyebrow="Settings · you"
        title="Your crew,"
        italic="set up just for you."
        sub="The defaults shape every draft Crew sends. Change anything; it takes effect from your next message."
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
        <PaperCard p={p} color={p.marigold} hardShadow>
          <Eyebrow p={p} hindi="रंग" en="Theme" />
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

        <PaperCard p={p} color={p.stamp} hardShadow>
          <Eyebrow p={p} hindi="कौन" en="Voice" />
          <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 22, marginTop: 4, marginBottom: 10 }}>
            How Crew writes for you
          </div>
          <p style={{ margin: 0, fontFamily: PAPER_FONTS.serif, fontStyle: "italic", fontSize: 15, color: p.inkSoft }}>
            Based on your writing samples + goals summary from onboarding. Re-train any time.
          </p>
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <InkButton p={p} kind="outline" size="sm" onClick={() => onBack("onboarding")}>
              Re-run onboarding
            </InkButton>
            <InkButton p={p} kind="ghost" size="sm" onClick={() => onBack("landing")}>
              ← Back to landing
            </InkButton>
          </div>
        </PaperCard>

        <PaperCard p={p} color={p.leaf} hardShadow>
          <Eyebrow p={p} hindi="नज़र" en="Followups" />
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

        <PaperCard p={p} color={p.tea} hardShadow>
          <Eyebrow p={p} hindi="चाबी" en="Connected" />
          <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 22, marginTop: 4, marginBottom: 10 }}>
            What Crew reads
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {connected.map(({ name, sub, on }) => (
              <div
                key={name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 10px",
                  border: `1px solid ${p.ink}24`,
                }}
              >
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
              </div>
            ))}
          </div>
        </PaperCard>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { p, t, setTweak } = usePaperTheme();
  const [profile, setProfile] = useState(null);
  useEffect(() => {
    fetch("/api/profile").then((r) => r.json()).then((j) => setProfile(j?.profile ?? null)).catch(() => {});
  }, []);

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
      onBack={(dest) => {
        if (dest === "onboarding") router.push("/onboarding");
        else router.push("/");
      }}
    />
  );
}
