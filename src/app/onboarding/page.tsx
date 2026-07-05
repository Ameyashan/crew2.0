// @ts-nocheck — onboarding: the prototype's 3-step 600px card (jugaadu reskin, Phase F)
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PAPER_FONTS_V2 } from "@/components/paper/fonts";
import { TOKENS, RADII, SHADOWS } from "@/components/paper/tokens";
import { AuthLoadingOverlay } from "@/components/paper/auth-loading";
import { onboardingDonePatch } from "@/components/paper/phase5-logic";

// The four agents shown as chips on step 1 (prototype lines 115–118).
const AGENT_CHIPS = ["resume", "person khoji", "email wallah", "outreach"];

// Two preset goals + the "write your own" escape hatch (prototype step 3). The
// picked goal saves to the same context/goals field Settings edits.
const GOAL_PRESETS = [
  "Land a senior role at a company I respect.",
  "Meet the people who can open doors for me.",
];

function OnboardingV3({ onDone }) {
  const [step, setStep] = useState(1); // 1 | 2 | 3
  const [resume, setResume] = useState(null); // { name, seeded } | null
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [goal, setGoal] = useState("");
  const [customMode, setCustomMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  async function handleUpload(file) {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/profile/resume", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `upload failed: ${res.status}`);
      setResume({ name: j.filename || file.name, seeded: j.seeded || 0 });
    } catch (e) {
      setUploadError(String(e?.message || e));
    } finally {
      setUploading(false);
    }
  }

  // Finish onboarding. The resume (if any) was already saved by its own upload
  // endpoint; here we persist the goal and flip the onboarded flag. Skipping the
  // resume leaves the Story thin — exactly the prototype's thin-Story path.
  async function finish() {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          onboardingDonePatch({ linkedin: "", samples: [], goals: goal, followup: "5d" }),
        ),
      });
      if (!res.ok) throw new Error(`profile save failed: ${res.status}`);
      // Soft signal the middleware reads to skip the landing for returning users.
      document.cookie = "crew_onboarded=1; path=/; max-age=31536000; samesite=lax";
      onDone();
    } catch (e) {
      setSubmitError(String(e?.message || e));
      setSubmitting(false);
    }
  }

  function next() {
    if (step < 3) setStep(step + 1);
    else finish();
  }

  const dot = (n) => (n <= step ? TOKENS.ink : TOKENS.line);
  const nextLabel = step === 3 ? "Open the Desk →" : "Next →";

  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
      <div
        style={{
          width: 600,
          maxWidth: "100%",
          background: TOKENS.card,
          border: `1px solid ${TOKENS.lineSoft}`,
          borderRadius: RADII.modal,
          boxShadow: SHADOWS.elevated,
          padding: "44px 52px 40px",
          animation: "fadeUp .4s ease",
        }}
      >
        {/* header */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 26,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontFamily: PAPER_FONTS_V2.serif, fontWeight: 500, fontSize: 18, lineHeight: 1 }}>
              Jugaadu
            </span>
            <span style={{ fontFamily: PAPER_FONTS_V2.devan, fontSize: 10, lineHeight: 1, color: TOKENS.faint2Alt }}>
              जुगाडू
            </span>
          </div>
          <span
            style={{
              fontFamily: PAPER_FONTS_V2.mono,
              fontSize: 10.5,
              fontWeight: 500,
              color: TOKENS.faint,
            }}
          >
            STEP {step} OF 3
          </span>
        </div>

        {/* ── Step 1 — intro ── */}
        {step === 1 && (
          <div>
            <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 30, lineHeight: 1.25, letterSpacing: "-.01em" }}>
              You bring the ambition. The crew does the boring half.
            </div>
            <div
              style={{
                fontFamily: PAPER_FONTS_V2.sans,
                fontSize: 14,
                lineHeight: 1.7,
                color: TOKENS.muted2,
                margin: "16px 0 24px",
              }}
            >
              Four agents work behind one box: they weave your resume from your real work, find the
              people who decide, verify their emails, and draft outreach in your voice. You review
              everything before it goes out.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 30 }}>
              {AGENT_CHIPS.map((c) => (
                <span
                  key={c}
                  style={{
                    fontFamily: PAPER_FONTS_V2.mono,
                    fontSize: 11,
                    fontWeight: 500,
                    color: TOKENS.muted2,
                    background: TOKENS.chip,
                    borderRadius: RADII.pill,
                    padding: "8px 13px",
                  }}
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 2 — resume → Story ── */}
        {step === 2 && (
          <div>
            <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 30, lineHeight: 1.25, letterSpacing: "-.01em" }}>
              Give the crew your story.
            </div>
            <div
              style={{
                fontFamily: PAPER_FONTS_V2.sans,
                fontSize: 14,
                lineHeight: 1.7,
                color: TOKENS.muted2,
                margin: "16px 0 24px",
              }}
            >
              Drop in your current resume — it becomes the first entries in your{" "}
              <em>Story</em>, the living record of your work. Everything you add later makes every
              future resume sharper.
            </div>
            <label
              style={{
                display: "block",
                border: `1.5px dashed ${resume ? TOKENS.green : TOKENS.dashed2}`,
                borderRadius: RADII.panel,
                padding: "32px 24px",
                textAlign: "center",
                background: resume ? TOKENS.cardWarm : "transparent",
                marginBottom: 30,
                cursor: uploading ? "wait" : "pointer",
                transition: "border-color .2s, background .2s",
              }}
            >
              <input
                type="file"
                accept=".pdf,.docx,.txt"
                style={{ display: "none" }}
                disabled={uploading}
                onChange={(e) => handleUpload(e.target.files?.[0])}
              />
              <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 16, lineHeight: 1.4, color: resume ? TOKENS.green : TOKENS.muted2 }}>
                {uploading
                  ? "Reading your resume…"
                  : resume
                    ? `✓ ${resume.name}`
                    : "Drop your resume, or click to browse"}
              </div>
              <div style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 12, lineHeight: 1.6, color: TOKENS.faint, marginTop: 6 }}>
                {uploadError
                  ? uploadError
                  : resume
                    ? resume.seeded
                      ? `${resume.seeded} ${resume.seeded === 1 ? "entry" : "entries"} extracted into your Story…`
                      : "saved to your Story…"
                    : "PDF, DOCX, or TXT · or skip for now"}
              </div>
            </label>
          </div>
        )}

        {/* ── Step 3 — goal ── */}
        {step === 3 && (
          <div>
            <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 30, lineHeight: 1.25, letterSpacing: "-.01em" }}>
              What are you after right now?
            </div>
            <div
              style={{
                fontFamily: PAPER_FONTS_V2.sans,
                fontSize: 14,
                lineHeight: 1.7,
                color: TOKENS.muted2,
                margin: "16px 0 24px",
              }}
            >
              One line is enough. The crew uses it to rank roles and people for you.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 30 }}>
              {GOAL_PRESETS.map((g) => {
                const active = !customMode && goal === g;
                return (
                  <div
                    key={g}
                    onClick={() => {
                      setCustomMode(false);
                      setGoal(g);
                    }}
                    style={{
                      border: `1px solid ${active ? TOKENS.ink : TOKENS.line}`,
                      borderRadius: RADII.panelTight,
                      padding: "14px 18px",
                      background: TOKENS.card,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 15, lineHeight: 1.4, color: TOKENS.ink }}>
                      {g}
                    </span>
                    <span style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 12, color: TOKENS.ink }}>
                      {active ? "✓" : ""}
                    </span>
                  </div>
                );
              })}
              {/* write your own */}
              {!customMode ? (
                <div
                  onClick={() => {
                    setCustomMode(true);
                    setGoal("");
                  }}
                  style={{
                    border: `1px solid ${TOKENS.line}`,
                    borderRadius: RADII.panelTight,
                    padding: "14px 18px",
                    background: TOKENS.card,
                    cursor: "pointer",
                  }}
                >
                  <span style={{ fontFamily: PAPER_FONTS_V2.serif, fontStyle: "italic", fontSize: 15, color: TOKENS.muted }}>
                    or write your own…
                  </span>
                </div>
              ) : (
                <input
                  autoFocus
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="e.g. Break into climate tech as a staff engineer."
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    border: `1px solid ${goal.trim() ? TOKENS.ink : TOKENS.line}`,
                    borderRadius: RADII.panelTight,
                    padding: "14px 18px",
                    background: TOKENS.card,
                    color: TOKENS.ink,
                    fontFamily: PAPER_FONTS_V2.serif,
                    fontSize: 15,
                    outline: "none",
                  }}
                />
              )}
            </div>
          </div>
        )}

        {/* footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 6 }}>
            {[1, 2, 3].map((n) => (
              <span key={n} style={{ width: 18, height: 4, borderRadius: 2, background: dot(n) }} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            {submitError && (
              <span style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 11, color: TOKENS.red }}>
                {submitError}
              </span>
            )}
            {step === 2 && (
              <span
                onClick={next}
                style={{
                  fontFamily: PAPER_FONTS_V2.sans,
                  fontSize: 13,
                  color: TOKENS.faint2,
                  cursor: "pointer",
                }}
              >
                Skip for now
              </span>
            )}
            <span
              onClick={submitting ? undefined : next}
              style={{
                fontFamily: PAPER_FONTS_V2.sans,
                fontSize: 13,
                fontWeight: 500,
                color: TOKENS.paper,
                background: TOKENS.ink,
                borderRadius: RADII.button,
                padding: "12px 20px",
                cursor: submitting ? "wait" : "pointer",
                opacity: submitting ? 0.6 : 1,
              }}
            >
              {submitting ? "Saving…" : nextLabel}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  return (
    <>
      {/* First-timers land here straight from the OAuth callback — show the
          "Setting up your Desk…" moment before the setup card. */}
      <AuthLoadingOverlay />
      <OnboardingV3 onDone={() => router.push("/app/compose")} />
    </>
  );
}
