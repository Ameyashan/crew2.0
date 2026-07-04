// @ts-nocheck — onboarding (jugaadu reskin)
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PAPER_FONTS_V2 } from "@/components/paper/fonts";
import { TOKENS, RADII, SHADOWS } from "@/components/paper/tokens";
import { AuthLoadingOverlay } from "@/components/paper/auth-loading";
import {
  onboardingCompletedCount,
  onboardingDonePatch,
  onboardingSkipPatch,
} from "@/components/paper/phase5-logic";
import { useIsMobile } from "@/lib/use-is-mobile";
import { SECTORS } from "@/lib/jobs/catalog/sectors";

const GOALS_PROMPT = `I'm using a tool that drafts outreach messages on my behalf. Help me write a self-summary it can use as context. Cover:
- My current role, background, and what I'm working on
- What I'm looking for next (roles, companies, kinds of people to meet)
- My motivations and what excites me professionally
- How I communicate (tone, formality, things I'd never say)
- Anything else that would help someone write a message that sounds like me

Ask me questions if you need to. When we're done, give me a single block of text I can paste back.`;

const GOALS_SAMPLE = `I'm Ameya — Senior VP of Product at Goldman Sachs Asset Management's Alternatives group, where I partner with Strats to build portfolio management tools for private credit, real estate, and infra. Spent the last decade going from analyst to leading a small product team; before GSAM, I shipped retail trading at Robinhood and credit-risk tooling at Capital One.

What I'm looking for: senior product roles at AI-native fintechs (Series B+) or the asset-management arm of a top-tier firm. Roles where I get to own the LLM-in-the-loop layer for analysts, not just dashboards.

How I communicate: warm but direct. Hate corporate filler ("hope this finds you well", "circling back"). Will use lowercase if it feels right. Prefer ending on a real question, not a CTA.`;

