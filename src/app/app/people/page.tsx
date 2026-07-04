// @ts-nocheck — verbatim port of Crew prototype v3 people
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PAPER_FONTS_V2 } from "@/components/paper/fonts";
import { TOKENS, RADII, SHADOWS } from "@/components/paper/tokens";
import { InkButton2 } from "@/components/paper/primitives2";
import { useIsMobile } from "@/lib/use-is-mobile";
import { hydrateRun } from "@/lib/runs-store";

function PeopleV3({ go, PEOPLE_V3 = [], onDeleted }) {
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
      <div style={{ flex: 1, padding: 48, background: TOKENS.paper, color: TOKENS.ink }}>
        <div style={{
          padding: '48px 32px', textAlign: 'center',
          border: `1px dashed ${TOKENS.dashed}`, borderRadius: RADII.card, background: TOKENS.card,
        }}>
          <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 26, color: TOKENS.ink, lineHeight: 1.1 }}>
            No people yet.
          </div>
          <p style={{
            margin: '8px auto 0', maxWidth: 480, fontFamily: PAPER_FONTS_V2.serif,
            fontStyle: 'italic', fontSize: 16, color: TOKENS.inkSoft, lineHeight: 1.4,
          }}>
            Reach out to someone via Compose and they'll show up here with a full timeline of every Jugaadu interaction.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      flex: 1, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '380px 1fr', overflow: 'hidden',
      background: TOKENS.paper, color: TOKENS.ink,
    }}>
      {/* List */}
      {(!isMobile || mobileView === 'list') && (
      <div className="scroll" style={{ overflow: 'auto', borderRight: isMobile ? 'none' : `1px solid ${TOKENS.line}`, padding: isMobile ? '24px 16px 40px' : '32px 22px 40px' }}>
        <div style={{
          fontFamily: PAPER_FONTS_V2.mono, fontSize: 10.5, fontWeight: 500, color: TOKENS.muted,
          letterSpacing: '.1em', textTransform: 'uppercase',
        }}>{`People · ${PEOPLE_V3.length} contacts`}</div>
        <h1 style={{
          margin: '4px 0 18px', fontFamily: PAPER_FONTS_V2.serif, fontSize: 36,
          fontWeight: 400, lineHeight: 1, color: TOKENS.ink, letterSpacing: '-.02em',
        }}>The crew you've built.</h1>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="search by name, company, role, notes…"
          style={{
            width: '100%', padding: '11px 14px', background: TOKENS.card,
            border: `1px solid ${TOKENS.line}`, borderRadius: RADII.panelTight, fontFamily: PAPER_FONTS_V2.sans,
            fontSize: 14, color: TOKENS.ink, outline: 'none',
          }}
        />

        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6, margin: '12px 0 14px',
        }}>
          {[
            ['all', PEOPLE_V3.length],
            ['warm', PEOPLE_V3.filter(per => per.warmth === 'warm').length],
            ['awaiting', PEOPLE_V3.filter(per => per.status === 'awaiting').length],
            ['queued', PEOPLE_V3.filter(per => per.status === 'queued').length],
          ].map(([l, n]) => {
            const active = filter === l;
            return (
              <button key={l} onClick={() => setFilter(l)} style={{
                padding: '4px 12px', fontFamily: PAPER_FONTS_V2.mono, fontSize: 11,
                letterSpacing: '.04em', borderRadius: RADII.pill,
                background: active ? TOKENS.ink : 'transparent', color: active ? TOKENS.paper : TOKENS.muted2,
                border: `1px solid ${active ? TOKENS.ink : TOKENS.line}`, cursor: 'pointer',
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
                background: active ? TOKENS.card : 'transparent',
                border: `1px solid ${active ? TOKENS.line : 'transparent'}`,
                borderRadius: RADII.panelTight,
                boxShadow: active ? SHADOWS.card : 'none',
                textAlign: 'left', cursor: 'pointer', color: TOKENS.ink,
                transition: 'background .15s',
              }}>
                <div style={{
                  width: 40, height: 40, background: TOKENS.gold, color: TOKENS.paper,
                  display: 'grid', placeItems: 'center', borderRadius: RADII.pill,
                  fontFamily: PAPER_FONTS_V2.serif, fontSize: 14,
                }}>{per.initials}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 16, color: TOKENS.ink, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {per.name}
                  </div>
                  <div style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 11, color: TOKENS.muted, marginTop: 2, letterSpacing: '.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {per.role} · {per.co}
                  </div>
                </div>
                <span style={{
                  fontFamily: PAPER_FONTS_V2.mono, fontSize: 10, color: warmthColor(per.warmth),
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
            background: 'transparent', border: `1px solid ${TOKENS.line}`, color: TOKENS.ink,
            padding: '8px 14px', borderRadius: RADII.buttonTight, fontFamily: PAPER_FONTS_V2.mono, fontSize: 12,
            letterSpacing: '.04em', cursor: 'pointer',
          }}>← All people</button>
        )}
        <PersonDetailV3 key={person.id} person={person} go={go} onDeleted={(id) => {
          // Return to the list; the parent drops the row and the desktop
          // fallback (person = filtered[0]) selects the next contact.
          setSelected(null);
          setMobileView('list');
          onDeleted?.(id);
        }}/>
      </div>
      )}
    </div>
  );
}

