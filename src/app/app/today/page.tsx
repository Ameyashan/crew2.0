// @ts-nocheck — verbatim port of Crew prototype v3 today
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PAPER_FONTS_V2 } from "@/components/paper/fonts";
import { TOKENS, RADII, SHADOWS } from "@/components/paper/tokens";
import { useIsMobile } from "@/lib/use-is-mobile";
import { openGmailCompose } from "@/lib/gmail";

function TodayV3({ go }) {
  const isMobile = useIsMobile();
  const [cursor, setCursor]   = useState({ list: 'fu', idx: 0 });
  const [acted, setActed]     = useState({}); // id → 'sent' | 'replied' | 'skip' | 'done'
  const [expanded, setExpanded] = useState(null);
  const [followups, setFollowups] = useState([]);
  const [replies, setReplies] = useState([]);
  const [lastDigest, setLastDigest] = useState(null);
  const [tomorrow, setTomorrow] = useState({ armed: [], replyExpected: [] });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/today').then((r) => r.json()).then((j) => {
      setFollowups(adaptFollowups(j?.due || []));
      setReplies(adaptReplies(j?.replies || []));
      setLastDigest(j?.last_digest || null);
      setTomorrow({
        armed: j?.tomorrow?.armed || [],
        replyExpected: j?.tomorrow?.reply_expected || [],
      });
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

  const headTitle = remaining === 0 ? 'Inbox zero.' : `${remaining} ${remaining === 1 ? 'thing' : 'things'}`;
  const headItalic = remaining === 0 ? 'You\'re done.' : 'need you.';
  const headEyebrow = `Today · ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`;
  const headSub = `${lastDigest?.generated_at ? `Last digest ${new Date(lastDigest.generated_at).toLocaleString('en-US', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })} — ` : ''}${FOLLOWUPS.length} followups · ${REPLIES.length} replies to review · ~ ${Math.max(2, Math.round(remaining * 0.6))} min`;

  return (
    <div className="scroll" style={{
      flex: 1, overflow: 'auto', padding: isMobile ? '24px 16px 64px' : '36px 56px 80px', background: TOKENS.paper, color: TOKENS.ink,
    }}>
      {/* page head */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 24, flexWrap: 'wrap', marginBottom: 24,
      }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontFamily: PAPER_FONTS_V2.mono, fontSize: 11, color: TOKENS.muted,
            letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 8,
          }}>{headEyebrow}</div>
          <h1 style={{
            margin: 0, fontFamily: PAPER_FONTS_V2.serif, fontWeight: 400,
            fontSize: 30, lineHeight: 1.25, letterSpacing: '-.01em',
            color: TOKENS.ink, textWrap: 'balance',
          }}>
            {headTitle}{' '}
            <span style={{ fontStyle: 'italic', color: TOKENS.muted2 }}>{headItalic}</span>
          </h1>
          <p style={{
            margin: '12px 0 0', fontFamily: PAPER_FONTS_V2.sans,
            fontSize: 14, lineHeight: 1.7, color: TOKENS.muted, maxWidth: 720,
          }}>{headSub}</p>
        </div>
        {isMobile ? null : (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0,
            fontFamily: PAPER_FONTS_V2.mono, fontSize: 11, color: TOKENS.muted, letterSpacing: '.06em',
          }}>
            <kbd style={{ padding: '2px 7px', background: TOKENS.card, border: `1px solid ${TOKENS.line}`, borderRadius: 6 }}>j/k</kbd>move
            <kbd style={{ padding: '2px 7px', background: TOKENS.card, border: `1px solid ${TOKENS.line}`, borderRadius: 6 }}>r/n</kbd>reply
            <kbd style={{ padding: '2px 7px', background: TOKENS.card, border: `1px solid ${TOKENS.line}`, borderRadius: 6 }}>↵</kbd>open
          </div>
        )}
      </div>

      {/* progress strip */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, marginBottom: 26,
        fontFamily: PAPER_FONTS_V2.mono, fontSize: 11, color: TOKENS.muted, letterSpacing: '.06em',
      }}>
        <span>{total - remaining}/{total}</span>
        <div style={{ flex: 1, height: 4, background: TOKENS.line, borderRadius: RADII.pill }}>
          <div style={{ height: '100%', width: `${((total - remaining) / total) * 100}%`, background: TOKENS.green, borderRadius: RADII.pill, transition: 'width .4s' }}/>
        </div>
      </div>

      {/* Followups */}
      <SectionLabel en={`Followups due · ${FOLLOWUPS.filter(x => !acted[x.id]).length}`} color={TOKENS.amber}/>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, marginBottom: 32 }}>
        {FOLLOWUPS.map((fu, i) => (
          <FollowupRow
            key={fu.id} fu={fu}
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
      <SectionLabel en={`Conversations needing review · ${REPLIES.filter(x => !acted[x.id]).length}`} color={TOKENS.green}/>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, marginBottom: 32 }}>
        {REPLIES.map((r, i) => (
          <ReplyRow
            key={r.id} r={r}
            cursor={cursor.list === 're' && cursor.idx === i}
            acted={acted[r.id]}
            expanded={expanded === r.id}
            onExpand={() => setExpanded(expanded === r.id ? null : r.id)}
            onAct={(v) => setActed(a => ({ ...a, [r.id]: v }))}
          />
        ))}
      </div>

      {/* Tomorrow */}
      <SectionLabel en="Coming tomorrow · digest at 8am" color={TOKENS.muted2}/>
      <div style={{
        marginTop: 12, padding: '16px 20px', background: TOKENS.card,
        border: `1px solid ${TOKENS.lineSoft}`, borderRadius: RADII.card, boxShadow: SHADOWS.card,
        display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: 18,
      }}>
        {(() => {
          const tiles = buildTomorrowTiles(tomorrow);
          if (tiles.length === 0) {
            return (
              <div style={{
                gridColumn: '1 / -1',
                fontFamily: PAPER_FONTS_V2.serif, fontStyle: 'italic', fontSize: 15, color: TOKENS.inkSoft,
              }}>Nothing queued for tomorrow yet.</div>
            );
          }
          return tiles.map((t, i) => (
            <div key={i}>
              <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 19, marginTop: 2 }}>{t.label}</div>
              <div style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 10.5, color: TOKENS.muted, marginTop: 4, letterSpacing: '.04em' }}>{t.sub}</div>
            </div>
          ));
        })()}
      </div>
    </div>
  );
}