function OnboardingV3({ onDone }) {
  const isMobile = useIsMobile();
  const [resume, setResume] = useState(null);
  const [linkedin, setLinkedin] = useState("");
  const [samples, setSamples] = useState([]);
  const [goals, setGoals] = useState("");
  const [interests, setInterests] = useState([]);
  const [followup, setFollowup] = useState("3d");
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  async function handleDone() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(onboardingDonePatch({ linkedin, samples, goals, followup })),
      });
      if (!res.ok) throw new Error(`profile save failed: ${res.status}`);
      // Save job-feed interests so the first daily feed has something to show.
      // Non-blocking — onboarding shouldn't fail if catalog growth hiccups.
      try {
        await fetch("/api/jobs/preferences", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ interests }),
        });
      } catch {
        /* non-blocking */
      }
      // soft signal the middleware reads to skip the landing for returning users
      document.cookie = "crew_onboarded=1; path=/; max-age=31536000; samesite=lax";
      onDone();
    } catch (e) {
      setSubmitError(String(e?.message || e));
      setSubmitting(false);
    }
  }

  // The escape hatch. It still marks the profile onboarded — the /app layout
  // gate redirects un-onboarded users back here, so a skip that doesn't set
  // onboarded would trap people in a loop. Skipping ingests no resume, which is
  // exactly what leaves the account's Story thin (the thin-Story path).
  async function handleSkip() {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(onboardingSkipPatch()),
      });
      if (!res.ok) throw new Error(`profile save failed: ${res.status}`);
      document.cookie = "crew_onboarded=1; path=/; max-age=31536000; samesite=lax";
      onDone();
    } catch (e) {
      setSubmitError(String(e?.message || e));
      setSubmitting(false);
    }
  }

  const completed = onboardingCompletedCount({ resume, linkedin, samples, goals, interests });

  function copyPrompt() {
    navigator.clipboard?.writeText(GOALS_PROMPT).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div
      style={{
        flex: 1,
        background: TOKENS.paper,
        color: TOKENS.ink,
        ...(isMobile
          ? { display: "flex", flexDirection: "column", overflowY: "auto", overflowX: "hidden" }
          : { display: "grid", gridTemplateColumns: "1fr 1.15fr", overflow: "hidden" }),
      }}
    >
      {/* Left — narrative */}
      <aside
        style={{
          background: TOKENS.cardWarm,
          padding: isMobile ? "28px 20px 28px" : "64px 56px 48px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          borderRight: isMobile ? "none" : `1px solid ${TOKENS.line}`,
          borderBottom: isMobile ? `1px solid ${TOKENS.line}` : "none",
          position: "relative",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            right: -140,
            bottom: -200,
            fontFamily: PAPER_FONTS_V2.serif,
            fontSize: 480,
            lineHeight: 0.8,
            color: TOKENS.chip,
            opacity: 0.6,
            letterSpacing: "-.06em",
            pointerEvents: "none",
          }}
        >
          जु
        </div>

        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
            <button
              onClick={handleSkip}
              disabled={submitting}
              style={{
                background: "transparent",
                border: "none",
                color: TOKENS.muted,
                fontFamily: PAPER_FONTS_V2.mono,
                fontSize: 11,
                letterSpacing: ".1em",
                textTransform: "uppercase",
                cursor: "pointer",
                padding: 0,
              }}
            >
              skip setup — add all this later in Settings →
            </button>
          </div>
          <span
            style={{
              fontFamily: PAPER_FONTS_V2.mono,
              fontSize: 10.5,
              fontWeight: 500,
              letterSpacing: ".12em",
              textTransform: "uppercase",
              color: TOKENS.muted,
            }}
          >
            Jugaadu · let&apos;s get you set up
          </span>
          <h1
            style={{
              margin: "8px 0 0",
              fontFamily: PAPER_FONTS_V2.serif,
              fontWeight: 400,
              fontSize: "clamp(36px, 4.4vw, 56px)",
              lineHeight: 0.98,
              letterSpacing: "-.02em",
              color: TOKENS.ink,
              maxWidth: 500,
            }}
          >
            Tell Jugaadu about you.{" "}
            <span style={{ fontStyle: "italic", color: TOKENS.muted2 }}>
              Start with your resume.
            </span>
          </h1>
          <p
            style={{
              margin: "18px 0 0",
              fontFamily: PAPER_FONTS_V2.serif,
              fontStyle: "italic",
              fontSize: 18,
              lineHeight: 1.45,
              color: TOKENS.muted,
              maxWidth: 500,
            }}
          >
            The resume is what Resume Darzi tailors and what drafts lean on — without one, half the
            crew sits idle. Everything else here is optional polish.
          </p>

          {/* Live preview */}
          <div
            style={{
              marginTop: 32,
              padding: "18px 20px",
              background: TOKENS.card,
              border: `1px solid ${TOKENS.lineSoft}`,
              borderRadius: RADII.card,
              boxShadow: SHADOWS.card,
            }}
          >
            <div
              style={{
                fontFamily: PAPER_FONTS_V2.mono,
                fontSize: 10,
                color: TOKENS.muted,
                letterSpacing: ".14em",
                textTransform: "uppercase",
                marginBottom: 10,
              }}
            >
              Context Jugaadu will use
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <PreviewChip on={!!resume} label={resume ? `Resume · ${resume.name}` : "Resume"} />
              <PreviewChip
                on={!!linkedin.trim()}
                label={linkedin.trim() ? `LinkedIn · ${linkedin}` : "LinkedIn"}
              />
              <PreviewChip
                on={samples.length > 0}
                label={samples.length ? `Voice samples · ${samples.length} learned` : "Voice samples"}
              />
              <PreviewChip
                on={!!goals.trim()}
                label={goals.trim() ? `Goals & context · ${Math.round(goals.length / 5)} words` : "Goals & context"}
              />
              <PreviewChip
                on={interests.length > 0}
                label={
                  interests.length
                    ? `Interests · ${interests.length} sector${interests.length === 1 ? "" : "s"}`
                    : "Job interests"
                }
              />
              <PreviewChip on required label={`Followup default · after ${followup}`} />
            </div>
          </div>
        </div>

        {/* progress strip */}
        <div
          style={{
            position: "relative",
            marginTop: 36,
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontFamily: PAPER_FONTS_V2.mono,
            fontSize: 11,
            color: TOKENS.muted,
            letterSpacing: ".08em",
          }}
        >
          <span>{completed}/5 ADDED</span>
          <div
            style={{
              flex: 1,
              height: 4,
              background: TOKENS.lineInset,
              borderRadius: RADII.pill,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${(completed / 5) * 100}%`,
                background: TOKENS.green,
                transition: "width .4s ease",
              }}
            />
          </div>
        </div>
      </aside>

      {/* Right — cards */}
      <div
        className="scroll"
        style={{
          overflow: isMobile ? "visible" : "auto",
          padding: isMobile ? "28px 20px 64px" : "60px 56px 80px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <OnbCardV3
          num={1}
          done={!!resume}
          required
          title="Drop your resume"
          sub="PDF or DOCX. Resume Darzi tailors this per job, and drafts borrow your background from it."
        >
          <ResumeDropV3 resume={resume} setResume={setResume} />
        </OnbCardV3>

        <OnbCardV3
          num={2}
          done={!!linkedin.trim()}
          optional
          title="LinkedIn profile"
          sub="Used for context, never to message anyone."
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "11px 14px",
              background: TOKENS.card,
              border: `1px solid ${linkedin.trim() ? TOKENS.green : TOKENS.line}`,
              borderRadius: RADII.panelTight,
              transition: "border-color .2s",
            }}
          >
            <span style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 13, color: TOKENS.muted }}>
              linkedin.com/in/
            </span>
            <input
              value={linkedin}
              onChange={(e) => setLinkedin(e.target.value)}
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
            {linkedin.trim() && (
              <span style={{ color: TOKENS.green, fontFamily: PAPER_FONTS_V2.mono, fontSize: 12 }}>
                ✓
              </span>
            )}
          </div>
        </OnbCardV3>

        <OnbCardV3
          num={3}
          done={samples.length > 0}
          optional
          title="Writing samples"
          sub="Paste 1–2 things you've actually written so Jugaadu matches your voice."
        >
          <SampleEditorV3 samples={samples} setSamples={setSamples} />
        </OnbCardV3>

        <OnbCardV3
          num={4}
          done={!!goals.trim()}
          optional
          title="Goals & context"
          sub="Paste the prompt below into your favourite LLM, answer its questions, then paste the summary back. Jugaadu uses it to write drafts that match what you're working toward."
        >
          <div
            style={{
              background: TOKENS.cardWarm,
              border: `1px dashed ${TOKENS.dashed}`,
              borderRadius: RADII.panelTight,
              padding: "14px 16px",
              position: "relative",
              fontFamily: PAPER_FONTS_V2.mono,
              fontSize: 12,
              lineHeight: 1.55,
              color: TOKENS.muted2,
              whiteSpace: "pre-wrap",
            }}
          >
            {GOALS_PROMPT}
            <button
              onClick={copyPrompt}
              style={{
                position: "absolute",
                top: 8,
                right: 8,
                padding: "5px 10px",
                fontFamily: PAPER_FONTS_V2.mono,
                fontSize: 10.5,
                letterSpacing: ".06em",
                textTransform: "uppercase",
                background: copied ? TOKENS.green : TOKENS.card,
                color: copied ? TOKENS.paper : TOKENS.ink,
                border: `1px solid ${copied ? TOKENS.green : TOKENS.line}`,
                borderRadius: RADII.buttonTight,
                cursor: "pointer",
              }}
            >
              {copied ? "✓ copied" : "copy prompt"}
            </button>
          </div>
          <textarea
            value={goals}
            onChange={(e) => setGoals(e.target.value)}
            placeholder={`Paste the LLM's reply here.\n\n${GOALS_SAMPLE.slice(0, 220)}…`}
            rows={6}
            style={{
              width: "100%",
              marginTop: 10,
              padding: "12px 14px",
              resize: "vertical",
              background: TOKENS.card,
              color: TOKENS.ink,
              border: `1px solid ${goals.trim() ? TOKENS.muted2 : TOKENS.line}`,
              borderRadius: RADII.panelTight,
              fontFamily: PAPER_FONTS_V2.sans,
              fontSize: 13.5,
              lineHeight: 1.5,
              outline: "none",
              minHeight: 110,
            }}
          />
          {!goals.trim() && (
            <button
              onClick={() => setGoals(GOALS_SAMPLE)}
              style={{
                marginTop: 8,
                padding: "6px 10px",
                background: "transparent",
                border: `1px solid ${TOKENS.line}`,
                borderRadius: RADII.buttonTight,
                color: TOKENS.muted2,
                fontFamily: PAPER_FONTS_V2.mono,
                fontSize: 10.5,
                letterSpacing: ".06em",
                cursor: "pointer",
              }}
            >
              + try a sample summary
            </button>
          )}
        </OnbCardV3>

        <OnbCardV3
          num={5}
          done={interests.length > 0}
          optional
          title="What jobs interest you?"
          sub="Pick the sectors you want roles from. This powers your daily Jobs feed — we scan companies in these spaces and rank openings by fit."
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {SECTORS.map((s) => {
              const active = interests.includes(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() =>
                    setInterests(active ? interests.filter((x) => x !== s.id) : [...interests, s.id])
                  }
                  style={{
                    padding: "8px 14px",
                    fontFamily: PAPER_FONTS_V2.mono,
                    fontSize: 13,
                    background: active ? TOKENS.ink : "transparent",
                    color: active ? TOKENS.paper : TOKENS.ink,
                    border: `1px solid ${active ? TOKENS.ink : TOKENS.line}`,
                    borderRadius: RADII.pill,
                    cursor: "pointer",
                    transition: "background .15s, border-color .15s",
                  }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </OnbCardV3>

        <OnbCardV3
          num={6}
          done
          required
          title="Followup cadence"
          sub="When someone doesn't reply, when should Jugaadu nudge?"
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["3d", "5d", "7d", "10d", "never"].map((v) => {
              const active = followup === v;
              return (
                <button
                  key={v}
                  onClick={() => setFollowup(v)}
                  style={{
                    padding: "9px 18px",
                    fontFamily: PAPER_FONTS_V2.mono,
                    fontSize: 13,
                    background: active ? TOKENS.ink : "transparent",
                    color: active ? TOKENS.paper : TOKENS.ink,
                    border: `1px solid ${active ? TOKENS.ink : TOKENS.line}`,
                    borderRadius: RADII.pill,
                    cursor: "pointer",
                    transition: "background .15s, border-color .15s",
                  }}
                >
                  {v}
                </button>
              );
            })}
          </div>
        </OnbCardV3>

        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 18 }}>
          <button
            onClick={handleDone}
            disabled={submitting || !resume}
            style={{
              background: TOKENS.ink,
              color: TOKENS.paper,
              border: "none",
              borderRadius: RADII.button,
              padding: "12px 22px",
              fontFamily: PAPER_FONTS_V2.sans,
              fontSize: 15,
              fontWeight: 500,
              cursor: submitting || !resume ? "not-allowed" : "pointer",
              opacity: submitting || !resume ? 0.45 : 1,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {submitting ? "Saving…" : "Take me to Jugaadu"}{" "}
            <span style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 17 }}>→</span>
          </button>
          {submitError && (
            <span style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 11, color: TOKENS.red }}>
              {submitError}
            </span>
          )}
          <span
            style={{
              fontFamily: PAPER_FONTS_V2.serif,
              fontStyle: "italic",
              fontSize: 13.5,
              color: TOKENS.faint,
            }}
          >
            {resume ? "everything else is optional" : "drop your resume first — or skip setup, top left"}
          </span>
        </div>
      </div>
    </div>
  );
}