function warmthColor(w) {
  return ({ warm: TOKENS.green, cool: TOKENS.muted2, cold: TOKENS.muted, new: TOKENS.red }[w]) || TOKENS.muted;
}

function PersonDetailV3({ person, go, onDeleted }) {
  const router = useRouter();
  const [detail, setDetail] = useState(null);
  const [opening, setOpening] = useState(null);
  // The dossier is keyed by person.id at the call site, so selecting someone
  // else remounts it — delete-confirm state and the stale previous dossier
  // reset for free.
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  useEffect(() => {
    if (!person?.id) return;
    let cancelled = false;
    fetch(`/api/people/${person.id}`).then((r) => r.json()).then((j) => {
      if (!cancelled) setDetail(j);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [person?.id]);

  async function doDelete() {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/people/${person.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || `delete failed: ${res.status}`);
      }
      onDeleted?.(person.id);
    } catch (e) {
      setDeleteError(String(e?.message || e));
      setDeleting(false);
    }
  }

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
          width: 90, height: 90, background: TOKENS.gold, color: TOKENS.paper,
          display: 'grid', placeItems: 'center', borderRadius: RADII.pill,
          boxShadow: SHADOWS.card,
          fontFamily: PAPER_FONTS_V2.serif, fontSize: 30, flexShrink: 0,
        }}>{person.initials}</div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{
            fontFamily: PAPER_FONTS_V2.mono, fontSize: 10.5, fontWeight: 500, color: warmthColor(person.warmth),
            letterSpacing: '.1em', textTransform: 'uppercase',
          }}>{`Last touch · ${person.last}`}</div>
          <h1 style={{
            margin: '4px 0 6px', fontFamily: PAPER_FONTS_V2.serif,
            fontSize: 42, lineHeight: 1, color: TOKENS.ink, fontWeight: 400, letterSpacing: '-.02em',
          }}>{person.name}</h1>
          <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontStyle: 'italic', fontSize: 17, color: TOKENS.inkSoft }}>
            {person.role} at {person.co}
          </div>
          <div style={{
            display: 'flex', gap: 18, marginTop: 12, flexWrap: 'wrap',
            fontFamily: PAPER_FONTS_V2.mono, fontSize: 11, color: TOKENS.muted, letterSpacing: '.04em',
          }}>
            <span>✉ {person.email}</span>
            <span>● warmth: <span style={{ color: warmthColor(person.warmth) }}>{person.warmth}</span></span>
            <span>status: {person.status}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          <InkButton2 onClick={() => go('compose', {
            // Seed with the email when we have one (compose flips its
            // "I already have their email" shortcut); otherwise a name+company
            // query so the button still works for email-less contacts.
            input: person.email || [person.name, person.co].filter(Boolean).join(' at '),
          })}>Reach out again →</InkButton2>
          {!confirmDelete && (
            <InkButton2 kind="outline" onClick={() => setConfirmDelete(true)}>Delete</InkButton2>
          )}
        </div>
      </div>

      {/* delete confirmation strip */}
      {confirmDelete && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24,
          padding: '12px 16px', background: TOKENS.card,
          border: `1px solid ${TOKENS.red}`, borderRadius: RADII.panel, boxShadow: SHADOWS.card,
          flexWrap: 'wrap',
        }}>
          <span style={{
            fontFamily: PAPER_FONTS_V2.serif, fontStyle: 'italic', fontSize: 15, color: TOKENS.ink,
          }}>
            Really delete {person.name}? This removes their drafts, timeline, and follow-ups. Past compose runs stay in History.
          </span>
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <InkButton2 size="sm" onClick={doDelete} disabled={deleting} style={{ background: TOKENS.red, color: TOKENS.paper }}>
              {deleting ? 'deleting…' : 'Yes, delete'}
            </InkButton2>
            <InkButton2 kind="outline" size="sm" onClick={() => { setConfirmDelete(false); setDeleteError(null); }} disabled={deleting}>
              Keep
            </InkButton2>
          </div>
          {deleteError && (
            <span style={{ flexBasis: '100%', fontFamily: PAPER_FONTS_V2.mono, fontSize: 11, color: TOKENS.red }}>
              {deleteError}
            </span>
          )}
        </div>
      )}

      {/* facts strip */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 28 }}>
        {(extractFacts(detail) || []).map(f => (
          <span key={f} style={{
            padding: '4px 12px', background: TOKENS.card,
            border: `1px solid ${TOKENS.line}`, color: TOKENS.ink, borderRadius: RADII.pill,
            fontFamily: PAPER_FONTS_V2.sans, fontSize: 12,
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
        const color = overdue ? TOKENS.red : days <= 2 ? TOKENS.amber : TOKENS.green;
        const dateLabel = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28,
            padding: '12px 16px', background: TOKENS.card,
            border: `1px solid ${color}`, borderRadius: RADII.panel, boxShadow: SHADOWS.card,
          }}>
            <span style={{
              fontFamily: PAPER_FONTS_V2.mono, fontSize: 10.5, fontWeight: 500, letterSpacing: '.14em',
              textTransform: 'uppercase', color,
            }}>● Next followup</span>
            <span style={{
              fontFamily: PAPER_FONTS_V2.serif, fontSize: 18, color: TOKENS.ink, lineHeight: 1,
            }}>{when}</span>
            <span style={{
              fontFamily: PAPER_FONTS_V2.mono, fontSize: 11, color: TOKENS.muted, letterSpacing: '.04em',
            }}>{dateLabel}{nextFollowup.draft?.subject ? ` · ${nextFollowup.draft.subject}` : ''}</span>
          </div>
        );
      })()}

      {/* workflows */}
      <div style={{
        fontFamily: PAPER_FONTS_V2.mono, fontSize: 10.5, fontWeight: 500, color: TOKENS.muted,
        letterSpacing: '.1em', textTransform: 'uppercase',
      }}>{`Workflows · ${workflows.length}`}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
        {workflows.length === 0 && (
          <div style={{
            padding: '14px 18px', background: TOKENS.card, border: `1px dashed ${TOKENS.dashed}`,
            borderRadius: RADII.panel,
            fontFamily: PAPER_FONTS_V2.mono, fontSize: 12, color: TOKENS.muted, letterSpacing: '.04em',
          }}>No workflows yet for this person.</div>
        )}
        {workflows.map((w) => {
          const chip = workflowOutcome(w.outcome);
          const title = workflowTitle(w);
          return (
            <div key={w.id} style={{
              background: TOKENS.card, border: `1px solid ${TOKENS.lineSoft}`,
              borderRadius: RADII.panel, boxShadow: SHADOWS.card,
              padding: '14px 18px', display: 'grid',
              gridTemplateColumns: '1fr auto auto auto', alignItems: 'center', gap: 14,
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontFamily: PAPER_FONTS_V2.mono, fontSize: 10.5, fontWeight: 500, letterSpacing: '.14em',
                  textTransform: 'uppercase', color: TOKENS.muted,
                }}>compose · {w.kind}</div>
                <div style={{
                  fontFamily: PAPER_FONTS_V2.serif, fontSize: 17, color: TOKENS.ink, lineHeight: 1.15,
                  marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{title}</div>
              </div>
              <span style={{
                padding: '3px 10px', background: chip.bg, color: chip.color, borderRadius: RADII.pill,
                fontFamily: PAPER_FONTS_V2.mono, fontSize: 11, letterSpacing: '.04em', whiteSpace: 'nowrap',
              }}>{chip.label}</span>
              <span style={{
                fontFamily: PAPER_FONTS_V2.mono, fontSize: 11, color: TOKENS.muted,
                letterSpacing: '.04em', whiteSpace: 'nowrap',
              }}>{relTime(new Date(w.created_at))}</span>
              <InkButton2 kind="outline" size="sm"
                onClick={() => openWorkflow(w.id)} disabled={opening === w.id}>
                {opening === w.id ? 'opening…' : 'Open →'}
              </InkButton2>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function workflowOutcome(outcome) {
  if (outcome === 'complete') return { label: 'ready', color: TOKENS.green, bg: TOKENS.greenBg };
  if (outcome === 'in_flight') return { label: 'in progress…', color: TOKENS.red, bg: TOKENS.chip };
  if (outcome === 'needs_disambiguation') return { label: 'needs pick', color: TOKENS.amber, bg: TOKENS.amberBg };
  return { label: 'error', color: TOKENS.red, bg: TOKENS.chip };
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
  const [people, setPeople] = useState([]);
  useEffect(() => {
    fetch('/api/people').then((r) => r.json()).then((j) => {
      setPeople((j?.people || []).map(adaptPerson));
    }).catch(() => {});
  }, []);
  return (
    <PeopleV3
      PEOPLE_V3={people}
      onDeleted={(id) => setPeople((prev) => prev.filter((x) => x.id !== id))}
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
