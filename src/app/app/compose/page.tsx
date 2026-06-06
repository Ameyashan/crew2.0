// @ts-nocheck — verbatim port of Crew prototype v3 compose
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PAPER_FONTS } from "@/components/paper/fonts";
import { usePaperTheme } from "@/components/paper/use-paper-theme";
import {
  Eyebrow,
  InkButton,
  PageHead,
  PaperCard,
  Marginalia,
} from "@/components/paper/primitives";
import { openGmailCompose } from "@/lib/gmail";
import { useIsMobile } from "@/lib/use-is-mobile";
import { ChangeList } from "@/components/resume/ChangeList";
import {
  useRuns,
  startRun,
  startImageRun,
  dismissRun,
  clearAllRuns,
  retryRun,
  pickCandidate,
  regenerateResume,
  regenerateDraft,
  steerAllChannels,
  jobHost,
} from "@/lib/runs-store";

// Hit the existing PDF/DOCX endpoints (they take the tailored-resume JSON) and
// trigger a browser download. Shared by the ↓ PDF / ↓ Word buttons.
async function downloadResumeBlob(resume, fmt) {
  if (!resume) throw new Error("resume not ready yet");
  const dl = await fetch(`/api/resume/${fmt}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ resume }),
  });
  if (!dl.ok) throw new Error(`download failed: ${dl.status}`);
  const blob = await dl.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const base = (resume?.header?.full_name || "resume").replace(/[^\w.-]+/g, "_");
  const role = (resume?.meta?.target_role || "").replace(/[^\w.-]+/g, "_");
  a.download = [base, role || null].filter(Boolean).join("-").toLowerCase() + `.${fmt}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Three-way read of the paste box → drives the "Looks like…" banner and the
// high-level flow we preview before the user hits Go. Job postings and profile
// links resolve to a concrete target; everything else is treated as a fuzzy
// "describe a person" search.
function classifyKind(s) {
  const lo = (s || '').toLowerCase().trim();
  if (!lo) return 'person';
  if (/\b(jobs?|careers?|hiring|posting|positions?)\b/.test(lo)) return 'job';
  if (/(greenhouse|lever|ashbyhq|workable|wellfound|builtin|workday)\.(io|com)/.test(lo)) return 'job';
  if (lo.includes('/jobs/') || lo.includes('/careers/') || lo.includes('careers.')) return 'job';
  if (/(linkedin\.com\/in\/|x\.com\/|twitter\.com\/|github\.com\/)/.test(lo)) return 'person';
  if (/^https?:\/\//.test(lo) || lo.includes('.com/') || lo.includes('.io/')) return 'person';
  return 'fuzzy';
}

// Label + the high-level flow each kind kicks off, surfaced in the banner so
// people know what happens before they commit.
const KIND_META = {
  job:    { label: 'a job posting',     flow: 'Tailor résumé → find hiring manager → draft cold email → prep outreach' },
  person: { label: 'a specific person', flow: 'Verify email → draft cold email → write X & LinkedIn DMs' },
  fuzzy:  { label: 'a fuzzy search',    flow: 'Find matching people → you pick → draft personalized outreach' },
};

function ComposeV3({ p, go }) {
  // Paste-entry state only. Each submitted link becomes an independent run in
  // the module store (src/lib/runs-store.ts), so many can stream at once and
  // survive navigation between /app pages.
  const [input, setInput]   = useState('');
  const [intent, setIntent] = useState('');
  const [haveEmail, setHaveEmail] = useState(false);
  const [screenshot, setScreenshot] = useState(null);
  // null → trust auto-detection; otherwise the kind the user forced via the
  // "NOT RIGHT?" toggle. 'fuzzy' folds into the person flow in the store.
  const [kindOverride, setKindOverride] = useState(null);
  const runs = useRuns();
  const isMobile = useIsMobile();

  function onGo() {
    const hasText = input.trim().length > 0;
    const file = screenshot?.file;
    // Either a typed link/name/description OR an attached screenshot is enough.
    if (!hasText && !file) return;

    if (file) {
      // Screenshot-first: the vision pass decides job vs person and extracts a
      // query. Any typed text/intent rides along as a hint.
      startImageRun(file, { text: input, intent, providedEmail: haveEmail });
    } else {
      const kind = kindOverride || classifyKind(input);
      startRun(input, { intent, providedEmail: haveEmail, kind: kind === 'job' ? 'job' : 'person' });
    }
    // clear so the next link can be pasted immediately
    setInput(''); setIntent(''); setHaveEmail(false); setScreenshot(null); setKindOverride(null);
  }

  return (
    <div className="scroll" style={{
      flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: isMobile ? '24px 16px 64px' : '40px 56px 80px', background: p.paper, color: p.ink,
    }}>
      <PageHead p={p}
        eyebrow="Compose · the crew is ready"
        title="Who are you reaching out to?"
        italic="Fire off as many as you like."
        right={runs.length > 0 && (
          <InkButton p={p} kind="outline" size="sm" onClick={clearAllRuns}>↺ Clear all</InkButton>
        )}
      />

      {/* ─── paste field (always available) ─── */}
      <PasteFieldV3
        p={p} input={input} setInput={setInput}
        intent={intent} setIntent={setIntent}
        haveEmail={haveEmail} setHaveEmail={setHaveEmail}
        screenshot={screenshot} setScreenshot={setScreenshot}
        kindOverride={kindOverride} setKindOverride={setKindOverride}
        onGo={onGo}
      />

      {/* ─── one card per run, newest on top ─── */}
      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {runs.map((run) => (
          <RunCard key={run.id} p={p} run={run} go={go}/>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────── one run, all its lifecycle stages ─────────────────────── */

function RunCard({ p, run, go }) {
  const stageLabel = {
    parsing: 'reading…',
    working: run.kind === 'job' ? 'four agents on it' : 'three agents on it',
    done:    'package ready',
    error:   'needs attention',
  }[run.stage];

  return (
    <div style={{
      border: `1.5px solid ${p.ink}24`, background: p.paper, padding: '16px 18px',
    }}>
      {/* card header: kind · stage · echoed input · dismiss */}
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12,
      }}>
        <div style={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: PAPER_FONTS.mono, fontSize: 10, letterSpacing: '.16em',
            textTransform: 'uppercase', color: p.stamp,
          }}>{run.kind} · {stageLabel}</span>
          <span style={{
            fontFamily: PAPER_FONTS.mono, fontSize: 11.5, color: p.inkMute,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 460,
          }}>{run.input}</span>
          {run.screenshot && (
            <span style={{
              fontFamily: PAPER_FONTS.mono, fontSize: 10, letterSpacing: '.04em',
              color: p.leaf, border: `1px solid ${p.leaf}66`, padding: '1px 6px',
              whiteSpace: 'nowrap',
            }}>📎 {run.screenshot.name}</span>
          )}
        </div>
        <button onClick={() => dismissRun(run.id)} title="dismiss" style={{
          background: 'transparent', border: 'none', color: p.inkMute,
          fontFamily: PAPER_FONTS.mono, fontSize: 16, lineHeight: 1, cursor: 'pointer', flexShrink: 0,
        }}>×</button>
      </div>

      {/* parsing → shimmer preview */}
      {run.stage === 'parsing' && (
        <ParsedCard p={p} stage="parsing" kind={run.kind} parsed={run.parsed} hideConfirm/>
      )}

      {/* working / done → the agent row */}
      {(run.stage === 'working' || run.stage === 'done') && (
        <AgentRowV3 p={p} kind={run.kind} stage={run.stage} progress={run.progress}/>
      )}

      {/* done → the finished package */}
      {run.stage === 'done' && (
        <PackageV3 p={p} kind={run.kind} parsed={run.parsed} intent={run.intent}
          drafts={run.drafts} enrichment={run.enrichment} person={run.person} run={run}
          onReset={() => dismissRun(run.id)} go={go}/>
      )}

      {/* error → message, optional candidate picker, retry */}
      {run.stage === 'error' && (
        <>
          <div style={{
            marginTop: 12, padding: '12px 16px', background: p.card,
            border: `1.5px solid ${p.stamp}`, color: p.stamp,
            fontFamily: PAPER_FONTS.mono, fontSize: 12,
          }}>{run.error}</div>
          {Array.isArray(run.candidates) && run.candidates.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {run.candidates.map((c, i) => (
                <button key={c.name || i} onClick={() => retryRun(run.id, {
                  name: c.name, role: c.role ?? null, company: c.company ?? null, linkedin: c.linkedin ?? null,
                })} style={{
                  display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center',
                  padding: '10px 12px', background: p.paper,
                  border: `1.5px solid ${p.ink}24`, cursor: 'pointer', textAlign: 'left',
                }}>
                  <div>
                    <div style={{ fontFamily: PAPER_FONTS.sans, fontSize: 14, color: p.ink }}>{c.name}</div>
                    {(c.role || c.company) && (
                      <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.inkMute }}>
                        {[c.role, c.company].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                  {c.confidence != null && (
                    <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.stamp }}>{c.confidence}%</span>
                  )}
                </button>
              ))}
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <InkButton p={p} kind="outline" size="sm" onClick={() => retryRun(run.id)}>↻ Retry</InkButton>
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────────────────── paste field (idle state) ─────────────────────── */

function PasteFieldV3({ p, input, setInput, intent, setIntent, haveEmail, setHaveEmail, screenshot, setScreenshot, kindOverride, setKindOverride, onGo }) {
  const fileRef = useRef(null);
  const [showContext, setShowContext] = useState(false);
  const [attachError, setAttachError] = useState(null);
  // The three things you can hand us. Clicking a pill drops in a representative
  // example so the banner below can show the flow it kicks off.
  const samples = [
    { kind: 'job',    label: 'job link',     text: 'https://job-boards.greenhouse.io/thinkingmachines/jobs/5014120008' },
    { kind: 'person', label: 'person',       text: 'linkedin.com/in/maya-ramaswamy' },
    { kind: 'fuzzy',  label: 'fuzzy search', text: 'Product managers at Perplexity' },
  ];
  const hasInput = input.trim().length > 0;
  const hasScreenshot = !!screenshot;
  // Go is live when there's either typed input OR an attached screenshot the
  // vision pass can read.
  const canGo = hasInput || hasScreenshot;
  const detected = kindOverride || classifyKind(input);
  const meta = KIND_META[detected];

  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

  // setting text from the box or a pill clears any manual override so the
  // banner re-reads the fresh input.
  function setText(v) { setInput(v); setKindOverride(null); }

  function pickFile(e) {
    const f = e.target.files?.[0];
    // Reset so re-picking the same file still fires onChange.
    e.target.value = '';
    if (!f) return;
    if (!ALLOWED_IMAGE_TYPES.includes(f.type)) {
      setAttachError('Use a PNG, JPG, WEBP, or GIF.');
      return;
    }
    if (f.size > MAX_IMAGE_BYTES) {
      setAttachError('Image must be under 5MB.');
      return;
    }
    setAttachError(null);
    // Keep the real File so onGo can hand it to the vision pass + Supabase.
    setScreenshot({ name: f.name, size: `${Math.round(f.size / 1024)} KB`, file: f });
  }
  return (
    <>
      <PaperCard p={p} color={p.marigold} hardShadow style={{ padding: '22px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <Eyebrow p={p} hindi="लिंक · नाम · खयाल" en="Paste a link, name, or describe a person"/>
          <span style={{
            fontFamily: PAPER_FONTS.mono, fontSize: 10.5, letterSpacing: '.06em', color: p.inkMute,
          }}>linkedin · x · greenhouse · lever · pdf · anything</span>
        </div>
        <textarea
          value={input}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') onGo(); }}
          placeholder='x.com/maya  ·  linkedin.com/in/…  ·  "the woman who runs ops at Ramp"'
          rows={2}
          style={{
            width: '100%', resize: 'vertical', minHeight: 80,
            padding: '14px 16px', background: p.paper,
            border: `1.5px solid ${hasInput ? p.stamp : p.ink + '30'}`,
            fontFamily: PAPER_FONTS.mono, fontSize: 15, lineHeight: 1.5, color: p.ink,
            outline: 'none', transition: 'border-color .2s',
          }}
        />

        {/* ─── screenshot-only hint: no text typed, just an image ─── */}
        {!hasInput && hasScreenshot && (
          <div style={{
            marginTop: 14, paddingTop: 14,
            borderTop: `1.5px dashed ${p.ink}24`,
            display: 'flex', alignItems: 'flex-start', gap: 12,
          }}>
            <span style={{
              width: 14, height: 14, marginTop: 5, flexShrink: 0, borderRadius: '50%',
              border: `2px solid ${p.stamp}`,
              boxShadow: `inset 0 0 0 3px ${p.stamp}`, background: p.paper,
            }}/>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: PAPER_FONTS.serif, fontSize: 18, color: p.ink, lineHeight: 1.3 }}>
                Looks like <strong style={{ color: p.stamp }}>a screenshot</strong>
              </div>
              <div style={{
                fontFamily: PAPER_FONTS.mono, fontSize: 12.5, color: p.inkMute,
                marginTop: 4, lineHeight: 1.5,
              }}>Jugaadu reads it on Go → detects a job posting or a person → runs the right crew</div>
            </div>
          </div>
        )}

        {/* ─── attached-screenshot chip (always visible once attached) ─── */}
        {hasScreenshot && (
          <div style={{
            marginTop: 12, display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 12px', background: p.paper,
            border: `1.5px solid ${p.ink}24`, flexWrap: 'wrap',
          }}>
            <span style={{
              fontFamily: PAPER_FONTS.mono, fontSize: 10.5, letterSpacing: '.08em',
              color: p.leaf, textTransform: 'uppercase',
            }}>✓ attached</span>
            <span style={{
              fontFamily: PAPER_FONTS.mono, fontSize: 12, color: p.ink,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320,
            }}>{screenshot.name}</span>
            <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.inkMute }}>· {screenshot.size}</span>
            <button onClick={() => { setScreenshot(null); setAttachError(null); }} title="remove" style={{
              marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer',
              fontFamily: PAPER_FONTS.mono, fontSize: 15, lineHeight: 1, color: p.inkMute,
            }}>×</button>
          </div>
        )}

        {/* ─── "Looks like…" banner: what we detected + the flow it kicks off ─── */}
        {hasInput && (
          <div style={{
            marginTop: 14, paddingTop: 14,
            borderTop: `1.5px dashed ${p.ink}24`,
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
            gap: 16, flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
              <span style={{
                width: 14, height: 14, marginTop: 5, flexShrink: 0, borderRadius: '50%',
                border: `2px solid ${p.stamp}`,
                boxShadow: `inset 0 0 0 3px ${p.stamp}`, background: p.paper,
              }}/>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: PAPER_FONTS.serif, fontSize: 18, color: p.ink, lineHeight: 1.3 }}>
                  Looks like <strong style={{ color: p.stamp }}>{meta.label}</strong>
                </div>
                <div style={{
                  fontFamily: PAPER_FONTS.mono, fontSize: 12.5, color: p.inkMute,
                  marginTop: 4, lineHeight: 1.5,
                }}>{meta.flow}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{
                fontFamily: PAPER_FONTS.mono, fontSize: 10.5, letterSpacing: '.16em',
                color: p.inkMute, textTransform: 'uppercase',
              }}>Not right?</span>
              {(['job', 'person', 'fuzzy']).map(k => {
                const on = detected === k;
                return (
                  <button key={k} onClick={() => setKindOverride(k)} style={{
                    padding: '5px 14px', borderRadius: 999, cursor: 'pointer',
                    background: on ? p.ink : 'transparent',
                    color: on ? p.paper : p.ink,
                    border: `1.5px solid ${on ? p.ink : p.ink + '30'}`,
                    fontFamily: PAPER_FONTS.mono, fontSize: 11.5, letterSpacing: '.02em',
                  }}>{k}</button>
                );
              })}
            </div>
          </div>
        )}

        <div style={{
          marginTop: 14, paddingTop: 14, borderTop: `1.5px solid ${p.ink}18`,
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              fontFamily: PAPER_FONTS.mono, fontSize: 10.5, letterSpacing: '.16em',
              color: p.inkMute, textTransform: 'uppercase',
            }}>Try:</span>
            {samples.map(s => (
              <button key={s.label} onClick={() => setText(s.text)} style={{
                padding: '5px 11px', background: 'transparent', border: `1.5px solid ${p.ink}30`,
                fontFamily: PAPER_FONTS.mono, fontSize: 11.5, color: p.ink,
                letterSpacing: '.02em', cursor: 'pointer',
              }}>{s.label}</button>
            ))}
          </div>
          <InkButton p={p} color={p.stamp} onClick={onGo} disabled={!canGo}>
            <span>Go</span>
            <kbd style={{
              padding: '1px 6px', fontFamily: PAPER_FONTS.mono, fontSize: 10,
              background: 'rgba(255,255,255,.16)', borderRadius: 2,
            }}>⌘↵</kbd>
          </InkButton>
        </div>
      </PaperCard>

      {/* ─── Add context — optional (collapsed by default) ─── */}
      <div style={{ marginTop: 12 }}>
        <button onClick={() => setShowContext(!showContext)} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          fontFamily: PAPER_FONTS.mono, fontSize: 13, color: p.inkMute,
          letterSpacing: '.04em', padding: '4px 0',
          display: 'inline-flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ display: 'inline-block', transform: showContext ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>
          Add context <span style={{ color: p.ink + '66' }}>— optional</span>
        </button>
      </div>

      {showContext && (
        <>
          {/* what do you want to convey */}
          <div style={{
            marginTop: 10, padding: '14px 18px', background: p.card,
            border: `1.5px solid ${p.ink}30`,
          }}>
            <input
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              placeholder="What do you want to convey? (optional, e.g. 'PM at Wayfair, exploring AI roles')"
              style={{
                width: '100%', background: 'transparent', border: 'none', outline: 'none',
                fontFamily: PAPER_FONTS.serif, fontStyle: 'italic',
                fontSize: 16, color: p.ink, padding: '4px 0',
              }}
            />
          </div>

          {/* I already have their email */}
          <div style={{
            marginTop: 10, padding: '14px 18px', background: p.card,
            border: `1.5px solid ${p.ink}30`,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <button onClick={() => setHaveEmail(!haveEmail)} style={{
              width: 22, height: 22, background: haveEmail ? p.ink : 'transparent',
              color: p.paper, border: `1.5px solid ${p.ink}`,
              display: 'grid', placeItems: 'center', cursor: 'pointer', fontSize: 12,
            }}>{haveEmail ? '✓' : ''}</button>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: PAPER_FONTS.sans, fontSize: 14.5, color: p.ink }}>
                I already have their email
              </div>
              <div style={{
                fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.inkMute,
                letterSpacing: '.04em', marginTop: 2,
              }}>skip the email lookup</div>
            </div>
          </div>

          {/* attach screenshot */}
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={pickFile}/>
            <button onClick={() => fileRef.current?.click()} style={{
              padding: '8px 14px', background: 'transparent',
              border: `1.5px dashed ${p.ink}40`, color: p.ink,
              fontFamily: PAPER_FONTS.mono, fontSize: 12,
              letterSpacing: '.02em', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}>{screenshot ? '✓ attached' : '+ attach screenshot'}</button>
            <span style={{
              fontFamily: PAPER_FONTS.mono, fontSize: 10.5,
              letterSpacing: '.08em', color: p.inkMute, textTransform: 'uppercase',
            }}>{screenshot ? `${screenshot.name} · ${screenshot.size}` : 'PNG, JPG, WEBP, GIF · max 5MB · optional'}</span>
          </div>
          {attachError && (
            <div style={{
              marginTop: 6, fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.stamp,
            }}>{attachError}</div>
          )}
        </>
      )}

      <div style={{ marginTop: 22 }}>
        <Marginalia p={p} rotate={-1}>paste anything — Jugaadu sorts out what to do ↗</Marginalia>
      </div>
    </>
  );
}

/* ─────────────────────── parsed / review ─────────────────────── */

function ParsedCard({ p, stage, kind, parsed, onConfirm, onChoose, hideConfirm }) {
  const parsing = stage === 'parsing';
  const [picking, setPicking] = useState(false);

  if (!parsed) {
    return (
      <PaperCard p={p} style={{ marginTop: 14, padding: '28px 26px' }} color={p.tea}>
        <Shimmer p={p} width="40%" height={16}/>
        <div style={{ height: 14 }}/>
        <Shimmer p={p} width="80%" height={28}/>
      </PaperCard>
    );
  }

  if (kind === 'person') {
    const candidates = parsed.candidates;
    const chosen = parsed.chosen;
    return (
      <PaperCard p={p} hardShadow color={p.stamp} style={{ marginTop: 14, padding: '24px 26px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, marginBottom: 14 }}>
          <div style={{
            width: 72, height: 72, background: p.marigold, color: p.paper,
            display: 'grid', placeItems: 'center',
            fontFamily: PAPER_FONTS.display, fontSize: 32, border: `1.5px solid ${p.ink}`,
          }}>{chosen.initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Eyebrow p={p} hindi="मिल गया" en={`Best match · ${chosen.confidence}% confidence`} color={p.leaf}/>
            <div style={{
              fontFamily: PAPER_FONTS.display, fontSize: 34, lineHeight: 1.05, marginTop: 4, color: p.ink,
            }}>{chosen.name}</div>
            <div style={{ fontFamily: PAPER_FONTS.serif, fontStyle: 'italic', fontSize: 17, color: p.inkSoft, marginTop: 4 }}>
              {chosen.role} · {chosen.company}
            </div>
            <div style={{
              display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 10,
              fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.inkMute, letterSpacing: '.04em',
            }}>
              <span>● {chosen.location}</span>
              <span>· {chosen.signal}</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!hideConfirm && <InkButton p={p} color={p.stamp} onClick={onConfirm} disabled={parsing}>Send the crew →</InkButton>}
            <button onClick={() => setPicking(!picking)} style={{
              background: 'transparent', border: 'none', color: p.inkSoft,
              fontFamily: PAPER_FONTS.mono, fontSize: 11, letterSpacing: '.06em',
              cursor: 'pointer', textTransform: 'uppercase', textAlign: 'right',
            }}>{picking ? '× close' : '↓ other matches'}</button>
          </div>
        </div>

        {picking && (
          <div style={{ marginTop: 12, paddingTop: 14, borderTop: `1.5px dashed ${p.ink}30` }}>
            <Eyebrow p={p} en="Other candidates Jugaadu found" color={p.inkMute}/>
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {candidates.filter(c => c.name !== chosen.name).map(c => (
                <button key={c.name} onClick={() => { onChoose({ candidates, chosen: c }); setPicking(false); }} style={{
                  display: 'grid', gridTemplateColumns: '36px 1fr auto', gap: 12, alignItems: 'center',
                  padding: '10px 12px', background: p.paper,
                  border: `1.5px solid ${p.ink}24`, cursor: 'pointer', textAlign: 'left',
                }}>
                  <div style={{
                    width: 32, height: 32, background: p.paperShade, color: p.ink,
                    display: 'grid', placeItems: 'center',
                    fontFamily: PAPER_FONTS.display, fontSize: 13,
                  }}>{c.initials}</div>
                  <div>
                    <div style={{ fontFamily: PAPER_FONTS.sans, fontSize: 14, color: p.ink }}>{c.name}</div>
                    <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.inkMute, letterSpacing: '.02em' }}>{c.role} · {c.company}</div>
                  </div>
                  <span style={{
                    fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.stamp,
                    letterSpacing: '.04em',
                  }}>{c.confidence}%</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </PaperCard>
    );
  }

  // job — not parsed yet: be honest that the posting is read on send, don't
  // show fabricated company/role/skills.
  if (parsed.unparsed) {
    const host = jobHost(parsed.source);
    return (
      <PaperCard p={p} hardShadow color={p.marigold} style={{ marginTop: 14, padding: '24px 26px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18 }}>
          <div style={{
            width: 64, height: 64, background: p.ink, color: p.paper,
            display: 'grid', placeItems: 'center',
            fontFamily: PAPER_FONTS.display, fontSize: 28,
          }}>↗</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Eyebrow p={p} hindi="नौकरी का लिंक" en="Job link · not parsed yet" color={p.marigoldDeep}/>
            <div style={{
              fontFamily: PAPER_FONTS.display, fontSize: 28, lineHeight: 1.05, marginTop: 4, color: p.ink,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{host || 'Job posting'}</div>
            {parsed.source && (
              <div style={{
                fontFamily: PAPER_FONTS.mono, fontSize: 12, color: p.inkMute, marginTop: 4,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{parsed.source}</div>
            )}
            <div style={{ fontFamily: PAPER_FONTS.serif, fontStyle: 'italic', fontSize: 16, color: p.inkSoft, marginTop: 10 }}>
              Jugaadu reads the full posting when you send the crew.
            </div>
          </div>
          {!hideConfirm && <InkButton p={p} color={p.stamp} onClick={onConfirm} disabled={parsing}>Send the crew →</InkButton>}
        </div>
      </PaperCard>
    );
  }

  // job
  return (
    <PaperCard p={p} hardShadow color={p.marigold} style={{ marginTop: 14, padding: '24px 26px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18 }}>
        <div style={{
          width: 64, height: 64, background: p.ink, color: p.paper,
          display: 'grid', placeItems: 'center',
          fontFamily: PAPER_FONTS.display, fontSize: 28,
        }}>{parsed.logo}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Eyebrow p={p} hindi="मिली नौकरी" en={`Job parsed · ${parsed.posted}`} color={p.marigoldDeep}/>
          <div style={{
            fontFamily: PAPER_FONTS.display, fontSize: 28, lineHeight: 1.05, marginTop: 4, color: p.ink,
          }}>{parsed.role}</div>
          <div style={{ fontFamily: PAPER_FONTS.serif, fontStyle: 'italic', fontSize: 17, color: p.inkSoft, marginTop: 4 }}>
            {parsed.company} · {parsed.location} · {parsed.comp}
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {parsed.tags.map(tag => (
              <span key={tag} style={{
                padding: '3px 10px', background: p.paper, border: `1px solid ${p.ink}30`,
                fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.ink, letterSpacing: '.02em',
              }}>{tag}</span>
            ))}
          </div>
        </div>
        {!hideConfirm && <InkButton p={p} color={p.stamp} onClick={onConfirm} disabled={parsing}>Send the crew →</InkButton>}
      </div>
    </PaperCard>
  );
}

function Shimmer({ p, width = 100, height = 12 }) {
  return (
    <div style={{
      display: 'inline-block', width, height,
      background: `linear-gradient(90deg, ${p.ink}10 0%, ${p.ink}24 50%, ${p.ink}10 100%)`,
      backgroundSize: '200% 100%', animation: 'shimmer 1.4s linear infinite',
    }}/>
  );
}

/* ─────────────────────── working agents row ─────────────────────── */

const AGENTS_DATA = {
  person: [
    { k: 'person',   nameEn: 'Person Khoji', nameHi: 'खोजी',     glyph: '◆', color: 'leaf',     tag: 'Agent 1',
      steps: ['scraping their profile…', 'cross-checking LinkedIn…', 'ranking by signal…', 'locking in target…', 'identified ✓'] },
    { k: 'email',    nameEn: 'Email Wallah', nameHi: 'ईमेल वाला', glyph: '✉', color: 'stamp',    tag: 'Agent 2',
      steps: ['querying Apollo…', 'checking Hunter…', 'verifying MX…', 'cross-validating…', '96% verified'] },
    { k: 'outreach', nameEn: 'Outreach Bhai',nameHi: 'आउटरीच भाई',glyph: '↗', color: 'marigold', tag: 'Agent 3',
      steps: ['reading their threads…', 'finding a real hook…', 'matching your voice…', 'drafting 3 channels…', 'drafts ready'] },
  ],
  job: [
    { k: 'resume',   nameEn: 'Resume',       nameHi: 'रेज़्यूमे',   glyph: '§', color: 'marigold', tag: 'Agent 1',
      steps: ['pulling your CV…', 'matching to JD…', 'rewriting bullets…', 'checking ATS…', 'PDF + Word ready'] },
    { k: 'person',   nameEn: 'Person Khoji', nameHi: 'खोजी',     glyph: '◆', color: 'leaf',     tag: 'Agent 2',
      steps: ['scraping the team…', 'ranking by fit…', 'cross-checking LinkedIn…', 'shortlisting…', 'hiring manager picked'] },
    { k: 'email',    nameEn: 'Email Wallah', nameHi: 'ईमेल वाला', glyph: '✉', color: 'stamp',    tag: 'Agent 3',
      steps: ['querying Apollo…', 'checking Hunter…', 'verifying MX…', 'cross-validating…', '96% verified'] },
    { k: 'outreach', nameEn: 'Outreach Bhai',nameHi: 'आउटरीच भाई',glyph: '↗', color: 'tea',      tag: 'Agent 4',
      steps: ['reading her threads…', 'finding a hook…', 'matching voice…', 'drafting + queueing followup…', 'cold email ready'] },
  ],
};

function colorOf(p, name) {
  return ({ marigold: p.marigold, stamp: p.stamp, leaf: p.leaf, tea: p.tea }[name]) || p.ink;
}

function AgentRowV3({ p, kind, stage, progress }) {
  const isMobile = useIsMobile();
  const agents = AGENTS_DATA[kind] || AGENTS_DATA.person;
  return (
    <div style={{
      marginTop: 14, display: 'grid',
      gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : `repeat(${agents.length}, 1fr)`, gap: 12,
    }}>
      {agents.map(a => {
        const pct = progress[a.k] || (stage === 'done' ? 100 : 0);
        const working = stage === 'working' && pct < 100;
        const done = pct >= 100;
        const stepI = Math.min(a.steps.length - 1, Math.floor((pct / 100) * a.steps.length));
        const ac = colorOf(p, a.color);
        return (
          <div key={a.k} style={{
            background: p.card, color: p.ink,
            border: `1.5px solid ${done ? p.ink : p.ink + '40'}`,
            boxShadow: done ? `4px 4px 0 ${ac}` : 'none',
            padding: '16px 16px 14px', position: 'relative', minWidth: 0,
            minHeight: 168, display: 'flex', flexDirection: 'column', gap: 8,
            transition: 'box-shadow .25s, border-color .25s',
          }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 3,
              background: p.ink + '14', overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', width: `${pct}%`, background: ac,
                boxShadow: working ? `0 0 10px ${ac}` : 'none',
                transition: 'width .3s',
              }}/>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{
                width: 36, height: 36,
                background: done ? ac : 'transparent', color: done ? p.paper : ac,
                border: `1.5px solid ${ac}`,
                display: 'grid', placeItems: 'center',
                fontFamily: PAPER_FONTS.display, fontSize: 18,
              }}>{a.glyph}</div>
              <span style={{
                fontFamily: PAPER_FONTS.mono, fontSize: 9.5, letterSpacing: '.16em',
                color: done ? ac : p.inkMute, textTransform: 'uppercase',
              }}>{a.tag}</span>
            </div>
            <div>
              <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 19, lineHeight: 1.05, color: p.ink }}>{a.nameEn}</div>
            </div>
            <div style={{
              marginTop: 'auto', padding: '8px 10px',
              background: done ? p.paper : 'transparent',
              border: `1px solid ${done ? ac + '60' : p.ink + '20'}`,
              display: 'flex', alignItems: 'center', gap: 8, minHeight: 36,
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: 999, background: ac,
                animation: working ? 'pulseDot 1.1s ease-in-out infinite' : 'none',
                opacity: pct === 0 ? .3 : 1, flexShrink: 0,
              }}/>
              <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.ink, lineHeight: 1.3 }}>
                {pct === 0 && stage === 'working' ? 'queued…' : a.steps[stepI]}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────── package (done) ─────────────────────── */

// The email draft surfaced in the package. Shared so the header CTA and the
// per-card "Open in Gmail" button open the exact same message. Real outreach
// draft + best-available address; prefer a verified email, fall back to the top
// format-guess so "To" is never empty. Honest blanks when nothing was found —
// never fabricated sample copy. Works the same for job and person runs.
function buildEmailDraft({ drafts, enrichment }) {
  const emailDraft = Array.isArray(drafts) ? drafts.find((d) => d.channel === 'email') : null;
  const guess = Array.isArray(enrichment?.guesses) && enrichment.guesses.length
    ? enrichment.guesses[0].email : '';
  return {
    to: enrichment?.email || guess || '',
    subject: emailDraft?.subject || '',
    body: emailDraft?.body || '',
  };
}

// "Another angle" presets. Each is a one-line directive the redraft endpoint
// applies to the draft that's currently on screen — facts and ask preserved,
// just a different cut.
const ANGLE_PRESETS = [
  { id: 'angle',   label: '↻ Another angle',   directive: 'Rewrite with a completely different opening hook and angle. Keep the same facts and the single ask, but find a fresh way in — do not reuse the first sentence.' },
  { id: 'shorter', label: '✂ Make it shorter', directive: 'Cut it down hard — aim for 60–80 words. Keep only the single strongest specific reference and the ask. Strip throat-clearing and filler.' },
  { id: 'founder', label: '⚡ More founder-like', directive: 'Rewrite in a direct, high-conviction founder voice: short sentences, plain words, a clear point of view, no hedging and no corporate softeners.' },
  { id: 'warmer',  label: '☺ Warmer',          directive: 'Make it warmer and more personable while staying concise — a touch more human, still not gushing or over-familiar.' },
  { id: 'formal',  label: '◷ More formal',     directive: 'Make the tone a notch more formal and polished, without becoming stiff or corporate.' },
];

// The "Another angle" control: an outline button that opens a small menu of
// rewrite presets. Selecting one calls regenerateDraft, which swaps the new copy
// into the run's drafts so the card re-renders. Reads its busy/error state from
// the live run so a rewrite kicked off here shows progress anywhere it's mounted.
function AnotherAngle({ p, runId, channel, subject, body, recipientName, style }) {
  const [open, setOpen] = useState(false);
  const runs = useRuns();
  const run = runs.find((r) => r.id === runId);
  const busy = run?.redrafting === channel;
  const err = run?.redraftError;
  const disabled = busy || !body;

  return (
    <div style={{ position: 'relative', ...style }}>
      <InkButton p={p} kind="outline" size="sm" style={{ width: '100%' }}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}>
        {busy ? 'Rewriting…' : '↻ Another angle ▾'}
      </InkButton>
      {open && !busy && (
        <>
          {/* click-away catcher */}
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }}/>
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 20,
            background: p.paper, border: `1.5px solid ${p.ink}`,
            boxShadow: `3px 3px 0 ${p.ink}1a`,
          }}>
            {ANGLE_PRESETS.map((preset, i) => (
              <button key={preset.id} onClick={() => {
                setOpen(false);
                regenerateDraft(runId, channel, preset.directive, { subject, body, recipientName });
              }} style={{
                display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                padding: '8px 12px', background: 'transparent', color: p.ink,
                border: 'none', borderTop: i ? `1px solid ${p.ink}1a` : 'none',
                fontFamily: PAPER_FONTS.sans, fontSize: 12.5,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = p.ink + '0d'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                {preset.label}
              </button>
            ))}
          </div>
        </>
      )}
      {err && (
        <div style={{
          marginTop: 6, fontFamily: PAPER_FONTS.mono, fontSize: 10, color: p.stamp,
        }}>{err}</div>
      )}
    </div>
  );
}

// Rotating placeholder hints for the "Steer the draft" input. Cycle slowly so
// they read as suggestions, not noise; pause cycling whenever the input is
// focused or non-empty.
const STEER_HINTS = [
  "focus on their pottery side project",
  "mention we both went to Cornell",
  "lean on the fundraising angle",
  "emphasize their recent NYC move",
];

// "Steer the draft" — a free-form text strip that fans one directive across all
// three channels via steerAllChannels. Sits between the draft body and the
// action row inside PersonPackage. Reads busy/error/history from the live run
// so a steer kicked off from one tab is visible from any tab.
function SteerDraft({ p, runId, drafts, recipientName }) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [hintIdx, setHintIdx] = useState(0);
  const runs = useRuns();
  const run = runs.find((r) => r.id === runId);
  const busy = !!run?.steering;
  const err = run?.steerError;
  const history = Array.isArray(run?.steerHistory) ? run.steerHistory : [];
  const hasAnyDraft = Array.isArray(drafts) && drafts.some((d) => (d?.body || "").trim());
  const disabled = busy || !hasAnyDraft;

  useEffect(() => {
    if (focused || value) return;
    const t = setInterval(() => setHintIdx((i) => (i + 1) % STEER_HINTS.length), 4000);
    return () => clearInterval(t);
  }, [focused, value]);

  function submit(directive) {
    const text = (directive || "").trim();
    if (!text || disabled) return;
    setValue("");
    steerAllChannels(runId, text, { drafts, recipientName });
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Eyebrow p={p} hindi="हुक्म" en="Steer all three →" color={p.marigold || p.stamp}/>
        {busy && (
          <span style={{
            fontFamily: PAPER_FONTS.mono, fontSize: 10, color: p.stamp, letterSpacing: '.08em',
          }}>REWRITING ALL THREE…</span>
        )}
      </div>
      <div style={{
        display: 'flex', alignItems: 'stretch', gap: 0,
        border: `1.5px solid ${p.ink}`, background: p.paper,
        opacity: disabled && !busy ? 0.55 : 1,
      }}>
        <textarea
          rows={1}
          value={value}
          disabled={disabled}
          placeholder={hasAnyDraft ? STEER_HINTS[hintIdx] : 'waiting for the draft…'}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit(value);
            }
          }}
          style={{
            flex: 1, resize: 'none', border: 'none', outline: 'none', background: 'transparent',
            color: p.ink, padding: '10px 12px',
            fontFamily: PAPER_FONTS.sans, fontSize: 13.5, lineHeight: 1.4,
          }}
        />
        <button
          onClick={() => submit(value)}
          disabled={disabled || !value.trim()}
          aria-label="Steer all three drafts"
          style={{
            padding: '0 14px', border: 'none', borderLeft: `1.5px solid ${p.ink}`,
            background: value.trim() && !disabled ? p.ink : 'transparent',
            color: value.trim() && !disabled ? p.paper : p.ink,
            cursor: value.trim() && !disabled ? 'pointer' : 'default',
            fontFamily: PAPER_FONTS.mono, fontSize: 12, letterSpacing: '.08em',
          }}>
          {busy ? '…' : 'SEND ↵'}
        </button>
      </div>
      {history.length > 0 && (
        <div style={{
          marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        }}>
          <span style={{
            fontFamily: PAPER_FONTS.mono, fontSize: 10, color: p.inkMute, letterSpacing: '.08em',
          }}>RECENT</span>
          {history.map((h) => (
            <button key={h} onClick={() => submit(h)} disabled={disabled} style={{
              padding: '4px 8px', background: 'transparent', color: p.ink,
              border: `1px solid ${p.ink}40`, cursor: disabled ? 'default' : 'pointer',
              fontFamily: PAPER_FONTS.sans, fontSize: 11.5, maxWidth: 220,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = p.ink + '0d'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
              {h}
            </button>
          ))}
        </div>
      )}
      {err && (
        <div style={{
          marginTop: 6, fontFamily: PAPER_FONTS.mono, fontSize: 10, color: p.stamp,
        }}>{err}</div>
      )}
    </div>
  );
}

function PackageV3({ p, kind, parsed, intent, drafts, enrichment, person, run, onReset, go }) {
  const headerEmail = buildEmailDraft({ drafts, enrichment });
  const isMobile = useIsMobile();
  return (
    <div style={{ marginTop: 18 }}>
      <PaperCard p={p} hardShadow color={p.stamp} style={{ padding: '20px 24px' }}>
        <div style={{
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          gap: 18, flexWrap: 'wrap',
        }}>
          <div style={{ minWidth: 0 }}>
            <Eyebrow p={p} hindi="हो गया" en={`Package ready · ${kind === 'job' ? '47s' : '32s'}`} color={p.stamp}/>
            <div style={{
              fontFamily: PAPER_FONTS.display, fontSize: isMobile ? 23 : 30, lineHeight: 1.05, marginTop: 6, color: p.ink,
            }}>
              Everything you need to send,
              <span style={{ fontStyle: 'italic', color: p.stamp }}> in your voice.</span>
            </div>
          </div>
          <div style={{
            display: 'flex', gap: 10,
            flexDirection: isMobile ? 'column' : 'row',
            width: isMobile ? '100%' : 'auto',
          }}>
            <InkButton p={p} kind="outline" onClick={onReset}
              style={isMobile ? { width: '100%', justifyContent: 'center' } : undefined}>↺ Another</InkButton>
            <InkButton p={p} color={p.stamp} onClick={() => headerEmail.body && openGmailCompose(headerEmail)}
              style={isMobile ? { width: '100%', justifyContent: 'center' } : undefined}>
              <span style={{
                width: 18, height: 18, background: p.paper, color: p.stamp,
                display: 'grid', placeItems: 'center', fontFamily: PAPER_FONTS.mono,
                fontSize: 11, fontWeight: 700,
              }}>G</span>
              Open in Gmail
            </InkButton>
          </div>
        </div>
      </PaperCard>

      {kind === 'person'
        ? <PersonPackage p={p} parsed={parsed} drafts={drafts} enrichment={enrichment} run={run} go={go}/>
        : <JobPackage    p={p} parsed={parsed} drafts={drafts} enrichment={enrichment} person={person} run={run} go={go}/>
      }
    </div>
  );
}

function PersonPackage({ p, parsed, drafts, enrichment, run, go }) {
  const [channel, setChannel] = useState('email'); // email | linkedin | x
  const isMobile = useIsMobile();

  // The real researched person streamed back from /api/compose (research step).
  // Fall back to the lightweight paste-preview only for the headline fields, so
  // the card never goes blank — but everything shown is the actual human, not
  // fabricated sample copy.
  const research = run?.person || null;
  const stub = parsed?.chosen || {};
  const personName = research?.name || stub.name || null;
  const personRole = research?.role || stub.role || null;
  const personCompany = research?.company || stub.company || null;
  const personLinks = research?.links || {};
  const personFacts = (research?.context_lines || []).filter(Boolean);
  const initials = personName
    ? personName.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
    : (stub.initials || '?');
  const matchLabel = research?.match_confidence ? `${research.match_confidence} match` : null;

  // Real drafts from the Outreach agent. The pipeline speaks 'x_dm'; the UI tabs
  // say 'x' — normalize so the X tab shows its real draft (and a redraft, which
  // upserts under 'x', lands in the same slot).
  const draftByChannel = {};
  if (Array.isArray(drafts)) for (const d of drafts) {
    draftByChannel[d.channel === 'x_dm' ? 'x' : d.channel] = d;
  }

  // Ranked real addresses (verified → plausible → guess) for the email channel.
  const emailMsg = buildEmailDraft({ drafts, enrichment });
  const emailCandidates = buildEmailCandidates(enrichment);
  const emailPrimary = emailCandidates[0] || null;
  const emailOthers = emailCandidates.slice(1);

  const messages = {
    email: emailMsg,
    linkedin: {
      to: personLinks.linkedin ? personLinks.linkedin.replace(/^https?:\/\//, '') : (personName || ''),
      subject: null,
      body: draftByChannel.linkedin?.body || '',
    },
    x: {
      to: personLinks.x ? personLinks.x.replace(/^https?:\/\//, '') : (personName || ''),
      subject: null,
      body: draftByChannel.x?.body || '',
    },
  };
  const m = messages[channel];

  return (
    <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: 12 }}>
      {/* draft */}
      <PaperCard p={p} style={{ padding: '20px 22px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Eyebrow p={p} hindi="संदेश" en="The draft · choose channel" color={p.stamp}/>
          <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 10.5, color: p.leaf, letterSpacing: '.06em' }}>VOICE 96%</span>
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {[
            { id: 'email',    label: '✉ Email',     desc: 'cold email' },
            { id: 'linkedin', label: 'in LinkedIn', desc: 'DM' },
            { id: 'x',        label: '𝕏  X',        desc: 'reply / DM' },
          ].map(c => {
            const on = channel === c.id;
            return (
              <button key={c.id} onClick={() => setChannel(c.id)} style={{
                flex: 1, minWidth: 0, overflow: 'hidden', padding: '10px 12px',
                background: on ? p.ink : 'transparent',
                color: on ? p.paper : p.ink, border: `1.5px solid ${p.ink}`,
                fontFamily: PAPER_FONTS.display, fontSize: 16, textAlign: 'left',
                cursor: 'pointer',
              }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</div>
                <div style={{
                  fontFamily: PAPER_FONTS.mono, fontSize: 9.5, letterSpacing: '.1em',
                  opacity: .7, marginTop: 2, textTransform: 'uppercase',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{c.desc}</div>
              </button>
            );
          })}
        </div>
        <div style={{
          background: p.paper, border: `1.5px solid ${p.ink}30`,
          padding: '14px 16px', fontFamily: PAPER_FONTS.sans, fontSize: 14, lineHeight: 1.55,
        }}>
          <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 11.5, color: p.inkMute, marginBottom: 6, overflowWrap: 'anywhere' }}>
            <span style={{ color: p.inkMute }}>To &nbsp;</span>
            <span style={{ color: m.to ? p.ink : p.inkMute }}>
              {m.to || (channel === 'email' ? '(no public email found — add it in Gmail)' : '(profile link not found)')}
            </span>
            {channel === 'email' && emailPrimary && <TierBadge p={p} tier={emailPrimary.tier}/>}
          </div>
          {channel === 'email' && emailOthers.length > 0 && (
            <EmailOptions p={p} candidates={emailOthers} subject={m.subject} body={m.body}
              header="other addresses · click to use"/>
          )}
          {m.subject && (
            <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 11.5, color: p.inkMute, marginTop: 6, marginBottom: 8 }}>
              <span style={{ color: p.inkMute }}>Subject &nbsp;</span><span style={{ color: p.ink }}>{m.subject}</span>
            </div>
          )}
          <div style={{ height: 1, background: p.ink + '14', margin: '8px 0 10px' }}/>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap', color: p.ink }}>
            {m.body || 'The draft for this channel will appear here once the Outreach agent finishes.'}
          </p>
        </div>
        <SteerDraft p={p} runId={run?.id} drafts={drafts} recipientName={personName}/>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {channel === 'email' && (
            <InkButton p={p} color={p.stamp} size="sm" disabled={!m.body} onClick={() => {
              openGmailCompose({ to: m.to, subject: m.subject, body: m.body });
            }}>Open in Gmail →</InkButton>
          )}
          <AnotherAngle p={p} runId={run?.id} channel={channel} style={{ flex: 1 }}
            subject={m.subject} body={m.body} recipientName={personName}/>
        </div>
      </PaperCard>

      {/* person */}
      <PaperCard p={p} style={{ padding: '20px 22px', minWidth: 0 }}>
        <Eyebrow p={p} hindi="वो" en={matchLabel ? `The person · ${matchLabel}` : 'The person'} color={p.leaf}/>
        {personName ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
              <div style={{
                width: 52, height: 52, background: p.marigold, color: p.paper,
                display: 'grid', placeItems: 'center', fontFamily: PAPER_FONTS.display, fontSize: 20,
                border: `1.5px solid ${p.ink}`,
              }}>{initials}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 19, color: p.ink }}>{personName}</div>
                {(personRole || personCompany) && (
                  <div style={{ fontFamily: PAPER_FONTS.serif, fontStyle: 'italic', fontSize: 13.5, color: p.inkSoft }}>
                    {[personRole, personCompany].filter(Boolean).join(' · ')}
                  </div>
                )}
                {personLinks.linkedin && (
                  <a
                    href={personLinks.linkedin.match(/^https?:\/\//) ? personLinks.linkedin : `https://${personLinks.linkedin}`}
                    target="_blank" rel="noopener noreferrer"
                    title="Open LinkedIn profile in a new tab"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 5,
                      fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.stamp,
                      textDecoration: 'none', letterSpacing: '.04em',
                    }}>in · View LinkedIn ↗</a>
                )}
              </div>
            </div>
            {personFacts.length > 0 && (
              <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {personFacts.map(f => (
                  <span key={f} style={{
                    padding: '4px 10px', background: p.paper, border: `1px solid ${p.ink}30`,
                    fontFamily: PAPER_FONTS.sans, fontSize: 11.5, color: p.ink,
                  }}>{f}</span>
                ))}
              </div>
            )}
            <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
              {emailPrimary && (
                <KV p={p} k="email" v={emailPrimary.email}
                  chip={tierMeta(p, emailPrimary.tier).label}
                  chipColor={tierMeta(p, emailPrimary.tier).color}/>
              )}
              {personLinks.linkedin && <KV p={p} k="linkedin" v={personLinks.linkedin.replace(/^https?:\/\//, '')} href={withHttps(personLinks.linkedin)}/>}
              {personLinks.x && <KV p={p} k="x" v={personLinks.x.replace(/^https?:\/\//, '')} href={withHttps(personLinks.x)}/>}
              {personLinks.website && <KV p={p} k="website" v={personLinks.website.replace(/^https?:\/\//, '')} href={withHttps(personLinks.website)}/>}
              {personLinks.github && <KV p={p} k="github" v={personLinks.github.replace(/^https?:\/\//, '')} href={withHttps(personLinks.github)}/>}
            </div>
            <button onClick={() => go('people')} style={{
              marginTop: 12, width: '100%', padding: '10px 12px', background: 'transparent',
              border: `1.5px dashed ${p.ink}40`, color: p.ink,
              fontFamily: PAPER_FONTS.mono, fontSize: 11.5, letterSpacing: '.08em',
              textTransform: 'uppercase', cursor: 'pointer',
            }}>Save to People ↗</button>
          </>
        ) : (
          <div style={{
            marginTop: 12, fontFamily: PAPER_FONTS.serif, fontStyle: 'italic',
            fontSize: 13, color: p.inkMute,
          }}>
            The crew couldn&apos;t pin down a specific person. Try a LinkedIn or X
            link, or add a company in the intent box.
          </div>
        )}
      </PaperCard>
    </div>
  );
}

function JobPackage({ p, parsed, drafts, enrichment, person, run, go }) {
  const [picking, setPicking] = useState(false);
  const [expanded, setExpanded] = useState(false);   // full-size resume modal
  const [showNotes, setShowNotes] = useState(false);  // regenerate-with-notes panel
  const [showChanges, setShowChanges] = useState(false); // "what changed" panel
  const [notes, setNotes] = useState('');
  const [downloading, setDownloading] = useState(null); // 'pdf' | 'docx' | null
  const [dlError, setDlError] = useState(null);
  const isMobile = useIsMobile();
  const regenerating = !!run?.regenerating;

  async function handleDownload(fmt) {
    setDlError(null);
    setDownloading(fmt);
    try {
      await downloadResumeBlob(resume, fmt);
    } catch (e) {
      setDlError(String(e?.message || e));
    } finally {
      setDownloading(null);
    }
  }
  // Everything here is real data produced by the crew for the job URL the user
  // pasted: the tailor agent's resume, the research agent's hiring manager, the
  // email lookup, and the outreach draft. Fall back to honest placeholders only
  // when an agent genuinely returned nothing — never to fabricated sample copy.
  const jobRole = parsed?.role;
  const jobCompany = parsed?.company;
  const atsScore = parsed?.ats_score;
  const atsScoreBefore = parsed?.ats_score_before;
  const resume = parsed?.resume;
  const changes = Array.isArray(resume?.changes) ? resume.changes : [];

  // Real outreach draft + best-available email via the shared builder.
  const { to: emailTo, subject: emailSubject, body: emailBody } =
    buildEmailDraft({ drafts, enrichment });
  // Discovered/guessed addresses ranked into confidence tiers (high=verified,
  // medium=plausible, low=pure guess). The first is the primary recipient.
  const emailCandidates = buildEmailCandidates(enrichment);
  const emailPrimary = emailCandidates[0] || null;
  const emailOthers = emailCandidates.slice(1);

  const personName = person?.name || null;
  const personRole = person?.role || null;
  const personCompany = person?.company || jobCompany || null;
  const personFacts = (person?.context_lines || []).filter(Boolean);
  const personLinks = person?.links || {};
  const initials = personName
    ? personName.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
    : '?';
  const matchLabel = person?.match_confidence ? `${person.match_confidence} match` : null;
  const candidates = Array.isArray(run?.candidates) ? run.candidates : [];
  const searched = person?.searched || null;

  return (
    <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.2fr 1fr', gap: 12 }}>
      {/* resume */}
      <PaperCard p={p} style={{ padding: '20px 22px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Eyebrow p={p} hindi="रेज़्यूमे" en="Tailored resume" color={p.marigold}/>
          <AtsBadge p={p} before={atsScoreBefore} after={atsScore}/>
        </div>
        {(jobRole || jobCompany) && (
          <div style={{
            fontFamily: PAPER_FONTS.serif, fontStyle: 'italic', fontSize: 13, color: p.inkSoft, marginTop: 6,
          }}>
            for {[jobRole, jobCompany].filter(Boolean).join(' at ')}
          </div>
        )}
        <div
          onClick={() => resume && setExpanded(true)}
          title={resume ? 'Click to read the full resume' : undefined}
          style={{
          marginTop: 12, background: p.paper, border: `1.5px solid ${p.ink}30`,
          aspectRatio: '8.5/11', padding: '14px 14px', position: 'relative',
          fontFamily: PAPER_FONTS.serif, color: p.ink, fontSize: 8, lineHeight: 1.3, overflow: 'hidden',
          cursor: resume ? 'zoom-in' : 'default',
        }}>
          {resume && (
            <div style={{
              position: 'absolute', top: 8, right: 8, zIndex: 2,
              padding: '3px 8px', background: p.ink, color: p.paper,
              fontFamily: PAPER_FONTS.mono, fontSize: 8, letterSpacing: '.08em',
              textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4,
            }}>⤢ expand</div>
          )}
          {resume ? (
            <>
              <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 14 }}>
                {resume.header?.full_name || 'Your name'}
              </div>
              {(resume.header?.email || resume.header?.location || resume.header?.links?.website) && (
                <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 7, color: p.inkMute, marginTop: 2 }}>
                  {[resume.header?.email, resume.header?.location, resume.header?.links?.website]
                    .filter(Boolean).join(' · ')}
                </div>
              )}
              <div style={{ height: 1, background: p.ink + '30', margin: '6px 0' }}/>
              {resume.summary && <div style={{ marginBottom: 4 }}>{resume.summary}</div>}
              {(resume.experience || []).slice(0, 2).map((exp, i) => (
                <div key={i} style={{ marginTop: i ? 6 : 0 }}>
                  <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 9 }}>
                    {[exp.role, exp.company].filter(Boolean).join(' · ')}
                  </div>
                  {(exp.bullets || []).slice(0, 3).map((b, j) => (
                    <div key={j}>· {b}</div>
                  ))}
                </div>
              ))}
              {(resume.skills || []).length > 0 && (
                <>
                  <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 9, marginTop: 6 }}>Skills</div>
                  {resume.skills.slice(0, 2).map((s, i) => (
                    <div key={i}>· {s.group ? `${s.group}: ` : ''}{(s.items || []).join(', ')}</div>
                  ))}
                </>
              )}
            </>
          ) : (
            <div style={{ fontFamily: PAPER_FONTS.serif, fontStyle: 'italic', color: p.inkMute }}>
              The tailored resume preview will appear here once the Resume agent finishes.
            </div>
          )}
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, height: 50,
            background: `linear-gradient(to bottom, transparent, ${p.paper})`,
          }}/>
          <div style={{
            position: 'absolute', right: 8, bottom: 6,
            fontFamily: PAPER_FONTS.mono, fontSize: 7, color: p.inkMute,
          }}>PDF · 1 of {resume?.meta?.page_count || 1}</div>
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
          <InkButton p={p} kind="outline" size="sm" style={{ flex: 1 }}
            disabled={!resume || downloading === 'pdf'}
            onClick={() => handleDownload('pdf')}>
            {downloading === 'pdf' ? '…PDF' : '↓ PDF'}
          </InkButton>
          <InkButton p={p} kind="outline" size="sm" style={{ flex: 1 }}
            disabled={!resume || downloading === 'docx'}
            onClick={() => handleDownload('docx')}>
            {downloading === 'docx' ? '…Word' : '↓ Word'}
          </InkButton>
          <InkButton p={p} kind={showNotes ? 'solid' : 'outline'} size="sm" style={{ flex: 1 }}
            disabled={!resume}
            onClick={() => setShowNotes((s) => !s)}>
            ✎ Notes
          </InkButton>
        </div>
        {dlError && (
          <div style={{
            marginTop: 8, fontFamily: PAPER_FONTS.mono, fontSize: 10.5, color: p.stamp,
          }}>{dlError}</div>
        )}

        {/* what changed — your resume vs the tailored version, with the why */}
        {changes.length > 0 && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1.5px dashed ${p.ink}24` }}>
            <button onClick={() => setShowChanges((s) => !s)} style={{
              background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
              color: p.inkSoft, fontFamily: PAPER_FONTS.mono, fontSize: 11,
              letterSpacing: '.06em', textTransform: 'uppercase',
            }}>
              {showChanges ? '× hide changes' : `✦ what changed (${changes.length})`}
            </button>
            {showChanges && (
              <div style={{ marginTop: 10 }}>
                <ChangeList p={p} changes={changes} compact/>
              </div>
            )}
          </div>
        )}

        {/* regenerate with notes — reruns ONLY the resume agent */}
        {showNotes && (
          <div style={{
            marginTop: 10, paddingTop: 10, borderTop: `1.5px dashed ${p.ink}24`,
          }}>
            <div style={{
              fontFamily: PAPER_FONTS.mono, fontSize: 10, letterSpacing: '.1em',
              textTransform: 'uppercase', color: p.inkMute, marginBottom: 6,
            }}>What should change?</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={regenerating}
              placeholder="e.g. lead with my platform work, cut the older bullets, push the AI/ML angle harder, make it one page"
              rows={3}
              style={{
                width: '100%', resize: 'vertical', minHeight: 64,
                padding: '10px 12px', background: p.paper,
                border: `1.5px solid ${p.ink}30`,
                fontFamily: PAPER_FONTS.mono, fontSize: 12, lineHeight: 1.5, color: p.ink,
                outline: 'none',
              }}
            />
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
              <InkButton p={p} color={p.marigold} size="sm"
                disabled={!notes.trim() || regenerating}
                onClick={async () => { await regenerateResume(run.id, notes); setNotes(''); }}>
                {regenerating ? 'Regenerating…' : '↻ Regenerate resume'}
              </InkButton>
              <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 10.5, color: p.inkMute }}>
                reruns the Resume agent only
              </span>
            </div>
            {run?.regenError && (
              <div style={{
                marginTop: 8, fontFamily: PAPER_FONTS.mono, fontSize: 10.5, color: p.stamp,
              }}>{run.regenError}</div>
            )}
          </div>
        )}
      </PaperCard>

      {expanded && resume && (
        <ResumeModal p={p} resume={resume} jobRole={jobRole} jobCompany={jobCompany}
          atsScore={atsScore} atsScoreBefore={atsScoreBefore} onClose={() => setExpanded(false)}/>
      )}

      {/* email draft */}
      <PaperCard p={p} style={{ padding: '20px 22px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Eyebrow p={p} hindi="संदेश" en="Cold email · drafted" color={p.tea}/>
          <span style={{
            fontFamily: PAPER_FONTS.mono, fontSize: 10.5, color: p.leaf, letterSpacing: '.06em',
          }}>VOICE 96%</span>
        </div>
        <div style={{
          background: p.paper, border: `1.5px solid ${p.ink}30`,
          padding: '12px 14px', fontFamily: PAPER_FONTS.sans, fontSize: 13, lineHeight: 1.55,
        }}>
          <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.inkMute, overflowWrap: 'anywhere' }}>
            <span>To &nbsp;</span>
            <span style={{ color: emailTo ? p.ink : p.inkMute }}>
              {emailTo || '(no public email found — add it in Gmail)'}
            </span>
            {emailPrimary && <TierBadge p={p} tier={emailPrimary.tier}/>}
          </div>
          {emailOthers.length > 0 && (
            <EmailOptions p={p} candidates={emailOthers} subject={emailSubject} body={emailBody}
              header="other addresses · click to use"/>
          )}
          {emailSubject && (
            <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.inkMute, marginTop: 4 }}>
              <span>Subject &nbsp;</span><span style={{ color: p.ink }}>{emailSubject}</span>
            </div>
          )}
          <div style={{ height: 1, background: p.ink + '14', margin: '8px 0' }}/>
          <p style={{ margin: 0, color: p.ink, whiteSpace: 'pre-wrap' }}>
            {emailBody || 'The cold email draft will appear here once the Outreach agent finishes.'}
          </p>
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <InkButton p={p} color={p.stamp} size="sm" style={{ flex: 1 }} disabled={!emailBody} onClick={() => {
            openGmailCompose({ to: emailTo, subject: emailSubject, body: emailBody });
          }}>Open in Gmail →</InkButton>
          <AnotherAngle p={p} runId={run?.id} channel="email" style={{ flex: 1 }}
            subject={emailSubject} body={emailBody} recipientName={personName}/>
        </div>
      </PaperCard>

      {/* person */}
      <PaperCard p={p} style={{ padding: '20px 22px', minWidth: 0 }}>
        <Eyebrow p={p} hindi="वो" en={matchLabel ? `Hiring manager · ${matchLabel}` : 'Hiring manager'} color={p.leaf}/>
        {personName ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
              <div style={{
                width: 52, height: 52, background: p.marigold, color: p.paper,
                display: 'grid', placeItems: 'center', fontFamily: PAPER_FONTS.display, fontSize: 18,
                border: `1.5px solid ${p.ink}`,
              }}>{initials}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 18, color: p.ink }}>{personName}</div>
                {(personRole || personCompany) && (
                  <div style={{ fontFamily: PAPER_FONTS.serif, fontStyle: 'italic', fontSize: 13, color: p.inkSoft }}>
                    {[personRole, personCompany].filter(Boolean).join(' · ')}
                  </div>
                )}
                {personLinks.linkedin && (
                  <a
                    href={personLinks.linkedin.match(/^https?:\/\//) ? personLinks.linkedin : `https://${personLinks.linkedin}`}
                    target="_blank" rel="noopener noreferrer"
                    title="Open LinkedIn profile in a new tab"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 5,
                      fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.stamp,
                      textDecoration: 'none', letterSpacing: '.04em',
                    }}>in · View LinkedIn ↗</a>
                )}
              </div>
            </div>
            {personFacts.length > 0 && (
              <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {personFacts.map((f) => (
                  <span key={f} style={{
                    padding: '4px 10px', background: p.paper, border: `1px solid ${p.ink}30`,
                    fontFamily: PAPER_FONTS.sans, fontSize: 11.5, color: p.ink,
                  }}>{f}</span>
                ))}
              </div>
            )}
            <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
              {emailPrimary && (
                <KV p={p} k="email" v={emailPrimary.email}
                  chip={tierMeta(p, emailPrimary.tier).label}
                  chipColor={tierMeta(p, emailPrimary.tier).color}/>
              )}
              {emailOthers.length > 0 && (
                <EmailOptions p={p} candidates={emailOthers} subject={emailSubject} body={emailBody}
                  header="other addresses · click to use"/>
              )}
              {personLinks.linkedin && <KV p={p} k="linkedin" v={personLinks.linkedin.replace(/^https?:\/\//, '')} href={withHttps(personLinks.linkedin)}/>}
              {personLinks.x && <KV p={p} k="x" v={personLinks.x.replace(/^https?:\/\//, '')} href={withHttps(personLinks.x)}/>}
              {personLinks.website && <KV p={p} k="website" v={personLinks.website.replace(/^https?:\/\//, '')} href={withHttps(personLinks.website)}/>}
            </div>
            <button onClick={() => go('people')} style={{
              marginTop: 12, width: '100%', padding: '10px 12px', background: 'transparent',
              border: `1.5px dashed ${p.ink}40`, color: p.ink,
              fontFamily: PAPER_FONTS.mono, fontSize: 11.5, letterSpacing: '.08em',
              textTransform: 'uppercase', cursor: 'pointer',
            }}>Save to People ↗</button>
          </>
        ) : (
          <div style={{
            marginTop: 12, fontFamily: PAPER_FONTS.serif, fontStyle: 'italic',
            fontSize: 13, color: p.inkMute,
          }}>
            The crew couldn&apos;t pin down a specific hiring manager for this role.
            {searched && <> Searched <span style={{ fontStyle: 'normal', color: p.ink }}>&ldquo;{searched}&rdquo;</span>.</>}
            {' '}Try pasting the team name in the intent box, or a LinkedIn profile.
          </div>
        )}

        {/* shortlist → re-pick the contact the cold email is drafted to */}
        {candidates.length > (personName ? 1 : 0) && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1.5px dashed ${p.ink}24` }}>
            <button onClick={() => setPicking(!picking)} style={{
              background: 'transparent', border: 'none', color: p.inkSoft, padding: 0,
              fontFamily: PAPER_FONTS.mono, fontSize: 11, letterSpacing: '.06em',
              textTransform: 'uppercase', cursor: 'pointer',
            }}>{picking ? '× close' : `↓ other matches (${candidates.length})`}</button>
            {picking && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {candidates.map((c, i) => {
                  const isCurrent = !!personName && c.name === personName;
                  const li = c.linkedin
                    ? (c.linkedin.match(/^https?:\/\//) ? c.linkedin : `https://${c.linkedin}`)
                    : null;
                  return (
                    <div
                      key={c.name || i}
                      style={{
                        position: 'relative', background: p.paper,
                        border: `1.5px solid ${p.ink}${isCurrent ? '12' : '24'}`,
                        opacity: isCurrent ? 0.6 : 1,
                      }}>
                      <button
                        disabled={isCurrent}
                        onClick={() => { if (!isCurrent) { pickCandidate(run.id, c); setPicking(false); } }}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: `10px ${li ? '58px' : '12px'} 10px 12px`,
                          background: 'transparent', border: 'none',
                          cursor: isCurrent ? 'default' : 'pointer',
                        }}>
                        <div style={{ fontFamily: PAPER_FONTS.sans, fontSize: 13.5, color: p.ink }}>
                          {c.name}{isCurrent ? ' · current' : ''}
                        </div>
                        {(c.role || c.company) && (
                          <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 10.5, color: p.inkMute, letterSpacing: '.02em' }}>
                            {[c.role, c.company].filter(Boolean).join(' · ')}
                          </div>
                        )}
                        {c.why && (
                          <div style={{ fontFamily: PAPER_FONTS.serif, fontStyle: 'italic', fontSize: 11.5, color: p.inkSoft, marginTop: 2 }}>
                            {c.why}
                          </div>
                        )}
                      </button>
                      {li && (
                        <a
                          href={li}
                          target="_blank" rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title="Open LinkedIn profile in a new tab"
                          style={{
                            position: 'absolute', top: 8, right: 8, padding: '3px 8px',
                            fontFamily: PAPER_FONTS.mono, fontSize: 10.5, color: p.stamp,
                            border: `1px solid ${p.stamp}40`, background: p.paper,
                            textDecoration: 'none', letterSpacing: '.04em',
                          }}>in ↗</a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </PaperCard>
    </div>
  );
}

// Full-size, readable view of the tailored resume. The card preview is
// deliberately tiny (it's a thumbnail); this is the "actually read it" view.
function ResumeSection({ p, title }) {
  return (
    <div style={{
      fontFamily: PAPER_FONTS.mono, fontSize: 10.5, letterSpacing: '.16em',
      textTransform: 'uppercase', color: p.marigoldDeep,
      borderBottom: `1.5px solid ${p.ink}20`, paddingBottom: 4, margin: '20px 0 10px',
    }}>{title}</div>
  );
}

function ResumeModal({ p, resume, jobRole, jobCompany, atsScore, atsScoreBefore, onClose }) {
  const h = resume.header || {};
  const isMobile = useIsMobile();
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.55)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: isMobile ? '20px 10px' : '40px 20px', overflow: 'auto',
      }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 820, background: p.paper,
          border: `1.5px solid ${p.ink}`, boxShadow: `8px 8px 0 ${p.ink}24`,
          padding: isMobile ? '24px 18px 28px' : '32px 44px 40px', position: 'relative', color: p.ink,
        }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
          <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: p.marigoldDeep }}>
            Tailored resume{(jobRole || jobCompany) ? ` · for ${[jobRole, jobCompany].filter(Boolean).join(' at ')}` : ''}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
            {atsScore != null && <AtsBadge p={p} before={atsScoreBefore} after={atsScore} size={11}/>}
            <button onClick={onClose} style={{
              background: 'transparent', border: 'none', color: p.inkMute,
              fontFamily: PAPER_FONTS.mono, fontSize: 12, letterSpacing: '.08em',
              textTransform: 'uppercase', cursor: 'pointer',
            }}>× close</button>
          </div>
        </div>

        <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 30, lineHeight: 1.05 }}>
          {h.full_name || 'Your name'}
        </div>
        {h.headline && (
          <div style={{ fontFamily: PAPER_FONTS.serif, fontStyle: 'italic', fontSize: 15, color: p.inkSoft, marginTop: 3 }}>
            {h.headline}
          </div>
        )}
        {(h.email || h.phone || h.location || h.links?.website || h.links?.linkedin || h.links?.github) && (
          <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 11.5, color: p.inkMute, marginTop: 6 }}>
            {[h.email, h.phone, h.location, h.links?.website, h.links?.linkedin, h.links?.github].filter(Boolean).join('  ·  ')}
          </div>
        )}
        <div style={{ height: 1.5, background: p.ink + '30', margin: '16px 0' }}/>

        {Array.isArray(resume.changes) && resume.changes.length > 0 && (
          <div style={{
            marginBottom: 20, padding: '16px 18px',
            background: p.card, border: `1.5px solid ${p.ink}24`,
          }}>
            <div style={{
              fontFamily: PAPER_FONTS.mono, fontSize: 10.5, letterSpacing: '.14em',
              textTransform: 'uppercase', color: p.stamp, marginBottom: 12,
            }}>What Jugaadu changed for this role</div>
            <ChangeList p={p} changes={resume.changes}/>
          </div>
        )}

        {resume.summary && (
          <p style={{ margin: 0, fontFamily: PAPER_FONTS.sans, fontSize: 14, lineHeight: 1.55 }}>{resume.summary}</p>
        )}

        {(resume.experience || []).length > 0 && <ResumeSection p={p} title="Experience"/>}
        {(resume.experience || []).map((exp, i) => (
          <div key={i} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
              <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 15.5 }}>
                {[exp.role, exp.company].filter(Boolean).join(' · ')}
              </div>
              {(exp.start || exp.end) && (
                <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.inkMute, whiteSpace: 'nowrap' }}>
                  {[exp.start, exp.end].filter(Boolean).join(' – ')}
                </div>
              )}
            </div>
            {exp.location && (
              <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.inkMute }}>{exp.location}</div>
            )}
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {(exp.bullets || []).map((b, j) => (
                <li key={j} style={{ fontFamily: PAPER_FONTS.sans, fontSize: 13.5, lineHeight: 1.5, marginBottom: 3 }}>{b}</li>
              ))}
            </ul>
          </div>
        ))}

        {(resume.education || []).length > 0 && <ResumeSection p={p} title="Education"/>}
        {(resume.education || []).map((ed, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 14.5 }}>
              {[[ed.degree, ed.field].filter(Boolean).join(', '), ed.school].filter(Boolean).join(' · ')}
            </div>
            {(ed.notes || []).length > 0 && (
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {ed.notes.map((n, j) => (
                  <li key={j} style={{ fontFamily: PAPER_FONTS.sans, fontSize: 13, color: p.inkSoft }}>{n}</li>
                ))}
              </ul>
            )}
          </div>
        ))}

        {(resume.skills || []).length > 0 && <ResumeSection p={p} title="Skills"/>}
        {(resume.skills || []).map((s, i) => (
          <div key={i} style={{ fontFamily: PAPER_FONTS.sans, fontSize: 13.5, lineHeight: 1.55, marginBottom: 3 }}>
            {s.group ? <strong>{s.group}: </strong> : null}{(s.items || []).join(', ')}
          </div>
        ))}

        {(resume.projects || []).length > 0 && <ResumeSection p={p} title="Projects"/>}
        {(resume.projects || []).map((pr, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 14.5 }}>
              {pr.link ? (
                <a href={pr.link} target="_blank" rel="noopener noreferrer" style={{ color: p.ink }}>{pr.name} ↗</a>
              ) : pr.name}
            </div>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {(pr.bullets || []).map((b, j) => (
                <li key={j} style={{ fontFamily: PAPER_FONTS.sans, fontSize: 13.5, lineHeight: 1.5 }}>{b}</li>
              ))}
            </ul>
          </div>
        ))}

        <div style={{ marginTop: 24, display: 'flex', gap: 8 }}>
          <InkButton p={p} kind="outline" size="sm" onClick={() => downloadResumeBlob(resume, 'pdf').catch(() => {})}>↓ PDF</InkButton>
          <InkButton p={p} kind="outline" size="sm" onClick={() => downloadResumeBlob(resume, 'docx').catch(() => {})}>↓ Word</InkButton>
        </div>
      </div>
    </div>
  );
}