function PreviewChip({ on, label, required }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 13.5,
        color: on ? TOKENS.ink : TOKENS.muted,
      }}
    >
      <span
        style={{
          width: 14,
          height: 14,
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
      <span
        style={{
          fontFamily: on ? PAPER_FONTS_V2.sans : PAPER_FONTS_V2.serif,
          fontStyle: on ? "normal" : "italic",
        }}
      >
        {label}
      </span>
      {required && (
        <span
          style={{
            marginLeft: "auto",
            fontFamily: PAPER_FONTS_V2.mono,
            fontSize: 9,
            letterSpacing: ".16em",
            color: TOKENS.muted2,
            textTransform: "uppercase",
          }}
        >
          set
        </span>
      )}
    </div>
  );
}

function OnbCardV3({ num, done, required, optional, title, sub, children }) {
  return (
    <div
      style={{
        background: TOKENS.card,
        border: `1px solid ${done ? TOKENS.line : TOKENS.lineSoft}`,
        borderRadius: RADII.card,
        boxShadow: done ? SHADOWS.elevated : SHADOWS.card,
        padding: "20px 22px",
        transition: "box-shadow .25s, border-color .25s",
        animation: `fadeUp .4s ease both`,
        animationDelay: `${num * 50}ms`,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
        <span
          style={{
            width: 26,
            height: 26,
            fontSize: 12,
            fontWeight: 500,
            fontFamily: PAPER_FONTS_V2.mono,
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
            background: done ? TOKENS.ink : "transparent",
            color: done ? TOKENS.paper : TOKENS.ink,
            border: `1px solid ${done ? TOKENS.ink : TOKENS.line}`,
            borderRadius: RADII.pill,
          }}
        >
          {done ? "✓" : num}
        </span>
        <h3
          style={{
            fontFamily: PAPER_FONTS_V2.serif,
            fontWeight: 400,
            fontSize: 22,
            letterSpacing: "-.01em",
            margin: 0,
            flex: 1,
            color: TOKENS.ink,
            lineHeight: 1.1,
          }}
        >
          {title}
        </h3>
        <span
          style={{
            fontFamily: PAPER_FONTS_V2.mono,
            fontSize: 10,
            letterSpacing: ".18em",
            color: required ? TOKENS.muted2 : TOKENS.faint,
            textTransform: "uppercase",
          }}
        >
          {required ? "required" : "optional"}
        </span>
      </div>
      {sub && (
        <p
          style={{
            margin: "4px 0 14px",
            marginLeft: 38,
            fontFamily: PAPER_FONTS_V2.serif,
            fontStyle: "italic",
            fontSize: 14,
            lineHeight: 1.5,
            color: TOKENS.muted,
          }}
        >
          {sub}
        </p>
      )}
      <div style={{ marginLeft: 38 }}>{children}</div>
    </div>
  );
}

function ResumeDropV3({ resume, setResume }) {
  const [hover, setHover] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  async function handleFile(file) {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/profile/resume", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `upload failed: ${res.status}`);
      const kb = Math.max(1, Math.round(file.size / 1024));
      setResume({ name: j.filename || file.name, size: `${kb} KB`, characters: j.characters });
    } catch (e) {
      setUploadError(String(e?.message || e));
    } finally {
      setUploading(false);
    }
  }
  if (resume) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "12px 14px",
          background: TOKENS.cardWarm,
          border: `1px solid ${TOKENS.green}`,
          borderRadius: RADII.panelTight,
        }}
      >
        <div
          style={{
            width: 36,
            height: 44,
            background: TOKENS.card,
            color: TOKENS.amber,
            border: `1px solid ${TOKENS.amberLine}`,
            borderRadius: 6,
            display: "grid",
            placeItems: "center",
            fontFamily: PAPER_FONTS_V2.mono,
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: ".04em",
          }}
        >
          PDF
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 14, color: TOKENS.ink }}>
            <span style={{ color: TOKENS.green, marginRight: 4 }}>✓</span>
            {resume.name}
          </div>
          <div
            style={{
              fontFamily: PAPER_FONTS_V2.mono,
              fontSize: 11,
              color: TOKENS.muted,
              marginTop: 2,
              letterSpacing: ".04em",
            }}
          >
            {resume.size}
            {resume.characters ? ` · ${resume.characters.toLocaleString()} chars` : ""} · parsed
          </div>
        </div>
        <button
          onClick={() => setResume(null)}
          style={{
            padding: "6px 10px",
            background: "transparent",
            color: TOKENS.muted2,
            border: `1px solid ${TOKENS.line}`,
            borderRadius: RADII.buttonTight,
            fontFamily: PAPER_FONTS_V2.mono,
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          remove
        </button>
      </div>
    );
  }
  return (
    <label
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "18px 18px",
        background: hover ? TOKENS.cardWarm : "transparent",
        border: `1px dashed ${hover ? TOKENS.dashed2 : TOKENS.dashed}`,
        borderRadius: RADII.panelTight,
        cursor: "pointer",
        transition: "border-color .2s, background .2s",
      }}
    >
      <input
        type="file"
        accept=".pdf,.docx,.txt"
        style={{ display: "none" }}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <span
        style={{
          width: 32,
          height: 32,
          background: hover ? TOKENS.ink : "transparent",
          color: hover ? TOKENS.paper : TOKENS.ink,
          display: "grid",
          placeItems: "center",
          fontSize: 16,
          border: `1px solid ${hover ? TOKENS.ink : TOKENS.line}`,
          borderRadius: RADII.pill,
          transition: "all .2s",
        }}
      >
        {uploading ? "…" : "↑"}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 14, color: TOKENS.ink }}>
          {uploading ? "Parsing…" : "Click to upload your resume"}
        </div>
        <div
          style={{
            fontFamily: PAPER_FONTS_V2.mono,
            fontSize: 11,
            color: uploadError ? TOKENS.red : TOKENS.muted,
            marginTop: 2,
            letterSpacing: ".04em",
          }}
        >
          {uploadError || "PDF, DOCX, TXT · max 5MB · skip if you’d rather not"}
        </div>
      </div>
    </label>
  );
}

