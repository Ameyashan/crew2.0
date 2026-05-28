// @ts-nocheck — verbatim port of Crew prototype v3 today
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PAPER_FONTS } from "@/components/paper/fonts";
import { usePaperTheme } from "@/components/paper/use-paper-theme";
import {
  Eyebrow,
  InkButton,
  PageHead,
  Marginalia,
} from "@/components/paper/primitives";
import { openGmailCompose } from "@/lib/gmail";

function TodayV3({ p, go }) {
  const [cursor, setCursor]   = useState({ list: 'fu', idx: 0 });
  const [acted, setActed]     = useState({}); // id → 'sent' | 'replied' | 'skip' | 'done'
  const [expanded, setExpanded] = useState(null);
  const [followups, setFollowups] = useState([]);
  const [replies, setReplies] = useState([]);
  const [lastDigest, setLastDigest] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/today').then((r) => r.json()).then((j) => {
      setFollowups(adaptFollowups(j?.due || []));
      setReplies(adaptReplies(j?.replies || []));
      setLastDigest(j?.last_digest || null);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const FOLLOWUPS = followups;
  const REPLIES = replies;

  useEffect(() => {
    if (loaded && !expanded && FOLLOWUPS.length) setExpanded(FOLLOWUPS[0].id);
  }, [loaded, expanded, FOLLOWUPS]);

  async function markFollowup(id, kind) {
    setActed((a) => ({ ...a, [id]: kind }));
    try {
      if (kind === 'sent') await fetch(`/api/followup/${id}/sent`, { method: 'POST' });
      else if (kind === 'replied') await fetch(`/api/followup/${id}/replied`, { method: 'POST' });
    } catch { /* keep optimistic state */ }
  }

  // keyboard
  useEffect(() => {
    function onKey(e) {
      const fu = FOLLOWUPS.filter(x => !acted[x.id]);
      const re = REPLIES.filter(x => !acted[x.id]);
      if (e.key === 'j' || e.key === 'ArrowDown') {
        if (cursor.list === 'fu') {
          if (cursor.idx + 1 < fu.length) setCursor({ list: 'fu', idx: cursor.idx + 1 });
          else if (re.length) setCursor({ list: 're', idx: 0 });
        } else {
          if (cursor.idx + 1 < re.length) setCursor({ list: 're', idx: cursor.idx + 1 });
        }
        e.preventDefault();
      }
      if (e.key === 'k' || e.key === 'ArrowUp') {
        if (cursor.list === 're') {
          if (cursor.idx > 0) setCursor({ list: 're', idx: cursor.idx - 1 });
          else if (fu.length) setCursor({ list: 'fu', idx: fu.length - 1 });
        } else {
          if (cursor.idx > 0) setCursor({ list: 'fu', idx: cursor.idx - 1 });
        }
        e.preventDefault();
      }
      if (e.key === 'Enter') {
        const list = cursor.list === 'fu' ? fu : re;
        const item = list[cursor.idx];
        if (item) setExpanded(item.id);
        e.preventDefault();
      }
      if (e.key === 'r' || e.key === 'n') {
        const list = cursor.list === 'fu' ? fu : re;
        const item = list[cursor.idx];
        if (!item) return;
        setActed(a => ({ ...a, [item.id]: e.key === 'r' ? 'replied' : 'sent' }));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cursor, acted]);

  const remaining = FOLLOWUPS.filter(x => !acted[x.id]).length + REPLIES.filter(x => !acted[x.id]).length;
  const total = FOLLOWUPS.length + REPLIES.length;

  return (
    <div className="scroll" style={{
      flex: 1, overflow: 'auto', padding: '36px 56px 80px', background: p.paper, color: p.ink,
    }}>
      <PageHead p={p}
        eyebrow={`Today · ${new Date(2026, 4, 17).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`}
        title={remaining === 0 ? 'Inbox zero.' : `${remaining} ${remaining === 1 ? 'thing' : 'things'}`}
        italic={remaining === 0 ? 'You\'re done.' : 'need you.'}
        sub={`Last digest 5/17, 8:00 AM — ${FOLLOWUPS.length} followups · ${REPLIES.length} replies to review · ~ ${Math.max(2, Math.round(remaining * 0.6))} min`}
        right={
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
            fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.inkMute, letterSpacing: '.06em',
          }}>
            <kbd style={{ padding: '2px 7px', background: p.card, border: `1px solid ${p.ink}30` }}>j/k</kbd>move
            <kbd style={{ padding: '2px 7px', background: p.card, border: `1px solid ${p.ink}30` }}>r/n</kbd>reply
            <kbd style={{ padding: '2px 7px', background: p.card, border: `1px solid ${p.ink}30` }}>↵</kbd>open
          </div>
        }
      />

      {/* progress strip */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, marginBottom: 26,
        fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.inkMute, letterSpacing: '.06em',
      }}>
        <span>{total - remaining}/{total}</span>
        <div style={{ flex: 1, height: 4, background: p.ink + '14' }}>
          <div style={{ height: '100%', width: `${((total - remaining) / total) * 100}%`, background: p.stamp, transition: 'width .4s' }}/>
        </div>
        <Marginalia p={p} rotate={-1} style={{ fontSize: 16 }}>{remaining === 0 ? 'Inbox zero. nice ✓' : ''}</Marginalia>
      </div>

      {/* Followups */}
      <Eyebrow p={p} hindi="दूसरी आवाज़" en={`Followups due · ${FOLLOWUPS.filter(x => !acted[x.id]).length}`} color={p.stamp}/>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, marginBottom: 32 }}>
        {FOLLOWUPS.map((fu, i) => (
          <FollowupRow
            key={fu.id} p={p} fu={fu}
            cursor={cursor.list === 'fu' && cursor.idx === i}
            acted={acted[fu.id]}
            expanded={expanded === fu.id}
            onExpand={() => setExpanded(expanded === fu.id ? null : fu.id)}
            onAct={(v) => markFollowup(fu.id, v)}
            onGo={() => go('compose', { input: fu.name })}
          />
        ))}
      </div>

      {/* Replies needing review */}
      <Eyebrow p={p} hindi="जवाब" en={`Conversations needing review · ${REPLIES.filter(x => !acted[x.id]).length}`} color={p.leaf}/>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, marginBottom: 32 }}>
        {REPLIES.length === 0 && (
          <p style={{ margin: 0, fontFamily: PAPER_FONTS.serif, fontStyle: 'italic', fontSize: 16, color: p.inkSoft }}>
            Inbox zero. Nice.
          </p>
        )}
        {REPLIES.map((r, i) => (
          <ReplyRow
            key={r.id} p={p} r={r}
            cursor={cursor.list === 're' && cursor.idx === i}
            acted={acted[r.id]}
            expanded={expanded === r.id}
            onExpand={() => setExpanded(expanded === r.id ? null : r.id)}
            onAct={(v) => setActed(a => ({ ...a, [r.id]: v }))}
          />
        ))}
      </div>

      {/* Tomorrow */}
      <Eyebrow p={p} hindi="कल" en="Coming tomorrow · digest at 8am" color={p.tea}/>
      <div style={{
        marginTop: 12, padding: '16px 20px', background: p.card, border: `1.5px solid ${p.ink}30`,
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18,
      }}>
        {[
          { hindi: 'दूसरी', label: '3 followups armed',  sub: 'EC, JG, PI · normal cadence' },
          { hindi: 'खबर',   label: '1 reply expected',   sub: 'Vishnu intro · ETA this week' },
          { hindi: 'मौके',  label: '2 fresh signals',    sub: 'X · Devon Park, Sophia Singh' },
        ].map((t, i) => (
          <div key={i}>
            <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 19, marginTop: 2 }}>{t.label}</div>
            <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 10.5, color: p.inkMute, marginTop: 4, letterSpacing: '.04em' }}>{t.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── followup row ─── */

function FollowupRow({ p, fu, cursor, acted, expanded, onExpand, onAct, onGo }) {
  const c = fu.overdue ? p.stamp : p.marigold;
  const ghostOnActed = acted ? .55 : 1;
  return (
    <div style={{
      background: acted ? 'transparent' : p.card,
      border: `1.5px solid ${cursor && !acted ? p.ink : p.ink + '24'}`,
      boxShadow: cursor && !acted ? `4px 4px 0 ${c}` : 'none',
      transition: 'box-shadow .15s, border-color .15s, opacity .15s',
      opacity: ghostOnActed,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        padding: '14px 18px', cursor: 'pointer',
      }} onClick={onExpand}>
        <div style={{
          width: 44, height: 44, background: c, color: p.paper,
          display: 'grid', placeItems: 'center', border: `1.5px solid ${p.ink}`,
          fontFamily: PAPER_FONTS.display, fontSize: 16, flexShrink: 0,
        }}>{fu.initials}</div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 19, color: p.ink, lineHeight: 1.05 }}>
              {fu.name}
            </div>
            <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 11.5, color: p.inkMute, letterSpacing: '.02em' }}>
              {fu.role} · {fu.co}
            </div>
          </div>
          <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.inkMute, letterSpacing: '.04em', marginTop: 4 }}>
            <span style={{ color: fu.overdue ? p.stamp : p.inkSoft, fontWeight: 600 }}>{fu.due}</span>
            <span style={{ margin: '0 8px' }}>·</span>
            <span>{fu.last}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          {acted ? (
            <span style={{
              padding: '5px 10px', fontFamily: PAPER_FONTS.mono, fontSize: 11,
              letterSpacing: '.08em', color: p.leaf,
              border: `1px solid ${p.leaf}60`, background: p.leaf + '14', textTransform: 'uppercase',
            }}>{acted === 'sent' ? '✓ sent' : acted === 'replied' ? '✓ replied' : '· skipped'}</span>
          ) : (
            <>
              {fu.channel === 'email' && fu.email && (
                <button onClick={(e) => {
                  e.stopPropagation();
                  openGmailCompose({ to: fu.email, subject: fu.subject, body: fu.body });
                  onAct('sent');
                }} style={{
                  padding: '8px 14px', background: p.ink, color: p.paper,
                  border: `1.5px solid ${p.ink}`, fontFamily: PAPER_FONTS.display, fontSize: 13,
                  cursor: 'pointer',
                }}>Open in Gmail →</button>
              )}
              <button onClick={(e) => { e.stopPropagation(); onAct('done'); }} style={{
                padding: '8px 12px', background: 'transparent', color: p.ink,
                border: `1.5px solid ${p.ink}40`, fontFamily: PAPER_FONTS.mono, fontSize: 12,
                cursor: 'pointer',
              }}>Mark sent</button>
              <button onClick={(e) => { e.stopPropagation(); onAct('replied'); }} style={{
                padding: '8px 12px', background: 'transparent', color: p.ink,
                border: `1.5px solid ${p.ink}40`, fontFamily: PAPER_FONTS.mono, fontSize: 12,
                cursor: 'pointer',
              }}>Replied</button>
            </>
          )}
        </div>
      </div>
      {expanded && !acted && (
        <div style={{
          padding: '0 18px 18px 78px',
        }}>
          <div style={{
            background: p.paper, border: `1.5px dashed ${p.ink}30`, padding: '14px 16px',
            fontFamily: PAPER_FONTS.sans, fontSize: 13.5, lineHeight: 1.55, color: p.ink,
          }}>
            <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 10.5, color: p.inkMute, letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: 8 }}>
              Followup draft · {fu.angle}
            </div>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{fu.preview}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <InkButton p={p} kind="outline" size="sm">↻ Another angle</InkButton>
            <InkButton p={p} kind="outline" size="sm">✎ Edit</InkButton>
            <InkButton p={p} kind="ghost" size="sm" onClick={onGo}>↗ Open in compose</InkButton>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── reply row ─── */

