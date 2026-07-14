// @ts-nocheck — verbatim port of Crew prototype v3 compose
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PAPER_L } from "@/components/paper/palette";
import { openGmailCompose } from "@/lib/gmail";
import { track } from "@/lib/analytics/client";
import { useIsMobile } from "@/lib/use-is-mobile";
import { ChangeList } from "@/components/resume/ChangeList";
import {
  useRuns,
  useFocusedRun,
  setFocusedRun,
  startRun,
  startImageRun,
  dismissRun,
  retryRun,
  switchRunToJob,
  resumePendingRuns,
  pickCandidate,
  regenerateResume,
  regenerateDraft,
  steerAllChannels,
  submitJobText,
  draftAnswers,
  jobHost,
  beginAuthNavigation,
} from "@/lib/runs-store";
import { classifyKind } from "@/lib/kind-detect";
import { supabaseBrowser, signInWithGoogle } from "@/lib/supabase-browser";
import { useSignedIn } from "@/lib/use-signed-in";
import { TOKENS, RADII, SHADOWS } from "@/components/paper/tokens";
import { PAPER_FONTS_V2 } from "@/components/paper/fonts";
import { nameFromEmail } from "@/components/paper/top-bar-logic";
import {
  SUGGESTION_PILLS,
  FIRST_TIME_CARDS,
  validateScreenshot,
  imageFromClipboard,
  deriveStoryIsEmpty,
  storyNudgeKey,
  isFirstTime,
  deskHeadline,
  deskEarlierRuns,
  fmtWhen,
} from "@/components/paper/desk-logic";
import {
  runStatusChip,
  CHIP_TONE_COLORS,
  THIN_STORY,
  THIN_STORY_ENTRIES,
  isThinStory,
  hasGateableOutput,
  shouldBlurGate,
  gateSummary,
  serializePendingRun,
  parsePendingRun,
  PENDING_RUN_KEY,
  buildRunSteps,
  stepActivityPhrase,
  runViewTitle,
  ANGLE_PILLS,
  handoffCta,
  handoffQuestion,
  sentLine,
  sentSub,
  altsLabel,
  GATE_CHIP_LABEL,
  GATE_BUTTON_LABEL,
  GATE_FOOTNOTE,
} from "@/components/paper/run-view-logic";

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

// Hover affordances lifted from the prototype's style-hover attributes — inline
// styles can't express :hover, so the Desk ships this tiny stylesheet instead.
const DESK_HOVER_CSS = `
.dk-pill:hover{border-color:#b0a692!important;color:#211e19!important}
.dk-submit:hover{background:#3a352c!important}
.dk-card:hover{border-color:#b0a692!important;box-shadow:0 2px 12px rgba(60,50,30,.07)}
.dk-row:hover{background:#f7f4ec}
.dk-x:hover{color:#211e19!important}
.rv-ink:hover{background:#3a352c!important}
.rv-tile:hover{border-color:#b0a692!important}
.rv-cand:hover{border-color:#b0a692}
.rv-alt:hover{border-color:#b0a692!important}
.rv-avail:hover{border-color:#b0a692!important;background:#fdfcf8!important}
.rv-x:hover{color:#a03d2e!important}
.rv-back:hover{border-color:#b0a692!important;color:#211e19!important}
.rv-ghost:hover{color:#211e19!important}
.rv-google:hover{background:#faf8f3!important;border-color:#b0a692!important}
`;

function ComposeV3({ p, go }) {
  // Paste-entry state only. Each submitted link becomes an independent run in
  // the module store (src/lib/runs-store.ts), so many can stream at once and
  // survive navigation between /app pages.
  const [input, setInput] = useState('');
  // Set programmatically when ?seed= is the person's email address (People's
  // "Reach out again →") — skips the email lookup for that run. No UI toggle;
  // the prototype composer assembles the crew automatically.
  const [haveEmail, setHaveEmail] = useState(false);
  const [screenshot, setScreenshot] = useState(null);
  const runs = useRuns();
  const isMobile = useIsMobile();
  // Which run is showing full-screen (replacing the Desk). Shared via the module
  // store so the top bar's "crew running" chip and Desk pill toggle the same
  // signal — no route change (see runs-store `useFocusedRun`).
  const focusedRunId = useFocusedRun();
  // Tri-state: null while resolving, then a boolean. Drives the headline
  // variant and the signed-out blur gate on completed runs.
  const signedIn = useSignedIn();

  // ─── Desk data: Story-empty derivation, first-time gate, earlier runs ───
  // profile → storyIsEmpty (thin-Story flag, threaded to the run view); the two
  // history endpoints feed both the first-time gate and the earlier-runs rows
  // (same payload the history page fetches — we don't invent a new source).
  const [profile, setProfile] = useState(null);
  const [composeRuns, setComposeRuns] = useState([]);
  const [resumeRuns, setResumeRuns] = useState([]);
  const [nudgeKey, setNudgeKey] = useState(null);
  // Start hidden so the amber pill never flashes before we know the account +
  // its saved dismissal.
  const [nudgeDismissed, setNudgeDismissed] = useState(true);
  // Display name for the first-time "Welcome, {first}." headline — profile name
  // first, then Google metadata / email, same resolution the top bar uses.
  const [name, setName] = useState(null);

  async function loadHistory() {
    try {
      const [composeRes, resumeRes] = await Promise.all([
        fetch('/api/compose/history').then((r) => r.json()).catch(() => null),
        fetch('/api/resume/history').then((r) => r.json()).catch(() => null),
      ]);
      setComposeRuns(Array.isArray(composeRes?.runs) ? composeRes.runs : []);
      setResumeRuns(Array.isArray(resumeRes?.generations) ? resumeRes.generations : []);
    } catch { /* leave prior state */ }
  }

  useEffect(() => {
    let alive = true;
    fetch('/api/profile').then((r) => r.json()).then((j) => {
      if (!alive) return;
      setProfile(j?.profile ?? null);
      const fromProfile = typeof j?.profile?.full_name === 'string' ? j.profile.full_name.trim() : '';
      if (fromProfile) setName(fromProfile);
    }).catch(() => {});
    loadHistory();
    // Resolve the account so the nudge dismissal is per-user, then read its saved
    // flag. Key by email — dismissal persists across reloads, not across accounts.
    supabaseBrowser().auth.getUser().then(({ data }) => {
      if (!alive) return;
      const u = data?.user;
      const key = storyNudgeKey(u?.email);
      setNudgeKey(key);
      try {
        setNudgeDismissed(typeof window !== 'undefined' && localStorage.getItem(key) === '1');
      } catch { setNudgeDismissed(false); }
      if (u) {
        const meta = u.user_metadata ?? {};
        const fallback =
          (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
          (typeof meta.name === 'string' && meta.name.trim()) ||
          nameFromEmail(u.email);
        // Don't override a name already resolved from the profile.
        setName((prev) => prev ?? (fallback || null));
      }
    }).catch(() => { if (alive) setNudgeDismissed(false); });
    return () => { alive = false; };
  }, []);

  // Refresh the earlier-runs list whenever a live run finishes, so a completed
  // run shows up as a new row without a manual reload.
  const doneCount = runs.filter((r) => r.stage === 'done').length;
  useEffect(() => { loadHistory(); }, [doneCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const storyIsEmpty = deriveStoryIsEmpty(profile);
  const liveNonResume = runs.filter((run) => run.kind !== 'resume');
  // The run to show full-screen instead of the Desk. Falls back to the Desk when
  // nothing is focused or the focused run was dismissed / not in the store.
  const focusedRun = focusedRunId
    ? liveNonResume.find((run) => run.id === focusedRunId) || null
    : null;
  const firstTime = isFirstTime(composeRuns.length, resumeRuns.length) && liveNonResume.length === 0;
  const earlier = deskEarlierRuns(composeRuns, resumeRuns, 4);
  // Prototype shows the Story nudge for signed-in accounts only.
  const showNudge = signedIn === true && !!nudgeKey && storyIsEmpty && !nudgeDismissed;
  const headline = deskHeadline(signedIn, firstTime, name);

  // Seed the composer from a suggestion pill / first-time card.
  function fillComposer(text) { setInput(text); }
  function dismissNudge() {
    setNudgeDismissed(true);
    if (nudgeKey && typeof window !== 'undefined') {
      try { localStorage.setItem(nudgeKey, '1'); } catch { /* private mode */ }
    }
  }

  // Recover any runs that were still streaming when a previous session ended
  // (e.g. the OS reclaimed a backgrounded mobile tab). The server kept working
  // and persisted the result; this polls those rows back into the store rather
  // than stranding them behind a "Lost the connection" error.
  useEffect(() => {
    resumePendingRuns();
  }, []);

  // ─── pendingRun restore (signed-out blur gate) ───
  // A run started while signed-out is stashed to sessionStorage before the OAuth
  // hop (see the gate's Sign-in button). Once we're back and signed in, re-open
  // that run "unlocked" — the module run-store was wiped by the full-page
  // redirect, so we reconstruct from the stashed input. Replays go through the
  // module store (startRun), not React state, so there's no synchronous setState
  // here. A screenshot-only run can't be replayed (the File blob didn't survive
  // the redirect) and is dropped; the user re-attaches on a fresh composer.
  useEffect(() => {
    if (signedIn !== true || typeof window === 'undefined') return;
    let raw = null;
    try { raw = sessionStorage.getItem(PENDING_RUN_KEY); } catch { raw = null; }
    const pending = parsePendingRun(raw);
    if (!pending) return;
    try { sessionStorage.removeItem(PENDING_RUN_KEY); } catch { /* private mode */ }
    if (pending.input && pending.input.trim()) {
      const kind = pending.kind && pending.kind !== 'fuzzy' ? pending.kind : classifyKind(pending.input);
      const restoredId = startRun(pending.input, {
        intent: pending.intent,
        providedEmail: pending.providedEmail,
        kind: kind === 'job' ? 'job' : 'person',
        selectedAgents: pending.selectedAgents,
      });
      // Reopen the run full-screen (now unlocked) rather than dropping the user
      // on a fresh Desk after the OAuth round-trip.
      if (restoredId) setFocusedRun(restoredId);
    }
  }, [signedIn]);

  // Honor ?seed= (People's "Reach out again →"): prefill the paste box, and
  // when the seed is the person's email address, flip the haveEmail shortcut
  // too. Read from location instead of useSearchParams so the one-shot
  // semantics are explicit; strip the param so a refresh doesn't re-seed over
  // whatever the user typed since.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const seed = new URLSearchParams(window.location.search).get('seed');
    if (!seed) return;
    setInput(seed);
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(seed.trim())) setHaveEmail(true);
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  function onGo() {
    const hasText = input.trim().length > 0;
    const file = screenshot?.file;
    // Either a typed link/name/description OR an attached screenshot is enough.
    if (!hasText && !file) return;

    let startedId = null;
    if (file) {
      // Screenshot-first: the vision pass decides job vs person and extracts a
      // query. The full job-flow crew rides along; picks that don't apply to
      // the resolved kind are silently dropped server-side.
      startedId = startImageRun(file, {
        text: input, providedEmail: haveEmail,
        selectedAgents: Array.from(defaultSelectionFor('job', haveEmail)),
      });
    } else {
      const kind = classifyKind(input) === 'job' ? 'job' : 'person';
      startedId = startRun(input, {
        providedEmail: haveEmail, kind,
        selectedAgents: Array.from(defaultSelectionFor(kind, haveEmail)),
      });
    }
    // Take over the screen with the new run (matches the prototype's run view).
    if (startedId) setFocusedRun(startedId);
    // clear so the next link can be pasted immediately
    setInput(''); setHaveEmail(false); setScreenshot(null);
  }

  const sidePad = isMobile ? 16 : 44;

  // ─── Run screen: a focused run takes over the whole Desk (prototype line 536):
  // centered column, fadeUp entrance, steps that reveal one at a time. The
  // composer/first-time/earlier-runs are hidden until "Back to the Desk". ───
  if (focusedRun) {
    return (
      <div className="scroll" style={{
        flex: 1, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column',
        background: TOKENS.paper, color: TOKENS.ink,
      }}>
        <style>{DESK_HOVER_CSS}</style>
        <div key={focusedRun.id} style={{
          flex: 1, maxWidth: 1100, margin: '0 auto', width: '100%', boxSizing: 'border-box',
          padding: `40px ${sidePad}px 60px`, animation: 'fadeUp .4s ease',
        }}>
          {/* A signed-out visitor gets one run that lives only in memory (anon
              runs persist nothing — see api/compose). Leaving the run screen
              would strand it with no way back (the "crew running" chip is
              signed-in only), so we lock them here: the only way forward is the
              blur-gate's "sign in" — which stashes + replays the run unlocked. */}
          {signedIn !== false && (
            <button
              type="button"
              className="rv-back"
              onClick={() => setFocusedRun(null)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 22,
                background: 'transparent', border: 'none', cursor: 'pointer',
                fontFamily: PAPER_FONTS_V2.sans, fontSize: 13, color: TOKENS.muted, padding: 0,
              }}
            >← Back to the Desk</button>
          )}
          <RunCard p={p} run={focusedRun} go={go} storyIsEmpty={storyIsEmpty} signedIn={signedIn}/>
        </div>
      </div>
    );
  }

  return (
    <div className="scroll" style={{
      flex: 1, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column',
      background: TOKENS.paper, color: TOKENS.ink, animation: 'fadeUp .4s ease',
    }}>
      <style>{DESK_HOVER_CSS}</style>

      {/* ─── hero: headline + composer + nudge, centered in the leftover space ─── */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: `48px ${sidePad}px 32px`,
      }}>
        <div style={{
          fontFamily: PAPER_FONTS_V2.serif, fontSize: 34, lineHeight: 1.25,
          letterSpacing: '-.01em', textAlign: 'center',
        }}>{headline}</div>
        {firstTime && (
          <div style={{
            fontFamily: PAPER_FONTS_V2.serif, fontStyle: 'italic', fontSize: 17, lineHeight: 1.5,
            color: TOKENS.muted, marginTop: 10, maxWidth: 520, textAlign: 'center',
          }}>You say what you want. The crew does the boring half.</div>
        )}

        <DeskComposer
          input={input} setInput={setInput}
          screenshot={screenshot} setScreenshot={setScreenshot}
          onGo={onGo} fillComposer={fillComposer}
        />

        {/* thin-Story nudge: signed-in, empty Story, dismissible per-account */}
        {showNudge && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, marginTop: 14,
            background: TOKENS.amberWash, border: `1px solid ${TOKENS.amberLine}`,
            borderRadius: RADII.pill, padding: '7px 9px 7px 18px', animation: 'fadeUp .3s ease',
          }}>
            <span style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 12.5, lineHeight: 1.4, color: TOKENS.muted2 }}>
              Your Story is empty — the crew is working from guesses.
            </span>
            <button onClick={() => go('resume')} style={{
              fontFamily: PAPER_FONTS_V2.sans, fontSize: 12, fontWeight: 500, color: TOKENS.paper,
              background: TOKENS.ink, borderRadius: RADII.pill, border: 'none', padding: '8px 13px', cursor: 'pointer',
            }}>Add your resume</button>
            <button onClick={dismissNudge} title="dismiss" className="dk-x" style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: TOKENS.faint, fontFamily: PAPER_FONTS_V2.sans, fontSize: 14, lineHeight: 1, padding: '2px 6px',
            }}>×</button>
          </div>
        )}
      </div>

      {/* Live runs no longer stack under the composer — an active run takes over
          the whole screen (see the focusedRun branch above). The top-bar
          "crew running" chip reopens it. */}

      {/* ─── first-time: "Things your crew can do" 3-card grid (no runs yet) ─── */}
      {firstTime && (
        <div style={{
          padding: `0 ${sidePad}px ${isMobile ? 32 : 44}px`, maxWidth: 1060, margin: '0 auto',
          width: '100%', boxSizing: 'border-box',
        }}>
          <div style={{
            fontFamily: PAPER_FONTS_V2.sans, fontSize: 11, fontWeight: 500, letterSpacing: '.12em',
            textTransform: 'uppercase', color: TOKENS.faint, marginBottom: 16,
          }}>Things your crew can do — tap one to see it</div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 14,
          }}>
            {FIRST_TIME_CARDS.map((card) => (
              <div key={card.id} className="dk-card" onClick={() => fillComposer(card.fill)} style={{
                background: TOKENS.card, border: `1px solid ${TOKENS.lineSoft}`, borderRadius: 12,
                padding: '18px 20px', cursor: 'pointer', transition: 'border-color .15s, box-shadow .15s',
              }}>
                <div style={{
                  fontFamily: PAPER_FONTS_V2.serif, fontSize: 17, lineHeight: 1.35, color: TOKENS.ink, marginBottom: 8,
                }}>{card.title}</div>
                <div style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 12, lineHeight: 1.6, color: TOKENS.muted }}>
                  {card.desc}
                </div>
                <div style={{ display: 'flex', gap: 5, marginTop: 12, flexWrap: 'wrap' }}>
                  {card.chips.map((c) => (
                    <span key={c} style={{
                      fontFamily: PAPER_FONTS_V2.mono, fontSize: 10, fontWeight: 500, color: TOKENS.muted,
                      background: TOKENS.chip, borderRadius: 4, padding: '4px 7px',
                    }}>{c}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{
            fontFamily: PAPER_FONTS_V2.sans, fontSize: 12, lineHeight: 1.6, color: TOKENS.faint,
            marginTop: 18, textAlign: 'center',
          }}>These cards disappear once you&apos;ve run your first thread.</div>
        </div>
      )}

      {/* ─── earlier runs: first few from history, → the repurposed history page ─── */}
      {earlier.length > 0 && (
        <div style={{
          padding: `0 ${sidePad}px ${isMobile ? 32 : 44}px`, maxWidth: 1060, margin: '0 auto',
          width: '100%', boxSizing: 'border-box',
        }}>
          <div style={{
            fontFamily: PAPER_FONTS_V2.sans, fontSize: 11, fontWeight: 500, letterSpacing: '.12em',
            textTransform: 'uppercase', color: TOKENS.faint, marginBottom: 14,
          }}>Earlier runs</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {earlier.map((row) => (
              <div key={row.key} className="dk-row" onClick={() => go('history')} style={{
                display: 'flex', alignItems: 'center', gap: 16, padding: '15px 8px', margin: '0 -8px',
                borderTop: `1px solid ${TOKENS.lineRow}`, cursor: 'pointer', borderRadius: 8,
                transition: 'background .15s', flexWrap: 'wrap',
              }}>
                <div style={{
                  flex: 1, minWidth: 0, fontFamily: PAPER_FONTS_V2.serif, fontSize: 16, lineHeight: 1.3, color: TOKENS.inkSoft,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{row.title}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {row.chips.map((c, i) => {
                    const tone = EARLIER_CHIP_TONE[c.tone] || EARLIER_CHIP_TONE.done;
                    return (
                      <span key={i} style={{
                        fontFamily: PAPER_FONTS_V2.mono, fontSize: 10.5, fontWeight: 500,
                        color: tone.color, background: tone.bg, borderRadius: 5, padding: '4px 8px', whiteSpace: 'nowrap',
                      }}>{c.label}</span>
                    );
                  })}
                </div>
                <div style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 12, color: TOKENS.faint2, whiteSpace: 'nowrap' }}>
                  {fmtWhen(row.created_at)}
                </div>
                <span style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 13, color: TOKENS.faint }}>→</span>
              </div>
            ))}
            <div style={{ borderTop: `1px solid ${TOKENS.lineRow}` }} />
          </div>
        </div>
      )}
    </div>
  );
}

