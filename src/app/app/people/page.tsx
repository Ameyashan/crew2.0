// @ts-nocheck — verbatim port of Crew prototype v3 people
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PAPER_FONTS } from "@/components/paper/fonts";
import { usePaperTheme } from "@/components/paper/use-paper-theme";
import {
  Eyebrow,
  InkButton,
  PageHead,
  PaperEmpty,
} from "@/components/paper/primitives";
import { useIsMobile } from "@/lib/use-is-mobile";
import { hydrateRun } from "@/lib/runs-store";

function PeopleV3({ p, go, PEOPLE_V3 = [] }) {
  const isMobile = useIsMobile();
  const [q, setQ] = useState('');
  const [selectedId, setSelected] = useState(null);
  const [filter, setFilter] = useState('all');
  // On phones the list and detail can't sit side by side, so we swap between
  // them: tapping a contact opens the detail, and a back button returns.
  const [mobileView, setMobileView] = useState('list'); // 'list' | 'detail'
  useEffect(() => {
    if (!selectedId && PEOPLE_V3[0]?.id) setSelected(PEOPLE_V3[0].id);
  }, [PEOPLE_V3, selectedId]);

  const filtered = PEOPLE_V3
    .filter(x => filter === 'all' || x.warmth === filter || x.status === filter)
    .filter(x => !q ||
      x.name.toLowerCase().includes(q.toLowerCase()) ||
      x.co.toLowerCase().includes(q.toLowerCase()) ||
      x.role.toLowerCase().includes(q.toLowerCase())
    );
  const person = filtered.find(x => x.id === selectedId) || filtered[0] || PEOPLE_V3[0] || null;

  if (!person) {
    return (
      <div style={{ flex: 1, padding: 48, background: p.paper, color: p.ink }}>
        <PaperEmpty p={p} hindi="लोग" title="No people yet."
          sub="Reach out to someone via Compose and they'll show up here with a full timeline of every Jugaadu interaction." />
      </div>
    );
  }

  return (
    <div style={{
      flex: 1, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '380px 1fr', overflow: 'hidden',
      background: p.paper, color: p.ink,
    }}>
      {/* List */}
      {(!isMobile || mobileView === 'list') && (
      <div className="scroll" style={{ overflow: 'auto', borderRight: isMobile ? 'none' : `1.5px solid ${p.ink}`, padding: isMobile ? '24px 16px 40px' : '32px 22px 40px' }}>
        <Eyebrow p={p} hindi="लोग" en={`People · ${PEOPLE_V3.length} contacts`}/>
        <h1 style={{
          margin: '4px 0 18px', fontFamily: PAPER_FONTS.display, fontSize: 36,
          fontWeight: 400, lineHeight: 1, color: p.ink, letterSpacing: '-.02em',
        }}>The crew you've built.</h1>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="search by name, company, role, notes…"
          style={{
            width: '100%', padding: '11px 14px', background: p.card,
            border: `1.5px solid ${p.ink}30`, fontFamily: PAPER_FONTS.sans,
            fontSize: 14, color: p.ink, outline: 'none',
          }}
        />

        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6, margin: '12px 0 14px',
        }}>
          {[
            ['all', PEOPLE_V3.length],
            ['warm', PEOPLE_V3.filter(p => p.warmth === 'warm').length],
            ['awaiting', PEOPLE_V3.filter(p => p.status === 'awaiting').length],
            ['queued', PEOPLE_V3.filter(p => p.status === 'queued').length],
          ].map(([l, n]) => {
            const active = filter === l;
            return (
              <button key={l} onClick={() => setFilter(l)} style={{
                padding: '4px 10px', fontFamily: PAPER_FONTS.mono, fontSize: 11,
                letterSpacing: '.04em',
                background: active ? p.ink : 'transparent', color: active ? p.paper : p.ink,
                border: `1px solid ${p.ink}`, cursor: 'pointer',
              }}>{l} <span style={{ opacity: .6, marginLeft: 4 }}>{n}</span></button>
            );
          })}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {filtered.map((per, i) => {
            const active = per.id === person.id;
            return (
              <button key={per.id} onClick={() => { setSelected(per.id); setMobileView('detail'); }} style={{
                display: 'grid', gridTemplateColumns: '40px 1fr auto', alignItems: 'center', gap: 12,
                padding: '10px 12px',
                background: active ? p.card : 'transparent',
                border: active ? `1.5px solid ${p.ink}` : '1.5px solid transparent',
                boxShadow: active ? `3px 3px 0 ${warmthColor(p, per.warmth)}` : 'none',
                textAlign: 'left', cursor: 'pointer', color: p.ink,
                transition: 'background .15s',
              }}>
                <div style={{
                  width: 40, height: 40, background: p.marigold, color: p.paper,
                  display: 'grid', placeItems: 'center', border: `1.5px solid ${p.ink}`,
                  fontFamily: PAPER_FONTS.display, fontSize: 14,
                }}>{per.initials}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 16, color: p.ink, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {per.name}
                  </div>
                  <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.inkMute, marginTop: 2, letterSpacing: '.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {per.role} · {per.co}
                  </div>
                </div>
                <span style={{
                  fontFamily: PAPER_FONTS.mono, fontSize: 10, color: warmthColor(p, per.warmth),
                  letterSpacing: '.04em', whiteSpace: 'nowrap',
                }}>{per.last}</span>
              </button>
            );
          })}
        </div>
      </div>
      )}

      {/* Detail */}
      {(!isMobile || mobileView === 'detail') && (
      <div className="scroll" style={{ overflow: 'auto', padding: isMobile ? '20px 16px 64px' : '40px 56px 80px' }}>
        {isMobile && (
          <button onClick={() => setMobileView('list')} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 16,
            background: 'transparent', border: `1.5px solid ${p.ink}`, color: p.ink,
            padding: '8px 14px', fontFamily: PAPER_FONTS.mono, fontSize: 12,
            letterSpacing: '.04em', cursor: 'pointer',
          }}>← All people</button>
        )}
        <PersonDetailV3 p={p} person={person} go={go}/>
      </div>
      )}
    </div>
  );
}