function ReplyRow({ p, r, cursor, acted, expanded, onExpand, onAct }) {
  return (
    <div style={{
      background: acted ? 'transparent' : p.card,
      border: `1.5px solid ${cursor && !acted ? p.ink : p.ink + '24'}`,
      boxShadow: cursor && !acted ? `4px 4px 0 ${p.leaf}` : 'none',
      transition: 'box-shadow .15s, border-color .15s, opacity .15s',
      opacity: acted ? .55 : 1,
    }}>
      <div onClick={onExpand} style={{
        display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap',
        padding: '14px 18px', cursor: 'pointer',
      }}>
        <div style={{
          width: 44, height: 44, background: p.leaf, color: p.paper,
          display: 'grid', placeItems: 'center', border: `1.5px solid ${p.ink}`,
          fontFamily: PAPER_FONTS.display, fontSize: 16, flexShrink: 0,
        }}>{r.initials}</div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 19, color: p.ink, lineHeight: 1.05 }}>{r.name}</div>
            <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 11.5, color: p.inkMute, letterSpacing: '.02em' }}>{r.co}</div>
            <span style={{
              padding: '2px 7px', fontFamily: PAPER_FONTS.mono, fontSize: 9.5, letterSpacing: '.08em',
              color: p.leaf, border: `1px solid ${p.leaf}40`, textTransform: 'uppercase',
            }}>● {r.sentiment}</span>
            {r.intro && <span style={{ padding: '2px 7px', fontFamily: PAPER_FONTS.mono, fontSize: 9.5, color: p.stamp, border: `1px solid ${p.stamp}40` }}>INTRO OFFERED</span>}
            {r.meeting && <span style={{ padding: '2px 7px', fontFamily: PAPER_FONTS.mono, fontSize: 9.5, color: p.tea, border: `1px solid ${p.tea}40` }}>MEETING · {r.meeting}</span>}
          </div>
          <p style={{
            margin: '6px 0 0', fontFamily: PAPER_FONTS.serif, fontStyle: 'italic',
            fontSize: 15, lineHeight: 1.45, color: p.inkSoft,
          }}>{r.summary}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          {acted ? (
            <span style={{
              padding: '5px 10px', fontFamily: PAPER_FONTS.mono, fontSize: 11,
              letterSpacing: '.08em', color: p.leaf,
              border: `1px solid ${p.leaf}60`, background: p.leaf + '14', textTransform: 'uppercase',
            }}>✓ handled</span>
          ) : (
            <>
              <button onClick={(e) => { e.stopPropagation(); onAct('replied'); }} style={{
                padding: '8px 14px', background: p.leaf, color: p.paper,
                border: `1.5px solid ${p.ink}`, fontFamily: PAPER_FONTS.display, fontSize: 13,
                cursor: 'pointer',
              }}>Draft a reply</button>
              <button onClick={(e) => { e.stopPropagation(); onAct('done'); }} style={{
                padding: '8px 12px', background: 'transparent', color: p.ink,
                border: `1.5px solid ${p.ink}40`, fontFamily: PAPER_FONTS.mono, fontSize: 12,
                cursor: 'pointer',
              }}>Mark read</button>
            </>
          )}
        </div>
      </div>
      {expanded && !acted && (
        <div style={{ padding: '0 18px 18px 78px' }}>
          <div style={{
            background: p.paper, border: `1.5px dashed ${p.ink}30`, padding: '14px 16px',
            fontFamily: PAPER_FONTS.sans, fontSize: 13.5, lineHeight: 1.55, color: p.ink,
          }}>
            <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 10.5, color: p.inkMute, letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: 8 }}>
              Suggested next move
            </div>
            <p style={{ margin: 0 }}>{r.suggested}</p>
          </div>
        </div>
      )}
    </div>
  );
}


