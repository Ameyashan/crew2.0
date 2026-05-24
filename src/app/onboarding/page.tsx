// @ts-nocheck — verbatim port of Crew prototype v3 onboarding
"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PAPER_FONTS } from "@/components/paper/fonts";
import { usePaperTheme } from "@/components/paper/use-paper-theme";
import { Eyebrow, InkButton, Marginalia } from "@/components/paper/primitives";

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

function OnboardingV3({ p, onDone, onBack }) {
  const [resume, setResume]     = useState(null);
  const [linkedin, setLinkedin] = useState('');
  const [samples, setSamples]   = useState([]);
  const [goals, setGoals]       = useState('');
  const [followup, setFollowup] = useState('3d');
  const [copied, setCopied]     = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const FOLLOWUP_TO_DAYS = { '3d': 3, '5d': 5, '7d': 7, '10d': 10, 'never': 0 };

  async function handleDone() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          linkedin_url: linkedin.trim() ? `https://linkedin.com/in/${linkedin.trim()}` : null,
          writing_samples: samples.length ? samples : null,
          context_prompt: goals.trim() || null,
          followup_days: FOLLOWUP_TO_DAYS[followup] ?? null,
          onboarded: true,
        }),
      });
      if (!res.ok) throw new Error(`profile save failed: ${res.status}`);
      // soft signal the middleware reads to skip the landing for returning users
      document.cookie = 'crew_onboarded=1; path=/; max-age=31536000; samesite=lax';
      onDone();
    } catch (e) {
      setSubmitError(String(e?.message || e));
      setSubmitting(false);
    }
  }

  const completed =
    (resume ? 1 : 0) +
    (linkedin.trim() ? 1 : 0) +
    (samples.length > 0 ? 1 : 0) +
    (goals.trim() ? 1 : 0);

  function copyPrompt() {
    navigator.clipboard?.writeText(GOALS_PROMPT).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div style={{
      flex: 1, display: 'grid', gridTemplateColumns: '1fr 1.15fr', background: p.paper, color: p.ink,
      overflow: 'hidden',
    }}>
      {/* Left — narrative */}
      <aside style={{
        background: p.paperDeep, padding: '64px 56px 48px',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        borderRight: `1.5px solid ${p.ink}`, position: 'relative', overflow: 'hidden',
      }}>
        <div aria-hidden style={{
          position: 'absolute', right: -140, bottom: -200,
          fontFamily: PAPER_FONTS.display, fontSize: 480, lineHeight: .8,
          color: p.paper, opacity: .55, letterSpacing: '-.06em', pointerEvents: 'none',
        }}>क्र</div>

        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
            <button onClick={onBack} style={{
              background: 'transparent', border: 'none', color: p.inkMute,
              fontFamily: PAPER_FONTS.mono, fontSize: 11, letterSpacing: '.1em',
              textTransform: 'uppercase', cursor: 'pointer', padding: 0,
            }}>← landing</button>
          </div>
          <Eyebrow p={p} hindi="शुरुआत" en="Jugaadu · let's get you set up"/>
          <h1 style={{
            margin: '8px 0 0', fontFamily: PAPER_FONTS.display, fontWeight: 400,
            fontSize: 'clamp(40px, 4.4vw, 60px)', lineHeight: .95, letterSpacing: '-.025em',
            color: p.ink, maxWidth: 500,
          }}>
            Tell Jugaadu about you. <span style={{ fontStyle: 'italic', color: p.stamp }}>All of it is optional.</span>
          </h1>
          <p style={{
            margin: '18px 0 0', fontFamily: PAPER_FONTS.serif, fontStyle: 'italic',
            fontSize: 18, lineHeight: 1.45, color: p.inkSoft, maxWidth: 500,
          }}>
            More context means sharper drafts. You can skip every step except the followup default and still ship your first message in under a minute.
          </p>

          {/* Live preview */}
          <div style={{
            marginTop: 32, padding: '18px 20px',
            background: p.card, border: `1.5px solid ${p.ink}`, boxShadow: `4px 4px 0 ${p.marigold}`,
          }}>
            <div style={{
              fontFamily: PAPER_FONTS.mono, fontSize: 10, color: p.inkMute,
              letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: 10,
            }}>Context Jugaadu will use</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <PreviewChip p={p} on={!!resume}            label={resume ? `Resume · ${resume.name}` : 'Resume'}/>
              <PreviewChip p={p} on={!!linkedin.trim()}    label={linkedin.trim() ? `LinkedIn · ${linkedin}` : 'LinkedIn'}/>
              <PreviewChip p={p} on={samples.length > 0}   label={samples.length ? `Voice samples · ${samples.length} learned` : 'Voice samples'}/>
              <PreviewChip p={p} on={!!goals.trim()}       label={goals.trim() ? `Goals & context · ${Math.round(goals.length/5)} words` : 'Goals & context'}/>
              <PreviewChip p={p} on required label={`Followup default · after ${followup}`}/>
            </div>
          </div>
        </div>

        {/* progress strip */}
        <div style={{
          position: 'relative', marginTop: 36,
          display: 'flex', alignItems: 'center', gap: 14,
          fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.inkMute, letterSpacing: '.08em',
        }}>
          <span>{completed}/4 OPTIONAL</span>
          <div style={{ flex: 1, height: 4, background: p.ink + '20', overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${(completed / 4) * 100}%`,
              background: p.stamp, transition: 'width .4s ease',
            }}/>
          </div>
        </div>
      </aside>

      {/* Right — cards */}
      <div className="scroll" style={{
        overflow: 'auto', padding: '60px 56px 80px',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <OnbCardV3 p={p} num={1} done={!!resume} optional
          title="Drop your resume"
          sub="PDF or DOCX. Helps Jugaadu describe you in your own words."
          color={p.marigold}
        >
          <ResumeDropV3 p={p} resume={resume} setResume={setResume}/>
        </OnbCardV3>

        <OnbCardV3 p={p} num={2} done={!!linkedin.trim()} optional
          title="LinkedIn profile"
          sub="Used for context, never to message anyone."
          color={p.stamp}
        >
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '11px 14px', background: p.paper,
            border: `1.5px solid ${linkedin.trim() ? p.stamp : p.ink + '40'}`,
            transition: 'border-color .2s',
          }}>
            <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 13, color: p.inkMute }}>linkedin.com/in/</span>
            <input value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="ameya-shanbhag" style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: p.ink, fontFamily: PAPER_FONTS.mono, fontSize: 14,
            }}/>
            {linkedin.trim() && (
              <span style={{ color: p.stamp, fontFamily: PAPER_FONTS.mono, fontSize: 12 }}>✓</span>
            )}
          </div>
        </OnbCardV3>

        <OnbCardV3 p={p} num={3} done={samples.length > 0} optional
          title="Writing samples"
          sub="Paste 1–2 things you've actually written so Jugaadu matches your voice."
          color={p.leaf}
        >
          <SampleEditorV3 p={p} samples={samples} setSamples={setSamples}/>
        </OnbCardV3>

        <OnbCardV3 p={p} num={4} done={!!goals.trim()} optional
          title="Goals & context"
          sub="Paste the prompt below into your favourite LLM, answer its questions, then paste the summary back. Jugaadu uses it to write drafts that match what you're working toward."
          color={p.tea}
        >
          <div style={{
            background: p.paper, border: `1.5px dashed ${p.ink}40`,
            padding: '14px 16px', position: 'relative',
            fontFamily: PAPER_FONTS.mono, fontSize: 12, lineHeight: 1.55, color: p.inkSoft,
            whiteSpace: 'pre-wrap',
          }}>
            {GOALS_PROMPT}
            <button onClick={copyPrompt} style={{
              position: 'absolute', top: 8, right: 8,
              padding: '5px 10px', fontFamily: PAPER_FONTS.mono, fontSize: 10.5,
              letterSpacing: '.06em', textTransform: 'uppercase',
              background: copied ? p.leaf : p.card, color: copied ? p.paper : p.ink,
              border: `1.5px solid ${p.ink}`, cursor: 'pointer',
            }}>{copied ? '✓ copied' : 'copy prompt'}</button>
          </div>
          <textarea
            value={goals}
            onChange={(e) => setGoals(e.target.value)}
            placeholder={`Paste the LLM's reply here.\n\n${GOALS_SAMPLE.slice(0, 220)}…`}
            rows={6}
            style={{
              width: '100%', marginTop: 10, padding: '12px 14px', resize: 'vertical',
              background: p.paper, color: p.ink,
              border: `1.5px solid ${goals.trim() ? p.tea : p.ink + '30'}`,
              fontFamily: PAPER_FONTS.sans, fontSize: 13.5, lineHeight: 1.5, outline: 'none',
              minHeight: 110,
            }}
          />
          {!goals.trim() && (
            <button
              onClick={() => setGoals(GOALS_SAMPLE)}
              style={{
                marginTop: 8, padding: '6px 10px', background: 'transparent',
                border: `1px solid ${p.ink}30`, color: p.inkSoft,
                fontFamily: PAPER_FONTS.mono, fontSize: 10.5, letterSpacing: '.06em',
                cursor: 'pointer',
              }}
            >+ try a sample summary</button>
          )}
        </OnbCardV3>

        <OnbCardV3 p={p} num={5} done required
          title="Followup cadence"
          sub="When someone doesn't reply, when should Jugaadu nudge?"
          color={p.stamp}
        >
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['3d','5d','7d','10d','never'].map(v => {
              const active = followup === v;
              return (
                <button key={v} onClick={() => setFollowup(v)} style={{
                  padding: '9px 18px', fontFamily: PAPER_FONTS.mono, fontSize: 13,
                  background: active ? p.stamp : 'transparent', color: active ? p.paper : p.ink,
                  border: `1.5px solid ${p.ink}`, boxShadow: active ? `2px 2px 0 ${p.ink}` : 'none',
                  cursor: 'pointer',
                }}>{v}</button>
              );
            })}
          </div>
        </OnbCardV3>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, marginTop: 18,
        }}>
          <InkButton p={p} size="lg" color={p.stamp} disabled={submitting} onClick={handleDone}>
            {submitting ? 'Saving…' : 'Take me to Jugaadu'}  <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 17 }}>→</span>
          </InkButton>
          {submitError && (
            <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.stamp }}>{submitError}</span>
          )}
          <Marginalia p={p} rotate={-2}>or skip everything · ⌘↵</Marginalia>
        </div>
      </div>
    </div>
  );
}