/* ─── section label ─── */

function SectionLabel({ en, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{
        fontFamily: PAPER_FONTS_V2.mono, fontSize: 10.5,
        color: color || TOKENS.muted, letterSpacing: '.1em', textTransform: 'uppercase',
      }}>{en}</span>
    </div>
  );
}

/* ─── followup row ─── */

function FollowupRow({ fu, cursor, acted, expanded, onExpand, onAct, onGo }) {
  const c = fu.overdue ? TOKENS.red : TOKENS.gold;
  const ghostOnActed = acted ? .55 : 1;
  return (
    <div style={{
      background: acted ? 'transparent' : TOKENS.card,
      border: `1px solid ${cursor && !acted ? TOKENS.ink : TOKENS.lineSoft}`,
      borderRadius: RADII.card,
      boxShadow: acted ? 'none' : (cursor ? SHADOWS.elevated : SHADOWS.card),
      overflow: 'hidden',
      transition: 'box-shadow .15s, border-color .15s, opacity .15s',
      opacity: ghostOnActed,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        padding: '14px 18px', cursor: 'pointer',
      }} onClick={onExpand}>
        <div style={{
          width: 44, height: 44, background: c, color: TOKENS.paper,
          display: 'grid', placeItems: 'center', border: `1px solid ${TOKENS.line}`, borderRadius: RADII.pill,
          fontFamily: PAPER_FONTS_V2.serif, fontSize: 16, flexShrink: 0,
        }}>{fu.initials}</div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 19, color: TOKENS.ink, lineHeight: 1.05 }}>
              {fu.name}
            </div>
            <div style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 11.5, color: TOKENS.muted, letterSpacing: '.02em' }}>
              {fu.role} · {fu.co}
            </div>
          </div>
          <div style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 11, color: TOKENS.muted, letterSpacing: '.04em', marginTop: 4 }}>
            <span style={{ color: fu.overdue ? TOKENS.red : TOKENS.inkSoft, fontWeight: 600 }}>{fu.due}</span>
            <span style={{ margin: '0 8px' }}>·</span>
            <span>{fu.last}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          {acted ? (
            <span style={{
              padding: '5px 10px', fontFamily: PAPER_FONTS_V2.mono, fontSize: 11,
              letterSpacing: '.08em', color: TOKENS.green, borderRadius: RADII.pill,
              border: `1px solid ${TOKENS.line}`, background: TOKENS.greenBg, textTransform: 'uppercase',
            }}>{acted === 'sent' ? '✓ sent' : acted === 'replied' ? '✓ replied' : '· skipped'}</span>
          ) : (
            <>
              {fu.channel === 'email' && fu.email && (
                <button onClick={(e) => {
                  e.stopPropagation();
                  openGmailCompose({ to: fu.email, subject: fu.subject, body: fu.body });
                  onAct('sent');
                }} style={{
                  padding: '8px 14px', background: TOKENS.ink, color: TOKENS.paper,
                  border: `1px solid ${TOKENS.ink}`, borderRadius: RADII.buttonTight,
                  fontFamily: PAPER_FONTS_V2.sans, fontSize: 13, fontWeight: 500,
                  cursor: 'pointer',
                }}>Open in Gmail →</button>
              )}
              <button onClick={(e) => { e.stopPropagation(); onAct('done'); }} style={{
                padding: '8px 12px', background: 'transparent', color: TOKENS.ink,
                border: `1px solid ${TOKENS.faint}`, borderRadius: RADII.buttonTight,
                fontFamily: PAPER_FONTS_V2.sans, fontSize: 12,
                cursor: 'pointer',
              }}>Mark sent</button>
              <button onClick={(e) => { e.stopPropagation(); onAct('replied'); }} style={{
                padding: '8px 12px', background: 'transparent', color: TOKENS.ink,
                border: `1px solid ${TOKENS.faint}`, borderRadius: RADII.buttonTight,
                fontFamily: PAPER_FONTS_V2.sans, fontSize: 12,
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
            background: TOKENS.cardWarm, border: `1px dashed ${TOKENS.dashed}`, borderRadius: RADII.panelTight, padding: '14px 16px',
            fontFamily: PAPER_FONTS_V2.sans, fontSize: 13.5, lineHeight: 1.55, color: TOKENS.ink,
          }}>
            <div style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 10.5, color: TOKENS.muted, letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: 8 }}>
              Followup draft · {fu.angle}
            </div>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{fu.preview}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" style={{
              padding: '7px 12px', background: 'transparent', color: TOKENS.ink,
              border: `1px solid ${TOKENS.faint}`, borderRadius: RADII.buttonTight,
              fontFamily: PAPER_FONTS_V2.sans, fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}>↻ Another angle</button>
            <button type="button" style={{
              padding: '7px 12px', background: 'transparent', color: TOKENS.ink,
              border: `1px solid ${TOKENS.faint}`, borderRadius: RADII.buttonTight,
              fontFamily: PAPER_FONTS_V2.sans, fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}>✎ Edit</button>
            <button type="button" onClick={onGo} style={{
              padding: '7px 12px', background: 'transparent', color: TOKENS.ink,
              border: '1px solid transparent', borderRadius: RADII.buttonTight,
              fontFamily: PAPER_FONTS_V2.sans, fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}>↗ Open in compose</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── reply row ─── */

function ReplyRow({ r, cursor, acted, expanded, onExpand, onAct }) {
  return (
    <div style={{
      background: acted ? 'transparent' : TOKENS.card,
      border: `1px solid ${cursor && !acted ? TOKENS.ink : TOKENS.lineSoft}`,
      borderRadius: RADII.card,
      boxShadow: acted ? 'none' : (cursor ? SHADOWS.elevated : SHADOWS.card),
      overflow: 'hidden',
      transition: 'box-shadow .15s, border-color .15s, opacity .15s',
      opacity: acted ? .55 : 1,
    }}>
      <div onClick={onExpand} style={{
        display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap',
        padding: '14px 18px', cursor: 'pointer',
      }}>
        <div style={{
          width: 44, height: 44, background: TOKENS.green, color: TOKENS.paper,
          display: 'grid', placeItems: 'center', border: `1px solid ${TOKENS.line}`, borderRadius: RADII.pill,
          fontFamily: PAPER_FONTS_V2.serif, fontSize: 16, flexShrink: 0,
        }}>{r.initials}</div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 19, color: TOKENS.ink, lineHeight: 1.05 }}>{r.name}</div>
            <div style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 11.5, color: TOKENS.muted, letterSpacing: '.02em' }}>{r.co}</div>
            <span style={{
              padding: '2px 8px', fontFamily: PAPER_FONTS_V2.mono, fontSize: 9.5, letterSpacing: '.08em',
              color: TOKENS.green, background: TOKENS.greenBg, borderRadius: RADII.pill, border: `1px solid ${TOKENS.line}`, textTransform: 'uppercase',
            }}>● {r.sentiment}</span>
            {r.intro && <span style={{ padding: '2px 8px', fontFamily: PAPER_FONTS_V2.mono, fontSize: 9.5, color: TOKENS.amber, background: TOKENS.chip, borderRadius: RADII.pill, border: `1px solid ${TOKENS.line}` }}>INTRO OFFERED</span>}
            {r.meeting && <span style={{ padding: '2px 8px', fontFamily: PAPER_FONTS_V2.mono, fontSize: 9.5, color: TOKENS.muted2, background: TOKENS.chip, borderRadius: RADII.pill, border: `1px solid ${TOKENS.line}` }}>MEETING · {r.meeting}</span>}
          </div>
          <p style={{
            margin: '6px 0 0', fontFamily: PAPER_FONTS_V2.serif, fontStyle: 'italic',
            fontSize: 15, lineHeight: 1.45, color: TOKENS.inkSoft,
          }}>{r.summary}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          {acted ? (
            <span style={{
              padding: '5px 10px', fontFamily: PAPER_FONTS_V2.mono, fontSize: 11,
              letterSpacing: '.08em', color: TOKENS.green, borderRadius: RADII.pill,
              border: `1px solid ${TOKENS.line}`, background: TOKENS.greenBg, textTransform: 'uppercase',
            }}>✓ handled</span>
          ) : (
            <>
              <button onClick={(e) => { e.stopPropagation(); onAct('replied'); }} style={{
                padding: '8px 14px', background: TOKENS.green, color: TOKENS.paper,
                border: `1px solid ${TOKENS.green}`, borderRadius: RADII.buttonTight,
                fontFamily: PAPER_FONTS_V2.sans, fontSize: 13, fontWeight: 500,
                cursor: 'pointer',
              }}>Draft a reply</button>
              <button onClick={(e) => { e.stopPropagation(); onAct('done'); }} style={{
                padding: '8px 12px', background: 'transparent', color: TOKENS.ink,
                border: `1px solid ${TOKENS.faint}`, borderRadius: RADII.buttonTight,
                fontFamily: PAPER_FONTS_V2.sans, fontSize: 12,
                cursor: 'pointer',
              }}>Mark read</button>
            </>
          )}
        </div>
      </div>
      {expanded && !acted && (
        <div style={{ padding: '0 18px 18px 78px' }}>
          <div style={{
            background: TOKENS.cardWarm, border: `1px dashed ${TOKENS.dashed}`, borderRadius: RADII.panelTight, padding: '14px 16px',
            fontFamily: PAPER_FONTS_V2.sans, fontSize: 13.5, lineHeight: 1.55, color: TOKENS.ink,
          }}>
            <div style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 10.5, color: TOKENS.muted, letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: 8 }}>
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