// ATS match estimate. When we have the original resume's baseline score we show
// the lift (before → after, +delta); otherwise just the single score. The score
// is Claude's own honest estimate against the JD, not a real ATS scan.
function AtsBadge({ p, before, after, size = 10.5 }) {
  if (after == null) {
    return (
      <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: size, color: p.inkMute, letterSpacing: '.06em' }}>
        ATS —
      </span>
    );
  }
  const hasBefore = before != null;
  const delta = hasBefore ? after - before : 0;
  const up = delta > 0;
  return (
    <span
      title={hasBefore
        ? `Estimated ATS match vs this job: your original resume ${before}/100 → tailored ${after}/100`
        : `Estimated ATS match vs this job: ${after}/100`}
      style={{
        fontFamily: PAPER_FONTS.mono, fontSize: size, letterSpacing: '.06em',
        display: 'inline-flex', alignItems: 'baseline', gap: 4, whiteSpace: 'nowrap',
      }}>
      <span style={{ color: p.inkMute, textTransform: 'uppercase' }}>ATS</span>
      {hasBefore && delta !== 0 && (
        <>
          <span style={{ color: p.inkMute }}>{before}</span>
          <span style={{ color: p.inkMute }}>→</span>
        </>
      )}
      <span style={{ color: up ? p.leaf : (delta < 0 ? p.stamp : p.leaf) }}>
        {after}{(!hasBefore || delta === 0) && <span style={{ color: p.inkMute }}>/100</span>}
      </span>
      {hasBefore && delta !== 0 && (
        <span style={{ color: up ? p.leaf : p.stamp }}>({up ? '+' : ''}{delta})</span>
      )}
    </span>
  );
}

