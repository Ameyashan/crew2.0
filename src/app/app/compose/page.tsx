// @ts-nocheck — verbatim port of Crew prototype v3 compose
"use client";

import { Fragment, useEffect, useRef, useState } from "react";
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

function ComposeV3({ p, seed, setSeed, go }) {
  const [input, setInput]   = useState(seed?.input || '');
  const [intent, setIntent] = useState('');
  const [haveEmail, setHaveEmail] = useState(false);
  const [screenshot, setScreenshot] = useState(null);
  const [stage, setStage]   = useState('idle'); // idle|parsing|review|working|done
  const [kind, setKind]     = useState(null);   // 'person'|'job'
  const [parsed, setParsed] = useState(null);
  const [progress, setProgress] = useState({});
  const [drafts, setDrafts] = useState(null);   // person path: drafts returned by /api/compose
  const [runError, setRunError] = useState(null);
  const [enrichment, setEnrichment] = useState(null);

  function reset() {
    setInput(''); setIntent(''); setHaveEmail(false); setScreenshot(null);
    setStage('idle'); setKind(null); setParsed(null); setProgress({});
    setSeed?.(null);
  }

  function detectKind(s) {
    const lo = (s || '').toLowerCase();
    if (/\b(jobs?|careers?|hiring|posting|positions?)\b/.test(lo)) return 'job';
    if (/(greenhouse|lever|ashbyhq|workable|wellfound|builtin|workday)\.io|com/.test(lo)) return 'job';
    if (lo.includes('/jobs/') || lo.includes('/careers/') || lo.includes('careers.')) return 'job';
    return 'person';
  }

  function run() {
    if (!input.trim()) return;
    setStage('parsing');
    setProgress({});
    const k = detectKind(input);
    setKind(k);
    setTimeout(() => {
      setParsed(k === 'job' ? inferJobV3(input) : inferPersonV3(input));
      setStage('review');
    }, 900);
  }

  async function confirm() {
    setStage('working');
    setRunError(null);
    setDrafts(null);

    if (kind === 'job') {
      // ── job path ── stream from /api/compose/apply (tailor + reach-out)
      const collectedDrafts = [];
      let collectedEnrichment = null;
      let bundle = { ats_score: null, target_role: null, target_company: null };
      const jobUrl = input.trim().match(/^https?:\/\//) ? input.trim() : `https://${input.trim()}`;
      try {
        const res = await fetch('/api/compose/apply', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
          body: JSON.stringify({ job_url: jobUrl, intent: intent || undefined }),
        });
        if (!res.ok || !res.body) throw new Error(`apply failed: ${res.status}`);
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
            if (evt.type === 'step') {
              const k = evt.id; // resume | person | email | outreach
              if (evt.status === 'start') setProgress((p) => ({ ...p, [k]: 10 }));
              else if (evt.status === 'done' || evt.status === 'skipped') setProgress((p) => ({ ...p, [k]: 100 }));
              if (k === 'resume' && evt.status === 'done' && evt.data) {
                bundle = { ...bundle, ...evt.data };
              }
              if (k === 'email' && evt.data) collectedEnrichment = evt.data;
              if (k === 'outreach' && evt.status === 'done' && evt.data) {
                collectedDrafts.push(evt.data);
              }
            } else if (evt.type === 'error') {
              throw new Error(evt.message || 'apply error');
            }
          }
        }
        if (collectedDrafts.length) setDrafts(collectedDrafts);
        if (collectedEnrichment) setEnrichment(collectedEnrichment);
        // Stuff the bundle into parsed so PackageV3's JobPackage can render it.
        // The API speaks target_role/target_company; the card reads role/company —
        // map them across so a successful parse actually replaces the preview.
        setParsed((prev) => ({
          ...(prev || {}),
          ...bundle,
          unparsed: false,
          role: bundle.target_role || prev?.role,
          company: bundle.target_company || prev?.company,
          ats_score: bundle.ats_score ?? prev?.ats_score,
        }));
        setProgress({ resume: 100, person: 100, email: 100, outreach: 100 });
        setStage('done');
      } catch (e) {
        setRunError(String(e?.message || e));
        setStage('review');
      }
      return;
    }

    // ── person path ── stream from /api/compose (reach-out agent)
    // Maps SSE step events to the prototype's three progress keys so the
    // existing AgentRowV3 keeps animating without changes.
    const stepToKey = { research: 'person', email_lookup: 'email', draft: 'outreach' };
    const collectedDrafts = [];
    let collectedEnrichment = null;

    try {
      const res = await fetch('/api/compose', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
        body: JSON.stringify({ text: input, intent: intent || undefined }),
      });
      if (!res.ok || !res.body) throw new Error(`compose failed: ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // SSE events split by blank line
        const parts = buf.split('\n\n');
        buf = parts.pop() || '';
        for (const raw of parts) {
          const line = raw.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          let evt;
          try { evt = JSON.parse(line.slice(6)); } catch { continue; }
          if (evt.type === 'step') {
            const key = stepToKey[evt.id];
            if (key) {
              if (evt.status === 'start') setProgress((p) => ({ ...p, [key]: 10 }));
              else if (evt.status === 'done') setProgress((p) => ({ ...p, [key]: 100 }));
              else if (evt.status === 'skipped') setProgress((p) => ({ ...p, [key]: 100 }));
            }
            if (evt.id === 'email_lookup' && evt.data) collectedEnrichment = evt.data;
            if (evt.id === 'draft' && evt.status === 'done' && evt.data) {
              collectedDrafts.push(evt.data);
            }
          } else if (evt.type === 'needs_disambiguation') {
            setRunError('Multiple candidates matched. Open Compose with a more specific name.');
          } else if (evt.type === 'complete') {
            // surface enrichment + drafts to the done view
            if (collectedEnrichment) setEnrichment(collectedEnrichment);
            if (collectedDrafts.length) setDrafts(collectedDrafts);
            setProgress({ person: 100, email: 100, outreach: 100 });
            setStage('done');
          } else if (evt.type === 'error') {
            throw new Error(evt.message || 'compose error');
          }
        }
      }
      // Some streams complete without an explicit 'complete' event — fall through.
      if (collectedDrafts.length && !drafts) {
        setEnrichment(collectedEnrichment);
        setDrafts(collectedDrafts);
        setProgress({ person: 100, email: 100, outreach: 100 });
        setStage('done');
      }
    } catch (e) {
      setRunError(String(e?.message || e));
      setStage('review');
    }
  }

  const titles = {
    idle:    { eyebrow: 'Compose · the crew is ready',     title: 'Who are you reaching out to?',                    italic: 'Or what job today?' },
    parsing: { eyebrow: 'Compose · reading what you sent', title: 'Jugaadu is reading…',                                italic: '' },
    review:  { eyebrow: kind === 'job' ? 'Compose · the job' : 'Compose · the target',
               title: 'Confirm and ',
               italic: 'send the crew?' },
    working: { eyebrow: 'Compose · the crew is working',   title: kind === 'job' ? 'Four agents on it.' : 'Three agents on it.', italic: '' },
    done:    { eyebrow: 'Compose · ready to send',         title: 'Your package is ready,',                          italic: 'polished.' },
  };
  const ttl = titles[stage];

  return (
    <div className="scroll" style={{
      flex: 1, overflow: 'auto', padding: '40px 56px 80px', background: p.paper, color: p.ink,
    }}>
      <PageHead p={p}
        eyebrow={ttl.eyebrow}
        title={ttl.title}
        italic={ttl.italic}
        right={stage !== 'idle' && (
          <InkButton p={p} kind="outline" size="sm" onClick={reset}>↺ Start over</InkButton>
        )}
      />

      {/* ─── paste field ─── */}
      {stage === 'idle' && (
        <PasteFieldV3
          p={p} input={input} setInput={setInput}
          intent={intent} setIntent={setIntent}
          haveEmail={haveEmail} setHaveEmail={setHaveEmail}
          screenshot={screenshot} setScreenshot={setScreenshot}
          onGo={run}
        />
      )}

      {/* ─── parsed/review card ─── */}
      {(stage === 'parsing' || stage === 'review') && (
        <ParsedCard p={p} stage={stage} kind={kind} parsed={parsed} onConfirm={confirm} onChoose={(np) => setParsed(np)}/>
      )}

      {/* ─── working agents ─── */}
      {(stage === 'working' || stage === 'done') && (
        <AgentRowV3 p={p} kind={kind} stage={stage} progress={progress}/>
      )}

      {/* ─── package ─── */}
      {stage === 'done' && (
        <PackageV3 p={p} kind={kind} parsed={parsed} intent={intent} drafts={drafts} enrichment={enrichment} onReset={reset} go={go}/>
      )}
      {runError && (
        <div style={{
          marginTop: 16, padding: '12px 16px', background: p.card,
          border: `1.5px solid ${p.stamp}`, color: p.stamp,
          fontFamily: PAPER_FONTS.mono, fontSize: 12,
        }}>
          {runError}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────── paste field (idle state) ─────────────────────── */

function PasteFieldV3({ p, input, setInput, intent, setIntent, haveEmail, setHaveEmail, screenshot, setScreenshot, onGo }) {
  const fileRef = useRef(null);
  const samples = [
    { label: 'x post',     text: 'x.com/anika_designs/status/1782991028' },
    { label: 'linkedin',   text: 'linkedin.com/in/anika-mehta' },
    { label: 'free-text',  text: 'the woman who runs ops at Ramp' },
    { label: 'job link ↗', text: 'https://stripe.com/jobs/listing/product-designer-payments' },
  ];
  function pickFile(e) {
    const f = e.target.files?.[0];
    if (f) setScreenshot({ name: f.name, size: `${Math.round(f.size / 1024)} KB` });
  }
  return (
    <>
      <PaperCard p={p} color={p.marigold} hardShadow style={{ padding: '22px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <Eyebrow p={p} hindi="लिंक · नाम · खयाल" en="Paste a link, name, or free-text"/>
          <span style={{
            fontFamily: PAPER_FONTS.mono, fontSize: 10.5, letterSpacing: '.06em', color: p.inkMute,
          }}>linkedin · x · greenhouse · lever · pdf · anything</span>
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') onGo(); }}
          placeholder='x.com/maya  ·  linkedin.com/in/…  ·  "the woman who runs ops at Ramp"'
          rows={2}
          style={{
            width: '100%', resize: 'vertical', minHeight: 80,
            padding: '14px 16px', background: p.paper,
            border: `1.5px solid ${input.trim() ? p.stamp : p.ink + '30'}`,
            fontFamily: PAPER_FONTS.mono, fontSize: 15, lineHeight: 1.5, color: p.ink,
            outline: 'none', transition: 'border-color .2s',
          }}
        />
        <div style={{
          marginTop: 10, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              fontFamily: PAPER_FONTS.mono, fontSize: 10.5, letterSpacing: '.16em',
              color: p.inkMute, textTransform: 'uppercase',
            }}>Try:</span>
            {samples.map(s => (
              <button key={s.label} onClick={() => setInput(s.text)} style={{
                padding: '5px 11px', background: 'transparent', border: `1.5px solid ${p.ink}30`,
                fontFamily: PAPER_FONTS.mono, fontSize: 11.5, color: p.ink,
                letterSpacing: '.02em', cursor: 'pointer',
              }}>{s.label}</button>
            ))}
          </div>
          <InkButton p={p} color={p.stamp} onClick={onGo} disabled={!input.trim()}>
            <span>Go</span>
            <kbd style={{
              padding: '1px 6px', fontFamily: PAPER_FONTS.mono, fontSize: 10,
              background: 'rgba(255,255,255,.16)', borderRadius: 2,
            }}>⌘↵</kbd>
          </InkButton>
        </div>
      </PaperCard>

      {/* intent */}
      <div style={{
        marginTop: 12, padding: '14px 18px', background: p.card,
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

      {/* email skip */}
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

      <div style={{ marginTop: 22 }}>
        <Marginalia p={p} rotate={-1}>paste anything — Jugaadu sorts out what to do ↗</Marginalia>
      </div>
    </>
  );
}

/* ─────────────────────── parsed / review ─────────────────────── */

function ParsedCard({ p, stage, kind, parsed, onConfirm, onChoose }) {
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
            <InkButton p={p} color={p.stamp} onClick={onConfirm} disabled={parsing}>Send the crew →</InkButton>
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
          <InkButton p={p} color={p.stamp} onClick={onConfirm} disabled={parsing}>Send the crew →</InkButton>
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
        <InkButton p={p} color={p.stamp} onClick={onConfirm} disabled={parsing}>Send the crew →</InkButton>
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
  const agents = AGENTS_DATA[kind] || AGENTS_DATA.person;
  return (
    <div style={{
      marginTop: 14, display: 'grid',
      gridTemplateColumns: `repeat(${agents.length}, 1fr)`, gap: 12,
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
            padding: '16px 16px 14px', position: 'relative',
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
              <div style={{ fontFamily: PAPER_FONTS.devan, fontSize: 12, color: p.inkSoft, fontWeight: 700 }}>{a.nameHi}</div>
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
// per-card "Open in Gmail" button open the exact same message.
function buildEmailDraft({ kind, parsed, drafts, enrichment }) {
  const emailDraft = Array.isArray(drafts) ? drafts.find((d) => d.channel === 'email') : null;

  if (kind === 'job') {
    return {
      to: enrichment?.email || 'anika@stripe.com',
      subject: emailDraft?.subject || 'the bit about pricing tables in Atlas — a 3 min thought',
      body: emailDraft?.body
        || `Anika — caught the Atlas pricing-table redesign and the way you handled the discount-stacking edge case is the cleanest take I've seen on it. I rebuilt onboarding at Razorpay last year and ran into a similar spec-vs-edge tension. I sketched two ways out (3-min watch).\n\nI'm also applying for the Senior PD role open on your team — resume attached. Either way, would love your take.\n\n— Sam`,
    };
  }

  const chosen = parsed.chosen;
  const verifiedEmail = enrichment?.email || `${chosen.firstName.toLowerCase()}@${chosen.companySlug}.com`;
  return emailDraft
    ? { to: verifiedEmail, subject: emailDraft.subject || '', body: emailDraft.body }
    : {
        to: verifiedEmail,
        subject: `the bit about ${chosen.angle} — a 3 min thought`,
        body: `${chosen.firstName} — caught your ${chosen.recent} and the way you handled the ${chosen.detail} is the cleanest take I've seen on it. I ran into a similar tension at Razorpay last year. Sketched two ways out (3-min watch).\n\nI'd love your take. Either way — hope this finds you well between sprints.\n\n— Sam`,
      };
}

function PackageV3({ p, kind, parsed, intent, drafts, enrichment, onReset, go }) {
  const headerEmail = buildEmailDraft({ kind, parsed, drafts, enrichment });
  return (
    <div style={{ marginTop: 18 }}>
      <PaperCard p={p} hardShadow color={p.stamp} style={{ padding: '20px 24px' }}>
        <div style={{
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          gap: 18, flexWrap: 'wrap',
        }}>
          <div>
            <Eyebrow p={p} hindi="हो गया" en={`Package ready · ${kind === 'job' ? '47s' : '32s'}`} color={p.stamp}/>
            <div style={{
              fontFamily: PAPER_FONTS.display, fontSize: 30, lineHeight: 1.05, marginTop: 6, color: p.ink,
            }}>
              Everything you need to send,
              <span style={{ fontStyle: 'italic', color: p.stamp }}> in your voice.</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <InkButton p={p} kind="outline" onClick={onReset}>↺ Another</InkButton>
            <InkButton p={p} color={p.stamp} onClick={() => openGmailCompose(headerEmail)}>
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
        ? <PersonPackage p={p} parsed={parsed} drafts={drafts} enrichment={enrichment} go={go}/>
        : <JobPackage    p={p} parsed={parsed} drafts={drafts} enrichment={enrichment} go={go}/>
      }
    </div>
  );
}

function PersonPackage({ p, parsed, drafts, enrichment, go }) {
  const [channel, setChannel] = useState('email'); // email | linkedin | x
  const chosen = parsed.chosen;

  // Real drafts from /api/compose override the prototype's mocked messages.
  const draftByChannel = {};
  if (Array.isArray(drafts)) for (const d of drafts) draftByChannel[d.channel] = d;

  const messages = {
    email: buildEmailDraft({ kind: 'person', parsed, drafts, enrichment }),
    linkedin: draftByChannel.linkedin
      ? { to: `linkedin.com/in/${chosen.companySlug}-${chosen.firstName.toLowerCase()}`, subject: null, body: draftByChannel.linkedin.body }
      : {
          to: `linkedin.com/in/${chosen.companySlug}-${chosen.firstName.toLowerCase()}`,
          subject: null,
          body: `${chosen.firstName} — your recent post on ${chosen.recent} resonated. Worked on a similar problem at Razorpay; would love to compare notes. Quick coffee, your time?`,
        },
    x: draftByChannel.x
      ? { to: `@${chosen.firstName.toLowerCase()}_${chosen.companySlug.slice(0,4)}`, subject: null, body: draftByChannel.x.body }
      : {
          to: `@${chosen.firstName.toLowerCase()}_${chosen.companySlug.slice(0,4)}`,
          subject: null,
          body: `loved the thread on ${chosen.angle} — esp. the bit about ${chosen.detail}. ran into the same wall a year ago, ended up shipping it backwards. happy to share what didn't work if useful 🙏`,
        },
  };
  const m = messages[channel];

  return (
    <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12 }}>
      {/* draft */}
      <PaperCard p={p} style={{ padding: '20px 22px' }}>
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
                flex: 1, padding: '10px 12px', background: on ? p.ink : 'transparent',
                color: on ? p.paper : p.ink, border: `1.5px solid ${p.ink}`,
                fontFamily: PAPER_FONTS.display, fontSize: 16, textAlign: 'left',
                cursor: 'pointer',
              }}>
                <div>{c.label}</div>
                <div style={{
                  fontFamily: PAPER_FONTS.mono, fontSize: 9.5, letterSpacing: '.1em',
                  opacity: .7, marginTop: 2, textTransform: 'uppercase',
                }}>{c.desc}</div>
              </button>
            );
          })}
        </div>
        <div style={{
          background: p.paper, border: `1.5px solid ${p.ink}30`,
          padding: '14px 16px', fontFamily: PAPER_FONTS.sans, fontSize: 14, lineHeight: 1.55,
        }}>
          <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 11.5, color: p.inkMute, marginBottom: 6 }}>
            <span style={{ color: p.inkMute }}>To &nbsp;</span><span style={{ color: p.ink }}>{m.to}</span>
            <span style={{ color: p.leaf, marginLeft: 8 }}>· verified</span>
          </div>
          {m.subject && (
            <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 11.5, color: p.inkMute, marginBottom: 8 }}>
              <span style={{ color: p.inkMute }}>Re &nbsp;</span><span style={{ color: p.ink }}>{m.subject}</span>
            </div>
          )}
          <div style={{ height: 1, background: p.ink + '14', margin: '4px 0 10px' }}/>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap', color: p.ink }}>{m.body}</p>
        </div>
        <div style={{
          marginTop: 10, display: 'flex', gap: 14, fontFamily: PAPER_FONTS.mono, fontSize: 11,
          color: p.inkSoft, letterSpacing: '.04em',
        }}>
          <span>● spam score 0.04</span>
          <span style={{ color: p.inkMute }}>· best send Tue 10:42am</span>
          <span style={{ color: p.inkMute }}>· followup in 3d</span>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {channel === 'email' && (
            <InkButton p={p} color={p.stamp} size="sm" onClick={() => {
              openGmailCompose({ to: m.to, subject: m.subject, body: m.body });
            }}>Open in Gmail →</InkButton>
          )}
          <InkButton p={p} kind="outline" size="sm">↻ Another angle</InkButton>
          <InkButton p={p} kind="outline" size="sm">✎ Edit</InkButton>
        </div>
      </PaperCard>

      {/* person */}
      <PaperCard p={p} style={{ padding: '20px 22px' }}>
        <Eyebrow p={p} hindi="वो" en="The person · matched 92%" color={p.leaf}/>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <div style={{
            width: 52, height: 52, background: p.marigold, color: p.paper,
            display: 'grid', placeItems: 'center', fontFamily: PAPER_FONTS.display, fontSize: 20,
            border: `1.5px solid ${p.ink}`,
          }}>{chosen.initials}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 19, color: p.ink }}>{chosen.name}</div>
            <div style={{ fontFamily: PAPER_FONTS.serif, fontStyle: 'italic', fontSize: 13.5, color: p.inkSoft }}>
              {chosen.role} · {chosen.company}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {chosen.facts.map(f => (
            <span key={f} style={{
              padding: '4px 10px', background: p.paper, border: `1px solid ${p.ink}30`,
              fontFamily: PAPER_FONTS.sans, fontSize: 11.5, color: p.ink,
            }}>{f}</span>
          ))}
        </div>
        <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
          <KV p={p} k="email"    v={`${chosen.firstName.toLowerCase()}@${chosen.companySlug}.com`} chip="96%"/>
          <KV p={p} k="linkedin" v={`linkedin.com/in/${chosen.companySlug}-${chosen.firstName.toLowerCase()}`} chip="active"/>
          <KV p={p} k="x"        v={`@${chosen.firstName.toLowerCase()}_designs`} chip="4h ago"/>
        </div>
        <button onClick={() => go('people')} style={{
          marginTop: 12, width: '100%', padding: '10px 12px', background: 'transparent',
          border: `1.5px dashed ${p.ink}40`, color: p.ink,
          fontFamily: PAPER_FONTS.mono, fontSize: 11.5, letterSpacing: '.08em',
          textTransform: 'uppercase', cursor: 'pointer',
        }}>Save to People ↗</button>
      </PaperCard>
    </div>
  );
}