// Earlier-runs chip colours per abstract tone (kept out of desk-logic since it's
// presentation, not a rule). Error rows use the amber-family bg — red-on-amber
// stays inside the token palette (no off-token pink).
const EARLIER_CHIP_TONE = {
  done:       { color: TOKENS.green, bg: TOKENS.greenBg },
  progress:   { color: TOKENS.amber, bg: TOKENS.amberBg },
  attention:  { color: TOKENS.amber, bg: TOKENS.amberBg },
  error:      { color: TOKENS.red,   bg: TOKENS.amberBg },
};

/* ─────────────────────── one run, all its lifecycle stages ─────────────────────── */
// Prototype lines 534–799: header + status chip, vertical steps list, pull-review
// panel, ATS resume card, people panel with drafts/angles, handoff → sent state,
// and the signed-out blur gate. Presentation only — the run-store state machine,
// steer, Hunter verdicts, Gmail links and the shortlist data all stay.

// Agent keys per run kind (the run-store's progress keys). Presentation-side
// only: the backend decides what actually runs.
const AGENT_KEYS = {
  person: ['person', 'email', 'outreach'],
  job: ['resume', 'person', 'email', 'outreach', 'application'],
};

// Confidence-tier chip colours in the token palette (verified green, plausible
// amber, pure format guess neutral).
function tierChip(tier) {
  if (tier === 'high') return { label: 'verified', color: TOKENS.green, bg: TOKENS.greenBg };
  if (tier === 'medium') return { label: 'likely', color: TOKENS.amber, bg: TOKENS.amberBg };
  return { label: 'guess', color: TOKENS.muted, bg: TOKENS.chip };
}

function RunCard({ p, run, go, storyIsEmpty, signedIn }) {
  const isMobile = useIsMobile();
  const thin = isThinStory(storyIsEmpty);
  // Handoff → sent state. Set when the user confirms "Sent ✓"; the confirm also
  // POSTs /api/draft/[id]/sent so the person lands in People with the follow-up
  // queued server-side.
  const [sent, setSent] = useState(null); // { channel, first } | null
  // Pull-review panel collapse (see showPull below).
  const [pullDone, setPullDone] = useState(false);

  const chipBase = runStatusChip(run.stage, { reconnecting: run.reconnecting });
  const chip = sent ? { label: 'DONE', tone: 'done', pulse: false } : chipBase;
  const chipTone = CHIP_TONE_COLORS[chip.tone];

  const hasPartial = hasPartialResult(run);
  const hasOutput = hasGateableOutput(run, hasPartial);
  // `signedIn` is tri-state (null while resolving); treat "not yet known" as
  // signed-in so the gate never flashes over a signed-in user's outputs.
  const gated = shouldBlurGate({ signedIn: signedIn !== false, run, hasPartial });

  const parsed = run.parsed;
  const contacts = run.contacts || null;
  const hasDual = !!(contacts && (contacts.poster || contacts.hiring_manager));
  const anyEnrichment =
    run.enrichment || contacts?.hiring_manager?.enrichment || contacts?.poster?.enrichment || null;
  const draftList = Array.isArray(run.drafts) && run.drafts.length
    ? run.drafts
    : (contacts?.hiring_manager?.drafts || contacts?.poster?.drafts || []);
  const draftCount = new Set(
    (Array.isArray(draftList) ? draftList : [])
      .map((d) => (d?.channel === 'x_dm' ? 'x' : d?.channel))
      .filter(Boolean),
  ).size;

  // A job parse is REAL only once the stream stamped `unparsed: false` (the
  // server's target_role/company replacing the preview). The local parse
  // previews (inferJobV3 / inferPersonV3) fabricate sample copy for demo
  // keywords, so they never feed the header or the steps.
  const jobParsed = run.kind === 'job' && parsed && parsed.unparsed === false ? parsed : null;
  const parsedLabel = run.kind === 'job'
    ? ([jobParsed?.role, jobParsed?.company, jobParsed?.location].filter(Boolean).join(' · ')
        || jobHost(run.input) || null)
    : null;

  // Only REAL researched people feed the steps/title — never the parse preview.
  const stepPerson =
    run.person || contacts?.hiring_manager?.person || contacts?.poster?.person || null;
  // run.candidates is the server's real shortlist on job runs; on person runs it
  // holds the fabricated parse-preview list (until a needs_disambiguation error
  // replaces it), so it never counts as "people found" there.
  const peopleCount = run.kind === 'job' && Array.isArray(run.candidates) && run.candidates.length
    ? run.candidates.length
    : (hasDual
        ? [contacts?.poster, contacts?.hiring_manager && !contacts.hiring_manager.sameAsPoster ? contacts.hiring_manager : null].filter(Boolean).length
        : (stepPerson ? 1 : 0));

  // Pull-review panel: shown while the resume agent is choosing/weaving. Real
  // Story entries arrive with Phase E — until then only the thin-Story variant
  // (the two generic THIN_STORY_ENTRIES rows) has honest data to show, so the
  // panel renders for thin runs only. Signed-out runs auto-advance (~2.2s) per
  // the prototype; the panel can't pause the real pipeline, so confirming just
  // collapses it.
  const resumeSelected = run.kind === 'job'
    && (!Array.isArray(run.selectedAgents) || run.selectedAgents.length === 0 || run.selectedAgents.includes('resume'));
  // Signed-out job runs never run Resume Darzi server-side, so its step shows as
  // "skipped" and the pull-review panel (which pulls from a Story they don't
  // have) is moot. `signedIn` is tri-state: only skip once we know it's false.
  const skipResume = signedIn === false && run.kind === 'job';
  const showPull = run.kind === 'job' && run.stage === 'working' && thin && resumeSelected && !skipResume
    && (run.progress?.resume ?? 0) < 100 && !run.stepErrors?.resume && !pullDone;
  useEffect(() => {
    if (!showPull || signedIn !== false) return;
    const t = setTimeout(() => setPullDone(true), 2200);
    return () => clearTimeout(t);
  }, [showPull, signedIn]);

  const steps = buildRunSteps({
    stage: run.stage,
    kind: run.kind === 'job' ? 'job' : 'person',
    progress: run.progress,
    selectedAgents: run.selectedAgents,
    stepErrors: run.stepErrors,
    screenshot: !!run.screenshot,
    parsedLabel,
    thin,
    skipResume,
    pulling: showPull,
    peopleCount,
    personLabel: stepPerson?.name || null,
    personSub: [stepPerson?.role, stepPerson?.company].filter(Boolean).join(' · ') || null,
    emailVerdict: emailVerdict(anyEnrichment),
    draftCount,
    ats: run.kind === 'job'
      ? { before: jobParsed?.ats_score_before ?? null, after: jobParsed?.ats_score ?? null }
      : null,
    questionCount: Array.isArray(run.applicationQuestions) ? run.applicationQuestions.length : null,
  });

  const title = runViewTitle({
    kind: run.kind === 'job' ? 'job' : 'person',
    role: run.kind === 'job' ? (jobParsed?.role ?? run.screenshotRole ?? null) : null,
    company: run.kind === 'job'
      ? (jobParsed?.company ?? run.screenshotCompany ?? null)
      : (stepPerson?.company ?? null),
    personName: run.kind === 'job' ? null : (stepPerson?.name ?? null),
    fallback: jobHost(run.input) || run.intent || run.input,
  });

  // Resume Darzi was opted in, but the resolved kind is a person — there's no
  // JD to tailor against. Warn and continue with the rest of the crew.
  const resumeMismatch = (run.stage === 'working' || run.stage === 'done')
    && run.kind === 'person'
    && Array.isArray(run.selectedAgents)
    && run.selectedAgents.includes('resume');

  return (
    <section style={{ animation: 'fadeUp .4s ease' }}>
      {/* ─── header: title + status chip + dismiss ─── */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
        <div style={{
          fontFamily: PAPER_FONTS_V2.serif, fontSize: isMobile ? 22 : 26, lineHeight: 1.3,
          letterSpacing: '-.01em', color: TOKENS.ink, minWidth: 0,
        }}>{title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontFamily: PAPER_FONTS_V2.mono, fontSize: 10.5, fontWeight: 500, lineHeight: 1,
            color: chipTone.color, background: chipTone.bg, borderRadius: 5, padding: '5px 8px',
            textTransform: 'uppercase', whiteSpace: 'nowrap',
          }}>
            {chip.pulse && (
              <span style={{
                width: 6, height: 6, borderRadius: 999, background: chipTone.color,
                animation: 'pulse 1.4s ease-in-out infinite',
              }}/>
            )}
            {chip.label}
          </span>
          <button onClick={() => dismissRun(run.id)} title="dismiss" className="dk-x" style={{
            background: 'transparent', border: 'none', color: TOKENS.faint,
            fontFamily: PAPER_FONTS_V2.sans, fontSize: 16, lineHeight: 1, cursor: 'pointer', padding: '0 2px',
          }}>×</button>
        </div>
      </div>

      {/* ─── sub-line: intent echo + screenshot chip (12×9 hatch swatch) ─── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 13, lineHeight: 1.6, color: TOKENS.muted }}>
          from &ldquo;{run.intent || run.input}&rdquo; · crew assembled automatically
        </div>
        {run.screenshot && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontFamily: PAPER_FONTS_V2.mono, fontSize: 10.5, fontWeight: 500, lineHeight: 1,
            color: TOKENS.muted2, background: TOKENS.chip, borderRadius: 5, padding: '4px 8px',
          }}>
            <span style={{
              width: 12, height: 9, borderRadius: 2, display: 'inline-block',
              background: 'repeating-linear-gradient(-45deg,#cfc6b2,#cfc6b2 2px,#f2eee4 2px,#f2eee4 4px)',
            }}/>
            {run.screenshot.name}
          </span>
        )}
      </div>

      {/* ─── steps list ─── */}
      {steps.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 820 }}>
          {steps.map((s) => <StepRow key={s.id} s={s}/>)}
        </div>
      )}

      {resumeMismatch && (
        <div style={{
          marginTop: 10, maxWidth: 820, display: 'flex', alignItems: 'center', gap: 10,
          background: TOKENS.amberWash, border: `1px solid ${TOKENS.amberLine}`,
          borderRadius: RADII.panelTight, padding: '10px 14px', boxSizing: 'border-box',
        }}>
          <span style={{
            fontFamily: PAPER_FONTS_V2.mono, fontSize: 9.5, fontWeight: 500, letterSpacing: '.08em',
            textTransform: 'uppercase', color: TOKENS.amber, flexShrink: 0,
          }}>RESUME</span>
          <span style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 12.5, lineHeight: 1.5, color: TOKENS.muted2 }}>
            The resume agent needs a job link — skipping for this {run.screenshot ? 'screenshot' : 'run'}. The rest of the crew is on it.
          </span>
        </div>
      )}

      {/* ─── login-walled board (Work at a Startup): paste the JD to run the crew ─── */}
      {run.needsJobText && run.stage !== 'working' && <PasteJdPanel run={run}/>}

      {/* ─── error state: message + shortlist picker + retry ─── */}
      {run.stage === 'error' && <RunErrorBlock run={run}/>}

      {/* ─── outputs (blur-gated for signed-out viewers) ─── */}
      <div style={{ position: 'relative' }}>
        <div
          style={{
            filter: gated ? 'blur(9px)' : 'none',
            pointerEvents: gated ? 'none' : 'auto',
            userSelect: gated ? 'none' : 'auto',
            transition: 'filter .3s ease',
          }}
          aria-hidden={gated || undefined}
        >
          {showPull && <PullPanel go={go} signedIn={signedIn} onConfirm={() => setPullDone(true)}/>}

          {run.kind === 'job' && parsed?.resume && (
            <ResumeOutCard p={p} run={run} go={go} thin={thin}/>
          )}

          {sent ? (
            <SentRow sent={sent} onBack={() => dismissRun(run.id)}/>
          ) : (
            hasOutput && (
              <PeoplePanel run={run} go={go} thin={thin}
                onSent={(info) => setSent(info)}/>
            )
          )}

          {run.kind === 'job' && <ApplicationCard run={run}/>}
        </div>
        {gated && <BlurGateOverlay kind={run.kind} run={run} input={run.input}/>}
      </div>
    </section>
  );
}