function adaptFollowups(rows) {
  return rows.map((r) => {
    const due = r.due_at ? new Date(r.due_at) : null;
    const overdue = due ? due.getTime() < Date.now() - 60 * 60 * 1000 : false;
    const name = r.person?.name || '(unknown)';
    const initials = name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '·';
    const last = r.parent
      ? `${formatShortDate(r.parent.sent_at)} · "${(r.parent.subject || r.parent.body || '').slice(0, 64)}"`
      : 'no prior message on file';
    return {
      id: r.id,
      initials,
      name,
      role: '',
      co: '',
      due: overdue ? `overdue ${formatRelative(due)}` : `due ${formatRelative(due)}`,
      overdue,
      last,
      preview: r.draft?.body || '(draft not generated yet)',
      angle: r.draft?.subject || 'followup',
      email: r.person?.email || '',
      subject: r.draft?.subject || '',
      body: r.draft?.body || '',
      channel: r.draft?.channel || 'email',
    };
  });
}

function adaptReplies(rows) {
  return rows.map((r) => {
    const name = r.person?.name || r.from_email?.split('@')[0] || '(unknown)';
    const initials = name.split(/[\s.@_-]+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '·';
    return {
      id: r.id,
      initials,
      name,
      co: r.person?.email?.split('@')[1] || '',
      sentiment: r.sentiment || 'new',
      intro: r.intro_offered,
      meeting: r.meeting || null,
      summary: r.summary || (r.body ? r.body.slice(0, 200) + (r.body.length > 200 ? '…' : '') : ''),
      suggested: r.suggested_reply || 'Jugaadu will summarise this shortly. In the meantime, open Compose to draft a reply manually.',
    };
  });
}

function formatShortDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatRelative(d) {
  if (!d) return 'soon';
  const diff = d.getTime() - Date.now();
  const abs = Math.abs(diff);
  const days = Math.round(abs / 86400000);
  if (days >= 1) return `${days}d`;
  const hours = Math.round(abs / 3600000);
  if (hours >= 1) return `${hours}h`;
  return 'soon';
}

export default function TodayPage() {
  const router = useRouter();
  const { p } = usePaperTheme();
  return <TodayV3 p={p} go={(r, seed) => {
    if (seed?.input) {
      router.push(`/app/compose?seed=${encodeURIComponent(seed.input)}`);
    } else {
      router.push(`/app/${r}`);
    }
  }} />;
}