function JobPackage({ p, parsed, drafts, enrichment, go }) {
  // Real values from the tailor agent, mapped in on confirm(). Fall back to the
  // prototype's mock copy only when a field genuinely wasn't returned.
  const jobRole = parsed?.role;
  const jobCompany = parsed?.company;
  const atsScore = parsed?.ats_score;
  // Prefer real drafts/enrichment over the prototype's mocked strings.
  const { to: emailTo, subject: emailSubject, body: emailBody } =
    buildEmailDraft({ kind: 'job', parsed, drafts, enrichment });
  return (
    <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr', gap: 12 }}>
      {/* resume */}
      <PaperCard p={p} style={{ padding: '20px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Eyebrow p={p} hindi="रेज़्यूमे" en="Tailored resume" color={p.marigold}/>
          <span style={{
            fontFamily: PAPER_FONTS.mono, fontSize: 10.5, color: p.leaf, letterSpacing: '.06em',
          }}>{atsScore != null ? `ATS ${atsScore}/100` : 'ATS 96/100'}</span>
        </div>
        {(jobRole || jobCompany) && (
          <div style={{
            fontFamily: PAPER_FONTS.serif, fontStyle: 'italic', fontSize: 13, color: p.inkSoft, marginTop: 6,
          }}>
            for {[jobRole, jobCompany].filter(Boolean).join(' at ')}
          </div>
        )}
        <div style={{
          marginTop: 12, background: p.paper, border: `1.5px solid ${p.ink}30`,
          aspectRatio: '8.5/11', padding: '14px 14px', position: 'relative',
          fontFamily: PAPER_FONTS.serif, color: p.ink, fontSize: 8, lineHeight: 1.3, overflow: 'hidden',
        }}>
          <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 14 }}>Sam Altman</div>
          <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 7, color: p.inkMute, marginTop: 2 }}>
            sam@jugaadu.app · SF · sam.work
          </div>
          <div style={{ height: 1, background: p.ink + '30', margin: '6px 0' }}/>
          <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 9 }}>Stripe-flavored experience</div>
          <div style={{ marginTop: 2 }}>· Cut onboarding drop-off <span style={{ background: p.marigold }}>41%</span> · KYC photo-first</div>
          <div>· Shipped Atlas-style design system, 6 surfaces</div>
          <div>· 0→1 of Bill Pay; 8mo to GA</div>
          <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 9, marginTop: 6 }}>Tooling</div>
          <div>· React + TS, Figma, OKLCH systems</div>
          <div>· Wrote the design tokens spec used by 4 teams</div>
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, height: 50,
            background: `linear-gradient(to bottom, transparent, ${p.paper})`,
          }}/>
          <div style={{
            position: 'absolute', right: 8, bottom: 6,
            fontFamily: PAPER_FONTS.mono, fontSize: 7, color: p.inkMute,
          }}>PDF · 1 of 1</div>
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
          <InkButton p={p} kind="outline" size="sm" style={{ flex: 1 }}>↓ PDF</InkButton>
          <InkButton p={p} kind="outline" size="sm" style={{ flex: 1 }}>↓ Word</InkButton>
          <InkButton p={p} kind="outline" size="sm" style={{ flex: 1 }} onClick={() => go('resume')}>history</InkButton>
        </div>
      </PaperCard>

      {/* email draft */}
      <PaperCard p={p} style={{ padding: '20px 22px' }}>
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
          <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.inkMute }}>
            <span>To &nbsp;</span><span style={{ color: p.ink }}>{emailTo}</span>
            {enrichment?.email && <span style={{ color: p.leaf, marginLeft: 8 }}>· verified</span>}
          </div>
          <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.inkMute, marginTop: 4 }}>
            <span>Re &nbsp;</span><span style={{ color: p.ink }}>{emailSubject}</span>
          </div>
          <div style={{ height: 1, background: p.ink + '14', margin: '8px 0' }}/>
          <p style={{ margin: 0, color: p.ink, whiteSpace: 'pre-wrap' }}>{emailBody}</p>
        </div>
        <div style={{
          marginTop: 10, display: 'flex', gap: 14, fontFamily: PAPER_FONTS.mono, fontSize: 11,
          color: p.inkSoft, letterSpacing: '.04em',
        }}>
          <span>● spam 0.04</span>
          <span style={{ color: p.inkMute }}>· best send Tue 10:42am</span>
          <span style={{ color: p.inkMute }}>· followup in 3d</span>
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <InkButton p={p} color={p.stamp} size="sm" style={{ flex: 1 }} onClick={() => {
            openGmailCompose({ to: emailTo, subject: emailSubject, body: emailBody });
          }}>Open in Gmail →</InkButton>
          <InkButton p={p} kind="outline" size="sm" style={{ flex: 1 }}>↻ Another angle</InkButton>
        </div>
      </PaperCard>

      {/* person */}
      <PaperCard p={p} style={{ padding: '20px 22px' }}>
        <Eyebrow p={p} hindi="वो" en="Hiring manager · 92%" color={p.leaf}/>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <div style={{
            width: 52, height: 52, background: p.marigold, color: p.paper,
            display: 'grid', placeItems: 'center', fontFamily: PAPER_FONTS.display, fontSize: 18,
            border: `1.5px solid ${p.ink}`,
          }}>AM</div>
          <div>
            <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 18, color: p.ink }}>Anika Mehta</div>
            <div style={{ fontFamily: PAPER_FONTS.serif, fontStyle: 'italic', fontSize: 13, color: p.inkSoft }}>
              Senior Product Designer · Stripe
            </div>
          </div>
        </div>
        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {[
            'shipped Atlas pricing redesign',
            'long-form > 1-liners',
            'IIT-D · Stanford d.school',
            'hates "hope this finds you well"',
          ].map(f => (
            <span key={f} style={{
              padding: '4px 10px', background: p.paper, border: `1px solid ${p.ink}30`,
              fontFamily: PAPER_FONTS.sans, fontSize: 11.5, color: p.ink,
            }}>{f}</span>
          ))}
        </div>
        <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
          <KV p={p} k="email"    v="anika@stripe.com" chip="96%"/>
          <KV p={p} k="linkedin" v="linkedin.com/in/anikamehta" chip="active"/>
          <KV p={p} k="x"        v="@anika_designs" chip="4h ago"/>
        </div>
        <button onClick={() => go('people')} style={{
          marginTop: 12, width: '100%', padding: '10px 12px', background: 'transparent',
          border: `1.5px dashed ${p.ink}40`, color: p.ink,
          fontFamily: PAPER_FONTS.mono, fontSize: 11.5, letterSpacing: '.08em',
          textTransform: 'uppercase', cursor: 'pointer',
        }}>Save to People ↗</button>
      </PaperCard>
    </div>
  );
}