/* ─────────────────────── steps list row ─────────────────────── */
// Done = 20px green circle with ✓; active = 20px pulsing gold ring; a non-fatal
// per-agent failure gets an amber ! circle. Title 14.5/500 + mono agent chip,
// muted sub underneath (prototype lines 549–565).

// Rotating "what the agent is doing right now" caption, shown only while a step
// is active. Advances on its own ~2.4s timer so the line keeps moving — the
// reassurance an LLM search UI gives ("refining search · looking for people").
function StepActivity({ id }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 2400);
    return () => clearInterval(t);
  }, []);
  const phrase = stepActivityPhrase(id, tick);
  if (!phrase) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7, marginTop: 5,
      fontFamily: PAPER_FONTS_V2.mono, fontSize: 11, lineHeight: 1.4,
      color: TOKENS.faint, letterSpacing: '.02em',
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: 999, background: TOKENS.gold, flex: 'none',
        animation: 'pulse 1.4s ease-in-out infinite',
      }}/>
      {/* keyed so each phrase fades in as it swaps */}
      <span key={phrase} style={{ animation: 'fadeUp .3s ease' }}>{phrase}…</span>
    </div>
  );
}

function StepRow({ s }) {
  return (
    <div style={{
      display: 'flex', gap: 16, padding: '15px 0',
      borderTop: `1px solid ${TOKENS.lineRow}`, animation: 'fadeUp .35s ease',
    }}>
      {s.state === 'done' && (
        <div style={{
          width: 20, height: 20, borderRadius: 99, background: TOKENS.green, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: PAPER_FONTS_V2.sans, fontSize: 10, fontWeight: 600, lineHeight: 1, flex: 'none',
        }}>✓</div>
      )}
      {s.state === 'active' && (
        <div style={{
          width: 20, height: 20, borderRadius: 99, border: `2px solid ${TOKENS.gold}`,
          flex: 'none', boxSizing: 'border-box', animation: 'pulse 1.4s infinite',
        }}/>
      )}
      {s.state === 'error' && (
        <div style={{
          width: 20, height: 20, borderRadius: 99, background: TOKENS.amberBg, color: TOKENS.amber,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: PAPER_FONTS_V2.sans, fontSize: 11, fontWeight: 600, lineHeight: 1, flex: 'none',
        }}>!</div>
      )}
      {s.state === 'skipped' && (
        <div style={{
          width: 20, height: 20, borderRadius: 99, border: `1px dashed ${TOKENS.line}`, color: TOKENS.faint,
          display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
          fontFamily: PAPER_FONTS_V2.sans, fontSize: 12, fontWeight: 500, lineHeight: 1, flex: 'none',
        }}>–</div>
      )}
      {s.state === 'pending' && (
        <div style={{
          width: 20, height: 20, borderRadius: 99, border: `1.5px solid ${TOKENS.line}`,
          background: TOKENS.card, boxSizing: 'border-box', flex: 'none',
        }}/>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: PAPER_FONTS_V2.sans, fontSize: 14.5, fontWeight: 500, lineHeight: 1.35,
            color: s.state === 'pending' ? TOKENS.faint : s.state === 'skipped' ? TOKENS.muted : TOKENS.ink,
          }}>{s.title}</span>
          <span style={{
            fontFamily: PAPER_FONTS_V2.mono, fontSize: 10, fontWeight: 500, lineHeight: 1,
            color: TOKENS.muted, background: TOKENS.chip, borderRadius: 4, padding: '3px 6px',
          }}>{s.agent}</span>
        </div>
        {s.sub && (
          <div style={{
            fontFamily: PAPER_FONTS_V2.sans, fontSize: 12.5, lineHeight: 1.55,
            color: s.state === 'error' ? TOKENS.amber : s.state === 'pending' ? TOKENS.faint : TOKENS.muted, marginTop: 3,
          }}>{s.sub}</div>
        )}
        {s.state === 'active' && <StepActivity id={s.id}/>}
      </div>
    </div>
  );
}

/* ─────────────────────── pull-review panel (prototype lines 570–614) ─────────────────────── */
// "RESUME AGENT · NEEDS YOUR EYES / Pulling these from your Story". Until Phase E
// lands a real story_entries model this renders the thin-Story variant only: the
// two generic THIN_STORY_ENTRIES rows + the THIN STORY banner. Removals and
// additions are local to the review (the panel can't steer the live pipeline
// yet); "Looks right — generate resume →" collapses it.

function PullPanel({ go, signedIn, onConfirm }) {
  const [entries, setEntries] = useState(() =>
    THIN_STORY_ENTRIES.map((e, i) => ({ id: i, raw: e.title, why: e.why })),
  );
  const [adding, setAdding] = useState('');

  function addEntry() {
    const text = adding.trim();
    if (!text) return;
    setEntries((list) => [...list, {
      id: Date.now(), raw: text, why: 'you added this yourself — always included',
    }]);
    setAdding('');
  }

  return (
    <div style={{
      marginTop: 6, maxWidth: 820, boxSizing: 'border-box',
      background: TOKENS.card, border: `1px solid ${TOKENS.amberLine}`, borderRadius: RADII.card,
      boxShadow: SHADOWS.elevated, padding: '24px 26px', animation: 'fadeUp .35s ease',
    }}>
      <div style={{
        fontFamily: PAPER_FONTS_V2.mono, fontSize: 10, fontWeight: 500, lineHeight: 1,
        letterSpacing: '.08em', color: TOKENS.amber, marginBottom: 6,
      }}>RESUME AGENT · NEEDS YOUR EYES</div>
      <div style={{
        fontFamily: PAPER_FONTS_V2.serif, fontSize: 20, lineHeight: 1.3, color: TOKENS.ink, marginBottom: 4,
      }}>Pulling these from your Story</div>
      <div style={{
        fontFamily: PAPER_FONTS_V2.sans, fontSize: 13, lineHeight: 1.6, color: TOKENS.muted, marginBottom: 18,
      }}>Picked for what the posting asks for. Remove anything, or add something else.</div>

      {/* thin-Story banner */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, background: TOKENS.amberWash,
        border: `1px solid ${TOKENS.amberLine}`, borderRadius: RADII.panelTight,
        padding: '12px 16px', marginBottom: 14, flexWrap: 'wrap',
      }}>
        <span style={{
          fontFamily: PAPER_FONTS_V2.mono, fontSize: 9.5, fontWeight: 500, lineHeight: 1,
          letterSpacing: '.08em', color: TOKENS.amber, background: TOKENS.amberBg,
          borderRadius: 4, padding: '4px 7px', flex: 'none',
        }}>{THIN_STORY.banner}</span>
        <span style={{
          flex: 1, minWidth: 180, fontFamily: PAPER_FONTS_V2.sans, fontSize: 12.5, lineHeight: 1.5, color: TOKENS.muted2,
        }}>Your Story only has these entries — the resume will be generic. Add your resume to give the crew real material.</span>
        <button onClick={() => go('resume')} className="rv-ink" style={{
          fontFamily: PAPER_FONTS_V2.sans, fontSize: 12, fontWeight: 500, lineHeight: 1,
          color: TOKENS.paper, background: TOKENS.ink, border: 'none',
          borderRadius: RADII.buttonTight, padding: '9px 13px', cursor: 'pointer', flex: 'none',
          transition: 'background .15s',
        }}>{THIN_STORY.cta}</button>
      </div>

      {/* entry rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {entries.map((e) => (
          <div key={e.id} style={{
            display: 'flex', gap: 14, alignItems: 'flex-start', background: TOKENS.cardWarm,
            border: `1px solid ${TOKENS.lineInset}`, borderRadius: RADII.panelTight, padding: '13px 16px',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 14.5, lineHeight: 1.45, color: TOKENS.ink }}>{e.raw}</div>
              <div style={{
                fontFamily: PAPER_FONTS_V2.sans, fontStyle: 'italic', fontSize: 11.5, lineHeight: 1.5,
                color: TOKENS.amber, marginTop: 4,
              }}>why: {e.why}</div>
            </div>
            <button onClick={() => setEntries((list) => list.filter((x) => x.id !== e.id))} title="remove"
              className="rv-x" style={{
                background: 'transparent', border: 'none', cursor: 'pointer', padding: 4,
                fontFamily: PAPER_FONTS_V2.sans, fontSize: 14, lineHeight: 1, color: TOKENS.faint,
              }}>✕</button>
          </div>
        ))}
      </div>

      {/* add-your-own input */}
      <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
        <input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEntry(); } }}
          placeholder="…or add something new, in your own words"
          style={{
            flex: 1, border: `1px solid ${TOKENS.line}`, borderRadius: RADII.button, padding: '11px 14px',
            fontFamily: PAPER_FONTS_V2.serif, fontSize: 14, lineHeight: 1.4,
            background: TOKENS.card, boxSizing: 'border-box', color: TOKENS.ink, outline: 'none',
          }}
        />
        <button onClick={addEntry} className="dk-pill" style={{
          fontFamily: PAPER_FONTS_V2.sans, fontSize: 12, fontWeight: 500, lineHeight: 1, color: TOKENS.muted2,
          border: `1px solid ${TOKENS.line}`, borderRadius: RADII.buttonTight, background: 'transparent',
          padding: '10px 14px', cursor: 'pointer', flex: 'none', transition: 'border-color .15s, color .15s',
        }}>Add</button>
      </div>

      {/* footer: count + confirm */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, gap: 12 }}>
        <span style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 12, lineHeight: 1.5, color: TOKENS.faint }}>
          {entries.length} entries → 1 page
        </span>
        <button onClick={onConfirm} className="rv-ink" style={{
          fontFamily: PAPER_FONTS_V2.sans, fontSize: 13, fontWeight: 500, lineHeight: 1,
          color: TOKENS.paper, background: TOKENS.ink, border: 'none',
          borderRadius: RADII.button, padding: '12px 20px', cursor: 'pointer', transition: 'background .15s',
        }}>Looks right — generate resume →</button>
      </div>
      {signedIn === false && (
        <div style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 11, color: TOKENS.faint, marginTop: 10 }}>
          running anonymously — the crew continues on its own
        </div>
      )}
    </div>
  );
}

/* ─────────────────────── resume output card (prototype lines 616–660) ─────────────────────── */
// ATS score header + delta, 8px gradient progress bar, gains list derived from
// the tailor's real change log, and the PDF/DOCX download tiles. The full-read
// modal, change log and regenerate-with-notes survive as quiet affordances.

