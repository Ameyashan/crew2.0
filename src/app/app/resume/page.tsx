// @ts-nocheck — verbatim port of Crew prototype v3 resume
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
  Stamp,
  Marginalia,
} from "@/components/paper/primitives";
import { ChangeList } from "@/components/resume/ChangeList";

function ResumeV3({ p, go }) {
  const [jobUrl, setJobUrl]   = useState('');
  const [emphasis, setEmphasis] = useState('');
  const [length, setLength]   = useState('1');
  const [running, setRunning] = useState(false);
  const [open, setOpen]       = useState(null);
  const [profile, setProfile] = useState(null);
  const [history, setHistory] = useState([]);
  const [tailorError, setTailorError] = useState(null);
  const [tailorProgress, setTailorProgress] = useState(null);

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
  }, []);

  const avgAts = (() => {
    const scored = history.slice(0, 10).map((h) => h.ats_score).filter((s) => typeof s === 'number');
    if (!scored.length) return null;
    return Math.round(scored.reduce((a, b) => a + b, 0) / scored.length);
  })();

  async function tailor() {
    if (!canTailor) return;
    setRunning(true);
    setTailorError(null);
    setTailorProgress({ chars: 0, bullets: 0 });
    let newId = null;
    try {
      const res = await fetch('/api/resume/tailor', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
        body: JSON.stringify({
          job_url: jobUrl.trim() ? (jobUrl.trim().match(/^https?:\/\//) ? jobUrl.trim() : `https://${jobUrl.trim()}`) : undefined,
          highlights: emphasis.trim() || undefined,
          page_count: length === '2' ? 2 : 1,
        }),
      });
      if (!res.ok || !res.body) throw new Error(`tailor failed: ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() || '';
        for (const raw of parts) {
          const line = raw.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          let evt;
          try { evt = JSON.parse(line.slice(6)); } catch { continue; }
          if (evt.type === 'progress') setTailorProgress({ chars: evt.chars, bullets: evt.bullets });
          if (evt.type === 'saved') newId = evt.id;
          if (evt.type === 'error') throw new Error(evt.message);
        }
      }
      setJobUrl(''); setEmphasis('');
      await refreshHistory();
      if (newId) setOpen(newId);
    } catch (e) {
      setTailorError(String(e?.message || e));
    } finally {
      setRunning(false);
      setTailorProgress(null);
    }
  }

  return (
    <div className="scroll" style={{
      flex: 1, overflow: 'auto', padding: '40px 56px 80px', background: p.paper, color: p.ink,
    }}>
      <PageHead p={p}
        eyebrow="Resume · agent"
        title="Tailor your resume "
        italic="to one job."
        sub="Jugaadu reads the job posting, rewrites the bullets that matter, and previews a fresh draft. You approve the PDF or take the Word version to finish by hand."
        right={
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 10.5, color: p.inkMute, letterSpacing: '.14em', textTransform: 'uppercase' }}>
              Avg. ATS · last 10
            </div>
            <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 38, lineHeight: 1, color: p.stamp, marginTop: 2 }}>{avgAts ?? '—'}<span style={{ fontSize: 18, color: p.inkMute, fontFamily: PAPER_FONTS.mono }}>/100</span></div>
          </div>
        }
      />

      {/* On file */}
      <PaperCard p={p} color={p.marigold} hardShadow style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Eyebrow p={p} hindi="आपकी फ़ाइल" en="Your resume on file"/>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14, marginTop: 10,
            }}>
              <div style={{
                width: 44, height: 56, background: p.paper, color: p.marigoldDeep,
                border: `1.5px solid ${p.marigold}`, display: 'grid', placeItems: 'center',
                fontFamily: PAPER_FONTS.mono, fontSize: 11, fontWeight: 700, letterSpacing: '.06em',
              }}>PDF</div>
              <div>
                <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 22, color: p.ink, lineHeight: 1.1 }}>
                  {profile?.resume_filename ? (
                    <><span style={{ color: p.leaf, marginRight: 4 }}>✓</span>{profile.resume_filename}</>
                  ) : (
                    <span style={{ color: p.inkMute }}>No resume on file</span>
                  )}
                </div>
                <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 11.5, color: p.inkMute, marginTop: 4, letterSpacing: '.04em' }}>
                  {profile?.resume_text
                    ? `${profile.resume_text.length.toLocaleString()} chars · base version`
                    : 'Upload one in onboarding or here to start tailoring'}
                </div>
              </div>
            </div>
            <p style={{ margin: '12px 0 0', fontFamily: PAPER_FONTS.serif, fontStyle: 'italic', fontSize: 14, color: p.inkSoft }}>
              Replacing here also updates the resume Jugaadu uses for outreach drafts.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{
              padding: '7px 12px',
              fontFamily: PAPER_FONTS.display, fontSize: 13,
              background: 'transparent', color: p.ink,
              border: `2px solid ${p.ink}`, cursor: 'pointer',
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
      </PaperCard>

      {/* The brief */}
      <div style={{ marginTop: 14 }}>
        <PaperCard p={p} color={p.stamp} hardShadow style={{ padding: '22px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <Eyebrow p={p} hindi="ब्रीफ़" en="The brief — what should change"/>
            <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 10.5, color: p.inkMute, letterSpacing: '.14em', textTransform: 'uppercase' }}>
              one is enough · both is best
            </span>
          </div>

          <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* URL */}
            <div>
              <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.inkSoft, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                Job posting URL
              </div>
              <input
                value={jobUrl}
                onChange={(e) => setJobUrl(e.target.value)}
                placeholder="https://stripe.com/jobs/listing/product-designer-payments"
                style={{
                  width: '100%', padding: '12px 14px', background: p.paper,
                  border: `1.5px solid ${jobUrl.trim() ? p.stamp : p.ink + '30'}`,
                  fontFamily: PAPER_FONTS.mono, fontSize: 13, color: p.ink, outline: 'none',
                }}
              />
              <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  'stripe.com/jobs/listing/product-designer-payments',
                  'ramp.com/careers/staff-engineer-bill-pay',
                  'anthropic.com/careers/design-engineer',
                ].map(s => (
                  <button key={s} onClick={() => setJobUrl(s)} style={{
                    padding: '4px 10px', background: 'transparent',
                    border: `1px solid ${p.ink}30`, color: p.inkSoft,
                    fontFamily: PAPER_FONTS.mono, fontSize: 10.5, cursor: 'pointer',
                  }}>{s.split('/')[0]}</button>
                ))}
              </div>
            </div>

            {/* Emphasis */}
            <div>
              <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.inkSoft, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                What to change / emphasize
              </div>
              <textarea
                value={emphasis}
                onChange={(e) => setEmphasis(e.target.value)}
                rows={4}
                placeholder="e.g. 'lead with the Stripe work, show python + infra signal, mention shipping the billing migration'. Required if you didn't give a job URL."
                style={{
                  width: '100%', padding: '12px 14px', background: p.paper, resize: 'vertical',
                  border: `1.5px solid ${emphasis.trim() ? p.stamp : p.ink + '30'}`,
                  fontFamily: PAPER_FONTS.sans, fontSize: 13.5, lineHeight: 1.5, color: p.ink, outline: 'none',
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
                fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.inkSoft,
                letterSpacing: '.08em', textTransform: 'uppercase',
              }}>Length</span>
              {['1','2'].map(v => {
                const active = length === v;
                return (
                  <button key={v} onClick={() => setLength(v)} style={{
                    padding: '7px 14px', fontFamily: PAPER_FONTS.mono, fontSize: 12,
                    background: active ? p.stamp : 'transparent',
                    color: active ? p.paper : p.ink,
                    border: `1.5px solid ${p.ink}`, cursor: 'pointer',
                  }}>{v} page{v === '2' ? 's' : ''}</button>
                );
              })}
            </div>
            <div style={{ flex: 1 }}/>
            <InkButton p={p} color={p.stamp} onClick={tailor} disabled={!canTailor || running}>
              {running ? <>Tailoring… <Spinner p={p}/></> : <>Tailor my resume →</>}
            </InkButton>
            {!canTailor && (
              <Marginalia p={p} rotate={-2}>add a job URL or a description →</Marginalia>
            )}
          </div>
        </PaperCard>
      </div>

      {/* History */}
      <div style={{ marginTop: 28 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
          <Eyebrow p={p} hindi="इतिहास" en={`Tailored history · ${history.length} version${history.length === 1 ? '' : 's'}`}/>
          <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.inkMute, letterSpacing: '.06em' }}>
            click a row to expand
          </span>
        </div>
        {tailorError && (
          <div style={{
            marginBottom: 10, padding: '10px 14px', background: p.card,
            border: `1.5px solid ${p.stamp}`, color: p.stamp,
            fontFamily: PAPER_FONTS.mono, fontSize: 12,
          }}>{tailorError}</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {history.length === 0 && (
            <div style={{
              padding: '24px', textAlign: 'center', border: `1.5px dashed ${p.ink}40`,
              fontFamily: PAPER_FONTS.serif, fontStyle: 'italic', color: p.inkSoft,
            }}>
              No tailored versions yet. Drop in a job posting URL above.
            </div>
          )}
          {history.map((row, i) => {
            const isOpen = open === row.id;
            const adapted = {
              id: row.id,
              co: row.target_company || '—',
              role: row.target_role || 'Tailored resume',
              when: formatWhen(row.created_at),
              ats: row.ats_score ?? null,
              jobUrl: row.job_url || '(no URL · highlights only)',
              changes: extractChanges(row),
              notes: row.regenerate_notes || '',
            };
            return (
              <HistoryRow key={row.id} p={p} row={adapted} isOpen={isOpen} onToggle={() => setOpen(isOpen ? null : row.id)} fresh={i === 0 && open === row.id}/>
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

function Spinner({ p }) {
  return (
    <span style={{
      width: 12, height: 12, border: `2px solid ${p.paper}`,
      borderTopColor: 'transparent', borderRadius: 999,
      animation: 'spin 0.8s linear infinite', display: 'inline-block',
      marginLeft: 4,
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}


function HistoryRow({ p, row, isOpen, onToggle, fresh }) {
  // Pull the full generation (resume blob + changelog) the first time the row is
  // opened — the history list endpoint only returns metadata. setState lives in
  // the async callbacks, never synchronously in the effect body.
  const [gen, setGen] = useState(null);
  const [loadErr, setLoadErr] = useState(null);

  useEffect(() => {
    if (!isOpen || gen) return;
    let alive = true;
    fetch(`/api/resume/history/${row.id}`)
      .then((r) => { if (!r.ok) throw new Error(`load failed: ${r.status}`); return r.json(); })
      .then((j) => { if (alive) setGen(j?.generation ?? null); })
      .catch((e) => { if (alive) setLoadErr(String(e?.message || e)); });
    return () => { alive = false; };
  }, [isOpen, gen, row.id]);

  const resume = gen?.resume || null;
  const realChanges = Array.isArray(resume?.changes) ? resume.changes : [];
  const loading = isOpen && !gen && !loadErr;

  return (
    <div style={{
      background: p.card, border: `1.5px solid ${isOpen ? p.ink : p.ink + '30'}`,
      boxShadow: fresh ? `4px 4px 0 ${p.stamp}` : (isOpen ? `3px 3px 0 ${p.marigold}` : 'none'),
      transition: 'box-shadow .2s, border-color .2s',
    }}>
      <button onClick={onToggle} style={{
        width: '100%', display: 'grid',
        gridTemplateColumns: '1fr auto auto auto auto', alignItems: 'center', gap: 18,
        padding: '14px 20px', background: 'transparent', border: 'none',
        cursor: 'pointer', textAlign: 'left', color: p.ink,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.inkMute, letterSpacing: '.06em' }}>{row.co}</div>
          <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 19, color: p.ink, lineHeight: 1.05 }}>{row.role}</div>
        </div>
        {fresh && <Stamp color={p.stamp} rotate={-6}>just made</Stamp>}
        <span style={{
          padding: '3px 10px', background: p.leaf + '14', color: p.leaf,
          fontFamily: PAPER_FONTS.mono, fontSize: 11, letterSpacing: '.04em',
        }}>ATS {row.ats ?? '—'}</span>
        <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.inkMute, letterSpacing: '.04em', whiteSpace: 'nowrap' }}>{row.when}</span>
        <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 14, color: p.inkMute }}>{isOpen ? '−' : '+'}</span>
      </button>

      {isOpen && (
        <div style={{
          borderTop: `1.5px dashed ${p.ink}24`,
          padding: '16px 20px 20px', display: 'grid',
          gridTemplateColumns: '1.4fr 1fr', gap: 22,
        }}>
          <div>
            <Eyebrow p={p} en="What Jugaadu changed" color={p.stamp}/>
            {realChanges.length > 0 ? (
              // The real per-edit changelog: your line → the tailored line, and why.
              <div style={{ marginTop: 10 }}>
                <ChangeList p={p} changes={realChanges}/>
              </div>
            ) : (
              // Older generations (or a load error) have no stored changelog — fall
              // back to the brief that produced this version.
              <>
                <ul style={{
                  margin: '10px 0 0', paddingLeft: 18,
                  fontFamily: PAPER_FONTS.serif, fontStyle: 'italic',
                  fontSize: 15, lineHeight: 1.55, color: p.inkSoft,
                }}>
                  {row.changes.map((c, i) => <li key={i} style={{ marginBottom: 4 }}>{c}</li>)}
                </ul>
                {loading && (
                  <div style={{ marginTop: 8, fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.inkMute }}>
                    reading the diff…
                  </div>
                )}
              </>
            )}
            <div style={{ marginTop: 14, fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.inkMute, letterSpacing: '.04em' }}>
              from: {row.jobUrl}
            </div>
            <div style={{ marginTop: 14 }}>
              <Eyebrow p={p} en="Notes for next regen" color={p.tea}/>
              <textarea
                defaultValue={row.notes}
                rows={2}
                placeholder="e.g. 'tone too formal — more punchy', or 'lead with python next time'"
                style={{
                  width: '100%', marginTop: 6, padding: '10px 12px', resize: 'vertical',
                  background: p.paper, color: p.ink,
                  border: `1.5px solid ${p.ink}30`,
                  fontFamily: PAPER_FONTS.sans, fontSize: 13, lineHeight: 1.5, outline: 'none',
                }}
              />
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <InkButton p={p} color={p.tea} size="sm">↻ Regenerate with notes</InkButton>
                <InkButton p={p} kind="outline" size="sm">Save notes</InkButton>
              </div>
            </div>
          </div>
          <div>
            <Eyebrow p={p} en="Output" color={p.marigold}/>
            <div style={{
              marginTop: 10, background: p.paper, border: `1.5px solid ${p.ink}30`,
              aspectRatio: '8.5/11', padding: '16px 14px', position: 'relative',
              fontFamily: PAPER_FONTS.serif, color: p.ink, fontSize: 8.5, lineHeight: 1.4, overflow: 'hidden',
            }}>
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
                  <div style={{ height: 1, background: p.ink + '24', margin: '6px 0' }}/>
                  {resume.summary && <div style={{ marginBottom: 4 }}>{resume.summary}</div>}
                  {(resume.experience || []).slice(0, 2).map((exp, i) => (
                    <div key={i} style={{ marginTop: i ? 6 : 0 }}>
                      <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 10 }}>
                        {[exp.role, exp.company].filter(Boolean).join(' · ')}
                      </div>
                      {(exp.bullets || []).slice(0, 3).map((b, j) => (
                        <div key={j}>· {b}</div>
                      ))}
                    </div>
                  ))}
                  {(resume.skills || []).length > 0 && (
                    <>
                      <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 10, marginTop: 6 }}>Skills</div>
                      {resume.skills.slice(0, 2).map((s, i) => (
                        <div key={i}>· {s.group ? `${s.group}: ` : ''}{(s.items || []).join(', ')}</div>
                      ))}
                    </>
                  )}
                </>
              ) : (
                <div style={{ fontFamily: PAPER_FONTS.serif, fontStyle: 'italic', color: p.inkMute }}>
                  {loadErr ? `Couldn't load this version (${loadErr}).` : 'Loading the tailored resume…'}
                </div>
              )}
              <div style={{
                position: 'absolute', left: 0, right: 0, bottom: 0, height: 60,
                background: `linear-gradient(to bottom, transparent, ${p.paper})`,
              }}/>
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
              <InkButton p={p} kind="outline" size="sm" style={{ flex: 1 }} onClick={() => downloadResume(row.id, 'pdf')}>↓ PDF</InkButton>
              <InkButton p={p} kind="outline" size="sm" style={{ flex: 1 }} onClick={() => downloadResume(row.id, 'docx')}>↓ Word</InkButton>
              <InkButton p={p} kind="outline" size="sm" style={{ flex: 1 }} onClick={() => window.open(`/api/resume/history/${row.id}`, '_blank')}>View ↗</InkButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


export default function ResumePage() {
  const router = useRouter();
  const { p } = usePaperTheme();
  return <ResumeV3 p={p} go={(r) => router.push(`/app/${r}`)} />;
}