function PreviewChip({ p, on, label, required }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5,
      color: on ? p.ink : p.inkMute,
    }}>
      <span style={{
        width: 14, height: 14, background: on ? p.stamp : 'transparent',
        border: `1.5px solid ${on ? p.stamp : p.ink + '40'}`,
        display: 'grid', placeItems: 'center', color: p.paper, fontSize: 10, flexShrink: 0,
      }}>{on ? '✓' : ''}</span>
      <span style={{
        fontFamily: on ? PAPER_FONTS.sans : PAPER_FONTS.serif,
        fontStyle: on ? 'normal' : 'italic',
      }}>{label}</span>
      {required && (
        <span style={{
          marginLeft: 'auto',
          fontFamily: PAPER_FONTS.mono, fontSize: 9, letterSpacing: '.16em',
          color: p.stamp, textTransform: 'uppercase',
        }}>set</span>
      )}
    </div>
  );
}

function OnbCardV3({ p, num, done, required, optional, title, sub, color, children }) {
  return (
    <div style={{
      background: p.card, border: `1.5px solid ${done ? p.ink : p.ink + '40'}`,
      boxShadow: done ? `4px 4px 0 ${color || p.marigold}` : 'none',
      padding: '20px 22px',
      transition: 'box-shadow .25s, border-color .25s',
      animation: `fadeUp .4s ease both`,
      animationDelay: `${num * 50}ms`,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6 }}>
        <span style={{
          width: 26, height: 26, fontSize: 12, fontWeight: 700,
          fontFamily: PAPER_FONTS.mono,
          display: 'grid', placeItems: 'center', flexShrink: 0,
          background: done ? p.ink : 'transparent', color: done ? p.paper : p.ink,
          border: `1.5px solid ${p.ink}`, borderRadius: 999,
        }}>{done ? '✓' : num}</span>
        <h3 style={{
          fontFamily: PAPER_FONTS.display, fontWeight: 400, fontSize: 22,
          letterSpacing: '-.01em', margin: 0, flex: 1, color: p.ink, lineHeight: 1.1,
        }}>{title}</h3>
        <span style={{
          fontFamily: PAPER_FONTS.mono, fontSize: 10, letterSpacing: '.18em',
          color: required ? p.stamp : p.inkMute, textTransform: 'uppercase',
        }}>{required ? 'required' : 'optional'}</span>
      </div>
      {sub && (
        <p style={{
          margin: '4px 0 14px', marginLeft: 38,
          fontFamily: PAPER_FONTS.serif, fontStyle: 'italic',
          fontSize: 14, lineHeight: 1.5, color: p.inkSoft,
        }}>{sub}</p>
      )}
      <div style={{ marginLeft: 38 }}>{children}</div>
    </div>
  );
}