function ResumeOutCard({ p, run, go, thin }) {
  const parsed = run.parsed || {};
  const resume = parsed.resume;
  const ats = parsed.ats_score ?? null;
  const before = parsed.ats_score_before ?? null;
  const changes = Array.isArray(resume?.changes) ? resume.changes : [];
  const jobRole = parsed.role;
  const jobCompany = parsed.company;
  const [downloading, setDownloading] = useState(null); // 'pdf' | 'docx' | null
  const [dlError, setDlError] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState('');
  const regenerating = !!run.regenerating;

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

  const atsHead = thin
    ? `ATS SCORE · ${THIN_STORY.atsHeader}`
    : before != null
      ? 'ATS SCORE · VS YOUR UPLOADED RESUME'
      : 'ATS SCORE · VS THE JOB POSTING';
  const delta = ats != null && before != null ? ats - before : null;
  const deltaLabel = delta != null
    ? (delta > 0 ? `↑ from ${before}` : delta < 0 ? `↓ from ${before}` : 'same as before')
    : (thin ? THIN_STORY.atsNote : '');
  const deltaColor = delta != null
    ? (delta >= 0 ? TOKENS.green : TOKENS.red)
    : TOKENS.amber;

  // Gains list from the real change log — green + for material added/lifted,
  // muted − for trims. First three; the full log lives behind "what changed".
  const gainMeta = {
    added: { plus: '+', color: TOKENS.green },
    emphasized: { plus: '+', color: TOKENS.green },
    reordered: { plus: '↑', color: TOKENS.green },
    rewritten: { plus: '+', color: TOKENS.green },
    dropped: { plus: '−', color: TOKENS.muted },
  };
  const gains = changes.slice(0, 3).map((c) => {
    const m = gainMeta[c.kind] || gainMeta.rewritten;
    return { plus: m.plus, color: m.color, text: c.reason || c.after || c.section || 'tailored' };
  });

  const fileBase = `Resume — ${jobCompany || jobRole || 'tailored'}`;
  const pages = resume?.meta?.page_count || 1;

  return (
    <div style={{
      marginTop: 6, maxWidth: 560, boxSizing: 'border-box',
      background: TOKENS.card, border: `1px solid ${TOKENS.lineSoft}`, borderRadius: RADII.card,
      boxShadow: SHADOWS.elevated, padding: '24px 26px', animation: 'fadeUp .35s ease',
    }}>
      {/* score header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
        <span style={{
          fontFamily: PAPER_FONTS_V2.mono, fontSize: 10, fontWeight: 500, lineHeight: 1,
          letterSpacing: '.08em', color: TOKENS.faint,
        }}>{ats != null ? atsHead : 'TAILORED RESUME'}</span>
        {ats != null && (
          <span style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 13, lineHeight: 1, color: deltaColor, whiteSpace: 'nowrap' }}>
            <span style={{
              fontFamily: PAPER_FONTS_V2.serif, fontSize: 22, fontWeight: 500, lineHeight: 1, color: TOKENS.ink,
            }}>{ats}</span>
            {deltaLabel ? ` ${deltaLabel}` : ''}
          </span>
        )}
      </div>

      {/* progress bar */}
      {ats != null && (
        <div style={{ position: 'relative', height: 8, borderRadius: 99, background: TOKENS.chip, marginBottom: 14 }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, height: 8, width: `${Math.max(0, Math.min(100, ats))}%`,
            borderRadius: 99, background: 'linear-gradient(90deg,#ddd5c4 60%,#3d7a4f)',
          }}/>
        </div>
      )}

      {/* gains from the real change log */}
      {gains.length > 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 8,
          fontFamily: PAPER_FONTS_V2.sans, fontSize: 12.5, lineHeight: 1.55, color: TOKENS.muted2, marginBottom: 18,
        }}>
          {gains.map((g, i) => (
            <div key={i} style={{ display: 'flex', gap: 8 }}>
              <span style={{ color: g.color, flex: 'none' }}>{g.plus}</span>
              <span>{g.text}</span>
            </div>
          ))}
        </div>
      )}
      {ats == null && changes.length === 0 && (
        <div style={{
          fontFamily: PAPER_FONTS_V2.sans, fontStyle: 'italic', fontSize: 12.5, lineHeight: 1.55,
          color: TOKENS.muted, marginBottom: 18,
        }}>
          The crew couldn&apos;t read this job posting, so this is a light reformat of your existing
          resume rather than a tailored rewrite. Add notes below and re-run to tailor it.
        </div>
      )}

      {/* thin-Story reweave banner */}
      {thin && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, background: TOKENS.amberWash,
          border: `1px solid ${TOKENS.amberLine}`, borderRadius: RADII.panelTight,
          padding: '12px 16px', marginBottom: 14, flexWrap: 'wrap',
        }}>
          <span style={{ flex: 1, minWidth: 180, fontFamily: PAPER_FONTS_V2.sans, fontSize: 12.5, lineHeight: 1.5, color: TOKENS.muted2 }}>
            Built from a thin Story. Add your resume and the crew reweaves it with real material.
          </span>
          <button onClick={() => go('resume')} className="rv-ink" style={{
            fontFamily: PAPER_FONTS_V2.sans, fontSize: 12, fontWeight: 500, lineHeight: 1,
            color: TOKENS.paper, background: TOKENS.ink, border: 'none',
            borderRadius: RADII.buttonTight, padding: '9px 13px', cursor: 'pointer', flex: 'none',
            transition: 'background .15s',
          }}>{THIN_STORY.cta}</button>
        </div>
      )}

      {/* download tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        {[
          { fmt: 'pdf', name: `${fileBase}.pdf`, sub: `${pages} page${pages > 1 ? 's' : ''} · for humans` },
          { fmt: 'docx', name: `${fileBase}.docx`, sub: 'editable · for portals' },
        ].map((tile) => (
          <button key={tile.fmt} className="rv-tile"
            disabled={!resume || downloading === tile.fmt}
            onClick={() => handleDownload(tile.fmt)}
            style={{
              border: `1px solid ${TOKENS.lineSoft}`, borderRadius: RADII.panel, padding: '14px 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              background: 'transparent', cursor: resume ? 'pointer' : 'default', textAlign: 'left',
              transition: 'border-color .15s', minWidth: 0,
            }}>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontFamily: PAPER_FONTS_V2.sans, fontSize: 13, fontWeight: 500, lineHeight: 1.3, color: TOKENS.ink,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{tile.name}</div>
              <div style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 11, lineHeight: 1.5, color: TOKENS.faint }}>{tile.sub}</div>
            </div>
            <span style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 15, lineHeight: 1, color: TOKENS.muted2, flex: 'none' }}>
              {downloading === tile.fmt ? '…' : '↓'}
            </span>
          </button>
        ))}
      </div>
      {dlError && (
        <div style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 11.5, color: TOKENS.red, marginBottom: 10 }}>{dlError}</div>
      )}

      {/* quiet affordances: full read / change log / regenerate notes */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <button onClick={() => resume && setExpanded(true)} disabled={!resume} className="rv-ghost" style={{
          background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
          fontFamily: PAPER_FONTS_V2.mono, fontSize: 11, color: TOKENS.muted, letterSpacing: '.04em',
        }}>read the full resume ↗</button>
        {changes.length > 0 && (
          <button onClick={() => setShowChanges((s) => !s)} className="rv-ghost" style={{
            background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
            fontFamily: PAPER_FONTS_V2.mono, fontSize: 11, color: TOKENS.muted, letterSpacing: '.04em',
          }}>{showChanges ? '× hide changes' : `what changed (${changes.length})`}</button>
        )}
        <button onClick={() => setShowNotes((s) => !s)} disabled={!resume} className="rv-ghost" style={{
          background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
          fontFamily: PAPER_FONTS_V2.mono, fontSize: 11, color: TOKENS.muted, letterSpacing: '.04em',
        }}>{showNotes ? '× close notes' : '✎ regenerate with notes'}</button>
      </div>

      {showChanges && changes.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${TOKENS.lineRow}` }}>
          <ChangeList p={p} changes={changes} compact/>
        </div>
      )}

      {showNotes && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${TOKENS.lineRow}` }}>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={regenerating}
            placeholder="e.g. lead with my platform work, cut the older bullets, make it one page"
            rows={3}
            style={{
              width: '100%', resize: 'vertical', minHeight: 64, boxSizing: 'border-box',
              padding: '10px 12px', background: TOKENS.card,
              border: `1px solid ${TOKENS.line}`, borderRadius: RADII.button, outline: 'none',
              fontFamily: PAPER_FONTS_V2.sans, fontSize: 12.5, lineHeight: 1.5, color: TOKENS.ink,
            }}
          />
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="rv-ink"
              disabled={!notes.trim() || regenerating}
              onClick={async () => { await regenerateResume(run.id, notes); setNotes(''); }}
              style={{
                fontFamily: PAPER_FONTS_V2.sans, fontSize: 12, fontWeight: 500, lineHeight: 1,
                color: TOKENS.paper, background: TOKENS.ink, border: 'none',
                borderRadius: RADII.buttonTight, padding: '10px 14px',
                cursor: notes.trim() && !regenerating ? 'pointer' : 'default',
                opacity: !notes.trim() || regenerating ? 0.6 : 1, transition: 'background .15s',
              }}>{regenerating ? 'Regenerating…' : '↻ Regenerate resume'}</button>
            <span style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 11.5, color: TOKENS.faint }}>
              reruns the resume agent only
            </span>
          </div>
          {run.regenError && (
            <div style={{ marginTop: 8, fontFamily: PAPER_FONTS_V2.sans, fontSize: 11.5, color: TOKENS.red }}>{run.regenError}</div>
          )}
        </div>
      )}

      {expanded && resume && (
        <ResumeModal p={p} resume={resume} jobRole={jobRole} jobCompany={jobCompany}
          atsScore={ats} atsScoreBefore={before} onClose={() => setExpanded(false)}/>
      )}
    </div>
  );
}

/* ─────────────────────── people panel (prototype lines 662–767) ─────────────────────── */
// "Who to reach out to": candidate cards (real shortlist / dual-contact slots),
// WHO + WHY + EMAIL columns, and the drafts card with underline channel tabs,
// inline angle pills and the handoff → "did it go out?" flow. Everything shown
// is real crew output; panels degrade honestly when an agent returned nothing.