function KV({ p, k, v, chip }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      padding: '6px 10px', background: p.paper, border: `1px solid ${p.ink}20`,
    }}>
      <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 10.5, color: p.inkMute, letterSpacing: '.04em', width: 64 }}>{k}</span>
      <span style={{ flex: 1, fontFamily: PAPER_FONTS.mono, fontSize: 11.5, color: p.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
      <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 10, color: p.stamp, padding: '2px 6px', background: p.stamp + '14', whiteSpace: 'nowrap', letterSpacing: '.04em' }}>{chip}</span>
    </div>
  );
}

/* ─────────────────────── data helpers ─────────────────────── */

function inferPersonV3(input) {
  const lo = (input || '').toLowerCase();
  if (lo.includes('maya')) {
    return {
      chosen: makeP('Maya Rao', 'MR', 'Head of Ops', 'Ramp', 'ramp', 'Maya', 92, 'NYC',
        'posted 4h ago about hiring ops', ['shipped Bill Pay ops in 8mo', 'ex-Brex, Capital One', 'replies long-form', 'allergic to "circling back"']),
      candidates: [
        makeP('Maya Rao', 'MR', 'Head of Ops', 'Ramp', 'ramp', 'Maya', 92, 'NYC'),
        makeP('Maya Patel', 'MP', 'Sr Ops Lead', 'Ramp · Bill Pay', 'ramp', 'Maya', 78, 'NYC'),
        makeP('Maya Gupta', 'MG', 'Ops PM', 'Ramp', 'ramp', 'Maya', 64, 'Remote'),
      ],
    };
  }
  if (lo.includes('anika') || lo.includes('stripe')) {
    return {
      chosen: makeP('Anika Mehta', 'AM', 'Senior Product Designer', 'Stripe', 'stripe', 'Anika', 96, 'NYC',
        'last post 4h · Atlas pricing thread', ['shipped Atlas pricing redesign', 'long-form > 1-liners', 'IIT-D · Stanford d.school', 'hates "hope this finds you well"']),
      candidates: [
        makeP('Anika Mehta', 'AM', 'Senior Product Designer', 'Stripe', 'stripe', 'Anika', 96, 'NYC'),
        makeP('Aniket Sharma', 'AS', 'Product Designer', 'Stripe', 'stripe', 'Aniket', 71, 'SF'),
        makeP('Anita Rao', 'AR', 'PM · Atlas', 'Stripe', 'stripe', 'Anita', 68, 'NYC'),
      ],
    };
  }
  // generic fallback
  return {
    chosen: makeP('Vishnu Sivaji', 'VS', 'Product Director', 'Google DeepMind', 'google', 'Vishnu', 88, 'London',
      'recently joined · 1mo ago', ['ex-Anthropic research', 'transitioning to / recently joined Google DeepMind', 'writes long-form', 'prefers cold DMs over emails']),
    candidates: [
      makeP('Vishnu Sivaji', 'VS', 'Product Director', 'Google DeepMind', 'google', 'Vishnu', 88, 'London'),
      makeP('Vinod Shankar', 'VS', 'Engineering Director', 'Google DeepMind', 'google', 'Vinod', 62, 'Mountain View'),
      makeP('Vivek Singh', 'VS', 'Product Lead', 'Google', 'google', 'Vivek', 58, 'Bangalore'),
    ],
  };
}