function initialsOf(name) {
  return (name || '').split(/[\s.@_-]+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '·';
}

function buildTomorrowTiles({ armed, replyExpected }) {
  const tiles = [];
  if (armed?.length) {
    const initials = armed.slice(0, 3).map((a) => initialsOf(a.person?.name)).join(', ');
    const more = armed.length > 3 ? ` +${armed.length - 3}` : '';
    tiles.push({
      label: `${armed.length} followup${armed.length === 1 ? '' : 's'} armed`,
      sub: `${initials}${more} · fires before 8am`,
    });
  }
  if (replyExpected?.length) {
    const oldest = replyExpected.reduce((a, b) => (a.sent_at < b.sent_at ? a : b));
    const days = Math.max(1, Math.round((Date.now() - new Date(oldest.sent_at).getTime()) / 86400000));
    const headline = oldest.person?.name || oldest.subject || 'open thread';
    tiles.push({
      label: `${replyExpected.length} repl${replyExpected.length === 1 ? 'y' : 'ies'} expected`,
      sub: `${headline} · waiting ${days}d`,
    });
  }
  return tiles;
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
  return <TodayV3 go={(r, seed) => {
    if (seed?.input) {
      router.push(`/app/compose?seed=${encodeURIComponent(seed.input)}`);
    } else {
      router.push(`/app/${r}`);
    }
  }} />;
}