// Email confidence tiers:
//  high   = Apollo-verified or user-provided — we believe this mailbox exists.
//  medium = Apollo matched the person and returned/derived an email but couldn't
//           verify the mailbox — plausible, tied to a real person match.
//  low    = pure format guess (pattern × domain), no person match.
function emailTier(source, confidence) {
  if (
    source === 'apollo_verified' ||
    source === 'user_provided' ||
    (typeof confidence === 'number' && confidence >= 0.9)
  ) return 'high';
  return 'medium';
}

function tierMeta(p, tier) {
  if (tier === 'high') return { label: 'verified', color: p.leaf };
  if (tier === 'medium') return { label: 'plausible', color: p.marigoldDeep };
  return { label: 'guess', color: p.inkMute };
}

// Rank discovered/guessed emails into tiers, best first. Any email Apollo
// returned leads (high or medium); the format guesses follow as low. De-duped.
function buildEmailCandidates(enrichment) {
  const out = [];
  const seen = new Set();
  if (enrichment?.email) {
    out.push({
      email: enrichment.email,
      tier: emailTier(enrichment.source, enrichment.confidence),
      pattern: enrichment.source,
    });
    seen.add(enrichment.email.toLowerCase());
  }
  const guesses = Array.isArray(enrichment?.guesses) ? enrichment.guesses : [];
  for (const g of guesses) {
    if (g?.email && !seen.has(g.email.toLowerCase())) {
      out.push({ email: g.email, tier: 'low', pattern: g.pattern });
      seen.add(g.email.toLowerCase());
    }
  }
  return out;
}