function makeP(name, initials, role, company, slug, firstName, confidence, location, signal = 'replies long-form', facts = []) {
  return {
    name, initials, role, company,
    companySlug: slug, firstName, confidence, location,
    signal,
    angle: 'pricing tables in Atlas',
    recent: 'Atlas pricing redesign',
    detail: 'discount-stacking edge case',
    facts: facts.length ? facts : ['recent product launches', 'replies long-form', 'writes on x weekly'],
  };
}

function inferJobV3(input) {
  const lo = (input || '').toLowerCase();
  if (lo.includes('stripe')) return {
    logo: 'S', company: 'Stripe · Payments', role: 'Senior Product Designer · Atlas',
    location: 'NYC · hybrid', comp: '$220k–$280k', posted: 'Posted 3d ago',
    tags: ['design systems', 'fintech', 'b2b', 'shipped products', 'figma + prototyping'],
  };
  if (lo.includes('ramp')) return {
    logo: 'R', company: 'Ramp', role: 'Staff Engineer · Bill Pay',
    location: 'NYC · onsite 3d', comp: '$260k–$340k', posted: 'Posted 6d ago',
    tags: ['typescript', 'postgres', 'high-throughput', 'payments rails', 'led teams 5+'],
  };
  if (lo.includes('anthropic')) return {
    logo: 'A', company: 'Anthropic', role: 'Design Engineer · Claude',
    location: 'SF · onsite 3d', comp: '$240k–$320k', posted: 'Posted 1d ago',
    tags: ['react + typescript', 'tight design taste', 'shipped LLM UX', 'systems thinking'],
  };
  // Unknown input: we have NOT parsed anything yet. The real fetch+parse runs
  // server-side on confirm(). Return an honest "not parsed yet" shape instead
  // of fabricated company/role/skills so the review card can't masquerade as
  // a parsed posting.
  return { unparsed: true, source: (input || '').trim() };
}

function jobHost(source) {
  const s = (source || '').trim();
  if (!s) return '';
  try {
    return new URL(s.match(/^https?:\/\//) ? s : `https://${s}`).hostname.replace(/^www\./, '');
  } catch {
    return s;
  }
}


export default function ComposePage() {
  const router = useRouter();
  const { p } = usePaperTheme();
  // seed/setSeed/go come from the prototype shell — provide safe defaults.
  return (
    <ComposeV3
      p={p}
      seed={null}
      setSeed={() => {}}
      go={(route) => router.push(`/app/${route}`)}
    />
  );
}
