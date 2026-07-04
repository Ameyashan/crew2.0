// @ts-nocheck — verbatim port of Crew prototype v3 resume
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PAPER_FONTS_V2 } from "@/components/paper/fonts";
import { TOKENS, RADII, SHADOWS } from "@/components/paper/tokens";
import { ChangeList } from "@/components/resume/ChangeList";
import { useIsMobile } from "@/lib/use-is-mobile";
import {
  useRuns,
  startResumeRun,
  retryRun,
  dismissRun,
  resumePendingRuns,
} from "@/lib/runs-store";

// ChangeList is a shared component still on the legacy palette shape; feed it a
// small token-backed shim mapping the keys it reads to the new token system.
const CHANGE_PALETTE = {
  ink: TOKENS.ink,
  inkSoft: TOKENS.inkSoft,
  inkMute: TOKENS.muted,
  stamp: TOKENS.red,
  leaf: TOKENS.green,
  tea: TOKENS.muted2,
  marigoldDeep: TOKENS.amber,
};

// Inline eyebrow — uppercase IBM Plex Mono section label.
function Eyebrow({ en, color }) {
  return (
    <span style={{
      fontFamily: PAPER_FONTS_V2.mono, fontSize: 10.5,
      color: color || TOKENS.muted, letterSpacing: '.1em', textTransform: 'uppercase',
    }}>{en}</span>
  );
}

