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

function PeopleV3({ p, go, PEOPLE_V3 = [] }) {
  const [q, setQ] = useState('');
  const [selectedId, setSelected] = useState(null);
  const [filter, setFilter] = useState('all');
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
          sub="Reach out to someone via Compose and they'll show up here with a full timeline of every Crew interaction." />
      </div>
    );
  }

  return (
    <div style={{
      flex: 1, display: 'grid', gridTemplateColumns: '380px 1fr', overflow: 'hidden',
      background: p.paper, color: p.ink,
    }}>
      {/* List */}
      <div className="scroll" style={{ overflow: 'auto', borderRight: `1.5px solid ${p.ink}`, padding: '32px 22px 40px' }}>
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
              <button key={per.id} onClick={() => setSelected(per.id)} style={{
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

      {/* Detail */}
      <div className="scroll" style={{ overflow: 'auto', padding: '40px 56px 80px' }}>
        <PersonDetailV3 p={p} person={person} go={go}/>
      </div>
    </div>
  );
}

function warmthColor(p, w) {
  return ({ warm: p.leaf, cool: p.tea, cold: p.inkMute, new: p.stamp }[w]) || p.inkMute;
}

function PersonDetailV3({ p, person, go }) {
  const [detail, setDetail] = useState(null);
  useEffect(() => {
    if (!person?.id) return;
    let cancelled = false;
    fetch(`/api/people/${person.id}`).then((r) => r.json()).then((j) => {
      if (!cancelled) setDetail(j);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [person?.id]);

  const events = (detail?.events || []).map(adaptEvent);
  if (events.length === 0) {
    events.push({ when: 'queued', kind: 'queued', text: 'No interactions yet · drafted but not sent' });
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
          <InkButton p={p} kind="outline" size="sm">⋯</InkButton>
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

      {/* timeline */}
      <Eyebrow p={p} hindi="समय रेखा" en="Timeline" color={p.stamp}/>
      <div style={{ position: 'relative', paddingLeft: 26, marginTop: 14 }}>
        <div style={{ position: 'absolute', top: 8, bottom: 8, left: 7, width: 2, background: p.ink + '20' }}/>
        {events.map((e, i) => (
          <div key={i} style={{
            position: 'relative', marginBottom: 22,
            animation: `fadeUp .35s ease both`, animationDelay: `${i * 50}ms`,
          }}>
            <div style={{
              position: 'absolute', left: -25, top: 4, width: 16, height: 16, background: p.paper,
              border: `2px solid ${kindColor(p, e.kind)}`,
            }}/>
            <div style={{ display: 'flex', gap: 14, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{
                fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.inkMute,
                letterSpacing: '.04em', minWidth: 130, textTransform: 'uppercase',
              }}>{e.when}</span>
              <span style={{
                padding: '2px 9px', fontFamily: PAPER_FONTS.mono, fontSize: 10,
                letterSpacing: '.08em', color: kindColor(p, e.kind),
                border: `1px solid ${kindColor(p, e.kind)}40`, textTransform: 'uppercase',
              }}>{e.kind}</span>
            </div>
            <div style={{
              marginTop: 6, fontSize: 15.5, lineHeight: 1.5,
              color: p.ink,
              fontFamily: e.kind === 'reply' ? PAPER_FONTS.serif : PAPER_FONTS.sans,
              fontStyle: e.kind === 'reply' ? 'italic' : 'normal',
            }}>{e.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function kindColor(p, kind) {
  return ({
    reply: p.leaf, sent: p.stamp, compose: p.stamp,
    research: p.inkSoft, awaiting: p.stamp, queued: p.inkMute,
  }[kind]) || p.inkSoft;
}

function adaptEvent(ix) {
  const when = ix.created_at ? relTime(new Date(ix.created_at)) : '—';
  const kind = mapKind(ix.interaction_type);
  let text;
  switch (ix.interaction_type) {
    case 'drafted':
      text = `Drafted ${ix.channel || ''} · ${quote(ix.draft?.subject) || quote(ix.draft?.body, 80) || 'draft saved'}`;
      break;
    case 'sent':
      text = `Sent ${ix.channel || ''} · ${quote(ix.draft?.subject) || quote(ix.draft?.body, 80) || 'message sent'}`;
      break;
    case 'replied':
      text = `Reply received${ix.draft?.body ? ` — ${quote(ix.draft.body, 140)}` : ''}`;
      break;
    case 'no_reply':
      text = 'No reply on this thread yet · followup armed';
      break;
    case 'followed_up':
      text = 'Followup sent';
      break;
    case 'clicked':
      text = 'Recipient opened the email';
      break;
    default:
      text = ix.interaction_type;
  }
  return { when, kind, text };
}

function mapKind(type) {
  switch (type) {
    case 'drafted': return 'compose';
    case 'sent': return 'sent';
    case 'replied': return 'reply';
    case 'no_reply': return 'awaiting';
    case 'followed_up': return 'sent';
    case 'clicked': return 'research';
    default: return 'research';
  }
}

function quote(s, max = 64) {
  if (!s) return null;
  const t = String(s).replace(/\s+/g, ' ').trim();
  return `"${t.length > max ? t.slice(0, max) + '…' : t}"`;
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