function ResumeDropV3({ p, resume, setResume }) {
  const [hover, setHover] = useState(false);
  if (resume) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '12px 14px', background: p.paper, border: `1.5px solid ${p.marigold}`,
      }}>
        <div style={{
          width: 36, height: 44, background: p.card, color: p.marigoldDeep,
          border: `1px solid ${p.marigold}`, display: 'grid', placeItems: 'center',
          fontFamily: PAPER_FONTS.mono, fontSize: 10, fontWeight: 700, letterSpacing: '.04em',
        }}>PDF</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: PAPER_FONTS.sans, fontSize: 14, color: p.ink }}>
            <span style={{ color: p.leaf, marginRight: 4 }}>✓</span>{resume.name}
          </div>
          <div style={{
            fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.inkMute,
            marginTop: 2, letterSpacing: '.04em',
          }}>{resume.size} · 7,204 chars · parsed in 1.2s</div>
        </div>
        <button onClick={() => setResume(null)} style={{
          padding: '6px 10px', background: 'transparent', color: p.inkSoft,
          border: `1.5px solid ${p.ink}30`, fontFamily: PAPER_FONTS.mono, fontSize: 11,
          cursor: 'pointer',
        }}>remove</button>
      </div>
    );
  }
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  async function handleFile(file) {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/profile/resume', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(`upload failed: ${res.status}`);
      const j = await res.json();
      const kb = Math.max(1, Math.round(file.size / 1024));
      setResume({ name: j.filename || file.name, size: `${kb} KB`, characters: j.characters });
    } catch (e) {
      setUploadError(String(e?.message || e));
    } finally {
      setUploading(false);
    }
  }
  return (
    <label
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '18px 18px',
        background: hover ? p.paper : 'transparent',
        border: `1.5px dashed ${hover ? p.marigoldDeep : p.ink + '40'}`,
        cursor: 'pointer', transition: 'border-color .2s, background .2s',
      }}
    >
      <input
        type="file"
        accept=".pdf,.docx,.txt"
        style={{ display: 'none' }}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <span style={{
        width: 32, height: 32, background: hover ? p.marigold : 'transparent',
        color: hover ? p.paper : p.ink, display: 'grid', placeItems: 'center',
        fontSize: 16, border: `1.5px solid ${p.ink}`, borderRadius: 999,
        transition: 'all .2s',
      }}>{uploading ? '…' : '↑'}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: PAPER_FONTS.sans, fontSize: 14, color: p.ink }}>
          {uploading ? 'Parsing…' : 'Click to upload your resume'}
        </div>
        <div style={{
          fontFamily: PAPER_FONTS.mono, fontSize: 11, color: uploadError ? p.stamp : p.inkMute, marginTop: 2,
          letterSpacing: '.04em',
        }}>{uploadError || 'PDF, DOCX, TXT · max 5MB · skip if you’d rather not'}</div>
      </div>
    </label>
  );
}