function warmthColor(p, w) {
  return ({ warm: p.leaf, cool: p.tea, cold: p.inkMute, new: p.stamp }[w]) || p.inkMute;
}

function PersonDetailV3({ p, person, go }) {
  const router = useRouter();
  const [detail, setDetail] = useState(null);
  const [opening, setOpening] = useState(null);
  useEffect(() => {
    if (!person?.id) return;
    let cancelled = false;
    fetch(`/api/people/${person.id}`).then((r) => r.json()).then((j) => {
      if (!cancelled) setDetail(j);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [person?.id]);

  const workflows = detail?.workflows || [];
  const nextFollowup = detail?.nextFollowup || null;

  async function openWorkflow(id) {
    setOpening(id);
    try {
      const res = await fetch(`/api/compose/history/${id}`);
      if (!res.ok) throw new Error(`load failed: ${res.status}`);
      const json = await res.json();
      const run = json?.run;
      if (!run) throw new Error('run not found');
      hydrateRun({
        id: run.id,
        kind: run.kind,
        input: run.input,
        intent: run.intent,
        outcome: run.outcome,
        error: run.error,
        created_at: run.created_at,
        output: run.output,
        screenshot: run.screenshot,
      });
      router.push('/app/compose');
    } catch {
      setOpening(null);
    }
  }
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 22, marginBottom: 24, flexWrap: 'wrap',
      }}>
        <div style={{
          width: 90, height: 90, background: p.marigold, color: p.paper,
          display: 'grid', placeItems: 'center', border: `1.5px solid ${p.ink}`,
          boxShadow: `4px 4px 0 ${p.ink}`,
          fontFamily: PAPER_FONTS.display, fontSize: 30, flexShrink: 0,
        }}>{person.initials}</div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <Eyebrow p={p} hindi="वो" en={`Last touch · ${person.last}`} color={warmthColor(p, person.warmth)}/>
          <h1 style={{
            margin: '4px 0 6px', fontFamily: PAPER_FONTS.display,
            fontSize: 42, lineHeight: 1, color: p.ink, fontWeight: 400, letterSpacing: '-.02em',
          }}>{person.name}</h1>
          <div style={{ fontFamily: PAPER_FONTS.serif, fontStyle: 'italic', fontSize: 17, color: p.inkSoft }}>
            {person.role} at {person.co}
          </div>
          <div style={{
            display: 'flex', gap: 18, marginTop: 12, flexWrap: 'wrap',
            fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.inkMute, letterSpacing: '.04em',
          }}>
            <span>✉ {person.email}</span>
            <span>● warmth: <span style={{ color: warmthColor(p, person.warmth) }}>{person.warmth}</span></span>
            <span>status: {person.status}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          <InkButton p={p} color={p.stamp} onClick={() => go('compose', { input: person.email })}>Reach out again →</InkButton>
        </div>
      </div>

      {/* facts strip */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 28 }}>
        {(extractFacts(detail) || []).map(f => (
          <span key={f} style={{
            padding: '4px 12px', background: p.card,
            border: `1px solid ${p.ink}30`, color: p.ink,
            fontFamily: PAPER_FONTS.sans, fontSize: 12,
          }}>{f}</span>
        ))}
      </div>

      {/* next followup indicator */}
      {nextFollowup && (() => {
        const due = new Date(nextFollowup.due_at);
        const diff = due.getTime() - Date.now();
        const days = Math.round(diff / 86400000);
        const overdue = diff < 0;
        const when = overdue
          ? `overdue · ${Math.abs(days)}d`
          : days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
        const color = overdue ? p.stamp : days <= 2 ? p.marigoldDeep : p.leaf;
        const dateLabel = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28,
            padding: '12px 16px', background: p.card,
            border: `1.5px solid ${color}`, boxShadow: `3px 3px 0 ${color}`,
          }}>
            <span style={{
              fontFamily: PAPER_FONTS.mono, fontSize: 10.5, letterSpacing: '.14em',
              textTransform: 'uppercase', color,
            }}>● Next followup</span>
            <span style={{
              fontFamily: PAPER_FONTS.display, fontSize: 18, color: p.ink, lineHeight: 1,
            }}>{when}</span>
            <span style={{
              fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.inkMute, letterSpacing: '.04em',
            }}>{dateLabel}{nextFollowup.draft?.subject ? ` · ${nextFollowup.draft.subject}` : ''}</span>
          </div>
        );
      })()}

      {/* workflows */}
      <Eyebrow p={p} hindi="कार्य" en={`Workflows · ${workflows.length}`} color={p.stamp}/>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
        {workflows.length === 0 && (
          <div style={{
            padding: '14px 18px', background: p.card, border: `1.5px dashed ${p.ink}30`,
            fontFamily: PAPER_FONTS.mono, fontSize: 12, color: p.inkMute, letterSpacing: '.04em',
          }}>No workflows yet for this person.</div>
        )}
        {workflows.map((w) => {
          const chip = workflowOutcome(p, w.outcome);
          const title = workflowTitle(w);
          return (
            <div key={w.id} style={{
              background: p.card, border: `1.5px solid ${p.ink}30`,
              padding: '14px 18px', display: 'grid',
              gridTemplateColumns: '1fr auto auto auto', alignItems: 'center', gap: 14,
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontFamily: PAPER_FONTS.mono, fontSize: 10.5, letterSpacing: '.14em',
                  textTransform: 'uppercase', color: p.inkMute,
                }}>compose · {w.kind}</div>
                <div style={{
                  fontFamily: PAPER_FONTS.display, fontSize: 17, color: p.ink, lineHeight: 1.15,
                  marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{title}</div>
              </div>
              <span style={{
                padding: '3px 10px', background: chip.color + '14', color: chip.color,
                fontFamily: PAPER_FONTS.mono, fontSize: 11, letterSpacing: '.04em', whiteSpace: 'nowrap',
              }}>{chip.label}</span>
              <span style={{
                fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.inkMute,
                letterSpacing: '.04em', whiteSpace: 'nowrap',
              }}>{relTime(new Date(w.created_at))}</span>
              <InkButton p={p} kind="outline" size="sm"
                onClick={() => openWorkflow(w.id)} disabled={opening === w.id}>
                {opening === w.id ? 'opening…' : 'Open →'}
              </InkButton>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function workflowOutcome(p, outcome) {
  if (outcome === 'complete') return { label: 'ready', color: p.leaf };
  if (outcome === 'in_flight') return { label: 'in progress…', color: p.stamp };
  if (outcome === 'needs_disambiguation') return { label: 'needs pick', color: p.marigoldDeep };
  return { label: 'error', color: p.stamp };
}

function workflowTitle(w) {
  const out = w.output || {};
  if (w.kind === 'job') {
    const parsed = out.parsed || {};
    const role = parsed.target_role || parsed.role || 'Job application';
    return w.intent ? `${role} · ${w.intent}` : role;
  }
  const summary = out.person?.name || out.summary || w.intent || w.input;
  return summary || 'Compose run';
}

function relTime(d) {
  const diff = Date.now() - d.getTime();
  const day = 86400000;
  if (diff < day) {
    const h = Math.max(1, Math.round(diff / 3600000));
    return `today · ${h}h ago`;
  }
  const days = Math.round(diff / day);
  return `${days}d ago`;
}

function extractFacts(detail) {
  if (!detail) return ['loading…'];
  const facts = [];
  const e = detail.person?.enrichment || {};
  if (typeof e.title === 'string') facts.push(e.title);
  if (typeof e.tenure === 'string') facts.push(e.tenure);
  if (Array.isArray(e.signals)) for (const s of e.signals.slice(0, 3)) if (typeof s === 'string') facts.push(s);
  if (typeof e.location === 'string') facts.push(e.location);
  if (!facts.length && detail.person?.company) facts.push(`works at ${detail.person.company}`);
  if (!facts.length) facts.push('no enrichment on file yet');
  return facts;
}


export default function PeoplePage() {
  const router = useRouter();
  const { p } = usePaperTheme();
  const [people, setPeople] = useState([]);
  useEffect(() => {
    fetch('/api/people').then((r) => r.json()).then((j) => {
      setPeople((j?.people || []).map(adaptPerson));
    }).catch(() => {});
  }, []);
  return (
    <PeopleV3
      p={p}
      PEOPLE_V3={people}
      go={(r, seed) => {
        if (seed?.input) router.push(`/app/compose?seed=${encodeURIComponent(seed.input)}`);
        else router.push(`/app/${r}`);
      }}
    />
  );
}

function adaptPerson(row) {
  const name = row.name || '(unknown)';
  const initials =
    name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() ||
    '·';
  const recent = row.last_interaction ? new Date(row.last_interaction) : null;
  const last = recent
    ? recent.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '—';
  // Heuristic warmth: replied → warm, sent w/o reply → cool, no contact → new.
  const type = row.last_interaction_type;
  let warmth = 'new';
  let status = 'queued';
  if (type === 'replied') { warmth = 'warm'; status = 'replied'; }
  else if (type === 'sent') {
    warmth = recent && Date.now() - recent.getTime() > 14 * 86400000 ? 'cold' : 'cool';
    status = 'awaiting';
  } else if (type === 'drafted') { status = 'queued'; }
  return {
    id: row.id,
    name,
    role: row.role || '',
    co: row.company || '',
    initials,
    last,
    warmth,
    status,
    email: row.email || '',
  };
}