// Inline tier tag for the "To" line — "· verified" / "· plausible" / "· guess".
function TierBadge({ p, tier }) {
  const tm = tierMeta(p, tier);
  return <span style={{ color: tm.color, marginLeft: 8 }}>· {tm.label}</span>;
}

// A list of candidate addresses, each a clickable chip (opens Gmail to it) with
// its confidence tier. Shared by the cold-email card and the hiring-manager panel.
function EmailOptions({ p, candidates, subject, body, header }) {
  if (!candidates?.length) return null;
  return (
    <div style={{ marginTop: 6 }}>
      {header && (
        <div style={{
          fontFamily: PAPER_FONTS.mono, fontSize: 10, color: p.inkMute,
          letterSpacing: '.04em', marginBottom: 4,
        }}>{header}</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {candidates.map((c) => {
          const tm = tierMeta(p, c.tier);
          return (
            <button
              key={c.email}
              title={`Open Gmail to ${c.email}${c.pattern ? ` (${c.pattern})` : ''}`}
              onClick={() => openGmailCompose({ to: c.email, subject, body })}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                width: '100%', textAlign: 'left', padding: '4px 8px',
                background: p.paper, border: `1px solid ${p.ink}24`, cursor: 'pointer',
              }}>
              <span style={{
                fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.ink,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{c.email}</span>
              <span style={{
                fontFamily: PAPER_FONTS.mono, fontSize: 9, color: tm.color,
                background: tm.color + '1f', padding: '2px 6px', letterSpacing: '.06em',
                whiteSpace: 'nowrap', textTransform: 'uppercase',
              }}>{tm.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function withHttps(url) {
  if (!url) return url;
  return /^https?:\/\//.test(url) ? url : `https://${url}`;
}

function KV({ p, k, v, chip, chipColor, href }) {
  const cc = chipColor || p.stamp;
  const valueStyle = {
    flex: 1, fontFamily: PAPER_FONTS.mono, fontSize: 11.5, color: p.ink,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  };
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      padding: '6px 10px', background: p.paper, border: `1px solid ${p.ink}20`,
    }}>
      <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 10.5, color: p.inkMute, letterSpacing: '.04em', width: 64 }}>{k}</span>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer"
          title={`Open ${k} in a new tab`}
          style={{ ...valueStyle, color: p.stamp, textDecoration: 'underline', textUnderlineOffset: 2 }}>
          {v}
        </a>
      ) : (
        <span style={valueStyle}>{v}</span>
      )}
      {chip && <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 10, color: cc, padding: '2px 6px', background: cc + '14', whiteSpace: 'nowrap', letterSpacing: '.04em' }}>{chip}</span>}
    </div>
  );
}

export default function ComposePage() {
  const router = useRouter();
  const { p } = usePaperTheme();
  return (
    <ComposeV3
      p={p}
      go={(route) => router.push(`/app/${route}`)}
    />
  );
}