function SampleEditorV3({ samples, setSamples }) {
  const [draft, setDraft] = useState("");
  const presets = [
    "Hey — saw your launch. The bit about agent UX hit. Worth a chat?",
    "Quick one. Retail investors can now access private markets through their 401k, and asset managers are being defensive in their investments — collateral monitoring is becoming critical for risk management.",
  ];
  function add(text) {
    if (!text.trim() || samples.length >= 3) return;
    setSamples([...samples, text.trim()]);
    setDraft("");
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {samples.map((s, i) => (
        <div
          key={i}
          style={{
            padding: "12px 14px",
            background: TOKENS.cardWarm,
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
              resize: "none",
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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {presets.map((s, i) => (
                <button
                  key={i}
                  onClick={() => add(s)}
                  style={{
                    padding: "5px 10px",
                    background: "transparent",
                    border: `1px solid ${TOKENS.line}`,
                    borderRadius: RADII.buttonTight,
                    color: TOKENS.muted2,
                    fontFamily: PAPER_FONTS_V2.mono,
                    fontSize: 10.5,
                    letterSpacing: ".04em",
                    cursor: "pointer",
                  }}
                >
                  + sample {i + 1}
                </button>
              ))}
            </div>
            <button
              onClick={() => add(draft)}
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
              add ⌘↵
            </button>
          </div>
        </>
      )}
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