function ResumeV3({ go }) {
  const isMobile = useIsMobile();
  const [jobUrl, setJobUrl]   = useState('');
  const [emphasis, setEmphasis] = useState('');
  const [length, setLength]   = useState('1');
  const [open, setOpen]       = useState(null);
  const [profile, setProfile] = useState(null);
  const [history, setHistory] = useState([]);
  const [tailorError, setTailorError] = useState(null);
  // Tailoring lives in the module runs store (like compose), so it keeps
  // going when this page unmounts and re-renders here when the user is back.
  const runs = useRuns();
  const resumeRuns = runs.filter((r) => r.kind === 'resume');
  const running = resumeRuns.some((r) => r.stage === 'working' || r.stage === 'parsing');
  // Runs whose result was already folded into the history list below.
  const handledRef = useRef(new Set());

  const canTailor = jobUrl.trim().length > 0 || emphasis.trim().length > 0;

  async function refreshHistory() {
    try {
      const r = await fetch('/api/resume/history');
      if (!r.ok) return;
      const j = await r.json();
      setHistory(Array.isArray(j?.generations) ? j.generations : []);
    } catch { /* ignore */ }
  }

  useEffect(() => {
    fetch('/api/profile').then((r) => r.json()).then((j) => setProfile(j?.profile ?? null)).catch(() => {});
    refreshHistory();
    // Revive any tailor run left streaming when a previous session ended.
    resumePendingRuns();
  }, []);

  // When a live run finishes, the persisted history row becomes the canonical
  // UI: refresh the list, pop the fresh row open, drop the transient card.
  useEffect(() => {
    for (const r of resumeRuns) {
      if (r.stage === 'done' && r.resumeGenerationId && !handledRef.current.has(r.id)) {
        handledRef.current.add(r.id);
        const genId = r.resumeGenerationId;
        const localId = r.id;
        refreshHistory().then(() => {
          setOpen(genId);
          dismissRun(localId);
        });
      }
    }
  }, [resumeRuns]);

  const avgAts = (() => {
    const scored = history.slice(0, 10).map((h) => h.ats_score).filter((s) => typeof s === 'number');
    if (!scored.length) return null;
    return Math.round(scored.reduce((a, b) => a + b, 0) / scored.length);
  })();

  function tailor() {
    if (!canTailor || running) return;
    setTailorError(null);
    const url = jobUrl.trim()
      ? (jobUrl.trim().match(/^https?:\/\//) ? jobUrl.trim() : `https://${jobUrl.trim()}`)
      : undefined;
    const id = startResumeRun({
      jobUrl: url,
      highlights: emphasis.trim() || undefined,
      pageCount: length === '2' ? 2 : 1,
    });
    if (id) { setJobUrl(''); setEmphasis(''); }
  }

  return (
    <div className="scroll" style={{
      flex: 1, overflow: 'auto', padding: isMobile ? '24px 16px 64px' : '40px 56px 80px', background: TOKENS.paper, color: TOKENS.ink,
    }}>
      {/* Page head */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 24, flexWrap: 'wrap', marginBottom: 24,
      }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontFamily: PAPER_FONTS_V2.mono, fontSize: 10.5, color: TOKENS.muted,
            letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 8,
          }}>Resume · agent</div>
          <h1 style={{
            margin: 0, fontFamily: PAPER_FONTS_V2.serif, fontWeight: 400,
            fontSize: 'clamp(40px, 4.8vw, 64px)', lineHeight: 0.95, letterSpacing: '-.02em',
            color: TOKENS.ink, textWrap: 'balance',
          }}>
            Tailor your resume{' '}
            <span style={{ fontStyle: 'italic', color: TOKENS.red }}>to one job.</span>
          </h1>
          <p style={{
            margin: '14px 0 0', fontFamily: PAPER_FONTS_V2.serif, fontStyle: 'italic',
            fontSize: 18, lineHeight: 1.45, color: TOKENS.inkSoft, maxWidth: 720,
          }}>
            Jugaadu reads the job posting, rewrites the bullets that matter, and previews a fresh draft. You approve the PDF or take the Word version to finish by hand.
          </p>
        </div>
        <div style={{ flexShrink: 0 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 10.5, color: TOKENS.muted, letterSpacing: '.14em', textTransform: 'uppercase' }}>
              Avg. ATS · last 10
            </div>
            <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 38, lineHeight: 1, color: TOKENS.red, marginTop: 2 }}>{avgAts ?? '—'}<span style={{ fontSize: 18, color: TOKENS.muted, fontFamily: PAPER_FONTS_V2.mono }}>/100</span></div>
          </div>
        </div>
      </div>

      {/* On file */}
      <div style={{
        background: TOKENS.card, color: TOKENS.ink,
        border: `1px solid ${TOKENS.lineSoft}`, borderRadius: RADII.card,
        boxShadow: SHADOWS.card, padding: '20px 24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <div style={{
                width: 44, height: 56, background: TOKENS.amberWash, color: TOKENS.amber,
                border: `1px solid ${TOKENS.amberLine}`, borderRadius: RADII.buttonTight, display: 'grid', placeItems: 'center',
                fontFamily: PAPER_FONTS_V2.mono, fontSize: 11, fontWeight: 700, letterSpacing: '.06em',
              }}>PDF</div>
              <div>
                <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 22, color: TOKENS.ink, lineHeight: 1.1 }}>
                  {profile?.resume_filename ? (
                    <><span style={{ color: TOKENS.green, marginRight: 4 }}>✓</span>{profile.resume_filename}</>
                  ) : (
                    <span style={{ color: TOKENS.muted }}>No resume on file</span>
                  )}
                </div>
                <div style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 11.5, color: TOKENS.muted, marginTop: 4, letterSpacing: '.04em' }}>
                  {profile?.resume_text
                    ? `${profile.resume_text.length.toLocaleString()} chars · base version`
                    : 'Upload one in onboarding or here to start tailoring'}
                </div>
              </div>
            </div>
            <p style={{ margin: '12px 0 0', fontFamily: PAPER_FONTS_V2.serif, fontStyle: 'italic', fontSize: 14, color: TOKENS.inkSoft }}>
              Replacing here also updates the resume Jugaadu uses for outreach drafts.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{
              padding: '7px 12px', borderRadius: RADII.buttonTight,
              fontFamily: PAPER_FONTS_V2.sans, fontSize: 13,
              background: 'transparent', color: TOKENS.ink,
              border: `1px solid ${TOKENS.faint}`, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
            }}>
              ↑ Replace…
              <input
                type="file"
                accept=".pdf,.docx,.txt"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const fd = new FormData();
                  fd.append('file', f);
                  try {
                    const r = await fetch('/api/profile/resume', { method: 'POST', body: fd });
                    if (!r.ok) throw new Error(`upload failed: ${r.status}`);
                    const profileRes = await fetch('/api/profile').then((x) => x.json());
                    setProfile(profileRes?.profile ?? null);
                  } catch (err) {
                    setTailorError(String(err?.message || err));
                  }
                }}
              />
            </label>
          </div>
        </div>
      </div>

      {/* The brief */}
      <div style={{ marginTop: 14 }}>
        <div style={{
          background: TOKENS.card, color: TOKENS.ink,
          border: `1px solid ${TOKENS.lineSoft}`, borderRadius: RADII.card,
          boxShadow: SHADOWS.card, padding: '22px 24px',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <Eyebrow en="The brief — what should change"/>
            <span style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 10.5, color: TOKENS.muted, letterSpacing: '.14em', textTransform: 'uppercase' }}>
              one is enough · both is best
            </span>
          </div>

          <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
            {/* URL */}
            <div>
              <input
                value={jobUrl}
                onChange={(e) => setJobUrl(e.target.value)}
                placeholder="https://stripe.com/jobs/listing/product-designer-payments"
                style={{
                  width: '100%', padding: '12px 14px', background: TOKENS.paper, borderRadius: RADII.panelTight,
                  border: `1px solid ${jobUrl.trim() ? TOKENS.red : TOKENS.line}`,
                  fontFamily: PAPER_FONTS_V2.mono, fontSize: 13, color: TOKENS.ink, outline: 'none',
                }}
              />
              <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  'stripe.com/jobs/listing/product-designer-payments',
                  'ramp.com/careers/staff-engineer-bill-pay',
                  'anthropic.com/careers/design-engineer',
                ].map(s => (
                  <button key={s} onClick={() => setJobUrl(s)} style={{
                    padding: '4px 10px', background: 'transparent', borderRadius: RADII.pill,
                    border: `1px solid ${TOKENS.line}`, color: TOKENS.muted2,
                    fontFamily: PAPER_FONTS_V2.mono, fontSize: 10.5, cursor: 'pointer',
                  }}>{s.split('/')[0]}</button>
                ))}
              </div>
            </div>

            {/* Emphasis */}
            <div>
              <textarea
                value={emphasis}
                onChange={(e) => setEmphasis(e.target.value)}
                rows={4}
                placeholder="e.g. 'lead with the Stripe work, show python + infra signal, mention shipping the billing migration'. Required if you didn't give a job URL."
                style={{
                  width: '100%', padding: '12px 14px', background: TOKENS.paper, resize: 'vertical', borderRadius: RADII.panelTight,
                  border: `1px solid ${emphasis.trim() ? TOKENS.red : TOKENS.line}`,
                  fontFamily: PAPER_FONTS_V2.sans, fontSize: 13.5, lineHeight: 1.5, color: TOKENS.ink, outline: 'none',
                  minHeight: 100,
                }}
              />
            </div>
          </div>

          <div style={{
            marginTop: 18, display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontFamily: PAPER_FONTS_V2.mono, fontSize: 11, color: TOKENS.muted2,
                letterSpacing: '.08em', textTransform: 'uppercase',
              }}>Length</span>
              {['1','2'].map(v => {
                const active = length === v;
                return (
                  <button key={v} onClick={() => setLength(v)} style={{
                    padding: '7px 14px', fontFamily: PAPER_FONTS_V2.mono, fontSize: 12, borderRadius: RADII.buttonTight,
                    background: active ? TOKENS.ink : 'transparent',
                    color: active ? TOKENS.paper : TOKENS.ink,
                    border: `1px solid ${active ? TOKENS.ink : TOKENS.line}`, cursor: 'pointer',
                  }}>{v} page{v === '2' ? 's' : ''}</button>
                );
              })}
            </div>
            <div style={{ flex: 1 }}/>
            <button onClick={tailor} disabled={!canTailor || running} style={{
              background: TOKENS.ink, color: TOKENS.paper,
              border: '1px solid transparent', borderRadius: RADII.buttonTight,
              padding: '10px 16px', fontFamily: PAPER_FONTS_V2.sans, fontSize: 13, fontWeight: 500,
              cursor: (!canTailor || running) ? 'not-allowed' : 'pointer',
              opacity: (!canTailor || running) ? 0.45 : 1,
              display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
            }}>
              {running ? <>Tailoring… <Spinner/></> : <>Tailor my resume →</>}
            </button>
            {!canTailor && (
              <span style={{
                fontFamily: PAPER_FONTS_V2.serif, fontStyle: 'italic', fontSize: 14, color: TOKENS.muted2,
              }}>add a job URL or a description →</span>
            )}
          </div>
        </div>
      </div>

      {/* Live tailoring runs — module-store backed, so they keep going when
          you switch screens and are still here (or finished) when you return. */}
      {resumeRuns.length > 0 && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {resumeRuns.map((run) => {
            const failed = run.stage === 'error';
            const pct = Math.round(run.progress?.tailor || 0);
            const caption = failed
              ? 'needs attention'
              : run.reconnecting
                ? 'reconnecting…'
                : run.tailor
                  ? `tailoring… ${run.tailor.chars.toLocaleString()} chars · ${run.tailor.bullets} bullet${run.tailor.bullets === 1 ? '' : 's'} in`
                  : 'tailoring… reading the posting';
            return (
              <div key={run.id} style={{
                position: 'relative', overflow: 'hidden', borderRadius: RADII.card,
                background: TOKENS.card, border: `1px solid ${failed ? TOKENS.red : TOKENS.lineSoft}`,
                boxShadow: SHADOWS.card,
                padding: '16px 18px 14px',
              }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: TOKENS.line }}>
                  <div style={{
                    height: '100%', width: `${failed ? 100 : pct}%`,
                    background: failed ? TOKENS.red : TOKENS.green, transition: 'width .4s',
                  }}/>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: 999, flexShrink: 0,
                    background: failed ? TOKENS.red : TOKENS.green,
                    animation: failed ? 'none' : 'pulseDot 1.1s ease-in-out infinite',
                  }}/>
                  <span style={{
                    fontFamily: PAPER_FONTS_V2.mono, fontSize: 10.5, letterSpacing: '.14em',
                    textTransform: 'uppercase', color: failed ? TOKENS.red : TOKENS.green,
                  }}>{caption}</span>
                  <span style={{
                    fontFamily: PAPER_FONTS_V2.mono, fontSize: 11.5, color: TOKENS.muted, minWidth: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{run.input}</span>
                  <button onClick={() => dismissRun(run.id)} title="dismiss" style={{
                    marginLeft: 'auto', background: 'transparent', border: 'none', color: TOKENS.muted,
                    fontFamily: PAPER_FONTS_V2.mono, fontSize: 16, lineHeight: 1, cursor: 'pointer', flexShrink: 0,
                  }}>×</button>
                </div>
                {!failed && (
                  <p style={{
                    margin: '10px 0 0', fontFamily: PAPER_FONTS_V2.serif, fontStyle: 'italic',
                    fontSize: 13.5, color: TOKENS.inkSoft,
                  }}>
                    Feel free to move around the app — this keeps running and lands in the history below.
                  </p>
                )}
                {failed && (
                  <>
                    <div style={{
                      marginTop: 10, padding: '10px 14px', background: TOKENS.paper, borderRadius: RADII.panelTight,
                      border: `1px solid ${TOKENS.red}`, color: TOKENS.red,
                      fontFamily: PAPER_FONTS_V2.mono, fontSize: 12,
                    }}>{run.error}</div>
                    <div style={{ marginTop: 8 }}>
                      <button onClick={() => retryRun(run.id)} style={{
                        background: 'transparent', color: TOKENS.ink,
                        border: `1px solid ${TOKENS.faint}`, borderRadius: RADII.buttonTight,
                        padding: '7px 12px', fontFamily: PAPER_FONTS_V2.sans, fontSize: 13, fontWeight: 500,
                        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
                      }}>↻ Retry</button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* History */}
      <div style={{ marginTop: 28 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
          <Eyebrow en={`Tailored history · ${history.length} version${history.length === 1 ? '' : 's'}`}/>
          <span style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 11, color: TOKENS.muted, letterSpacing: '.06em' }}>
            click a row to expand
          </span>
        </div>
        {tailorError && (
          <div style={{
            marginBottom: 10, padding: '10px 14px', background: TOKENS.card, borderRadius: RADII.panelTight,
            border: `1px solid ${TOKENS.red}`, color: TOKENS.red,
            fontFamily: PAPER_FONTS_V2.mono, fontSize: 12,
          }}>{tailorError}</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {history.length === 0 && (
            <div style={{
              padding: '24px', textAlign: 'center', border: `1px dashed ${TOKENS.dashed}`, borderRadius: RADII.card,
              background: TOKENS.cardWarm,
              fontFamily: PAPER_FONTS_V2.serif, fontStyle: 'italic', color: TOKENS.muted2,
            }}>
              No tailored versions yet. Drop in a job posting URL above.
            </div>
          )}
          {history
            // Rows still streaming in the live cards above shouldn't render twice.
            .filter((row) => !resumeRuns.some((r) => r.resumeGenerationId === row.id))
            .map((row, i) => {
            const isOpen = open === row.id;
            const status = row.status || 'complete';
            const adapted = {
              id: row.id,
              co: row.target_company || '—',
              role: row.target_role || (status === 'in_flight' ? 'Tailoring…' : 'Tailored resume'),
              when: formatWhen(row.created_at),
              ats: row.ats_score ?? null,
              status,
              error: row.error || null,
              jobUrl: row.job_url || '(no URL · highlights only)',
              changes: extractChanges(row),
              notes: row.regenerate_notes || '',
            };
            return (
              <HistoryRow key={row.id} row={adapted} isOpen={isOpen} onToggle={() => setOpen(isOpen ? null : row.id)} fresh={i === 0 && open === row.id}/>
            );
          })}
        </div>
      </div>
    </div>
  );
}

async function downloadResume(id, fmt) {
  try {
    const r = await fetch(`/api/resume/history/${id}`);
    if (!r.ok) throw new Error(`load failed: ${r.status}`);
    const { generation } = await r.json();
    const resume = generation?.resume;
    if (!resume) throw new Error('resume blob missing');
    const dl = await fetch(`/api/resume/${fmt}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resume }),
    });
    if (!dl.ok) throw new Error(`download failed: ${dl.status}`);
    const blob = await dl.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (generation?.target_role || 'resume') + (fmt === 'pdf' ? '.pdf' : '.docx');
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert(String(e?.message || e));
  }
}

function formatWhen(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const d = Math.floor(diff / 86400000);
  if (d < 1) return 'just now';
  if (d === 1) return '1d ago';
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function extractChanges(row) {
  // The history endpoint returns highlights/regenerate_notes but not the full
  // resume blob; surface a one-line summary instead of fabricating bullets.
  const out = [];
  if (row.highlights) out.push(`Brief: ${row.highlights.slice(0, 140)}${row.highlights.length > 140 ? '…' : ''}`);
  if (row.regenerate_notes) out.push(`Regen notes: ${row.regenerate_notes}`);
  if (!out.length) out.push('Tailored from the job posting alone (no highlights given).');
  return out;
}

function Spinner() {
  return (
    <span style={{
      width: 12, height: 12, border: `2px solid ${TOKENS.paper}`,
      borderTopColor: 'transparent', borderRadius: 999,
      animation: 'spin 0.8s linear infinite', display: 'inline-block',
      marginLeft: 4,
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}


function HistoryRow({ row, isOpen, onToggle, fresh }) {
  // Pull the full generation (resume blob + changelog) the first time the row is
  // opened — the history list endpoint only returns metadata. setState lives in
  // the async callbacks, never synchronously in the effect body.
  const isMobile = useIsMobile();
  const [gen, setGen] = useState(null);
  const [loadErr, setLoadErr] = useState(null);

  useEffect(() => {
    // Interrupted/errored rows have no blob to pull.
    if (!isOpen || gen || row.status !== 'complete') return;
    let alive = true;
    fetch(`/api/resume/history/${row.id}`)
      .then((r) => { if (!r.ok) throw new Error(`load failed: ${r.status}`); return r.json(); })
      .then((j) => { if (alive) setGen(j?.generation ?? null); })
      .catch((e) => { if (alive) setLoadErr(String(e?.message || e)); });
    return () => { alive = false; };
  }, [isOpen, gen, row.id, row.status]);

  const resume = gen?.resume || null;
  const realChanges = Array.isArray(resume?.changes) ? resume.changes : [];
  const loading = isOpen && !gen && !loadErr;

  return (
    <div style={{
      background: TOKENS.card, border: `1px solid ${isOpen ? TOKENS.line : TOKENS.lineSoft}`,
      borderRadius: RADII.card, overflow: 'hidden',
      boxShadow: fresh ? SHADOWS.elevated : (isOpen ? SHADOWS.card : 'none'),
      transition: 'box-shadow .2s, border-color .2s',
    }}>
      <button onClick={onToggle} style={{
        width: '100%',
        ...(isMobile
          ? { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }
          : { display: 'grid', gridTemplateColumns: '1fr auto auto auto auto', alignItems: 'center', gap: 18 }),
        padding: '14px 20px', background: 'transparent', border: 'none',
        cursor: 'pointer', textAlign: 'left', color: TOKENS.ink,
      }}>
        <div style={{ minWidth: 0, flex: isMobile ? '1 1 100%' : undefined }}>
          <div style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 11, color: TOKENS.muted, letterSpacing: '.06em' }}>{row.co}</div>
          <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 19, color: TOKENS.ink, lineHeight: 1.05 }}>{row.role}</div>
        </div>
        {fresh && (
          <span style={{
            fontFamily: PAPER_FONTS_V2.mono, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase',
            color: TOKENS.red, background: 'rgba(160,61,46,.10)', borderRadius: RADII.pill,
            padding: '3px 10px', whiteSpace: 'nowrap',
          }}>just made</span>
        )}
        {row.status === 'in_flight' ? (
          <span style={{
            padding: '3px 10px', background: TOKENS.amberBg, color: TOKENS.amber, borderRadius: RADII.pill,
            fontFamily: PAPER_FONTS_V2.mono, fontSize: 11, letterSpacing: '.04em',
          }}>in progress…</span>
        ) : row.status === 'error' ? (
          <span style={{
            padding: '3px 10px', background: 'rgba(160,61,46,.10)', color: TOKENS.red, borderRadius: RADII.pill,
            fontFamily: PAPER_FONTS_V2.mono, fontSize: 11, letterSpacing: '.04em',
          }}>error</span>
        ) : (
          <span style={{
            padding: '3px 10px', background: TOKENS.greenBg, color: TOKENS.green, borderRadius: RADII.pill,
            fontFamily: PAPER_FONTS_V2.mono, fontSize: 11, letterSpacing: '.04em',
          }}>ATS {row.ats ?? '—'}</span>
        )}
        <span style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 11, color: TOKENS.muted, letterSpacing: '.04em', whiteSpace: 'nowrap' }}>{row.when}</span>
        <span style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 14, color: TOKENS.muted }}>{isOpen ? '−' : '+'}</span>
      </button>

      {isOpen && (
        <div style={{
          borderTop: `1px dashed ${TOKENS.line}`,
          padding: '16px 20px 20px', display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: 22,
        }}>
          <div>
            <Eyebrow en="What Jugaadu changed" color={TOKENS.red}/>
            {realChanges.length > 0 ? (
              // The real per-edit changelog: your line → the tailored line, and why.
              <div style={{ marginTop: 10 }}>
                <ChangeList p={CHANGE_PALETTE} changes={realChanges}/>
              </div>
            ) : (
              // Older generations (or a load error) have no stored changelog — fall
              // back to the brief that produced this version.
              <>
                <ul style={{
                  margin: '10px 0 0', paddingLeft: 18,
                  fontFamily: PAPER_FONTS_V2.serif, fontStyle: 'italic',
                  fontSize: 15, lineHeight: 1.55, color: TOKENS.inkSoft,
                }}>
                  {row.changes.map((c, i) => <li key={i} style={{ marginBottom: 4 }}>{c}</li>)}
                </ul>
                {loading && (
                  <div style={{ marginTop: 8, fontFamily: PAPER_FONTS_V2.mono, fontSize: 11, color: TOKENS.muted }}>
                    reading the diff…
                  </div>
                )}
              </>
            )}
            <div style={{ marginTop: 14, fontFamily: PAPER_FONTS_V2.mono, fontSize: 11, color: TOKENS.muted, letterSpacing: '.04em' }}>
              from: {row.jobUrl}
            </div>
            <div style={{ marginTop: 14 }}>
              <Eyebrow en="Notes for next regen" color={TOKENS.muted2}/>
              <textarea
                defaultValue={row.notes}
                rows={2}
                placeholder="e.g. 'tone too formal — more punchy', or 'lead with python next time'"
                style={{
                  width: '100%', marginTop: 6, padding: '10px 12px', resize: 'vertical', borderRadius: RADII.panelTight,
                  background: TOKENS.paper, color: TOKENS.ink,
                  border: `1px solid ${TOKENS.line}`,
                  fontFamily: PAPER_FONTS_V2.sans, fontSize: 13, lineHeight: 1.5, outline: 'none',
                }}
              />
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button style={{
                  background: TOKENS.ink, color: TOKENS.paper, border: '1px solid transparent',
                  borderRadius: RADII.buttonTight, padding: '7px 12px',
                  fontFamily: PAPER_FONTS_V2.sans, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
                }}>↻ Regenerate with notes</button>
                <button style={{
                  background: 'transparent', color: TOKENS.ink, border: `1px solid ${TOKENS.faint}`,
                  borderRadius: RADII.buttonTight, padding: '7px 12px',
                  fontFamily: PAPER_FONTS_V2.sans, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
                }}>Save notes</button>
              </div>
            </div>
          </div>
          {row.status !== 'complete' ? (
            <div>
              <div style={{
                padding: '14px 16px', background: TOKENS.paper, borderRadius: RADII.panelTight,
                border: `1px solid ${TOKENS.red}`, color: TOKENS.red,
                fontFamily: PAPER_FONTS_V2.mono, fontSize: 12, lineHeight: 1.5,
              }}>
                {row.status === 'in_flight'
                  ? 'Still tailoring — check back in a moment.'
                  : (row.error || 'This run failed before a resume was produced.')}
              </div>
              <p style={{
                margin: '10px 0 0', fontFamily: PAPER_FONTS_V2.serif, fontStyle: 'italic',
                fontSize: 13.5, color: TOKENS.inkSoft,
              }}>
                Nothing was saved for this version, so there's no PDF/Word to download.
                Run the brief again from above.
              </p>
            </div>
          ) : (
          <div>
            <div style={{
              background: TOKENS.paper, border: `1px solid ${TOKENS.line}`, borderRadius: RADII.panelTight,
              aspectRatio: '8.5/11', padding: '16px 14px', position: 'relative',
              fontFamily: PAPER_FONTS_V2.serif, color: TOKENS.ink, fontSize: 8.5, lineHeight: 1.4, overflow: 'hidden',
            }}>
              {resume ? (
                <>
                  <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 14 }}>
                    {resume.header?.full_name || 'Your name'}
                  </div>
                  {(resume.header?.email || resume.header?.location || resume.header?.links?.website) && (
                    <div style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 7, color: TOKENS.muted, marginTop: 2 }}>
                      {[resume.header?.email, resume.header?.location, resume.header?.links?.website]
                        .filter(Boolean).join(' · ')}
                    </div>
                  )}
                  <div style={{ height: 1, background: TOKENS.line, margin: '6px 0' }}/>
                  {resume.summary && <div style={{ marginBottom: 4 }}>{resume.summary}</div>}
                  {(resume.experience || []).slice(0, 2).map((exp, i) => (
                    <div key={i} style={{ marginTop: i ? 6 : 0 }}>
                      <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 10 }}>
                        {[exp.role, exp.company].filter(Boolean).join(' · ')}
                      </div>
                      {(exp.bullets || []).slice(0, 3).map((b, j) => (
                        <div key={j}>· {b}</div>
                      ))}
                    </div>
                  ))}
                  {(resume.skills || []).length > 0 && (
                    <>
                      <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 10, marginTop: 6 }}>Skills</div>
                      {resume.skills.slice(0, 2).map((s, i) => (
                        <div key={i}>· {s.group ? `${s.group}: ` : ''}{(s.items || []).join(', ')}</div>
                      ))}
                    </>
                  )}
                </>
              ) : (
                <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontStyle: 'italic', color: TOKENS.muted }}>
                  {loadErr ? `Couldn't load this version (${loadErr}).` : 'Loading the tailored resume…'}
                </div>
              )}
              <div style={{
                position: 'absolute', left: 0, right: 0, bottom: 0, height: 60,
                background: `linear-gradient(to bottom, transparent, ${TOKENS.paper})`,
              }}/>
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
              <button onClick={() => downloadResume(row.id, 'pdf')} style={{
                flex: 1, background: 'transparent', color: TOKENS.ink, border: `1px solid ${TOKENS.faint}`,
                borderRadius: RADII.buttonTight, padding: '7px 12px', fontFamily: PAPER_FONTS_V2.sans,
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, whiteSpace: 'nowrap',
              }}>↓ PDF</button>
              <button onClick={() => downloadResume(row.id, 'docx')} style={{
                flex: 1, background: 'transparent', color: TOKENS.ink, border: `1px solid ${TOKENS.faint}`,
                borderRadius: RADII.buttonTight, padding: '7px 12px', fontFamily: PAPER_FONTS_V2.sans,
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, whiteSpace: 'nowrap',
              }}>↓ Word</button>
              <button onClick={() => window.open(`/api/resume/history/${row.id}`, '_blank')} style={{
                flex: 1, background: 'transparent', color: TOKENS.ink, border: `1px solid ${TOKENS.faint}`,
                borderRadius: RADII.buttonTight, padding: '7px 12px', fontFamily: PAPER_FONTS_V2.sans,
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, whiteSpace: 'nowrap',
              }}>View ↗</button>
            </div>
          </div>
          )}
        </div>
      )}
    </div>
  );
}


export default function ResumePage() {
  const router = useRouter();
  return <ResumeV3 go={(r) => router.push(`/app/${r}`)} />;
}