function PeoplePanel({ run, go, thin, onSent }) {
  const isMobile = useIsMobile();
  const contacts = run.contacts || null;
  const hasDual = !!(contacts && (contacts.poster || contacts.hiring_manager));
  // A re-pick is mid-flight: the previous contact's email + drafts were cleared
  // in the store, so the panel reads "drafting for {name}…" until the new copy
  // lands — never the old person's message under the new name.
  const picking = run.picking || null;

  // Dual-contact (screenshot) runs: the poster and the sourced hiring manager
  // each hold their own research / email / drafts.
  const slots = [];
  if (hasDual) {
    if (contacts.poster) slots.push({ key: 'poster', badge: 'POSTED THE ROLE', c: contacts.poster });
    if (contacts.hiring_manager && !contacts.hiring_manager.sameAsPoster) {
      slots.push({ key: 'hiring_manager', badge: 'LIKELY HIRING MANAGER', c: contacts.hiring_manager });
    }
  }
  const [activeKey, setActiveKey] = useState(null);
  const activeSlot = slots.find((s) => s.key === activeKey) || slots[0] || null;

  const effPerson = hasDual ? (activeSlot?.c?.person ?? null) : run.person;
  const effEnrichment = hasDual ? (activeSlot?.c?.enrichment ?? null) : run.enrichment;
  const effDrafts = hasDual ? (activeSlot?.c?.drafts ?? null) : run.drafts;

  // The shortlist is real only on job runs (the server's `candidates` event);
  // person-run candidates are the fabricated parse preview — never rendered.
  const shortlist = !hasDual && run.kind === 'job' && Array.isArray(run.candidates)
    ? run.candidates
    : [];
  const personName = effPerson?.name || null;
  const personRole = effPerson?.role || null;
  const personCompany = effPerson?.company || run.parsed?.company || null;
  const first = personName ? personName.split(/\s+/)[0] : null;
  const links = effPerson?.links || {};
  const facts = (effPerson?.context_lines || []).filter(Boolean);
  const searched = effPerson?.searched || null;

  // ranked real addresses (verified → plausible → format guesses)
  const emailCandidates = buildEmailCandidates(effEnrichment);
  const primary = emailCandidates[0] || null;
  const alternates = emailCandidates.slice(1);
  const [emailPick, setEmailPick] = useState({}); // personName → chosen alternate
  const [altsOpen, setAltsOpen] = useState(false);
  const pickedAlt = personName ? emailPick[personName] : null;
  const emailShown = pickedAlt || primary?.email || '';
  const primaryChip = pickedAlt
    ? { label: 'guess · your pick', color: TOKENS.amber, bg: TOKENS.amberBg }
    : primary
      ? (() => {
          const t = tierChip(primary.tier);
          const pct = typeof effEnrichment?.confidence === 'number'
            ? `${Math.round(effEnrichment.confidence * 100)}% · ` : '';
          return { ...t, label: `${primary.tier === 'low' ? '' : pct}${t.label}` };
        })()
      : null;

  // drafts by UI channel (pipeline says x_dm, tabs say x)
  const draftBy = {};
  for (const d of (Array.isArray(effDrafts) ? effDrafts : [])) {
    if (d?.channel) draftBy[d.channel === 'x_dm' ? 'x' : d.channel] = d;
  }
  const draftedCount = Object.keys(draftBy).length;
  const [channel, setChannel] = useState('email');
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState({}); // `${who}:${channel}` → body override
  const [editText, setEditText] = useState('');

  const editKey = `${activeSlot?.key || personName || 'p'}:${channel}`;
  const draft = draftBy[channel] || null;
  const body = edits[editKey] ?? (draft?.body || '');
  const subject = channel === 'email' ? (draft?.subject || '') : null;
  const redrafting = run.redrafting === channel || !!run.steering;

  const meta = channel === 'email'
    ? `To: ${emailShown || '(no public email found — add it in Gmail)'}${subject ? ` · Subject: ${subject}` : ''}`
    : channel === 'linkedin'
      ? (links.linkedin ? `LinkedIn message · ${links.linkedin.replace(/^https?:\/\//, '')}` : 'LinkedIn message')
      : (links.x ? `X direct message · ${links.x.replace(/^https?:\/\//, '')}` : 'X direct message');

  // Candidate cards: dual slots, else the real shortlist, else the single person.
  let cards = [];
  if (slots.length) {
    // Once the run settles, a slot with no confirmed name has FAILED to pin the
    // person down — it isn't still searching. Keep "(searching…)" only while the
    // run is genuinely in flight, else say so honestly (the persistent
    // "(searching…)" on a finished run is exactly what read as a hang).
    const settled = run.stage === 'done' || run.stage === 'error';
    cards = slots.map((s) => {
      const pers = s.c?.person || {};
      return {
        key: s.key, badge: s.badge,
        name: pers.name || (settled ? 'Couldn’t confirm this person' : '(searching…)'),
        role: [pers.role, pers.company].filter(Boolean).join(' · '),
        blurb: (pers.context_lines || []).filter(Boolean)[0] || '',
        links: pers.links || {},
        selected: activeSlot?.key === s.key,
        onSelect: () => { setActiveKey(s.key); setHandoffOpen(false); setEditing(false); },
      };
    });
  } else if (shortlist.length) {
    cards = shortlist.map((c, i) => {
      const isCurrent = !!personName && c.name === personName;
      return {
        key: c.name || String(i),
        badge: `${i === 0 ? 'BEST MATCH' : 'ALTERNATE'}${c.confidence != null ? ` · ${c.confidence}` : ''}`,
        name: c.name,
        role: [c.role, c.company].filter(Boolean).join(' · '),
        blurb: c.why || '',
        links: { linkedin: c.linkedin || null },
        selected: isCurrent,
        // Re-picks the hiring manager: reruns email + outreach for them (existing
        // shortlist behavior, now on the prototype cards).
        onSelect: () => { if (!isCurrent) { pickCandidate(run.id, c); setHandoffOpen(false); setEditing(false); } },
      };
    });
  } else if (personName) {
    cards = [{
      key: 'person',
      badge: effPerson?.match_confidence ? `${String(effPerson.match_confidence).toUpperCase()} MATCH` : 'YOUR PERSON',
      name: personName,
      role: [personRole, personCompany].filter(Boolean).join(' · '),
      blurb: facts[0] || '',
      links,
      selected: true,
      onSelect: () => {},
    }];
  }

  if (!cards.length && !draftedCount) {
    // The crew couldn't pin anyone down — say so honestly.
    return (
      <div style={{
        marginTop: 20, maxWidth: 820, fontFamily: PAPER_FONTS_V2.sans, fontStyle: 'italic',
        fontSize: 13, lineHeight: 1.6, color: TOKENS.muted,
      }}>
        The crew couldn&apos;t pin down a specific person.
        {searched && <> Searched &ldquo;{searched}&rdquo;.</>}
        {' '}Try a LinkedIn or X link, or add a company in the intent box.
      </div>
    );
  }

  function openChannel() {
    if (!body) return;
    // Analytics: the user is being handed off to actually send — the real
    // send-intent signal (84 drafts had 0 recorded sends; this measures it).
    track('draft_opened_channel', { channel });
    if (channel === 'email') {
      openGmailCompose({ to: emailShown, subject, body });
    } else if (channel === 'linkedin') {
      window.open(links.linkedin ? withHttps(links.linkedin) : 'https://www.linkedin.com/messaging/', '_blank', 'noopener');
    } else {
      window.open(links.x ? withHttps(links.x) : 'https://x.com/messages', '_blank', 'noopener');
    }
    setHandoffOpen(true);
  }

  function confirmSent() {
    setHandoffOpen(false);
    track('message_sent', { channel });
    // Real send confirmation: marks the draft sent, logs the interaction, queues
    // the follow-up — the person lands in People (existing endpoint).
    if (draft?.id) {
      fetch(`/api/draft/${draft.id}/sent`, { method: 'POST' }).catch(() => {});
    }
    onSent({ channel, first });
  }

  return (
    <div style={{ marginTop: 20, animation: 'fadeUp .35s ease' }}>
      <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 20, lineHeight: 1.3, color: TOKENS.ink, marginBottom: 4 }}>
        Who to reach out to
      </div>
      <div style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 13, lineHeight: 1.6, color: TOKENS.muted, marginBottom: 20 }}>
        {cards.length > 1
          ? 'Ranked by who decides · pick a person — the drafts are written for each'
          : 'Email, LinkedIn and X drafts are written — pick your channel'}
      </div>
      {thin && (
        <div style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 12.5, lineHeight: 1.6, color: TOKENS.amber, margin: '-10px 0 20px' }}>
          ⚠ Drafts are running generic — the crew has almost no Story to hook from.{' '}
          <button onClick={() => go('resume')} style={{
            background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
            fontFamily: PAPER_FONTS_V2.sans, fontSize: 12.5, color: TOKENS.amber, textDecoration: 'underline',
          }}>Add your resume</button> for sharper openers.
        </div>
      )}

      {/* candidate cards */}
      {cards.length > 0 && (
        <div style={{
          display: 'grid', gap: 14, marginBottom: 24,
          // A lone card keeps the prototype's 1-of-3 width instead of spanning
          // the whole panel.
          gridTemplateColumns: isMobile
            ? '1fr'
            : cards.length === 1 ? 'minmax(0, 420px)' : `repeat(${Math.min(cards.length, 3)}, 1fr)`,
        }}>
          {cards.map((c) => (
            <div key={c.key} onClick={c.onSelect} className={c.selected ? undefined : 'rv-cand'} style={{
              background: TOKENS.card,
              border: c.selected ? `1.5px solid ${TOKENS.ink}` : `1px solid ${TOKENS.lineSoft}`,
              borderRadius: RADII.card, padding: '20px 22px', position: 'relative',
              cursor: c.onSelect && !c.selected ? 'pointer' : 'default',
              boxShadow: c.selected ? '0 3px 16px rgba(60,50,30,.08)' : 'none',
              transition: 'border-color .15s, box-shadow .15s',
            }}>
              <div style={{
                position: 'absolute', top: -9, left: 20,
                fontFamily: PAPER_FONTS_V2.mono, fontSize: 9.5, fontWeight: 500, lineHeight: 1,
                letterSpacing: '.08em',
                color: c.selected ? TOKENS.paper : TOKENS.muted2,
                background: c.selected ? TOKENS.ink : TOKENS.chip,
                borderRadius: 4, padding: '4px 7px', whiteSpace: 'nowrap',
              }}>{c.badge}</div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '6px 0 12px' }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 99, background: TOKENS.lineSoft, flex: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: PAPER_FONTS_V2.serif, fontSize: 14, fontWeight: 500, lineHeight: 1, color: TOKENS.muted2,
                }}>
                  {(c.name || '?').split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontFamily: PAPER_FONTS_V2.serif, fontSize: 17, fontWeight: 500, lineHeight: 1.2, color: TOKENS.ink,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{c.name}</div>
                  {c.role && (
                    <div style={{
                      fontFamily: PAPER_FONTS_V2.sans, fontSize: 12, lineHeight: 1.4, color: TOKENS.muted,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{c.role}</div>
                  )}
                </div>
              </div>
              {c.blurb && (
                <div style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 12.5, lineHeight: 1.6, color: TOKENS.muted2 }}>{c.blurb}</div>
              )}
              <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                {c.selected && primary && (
                  <span style={{
                    fontFamily: PAPER_FONTS_V2.mono, fontSize: 10, fontWeight: 500, lineHeight: 1,
                    color: tierChip(primary.tier).color, background: tierChip(primary.tier).bg,
                    borderRadius: 4, padding: '4px 7px',
                  }}>email · {tierChip(primary.tier).label}</span>
                )}
                {c.links?.linkedin && (
                  <span style={{
                    fontFamily: PAPER_FONTS_V2.mono, fontSize: 10, fontWeight: 500, lineHeight: 1,
                    color: TOKENS.muted, background: TOKENS.chip, borderRadius: 4, padding: '4px 7px',
                  }}>linkedin</span>
                )}
                {c.links?.x && (
                  <span style={{
                    fontFamily: PAPER_FONTS_V2.mono, fontSize: 10, fontWeight: 500, lineHeight: 1,
                    color: TOKENS.muted, background: TOKENS.chip, borderRadius: 4, padding: '4px 7px',
                  }}>x</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* details: left column (who / why / email) + right drafts card */}
      <div style={{
        display: 'grid', gap: 20, alignItems: 'start',
        gridTemplateColumns: isMobile ? '1fr' : '380px 1fr',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          {/* WHO */}
          <div style={{
            background: TOKENS.card, border: `1px solid ${TOKENS.lineSoft}`,
            borderRadius: RADII.card, padding: '20px 22px',
          }}>
            <div style={{
              fontFamily: PAPER_FONTS_V2.mono, fontSize: 10, fontWeight: 500, lineHeight: 1,
              letterSpacing: '.08em', color: TOKENS.faint, marginBottom: 12,
            }}>WHO THEY ARE</div>
            <div style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 13.5, lineHeight: 1.65, color: TOKENS.inkSoft }}>
              {personName
                ? `${personName}${personRole ? ` — ${personRole}` : ''}${personCompany ? ` at ${personCompany}` : ''}.`
                : (run.stage === 'done' || run.stage === 'error')
                  ? 'The crew couldn’t confirm a specific person for this one.'
                  : 'The crew is still pinning this person down.'}
              {personName && effPerson?.match_confidence ? ` Match confidence: ${effPerson.match_confidence}.` : ''}
            </div>
            {Object.keys(links).filter((k) => links[k]).length > 0 && (
              <div style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 11.5, lineHeight: 1.5, color: TOKENS.faint, marginTop: 10 }}>
                sources: {Object.keys(links).filter((k) => links[k]).map((k, i, arr) => (
                  <span key={k}>
                    <a href={withHttps(links[k])} target="_blank" rel="noopener noreferrer"
                      style={{ color: TOKENS.faint, textDecoration: 'underline', textUnderlineOffset: 2 }}>{k}</a>
                    {i < arr.length - 1 ? ' · ' : ''}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* WHY — the research hooks the outreach is angled on */}
          {facts.length > 0 && (
            <div style={{
              background: TOKENS.cardWarm, border: `1px solid ${TOKENS.amberLine}`,
              borderRadius: RADII.card, padding: '20px 22px',
            }}>
              <div style={{
                fontFamily: PAPER_FONTS_V2.mono, fontSize: 10, fontWeight: 500, lineHeight: 1,
                letterSpacing: '.08em', color: TOKENS.amber, marginBottom: 12,
              }}>WHY THEY&apos;LL CARE ABOUT YOU</div>
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 10,
                fontFamily: PAPER_FONTS_V2.sans, fontSize: 13, lineHeight: 1.6, color: TOKENS.inkSoft,
              }}>
                {facts.map((w) => (
                  <div key={w} style={{ display: 'flex', gap: 9 }}>
                    <span style={{ color: TOKENS.amber, flex: 'none' }}>→</span>
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* EMAIL */}
          <div style={{
            background: TOKENS.card, border: `1px solid ${TOKENS.lineSoft}`,
            borderRadius: RADII.card, padding: '18px 22px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontFamily: PAPER_FONTS_V2.mono, fontSize: 10, fontWeight: 500, lineHeight: 1,
                  letterSpacing: '.08em', color: TOKENS.faint, marginBottom: 8,
                }}>EMAIL</div>
                <div style={{
                  fontFamily: PAPER_FONTS_V2.mono, fontSize: 13.5, lineHeight: 1.3, color: emailShown ? TOKENS.ink : TOKENS.faint,
                  overflowWrap: 'anywhere',
                }}>{emailShown || (picking ? `finding an address for ${picking}…` : 'no public address found')}</div>
              </div>
              {primaryChip && (
                <span style={{
                  fontFamily: PAPER_FONTS_V2.mono, fontSize: 10, fontWeight: 500, lineHeight: 1,
                  color: primaryChip.color, background: primaryChip.bg, borderRadius: 4, padding: '4px 7px',
                  whiteSpace: 'nowrap', flex: 'none',
                }}>{primaryChip.label}</span>
              )}
            </div>
            {alternates.length > 0 && (
              <>
                <button onClick={() => setAltsOpen((v) => !v)} className="rv-ghost" style={{
                  background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
                  fontFamily: PAPER_FONTS_V2.sans, fontSize: 12, lineHeight: 1.5, color: TOKENS.muted, marginTop: 12,
                }}>{altsLabel(altsOpen, alternates.length)}</button>
                {altsOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                    {alternates.map((a) => (
                      <button key={a.email} className="rv-alt"
                        onClick={() => personName && setEmailPick((m) => ({ ...m, [personName]: a.email }))}
                        style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                          border: `1px solid ${TOKENS.lineInset}`, borderRadius: RADII.buttonTight,
                          padding: '9px 12px', background: 'transparent', cursor: 'pointer',
                          transition: 'border-color .15s', width: '100%', textAlign: 'left',
                        }}>
                        <span style={{
                          fontFamily: PAPER_FONTS_V2.mono, fontSize: 12.5, lineHeight: 1, color: TOKENS.muted2,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
                        }}>{a.email}</span>
                        <span style={{
                          fontFamily: PAPER_FONTS_V2.mono, fontSize: 9.5, fontWeight: 500, lineHeight: 1,
                          color: TOKENS.muted, background: TOKENS.chip, borderRadius: 4, padding: '3px 6px', flex: 'none',
                        }}>GUESS</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* drafts card */}
        <div style={{
          background: TOKENS.card, border: `1px solid ${TOKENS.lineSoft}`,
          borderRadius: RADII.card, overflow: 'hidden', minWidth: 0,
        }}>
          {/* underline tabs */}
          <div style={{
            display: 'flex', borderBottom: `1px solid ${TOKENS.lineInset}`, padding: '0 22px',
            alignItems: 'center', flexWrap: 'wrap',
          }}>
            {[
              { id: 'email', label: 'Email' },
              { id: 'linkedin', label: 'LinkedIn' },
              { id: 'x', label: 'X' },
            ].map((t) => {
              const on = channel === t.id;
              return (
                <button key={t.id}
                  onClick={() => { setChannel(t.id); setHandoffOpen(false); setEditing(false); }}
                  style={{
                    fontFamily: PAPER_FONTS_V2.sans, fontSize: 13, fontWeight: 500, lineHeight: 1,
                    padding: '16px 14px', cursor: 'pointer', background: 'transparent', border: 'none',
                    color: on ? TOKENS.ink : TOKENS.faint2,
                    borderBottom: `2px solid ${on ? TOKENS.ink : 'transparent'}`, marginBottom: -1,
                  }}>{t.label}</button>
              );
            })}
            <div style={{
              marginLeft: 'auto', fontFamily: PAPER_FONTS_V2.sans, fontSize: 11.5, lineHeight: 1,
              color: TOKENS.faint, padding: '8px 0',
            }}>
              {draftedCount >= 3 ? 'all three drafted · pick your channel'
                : draftedCount > 0 ? `${draftedCount} drafted so far`
                : (run.stage === 'done' || run.stage === 'error') ? 'no draft — pick a person first'
                  : 'drafting…'}
            </div>
          </div>

          <div style={{ padding: 22 }}>
            <div style={{
              fontFamily: PAPER_FONTS_V2.sans, fontSize: 12, lineHeight: 1.5, color: TOKENS.faint,
              marginBottom: 12, overflowWrap: 'anywhere',
            }}>{meta}</div>

            {editing ? (
              <>
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={8}
                  style={{
                    width: '100%', boxSizing: 'border-box', resize: 'vertical',
                    border: `1px solid ${TOKENS.line}`, borderRadius: RADII.panelTight, padding: '12px 14px',
                    fontFamily: PAPER_FONTS_V2.serif, fontSize: 15, lineHeight: 1.75, color: TOKENS.inkSoft,
                    outline: 'none', background: TOKENS.card,
                  }}
                />
                <div style={{ display: 'flex', gap: 9, marginTop: 10 }}>
                  <button className="rv-ink" onClick={() => { setEdits((m) => ({ ...m, [editKey]: editText })); setEditing(false); }}
                    style={{
                      fontFamily: PAPER_FONTS_V2.sans, fontSize: 12.5, fontWeight: 500, lineHeight: 1,
                      color: TOKENS.paper, background: TOKENS.ink, border: 'none',
                      borderRadius: RADII.button, padding: '10px 15px', cursor: 'pointer', transition: 'background .15s',
                    }}>Save</button>
                  <button className="dk-pill" onClick={() => setEditing(false)} style={{
                    fontFamily: PAPER_FONTS_V2.sans, fontSize: 12.5, fontWeight: 500, lineHeight: 1,
                    color: TOKENS.muted2, background: 'transparent',
                    border: `1px solid ${TOKENS.line}`, borderRadius: RADII.button, padding: '10px 15px',
                    cursor: 'pointer', transition: 'border-color .15s, color .15s',
                  }}>Cancel</button>
                </div>
              </>
            ) : (
              <div style={{
                fontFamily: PAPER_FONTS_V2.serif, fontSize: 15, lineHeight: 1.75, color: TOKENS.inkSoft,
                whiteSpace: 'pre-line',
              }}>
                {redrafting && !body
                  ? 'Rewriting…'
                  : picking && !body
                    ? `Drafting for ${picking}…`
                    : body
                      || ((run.stage === 'done' || run.stage === 'error')
                        ? 'No draft here — the crew couldn’t confirm a person to write to. Pick someone above, or add a LinkedIn/X link and re-run.'
                        : 'The draft for this channel appears here once the outreach agent finishes.')}
              </div>
            )}

            {/* steer the draft — free-form directive across all three channels.
                A steer supersedes any local edits, so clear the overrides. */}
            {!editing && (
              <SteerDraft runId={run.id} drafts={effDrafts} recipientName={personName}
                onSteer={() => setEdits({})}/>
            )}

            {/* angles + actions */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginTop: 18, paddingTop: 18, borderTop: `1px solid ${TOKENS.chip}`, gap: 12, flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 11.5, lineHeight: 1, color: TOKENS.muted }}>
                  {redrafting ? '↻ rewriting…' : '↻ Another angle:'}
                </span>
                {ANGLE_PILLS.map((a) => (
                  <button key={a.id} className="dk-pill"
                    disabled={!body || redrafting}
                    onClick={() => {
                      if (!body || redrafting) return;
                      // The rewrite replaces the draft — drop any local edit so
                      // the new copy actually shows.
                      setEdits((m) => {
                        const next = { ...m };
                        delete next[editKey];
                        return next;
                      });
                      regenerateDraft(
                        run.id, channel, a.directive,
                        { subject, body, recipientName: personName },
                        hasDual ? activeSlot?.key : undefined,
                      );
                    }}
                    style={{
                      fontFamily: PAPER_FONTS_V2.sans, fontSize: 11, lineHeight: 1, color: TOKENS.muted2,
                      background: 'transparent', border: `1px solid ${TOKENS.line}`, borderRadius: RADII.pill,
                      padding: '6px 11px', cursor: body && !redrafting ? 'pointer' : 'default',
                      opacity: !body || redrafting ? 0.55 : 1, transition: 'border-color .15s, color .15s',
                    }}>{a.label}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 9 }}>
                <button className="dk-pill"
                  disabled={!body}
                  onClick={() => { setEditText(body); setEditing(true); }}
                  style={{
                    fontFamily: PAPER_FONTS_V2.sans, fontSize: 13, fontWeight: 500, lineHeight: 1,
                    color: TOKENS.muted2, background: 'transparent',
                    border: `1px solid ${TOKENS.line}`, borderRadius: RADII.button, padding: '11px 15px',
                    cursor: body ? 'pointer' : 'default', opacity: body ? 1 : 0.55,
                    transition: 'border-color .15s, color .15s',
                  }}>Edit</button>
                <button className="rv-ink"
                  disabled={!body}
                  onClick={openChannel}
                  style={{
                    fontFamily: PAPER_FONTS_V2.sans, fontSize: 13, fontWeight: 500, lineHeight: 1,
                    color: TOKENS.paper, background: TOKENS.ink, border: 'none',
                    borderRadius: RADII.button, padding: '12px 18px',
                    cursor: body ? 'pointer' : 'default', opacity: body ? 1 : 0.55, transition: 'background .15s',
                  }}>{handoffCta(channel)}</button>
              </div>
            </div>

            {/* handoff → did it go out? */}
            {handoffOpen ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, marginTop: 16,
                background: TOKENS.cardWarm, border: `1px dashed ${TOKENS.amberLine}`,
                borderRadius: RADII.panelTight, padding: '12px 16px', animation: 'fadeUp .3s ease', flexWrap: 'wrap',
              }}>
                <span style={{
                  flex: 1, minWidth: 160, fontFamily: PAPER_FONTS_V2.sans, fontSize: 13, lineHeight: 1.5, color: TOKENS.inkSoft,
                }}>{handoffQuestion(channel)} <em>Did it go out?</em></span>
                <button onClick={confirmSent} style={{
                  fontFamily: PAPER_FONTS_V2.sans, fontSize: 12, fontWeight: 500, lineHeight: 1,
                  color: TOKENS.paper, background: TOKENS.green, border: 'none',
                  borderRadius: RADII.pill, padding: '9px 14px', cursor: 'pointer', flex: 'none',
                }}>Sent ✓</button>
                <button onClick={() => setHandoffOpen(false)} style={{
                  fontFamily: PAPER_FONTS_V2.sans, fontSize: 12, fontWeight: 500, lineHeight: 1,
                  color: TOKENS.muted, background: TOKENS.chip, border: 'none',
                  borderRadius: RADII.pill, padding: '9px 14px', cursor: 'pointer', flex: 'none',
                }}>Not yet</button>
              </div>
            ) : (
              body && (
                <div style={{ marginTop: 16, fontFamily: PAPER_FONTS_V2.sans, fontSize: 12, lineHeight: 1.6, color: TOKENS.faint }}>
                  When you come back we&apos;ll ask <em>&ldquo;did it go out?&rdquo;</em> — one tap and{' '}
                  {first || 'they'} land{first ? 's' : ''} in your tracker with the follow-up queued.
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────── sent state (prototype lines 787–798) ─────────────────────── */

function SentRow({ sent, onBack }) {
  return (
    <div style={{
      marginTop: 20, maxWidth: 820, borderTop: `1px solid ${TOKENS.lineRow}`,
      padding: '22px 0', animation: 'fadeUp .35s ease',
    }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{
          width: 20, height: 20, borderRadius: 99, background: TOKENS.green, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: PAPER_FONTS_V2.sans, fontSize: 10, fontWeight: 600, lineHeight: 1, flex: 'none',
        }}>✓</div>
        <div>
          <div style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 14.5, fontWeight: 500, lineHeight: 1.35, color: TOKENS.ink }}>
            {sentLine(sent.first, sent.channel)}
          </div>
          <div style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 12.5, lineHeight: 1.6, color: TOKENS.muted, marginTop: 3 }}>
            {sentSub(sent.first)}
          </div>
          <button onClick={onBack} className="rv-back" style={{
            display: 'inline-block', marginTop: 14, background: 'transparent', cursor: 'pointer',
            fontFamily: PAPER_FONTS_V2.sans, fontSize: 13, fontWeight: 500, lineHeight: 1, color: TOKENS.muted2,
            border: `1px solid ${TOKENS.line}`, borderRadius: RADII.button, padding: '11px 16px',
            transition: 'border-color .15s, color .15s',
          }}>← Back to the Desk</button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────── error state ─────────────────────── */
// NEEDS-YOU chip is already amber; the message, the identify shortlist and the
// retry affordances restyled to the token language. Same actions as before.

function RunErrorBlock({ run }) {
  // Only the server's real disambiguation shortlist is offered for a retry —
  // the local parse preview (inferPersonV3/makeP, marked by companySlug)
  // fabricates sample people and never renders.
  const candidates = (Array.isArray(run.candidates) ? run.candidates : [])
    .filter((c) => c && !('companySlug' in c));
  return (
    <div style={{ marginTop: 10, maxWidth: 820 }}>
      <div style={{
        background: TOKENS.amberWash, border: `1px solid ${TOKENS.amberLine}`,
        borderRadius: RADII.panel, padding: '13px 16px',
        fontFamily: PAPER_FONTS_V2.sans, fontSize: 13, lineHeight: 1.55, color: TOKENS.inkSoft,
      }}>{run.error}</div>

      {candidates.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {candidates.map((c, i) => (
            <button key={c.name || i} className="rv-alt"
              onClick={() => retryRun(run.id, {
                name: c.name, role: c.role ?? null, company: c.company ?? null, linkedin: c.linkedin ?? null,
              })}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                padding: '11px 16px', background: TOKENS.card,
                border: `1px solid ${TOKENS.lineSoft}`, borderRadius: RADII.panelTight,
                cursor: 'pointer', textAlign: 'left', transition: 'border-color .15s',
              }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 15, lineHeight: 1.3, color: TOKENS.ink }}>{c.name}</div>
                {(c.role || c.company) && (
                  <div style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 11.5, lineHeight: 1.4, color: TOKENS.muted }}>
                    {[c.role, c.company].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
              {c.confidence != null && (
                <span style={{
                  fontFamily: PAPER_FONTS_V2.mono, fontSize: 10.5, fontWeight: 500, lineHeight: 1,
                  color: TOKENS.amber, background: TOKENS.amberBg, borderRadius: 4, padding: '4px 7px', flex: 'none',
                }}>{c.confidence}%</span>
              )}
            </button>
          ))}
        </div>
      )}

      <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {run.suggestedKind === 'job' && candidates.length === 0 && (
          <button className="rv-ink" onClick={() => switchRunToJob(run.id)} style={{
            fontFamily: PAPER_FONTS_V2.sans, fontSize: 12.5, fontWeight: 500, lineHeight: 1,
            color: TOKENS.paper, background: TOKENS.ink, border: 'none',
            borderRadius: RADII.button, padding: '11px 15px', cursor: 'pointer', transition: 'background .15s',
          }}>Run as a job application →</button>
        )}
        <button className="dk-pill" onClick={() => retryRun(run.id)} style={{
          fontFamily: PAPER_FONTS_V2.sans, fontSize: 12.5, fontWeight: 500, lineHeight: 1,
          color: TOKENS.muted2, background: 'transparent',
          border: `1px solid ${TOKENS.line}`, borderRadius: RADII.button, padding: '11px 15px',
          cursor: 'pointer', transition: 'border-color .15s, color .15s',
        }}>↻ Retry</button>
      </div>
    </div>
  );
}

/* ─────────────────── paste-the-JD (login-walled boards) ─────────────────── */

// Shown when a run's board is login-walled (Work at a Startup, etc.): the crew
// can't read the posting, so we ask for the description and re-run the whole
// crew off it via submitJobText. Its own textarea state; the store owns the run.
function PasteJdPanel({ run }) {
  const [text, setText] = useState('');
  const busy = run.stage === 'working';
  const label = run.needsJobText?.label || 'This board';
  return (
    <div style={{
      marginTop: 12, maxWidth: 820,
      background: TOKENS.amberWash, border: `1px solid ${TOKENS.amberLine}`,
      borderRadius: RADII.panel, padding: '14px 16px', boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{
          fontFamily: PAPER_FONTS_V2.mono, fontSize: 9.5, fontWeight: 500, letterSpacing: '.08em',
          textTransform: 'uppercase', color: TOKENS.amber, flexShrink: 0,
        }}>{label}</span>
        <span style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 12.5, lineHeight: 1.5, color: TOKENS.muted2 }}>
          {label} postings sit behind a login, so the crew can&apos;t read them. Paste the job
          description and re-run — your resume and the hiring-manager search go off this text.
        </span>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={busy}
        placeholder="Paste the full job description here…"
        rows={6}
        style={{
          width: '100%', boxSizing: 'border-box', resize: 'vertical',
          fontFamily: PAPER_FONTS_V2.sans, fontSize: 13, lineHeight: 1.55, color: TOKENS.ink,
          background: TOKENS.card, border: `1px solid ${TOKENS.lineSoft}`, borderRadius: RADII.panelTight,
          padding: '11px 13px', outline: 'none',
        }}
      />
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          className="rv-ink"
          disabled={!text.trim() || busy}
          onClick={() => { submitJobText(run.id, text); }}
          style={{
            fontFamily: PAPER_FONTS_V2.sans, fontSize: 12.5, fontWeight: 500, lineHeight: 1,
            color: TOKENS.paper, background: TOKENS.ink, border: 'none',
            borderRadius: RADII.button, padding: '11px 15px',
            cursor: text.trim() && !busy ? 'pointer' : 'default',
            opacity: !text.trim() || busy ? 0.6 : 1, transition: 'background .15s',
          }}
        >{busy ? 'Running the crew…' : 'Run the crew with this description →'}</button>
        <span style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 11.5, color: TOKENS.muted }}>
          runs resume + hiring-manager search
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────── Sawaal Jawaab: application Q&A ─────────────────────── */
// The fifth crew member's output. Lists the supplemental essay questions detected
// during the run and, on demand, drafts a full first-person answer to each —
// grounded in the user's profile/resume/stories. When the run couldn't read any
// questions (a non-ATS board), a paste box lets the user hand them in.

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text || '');
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch { /* clipboard blocked — no-op */ }
      }}
      style={{
        fontFamily: PAPER_FONTS_V2.mono, fontSize: 10, fontWeight: 500, lineHeight: 1,
        color: copied ? TOKENS.green : TOKENS.muted, background: TOKENS.chip,
        border: 'none', borderRadius: 4, padding: '5px 8px', cursor: 'pointer',
      }}
    >{copied ? 'copied ✓' : 'copy'}</button>
  );
}