function SampleEditorV3({ p, samples, setSamples }) {
  const [draft, setDraft] = useState('');
  const presets = [
    'Hey — saw your launch. The bit about agent UX hit. Worth a chat?',
    'Quick one. Retail investors can now access private markets through their 401k, and asset managers are being defensive in their investments — collateral monitoring is becoming critical for risk management.',
  ];
  function add(text) {
    if (!text.trim() || samples.length >= 3) return;
    setSamples([...samples, text.trim()]);
    setDraft('');
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {samples.map((s, i) => (
        <div key={i} style={{
          padding: '12px 14px', background: p.paper, border: `1.5px solid ${p.leaf}`,
          display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <span style={{
            fontFamily: PAPER_FONTS.mono, fontSize: 10, color: p.leaf,
            letterSpacing: '.1em', flexShrink: 0, marginTop: 2,
          }}>#{String(i + 1).padStart(2, '0')}</span>
          <span style={{
            flex: 1, fontFamily: PAPER_FONTS.serif, fontStyle: 'italic',
            fontSize: 14, lineHeight: 1.5, color: p.ink,
          }}>"{s}"</span>
          <button onClick={() => setSamples(samples.filter((_, j) => j !== i))} style={{
            background: 'transparent', border: 'none', color: p.inkMute,
            fontSize: 16, cursor: 'pointer', padding: 0, lineHeight: 1,
          }}>×</button>
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
              width: '100%', resize: 'none', padding: '11px 14px',
              background: p.paper, color: p.ink,
              border: `1.5px solid ${p.ink}30`,
              fontFamily: PAPER_FONTS.sans, fontSize: 13.5, lineHeight: 1.5, outline: 'none',
            }}
          />
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 8,
          }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {presets.map((s, i) => (
                <button key={i} onClick={() => add(s)} style={{
                  padding: '5px 10px', background: 'transparent',
                  border: `1px solid ${p.ink}30`, color: p.inkSoft,
                  fontFamily: PAPER_FONTS.mono, fontSize: 10.5, letterSpacing: '.04em',
                  cursor: 'pointer',
                }}>+ sample {i + 1}</button>
              ))}
            </div>
            <button onClick={() => add(draft)} disabled={!draft.trim()} style={{
              padding: '7px 14px', background: draft.trim() ? p.ink : 'transparent',
              color: draft.trim() ? p.paper : p.inkMute,
              border: `1.5px solid ${p.ink}`,
              fontFamily: PAPER_FONTS.mono, fontSize: 12,
              cursor: draft.trim() ? 'pointer' : 'not-allowed',
            }}>add ⌘↵</button>
          </div>
        </>
      )}
    </div>
  );
}


export default function OnboardingPage() {
  const router = useRouter();
  const { p } = usePaperTheme();
  return (
    <OnboardingV3
      p={p}
      onDone={() => router.push("/app/compose")}
      onBack={() => router.push("/")}
    />
  );
}