function ApplicationPasteBox({ run }) {
  const [text, setText] = useState('');
  const busy = !!run.answering;
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  return (
    <div style={{ marginTop: 4 }}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={busy}
        placeholder={"Paste the application's questions here, one per line…"}
        rows={4}
        style={{
          width: '100%', boxSizing: 'border-box', resize: 'vertical',
          fontFamily: PAPER_FONTS_V2.sans, fontSize: 13, lineHeight: 1.55, color: TOKENS.ink,
          background: TOKENS.card, border: `1px solid ${TOKENS.lineSoft}`, borderRadius: RADII.panelTight,
          padding: '11px 13px', outline: 'none',
        }}
      />
      <button
        className="rv-ink"
        disabled={!lines.length || busy}
        onClick={() => draftAnswers(run.id, lines)}
        style={{
          marginTop: 10, fontFamily: PAPER_FONTS_V2.sans, fontSize: 12.5, fontWeight: 500, lineHeight: 1,
          color: TOKENS.paper, background: TOKENS.ink, border: 'none', borderRadius: RADII.button,
          padding: '11px 15px', cursor: lines.length && !busy ? 'pointer' : 'default',
          opacity: !lines.length || busy ? 0.6 : 1,
        }}
      >{busy ? 'Drafting…' : 'Draft answers →'}</button>
    </div>
  );
}

function ApplicationCard({ run }) {
  const detected = Array.isArray(run.applicationQuestions) ? run.applicationQuestions : null;
  const answers = Array.isArray(run.applicationAnswers) ? run.applicationAnswers : [];
  const answering = !!run.answering;
  const hasQuestions = !!detected && detected.length > 0;
  const detectionDone = detected !== null;
  // Offer the paste fallback only once detection finished empty and the crew has
  // stopped working (so we don't flash it mid-run).
  const showPaste = detectionDone && !hasQuestions && run.stage !== 'working';

  if (!hasQuestions && !answers.length && !showPaste) return null;

  const answerFor = (q) =>
    answers.find((a) => (a.question || '').trim().toLowerCase() === (q || '').trim().toLowerCase());
  const anyAnswered = answers.some((a) => (a.body || '').trim());

  return (
    <div style={{
      marginTop: 12, maxWidth: 620, boxSizing: 'border-box',
      background: TOKENS.card, border: `1px solid ${TOKENS.lineSoft}`, borderRadius: RADII.card,
      boxShadow: SHADOWS.elevated, padding: '24px 26px', animation: 'fadeUp .35s ease',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
        <span style={{
          fontFamily: PAPER_FONTS_V2.mono, fontSize: 10, fontWeight: 500, lineHeight: 1,
          letterSpacing: '.08em', color: TOKENS.faint,
        }}>APPLICATION QUESTIONS</span>
        <span style={{
          fontFamily: PAPER_FONTS_V2.mono, fontSize: 10, fontWeight: 500, lineHeight: 1,
          color: TOKENS.muted, background: TOKENS.chip, borderRadius: 4, padding: '3px 6px',
        }}>SAWAAL JAWAAB</span>
      </div>

      {hasQuestions ? (
        <>
          <div style={{
            fontFamily: PAPER_FONTS_V2.sans, fontSize: 12.5, lineHeight: 1.55, color: TOKENS.muted, marginBottom: 16,
          }}>
            This application asks for {detected.length} written answer{detected.length === 1 ? '' : 's'}.
            {anyAnswered ? ' Drafted in your voice from your profile — edit before you paste.' : ' Draft first-person answers grounded in your profile.'}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {detected.map((q, i) => {
              const a = answerFor(q);
              const body = (a?.body || '').trim();
              return (
                <div key={i}>
                  <div style={{
                    fontFamily: PAPER_FONTS_V2.serif, fontSize: 15, lineHeight: 1.4, color: TOKENS.ink, marginBottom: 8,
                  }}>{q}</div>
                  {body ? (
                    <div style={{
                      background: TOKENS.paper, border: `1px solid ${TOKENS.lineSoft}`, borderRadius: RADII.panelTight,
                      padding: '12px 14px',
                    }}>
                      <div style={{
                        fontFamily: PAPER_FONTS_V2.sans, fontSize: 13, lineHeight: 1.6, color: TOKENS.ink,
                        whiteSpace: 'pre-wrap',
                      }}>{body}</div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                        <CopyBtn text={body}/>
                      </div>
                    </div>
                  ) : answering ? (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      fontFamily: PAPER_FONTS_V2.mono, fontSize: 11, lineHeight: 1.4, color: TOKENS.faint,
                    }}>
                      <span style={{
                        width: 5, height: 5, borderRadius: 999, background: TOKENS.gold, flex: 'none',
                        animation: 'pulse 1.4s ease-in-out infinite',
                      }}/>
                      drafting your answer…
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              className="rv-ink"
              disabled={answering}
              onClick={() => draftAnswers(run.id)}
              style={{
                fontFamily: PAPER_FONTS_V2.sans, fontSize: 12.5, fontWeight: 500, lineHeight: 1,
                color: TOKENS.paper, background: TOKENS.ink, border: 'none', borderRadius: RADII.button,
                padding: '11px 15px', cursor: answering ? 'default' : 'pointer', opacity: answering ? 0.6 : 1,
              }}
            >{answering ? 'Drafting…' : anyAnswered ? 'Redraft all answers' : 'Draft answers →'}</button>
            <span style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 11.5, color: TOKENS.muted }}>
              in your voice, from your profile & Story
            </span>
          </div>
        </>
      ) : (
        <div style={{
          fontFamily: PAPER_FONTS_V2.sans, fontSize: 12.5, lineHeight: 1.55, color: TOKENS.muted, marginBottom: 12,
        }}>
          The crew couldn&apos;t read supplemental questions off this posting. If the form asks any
          (like &ldquo;Why this company?&rdquo;), paste them below and the crew will draft answers.
        </div>
      )}

      {showPaste && <ApplicationPasteBox run={run}/>}

      {run.answerError && (
        <div style={{
          marginTop: 12, fontFamily: PAPER_FONTS_V2.sans, fontSize: 12, lineHeight: 1.5, color: TOKENS.amber,
        }}>{run.answerError}</div>
      )}
    </div>
  );
}

/* ─────────────────────── steer the draft ─────────────────────── */

// Rotating placeholder hints for the "steer the draft" input. Cycle slowly so
// they read as suggestions, not noise; paused while focused or non-empty.
const STEER_HINTS = [
  "focus on their pottery side project",
  "mention we both went to Cornell",
  "lean on the fundraising angle",
  "emphasize their recent NYC move",
];

// Free-form directive fanned across all three channels via steerAllChannels
// (existing store action). Reads busy/error/history from the live run so a
// steer kicked off here shows progress anywhere it's mounted.
function SteerDraft({ runId, drafts, recipientName, onSteer }) {
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
    if (onSteer) onSteer();
    steerAllChannels(runId, text, { drafts, recipientName });
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        border: `1px solid ${TOKENS.line}`, borderRadius: RADII.button, background: TOKENS.card,
        padding: '2px 2px 2px 12px', opacity: disabled && !busy ? 0.55 : 1,
      }}>
        <input
          value={value}
          disabled={disabled}
          placeholder={busy ? 'rewriting all three…' : hasAnyDraft ? `steer the draft — ${STEER_HINTS[hintIdx]}` : 'waiting for the draft…'}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(value); } }}
          style={{
            flex: 1, border: 'none', outline: 'none', background: 'transparent', minWidth: 0,
            fontFamily: PAPER_FONTS_V2.sans, fontSize: 12.5, lineHeight: 1.4, color: TOKENS.ink, padding: '8px 0',
          }}
        />
        <button
          onClick={() => submit(value)}
          disabled={disabled || !value.trim()}
          aria-label="Steer all three drafts"
          className={value.trim() && !disabled ? 'rv-ink' : undefined}
          style={{
            border: 'none', borderRadius: RADII.buttonTight, padding: '8px 12px', flex: 'none',
            background: value.trim() && !disabled ? TOKENS.ink : TOKENS.chip,
            color: value.trim() && !disabled ? TOKENS.paper : TOKENS.faint,
            cursor: value.trim() && !disabled ? 'pointer' : 'default',
            fontFamily: PAPER_FONTS_V2.sans, fontSize: 12, fontWeight: 500, lineHeight: 1, transition: 'background .15s',
          }}>{busy ? '…' : '↵'}</button>
      </div>
      {history.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: PAPER_FONTS_V2.mono, fontSize: 9.5, fontWeight: 500, letterSpacing: '.08em', color: TOKENS.faint,
          }}>RECENT</span>
          {history.map((h) => (
            <button key={h} onClick={() => submit(h)} disabled={disabled} className="dk-pill" style={{
              fontFamily: PAPER_FONTS_V2.sans, fontSize: 11, lineHeight: 1, color: TOKENS.muted2,
              background: 'transparent', border: `1px solid ${TOKENS.line}`, borderRadius: RADII.pill,
              padding: '6px 11px', cursor: disabled ? 'default' : 'pointer', maxWidth: 220,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              transition: 'border-color .15s, color .15s',
            }}>{h}</button>
          ))}
        </div>
      )}
      {err && (
        <div style={{ marginTop: 6, fontFamily: PAPER_FONTS_V2.sans, fontSize: 11.5, color: TOKENS.red }}>{err}</div>
      )}
    </div>
  );
}

/* ─────────────────────── signed-out blur gate overlay (prototype lines 770–783) ─────────────────────── */

// The card over the blurred output for a signed-out viewer: amber "CREW
// FINISHED · YOU'RE SIGNED OUT" chip and an OUTLINE Google button with the
// multicolor G (per the prototype — not the old green chip / solid ink button).
// The sign-in control persists enough of the run to sessionStorage — which
// survives the same-origin OAuth + onboarding redirect — then kicks off the
// real Supabase Google OAuth, returning to /app/compose where the run re-opens
// unlocked (see ComposeV3's pendingRun restore effect).
function BlurGateOverlay({ kind, run, input }) {
  async function signIn() {
    try {
      if (typeof window !== 'undefined') {
        const payload = serializePendingRun({
          input: input || run?.input || '',
          intent: run?.intent || '',
          kind: run?.kind ?? null,
          providedEmail: !!run?.providedEmail,
          selectedAgents: Array.isArray(run?.selectedAgents) ? run.selectedAgents : [],
          screenshotName: run?.screenshot?.name ?? null,
        });
        try { sessionStorage.setItem(PENDING_RUN_KEY, payload); } catch { /* private mode */ }
      }
      // Suppress the "Load failed" flash from the run's stream being torn down
      // by the OAuth navigation.
      beginAuthNavigation();
      await signInWithGoogle('/app/compose');
    } catch (e) {
      console.error('Gate sign-in failed', e);
      alert('Sign-in is not configured yet. See README for setup.');
    }
  }
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-start',
      justifyContent: 'center', paddingTop: 44, zIndex: 20,
    }}>
      <div style={{
        width: 410, maxWidth: '92%', boxSizing: 'border-box', background: TOKENS.card,
        border: `1px solid ${TOKENS.line}`, borderRadius: RADII.modal,
        boxShadow: SHADOWS.modal,
        padding: '34px 38px 28px', textAlign: 'center', animation: 'fadeUp .35s ease',
      }}>
        <span style={{
          display: 'inline-block', fontFamily: PAPER_FONTS_V2.mono, fontSize: 10, fontWeight: 500,
          lineHeight: 1, letterSpacing: '.1em', textTransform: 'uppercase', color: TOKENS.amber,
          background: TOKENS.amberBg, borderRadius: 5, padding: '5px 9px', marginBottom: 14,
        }}>{GATE_CHIP_LABEL}</span>
        <div style={{
          fontFamily: PAPER_FONTS_V2.serif, fontSize: 24, lineHeight: 1.3, letterSpacing: '-.01em',
          color: TOKENS.ink, marginBottom: 10,
        }}>Your crew&apos;s work is waiting behind the blur.</div>
        <div style={{
          fontFamily: PAPER_FONTS_V2.sans, fontSize: 13, lineHeight: 1.65, color: TOKENS.muted, marginBottom: 24,
        }}>{gateSummary(kind)}</div>
        <button onClick={signIn} className="rv-google" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, width: '100%',
          border: `1px solid ${TOKENS.dashed2}`, borderRadius: RADII.panelTight, padding: '13px 18px',
          cursor: 'pointer', background: TOKENS.card, transition: 'background .15s, border-color .15s',
        }}>
          <GoogleGlyph/>
          <span style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 14, fontWeight: 500, lineHeight: 1, color: TOKENS.ink }}>
            {GATE_BUTTON_LABEL}
          </span>
        </button>
        <div style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 11, lineHeight: 1.7, color: TOKENS.faint, marginTop: 18 }}>
          {GATE_FOOTNOTE}
        </div>
      </div>
    </div>
  );
}

// The multicolor Google "G" (prototype's exact paths), sized for the gate button.
function GoogleGlyph({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

/* ─────────────────────── the Desk composer (prototype lines 164–201) ─────────────────────── */

function DeskComposer({ input, setInput, screenshot, setScreenshot, onGo, fillComposer }) {
  const fileRef = useRef(null);
  const [attachError, setAttachError] = useState(null);
  // Drag-over highlight for image drop onto the composer card.
  const [dragOver, setDragOver] = useState(false);

  // The one validated path every attach entry point (file picker, paste,
  // drag-drop) funnels through — keeps a single validated `screenshot` shape
  // regardless of how the file arrived.
  function attachFile(f) {
    const res = validateScreenshot(f);
    if (!res.ok) {
      if (res.error) setAttachError(res.error);
      return;
    }
    setAttachError(null);
    // Keep the real File so onGo can hand it to the vision pass + Supabase.
    setScreenshot(res.screenshot);
  }

  function pickFile(e) {
    const f = e.target.files?.[0];
    // Reset so re-picking the same file still fires onChange.
    e.target.value = '';
    attachFile(f);
  }

  // Paste (⌘V) an image straight onto the composer.
  function onPaste(e) {
    const f = imageFromClipboard(e.clipboardData?.items ? Array.from(e.clipboardData.items) : null);
    if (f) { e.preventDefault(); attachFile(f); }
  }

  // Drag an image file onto the card — amber border + glow while hovering.
  function onDragOver(e) { e.preventDefault(); if (!dragOver) setDragOver(true); }
  function onDragLeave() { if (dragOver) setDragOver(false); }
  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    attachFile(e.dataTransfer?.files?.[0]);
  }

  // Object-URL thumbnail for the attached-screenshot chip. Revoked on change so
  // swapping/removing an attachment doesn't leak blobs.
  const [previewUrl, setPreviewUrl] = useState(null);
  useEffect(() => {
    if (!screenshot?.file || typeof URL === 'undefined' || !URL.createObjectURL) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(screenshot.file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [screenshot]);

  return (
    <div
      onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
      style={{
        width: 640, maxWidth: '100%', boxSizing: 'border-box',
        background: TOKENS.card,
        border: `1px solid ${dragOver ? TOKENS.amber : TOKENS.line}`,
        borderRadius: RADII.card,
        boxShadow: dragOver ? '0 2px 16px rgba(138,109,47,.18)' : SHADOWS.card,
        padding: '20px 22px 16px', marginTop: 30,
        transition: 'border-color .15s, box-shadow .15s',
      }}
    >
      {/* ─── attached-screenshot chip: 46×34 thumbnail, filename, meta, × ─── */}
      {screenshot && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, background: TOKENS.paper,
          border: `1px solid ${TOKENS.lineSoft}`, borderRadius: 10, padding: '8px 10px',
          marginBottom: 12, maxWidth: 360, animation: 'fadeUp .25s ease',
        }}>
          <div style={{
            width: 46, height: 34, flexShrink: 0, borderRadius: 5, border: `1px solid ${TOKENS.line}`,
            backgroundImage: previewUrl
              ? `url(${previewUrl})`
              : 'repeating-linear-gradient(-45deg,#f2eee4,#f2eee4 4px,#faf8f3 4px,#faf8f3 8px)',
            backgroundSize: 'cover', backgroundPosition: 'center',
          }} />
          <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
            <div style={{
              fontFamily: PAPER_FONTS_V2.mono, fontSize: 11.5, fontWeight: 500, lineHeight: 1.3, color: TOKENS.inkSoft,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{screenshot.name}</div>
            <div style={{
              fontFamily: PAPER_FONTS_V2.sans, fontSize: 11, lineHeight: 1.4, color: TOKENS.faint, marginTop: 2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>attached · the crew reads it when you run</div>
          </div>
          <button onClick={() => { setScreenshot(null); setAttachError(null); }} title="remove" className="dk-x" style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontFamily: PAPER_FONTS_V2.sans, fontSize: 15, lineHeight: 1, color: TOKENS.faint, padding: '2px 4px',
          }}>×</button>
        </div>
      )}

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onPaste={onPaste}
        onKeyDown={(e) => {
          // Enter submits (prototype); Shift+Enter keeps the newline. ⌘/Ctrl+Enter
          // is covered by the same branch.
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onGo(); }
        }}
        placeholder="Paste a job link, a name or profile, or a screenshot — and say why you're reaching out…"
        rows={2}
        style={{
          width: '100%', border: 'none', resize: 'none', outline: 'none',
          fontFamily: PAPER_FONTS_V2.serif, fontSize: 17, lineHeight: 1.5,
          color: TOKENS.ink, background: 'transparent', padding: 0, boxSizing: 'border-box',
        }}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, gap: 10 }}>
        {/* attach "+" popover + suggestion pills */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => fileRef.current?.click()}
            title="Add a screenshot"
            aria-label="Add a screenshot"
            className="dk-pill"
            style={{
              width: 28, height: 28, borderRadius: RADII.pill, cursor: 'pointer', padding: 0,
              border: `1px solid ${TOKENS.line}`, background: 'transparent', color: TOKENS.muted,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: PAPER_FONTS_V2.sans, fontSize: 16, lineHeight: 1,
              transition: 'border-color .15s, color .15s',
            }}
          >+</button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={pickFile}/>
          {SUGGESTION_PILLS.map((pill) => (
            <button key={pill.id} onClick={() => fillComposer(pill.fill)} className="dk-pill" style={{
              fontFamily: PAPER_FONTS_V2.sans, fontSize: 11.5, lineHeight: 1, color: TOKENS.muted,
              border: `1px solid ${TOKENS.line}`, borderRadius: RADII.pill, padding: '7px 12px',
              background: 'transparent', cursor: 'pointer', transition: 'border-color .15s, color .15s',
            }}>{pill.label}</button>
          ))}
        </div>
        {/* 34px ink circle submit (prototype's ↑; ⌘/Ctrl+Enter still works) */}
        <button onClick={onGo} title="Run the crew (↵)" aria-label="Run the crew" className="dk-submit" style={{
          width: 34, height: 34, borderRadius: RADII.pill, flexShrink: 0, alignSelf: 'flex-end',
          background: TOKENS.ink, color: TOKENS.paper, border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: PAPER_FONTS_V2.sans, fontSize: 15, lineHeight: 1, cursor: 'pointer',
          transition: 'background .15s',
        }}>↑</button>
      </div>

      {attachError && (
        <div style={{
          marginTop: 8, fontFamily: PAPER_FONTS_V2.sans, fontSize: 11.5, color: TOKENS.red, textAlign: 'left',
        }}>{attachError}</div>
      )}
    </div>
  );
}

function defaultSelectionFor(kind, haveEmail) {
  const set = new Set(AGENT_KEYS[kind] || AGENT_KEYS.person);
  if (haveEmail) set.delete('email');
  return set;
}

// True once at least one agent has streamed back a real deliverable, so the
// package can start rendering mid-run instead of waiting for the whole crew.
// Each sub-section of the package already shows an honest "appears once the X
// agent finishes" placeholder for the pieces that haven't landed yet.
function hasPartialResult(run) {
  if (!run) return false;
  const c = run.contacts;
  const dualHasData = !!(c && (
    c.poster?.person || c.poster?.enrichment || c.poster?.drafts?.length ||
    c.hiring_manager?.person || c.hiring_manager?.enrichment || c.hiring_manager?.drafts?.length
  ));
  return !!(
    (Array.isArray(run.drafts) && run.drafts.length) ||
    run.enrichment ||
    run.person ||
    run.parsed?.resume ||
    dualHasData
  );
}

// The Email Wallah card's final line should report the REAL deliverability
// signal Hunter returned, not a cosmetic number. enrichment.confidence is 0-1
// (Hunter's score/100) and enrichment.source says whether the address was
// actually verified vs. a format guess. Returns null until the lookup lands so
// the card keeps showing its scripted progress steps in the meantime.
function emailVerdict(enrichment) {
  if (!enrichment) return null;
  const conf = typeof enrichment.confidence === 'number' ? enrichment.confidence : null;
  const pct = conf != null ? Math.round(conf * 100) : null;
  if (enrichment.email) {
    const tier = emailTier(enrichment.source, enrichment.confidence);
    const word = tier === 'high' ? 'verified' : 'plausible';
    return pct != null ? `${pct}% ${word}` : word;
  }
  if (Array.isArray(enrichment.guesses) && enrichment.guesses.length > 0) return 'format guess';
  return 'no address found';
}

// Full-size, readable view of the tailored resume. The card preview is
// deliberately tiny (it's a thumbnail); this is the "actually read it" view.
// Styled from TOKENS (jugaadu reskin), matching the run view's paper aesthetic.
function ResumeSection({ title }) {
  return (
    <div style={{
      fontFamily: PAPER_FONTS_V2.mono, fontSize: 10.5, letterSpacing: '.16em',
      textTransform: 'uppercase', color: TOKENS.amber,
      borderBottom: `1px solid ${TOKENS.line}`, paddingBottom: 4, margin: '20px 0 10px',
    }}>{title}</div>
  );
}

// The full-resume modal keeps the `p` (light `Palette`) prop only to feed
// ChangeList, which still speaks the legacy palette shape; everything else here
// is TOKENS-driven.
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
          width: '100%', maxWidth: 820, background: TOKENS.card,
          border: `1px solid ${TOKENS.line}`, borderRadius: RADII.modal, boxShadow: SHADOWS.modal,
          padding: isMobile ? '24px 18px 28px' : '32px 44px 40px', position: 'relative', color: TOKENS.ink,
        }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
          <div style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: TOKENS.amber }}>
            Tailored resume{(jobRole || jobCompany) ? ` · for ${[jobRole, jobCompany].filter(Boolean).join(' at ')}` : ''}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
            {atsScore != null && <AtsBadge before={atsScoreBefore} after={atsScore} size={11}/>}
            <button onClick={onClose} style={{
              background: 'transparent', border: 'none', color: TOKENS.muted2,
              fontFamily: PAPER_FONTS_V2.mono, fontSize: 12, letterSpacing: '.08em',
              textTransform: 'uppercase', cursor: 'pointer',
            }}>× close</button>
          </div>
        </div>

        <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 30, lineHeight: 1.05 }}>
          {h.full_name || 'Your name'}
        </div>
        {h.headline && (
          <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontStyle: 'italic', fontSize: 15, color: TOKENS.inkSoft, marginTop: 3 }}>
            {h.headline}
          </div>
        )}
        {(h.email || h.phone || h.location || h.links?.website || h.links?.linkedin || h.links?.github) && (
          <div style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 11.5, color: TOKENS.muted2, marginTop: 6 }}>
            {[h.email, h.phone, h.location, h.links?.website, h.links?.linkedin, h.links?.github].filter(Boolean).join('  ·  ')}
          </div>
        )}
        <div style={{ height: 1, background: TOKENS.line, margin: '16px 0' }}/>

        {Array.isArray(resume.changes) && resume.changes.length > 0 && (
          <div style={{
            marginBottom: 20, padding: '16px 18px', borderRadius: RADII.panel,
            background: TOKENS.cardWarm, border: `1px solid ${TOKENS.lineInset}`,
          }}>
            <div style={{
              fontFamily: PAPER_FONTS_V2.mono, fontSize: 10.5, letterSpacing: '.14em',
              textTransform: 'uppercase', color: TOKENS.amber, marginBottom: 12,
            }}>What Jugaadu changed for this role</div>
            <ChangeList p={p} changes={resume.changes}/>
          </div>
        )}

        {resume.summary && (
          <p style={{ margin: 0, fontFamily: PAPER_FONTS_V2.sans, fontSize: 14, lineHeight: 1.55 }}>{resume.summary}</p>
        )}

        {(resume.experience || []).length > 0 && <ResumeSection title="Experience"/>}
        {(resume.experience || []).map((exp, i) => (
          <div key={i} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
              <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 15.5 }}>
                {[exp.role, exp.company].filter(Boolean).join(' · ')}
              </div>
              {(exp.start || exp.end) && (
                <div style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 11, color: TOKENS.muted2, whiteSpace: 'nowrap' }}>
                  {[exp.start, exp.end].filter(Boolean).join(' – ')}
                </div>
              )}
            </div>
            {exp.location && (
              <div style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 11, color: TOKENS.muted2 }}>{exp.location}</div>
            )}
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {(exp.bullets || []).map((b, j) => (
                <li key={j} style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 13.5, lineHeight: 1.5, marginBottom: 3 }}>{b}</li>
              ))}
            </ul>
          </div>
        ))}

        {(resume.education || []).length > 0 && <ResumeSection title="Education"/>}
        {(resume.education || []).map((ed, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 14.5 }}>
              {[[ed.degree, ed.field].filter(Boolean).join(', '), ed.school].filter(Boolean).join(' · ')}
            </div>
            {(ed.notes || []).length > 0 && (
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {ed.notes.map((n, j) => (
                  <li key={j} style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 13, color: TOKENS.inkSoft }}>{n}</li>
                ))}
              </ul>
            )}
          </div>
        ))}

        {(resume.skills || []).length > 0 && <ResumeSection title="Skills"/>}
        {(resume.skills || []).map((s, i) => (
          <div key={i} style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 13.5, lineHeight: 1.55, marginBottom: 3 }}>
            {s.group ? <strong>{s.group}: </strong> : null}{(s.items || []).join(', ')}
          </div>
        ))}

        {(resume.projects || []).length > 0 && <ResumeSection title="Projects"/>}
        {(resume.projects || []).map((pr, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 14.5 }}>
              {pr.link ? (
                <a href={pr.link} target="_blank" rel="noopener noreferrer" style={{ color: TOKENS.ink }}>{pr.name} ↗</a>
              ) : pr.name}
            </div>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {(pr.bullets || []).map((b, j) => (
                <li key={j} style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 13.5, lineHeight: 1.5 }}>{b}</li>
              ))}
            </ul>
          </div>
        ))}

        <div style={{ marginTop: 24, display: 'flex', gap: 8 }}>
          <DownloadBtn onClick={() => downloadResumeBlob(resume, 'pdf').catch(() => {})}>↓ PDF</DownloadBtn>
          <DownloadBtn onClick={() => downloadResumeBlob(resume, 'docx').catch(() => {})}>↓ Word</DownloadBtn>
        </div>
      </div>
    </div>
  );
}

// Small outline button for the modal's downloads — replaces the legacy
// InkButton so this file no longer depends on primitives.tsx.
function DownloadBtn({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '7px 14px', background: 'transparent', color: TOKENS.ink,
        border: `1px solid ${TOKENS.ink}`, borderRadius: RADII.buttonTight,
        fontFamily: PAPER_FONTS_V2.sans, fontSize: 12.5, cursor: 'pointer',
      }}>{children}</button>
  );
}

// ATS match estimate. When we have the original resume's baseline score we show
// the lift (before → after, +delta); otherwise just the single score. The score
// is Claude's own honest estimate against the JD, not a real ATS scan.
function AtsBadge({ before, after, size = 10.5 }) {
  if (after == null) {
    return (
      <span style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: size, color: TOKENS.muted2, letterSpacing: '.06em' }}>
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
        fontFamily: PAPER_FONTS_V2.mono, fontSize: size, letterSpacing: '.06em',
        display: 'inline-flex', alignItems: 'baseline', gap: 4, whiteSpace: 'nowrap',
      }}>
      <span style={{ color: TOKENS.muted2, textTransform: 'uppercase' }}>ATS</span>
      {hasBefore && delta !== 0 && (
        <>
          <span style={{ color: TOKENS.muted2 }}>{before}</span>
          <span style={{ color: TOKENS.muted2 }}>→</span>
        </>
      )}
      <span style={{ color: up ? TOKENS.green : (delta < 0 ? TOKENS.red : TOKENS.green) }}>
        {after}{(!hasBefore || delta === 0) && <span style={{ color: TOKENS.muted2 }}>/100</span>}
      </span>
      {hasBefore && delta !== 0 && (
        <span style={{ color: up ? TOKENS.green : TOKENS.red }}>({up ? '+' : ''}{delta})</span>
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

function withHttps(url) {
  if (!url) return url;
  return /^https?:\/\//.test(url) ? url : `https://${url}`;
}

export default function ComposePage() {
  const router = useRouter();
  // The reskinned Desk styles entirely from TOKENS; the only remaining paper-
  // palette consumer is ChangeList (still on the legacy `Palette` shape), so we
  // hand it the static light palette rather than the retired usePaperTheme hook.
  return (
    <ComposeV3
      p={PAPER_L}
      go={(route) => router.push(`/app/${route}`)}
    />
  );
}
