// @ts-nocheck — verbatim port of Crew prototype v3 landing
"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PAPER_FONTS } from "@/components/paper/fonts";
import { usePaperTheme } from "@/components/paper/use-paper-theme";
import { signInWithGoogle } from "@/lib/supabase-browser";

/* ─────────────────────── Jugaadu logo ─────────────────────── */
/* A boxy stamp echoing the newspaper aesthetic — a J anchored by a
   marigold spark (the "jugaad" — a clever little hack). */
function JugaaduMark({ p, size = 46 }) {
  return (
    <div style={{
      position: 'relative', width: size, height: size, borderRadius: 10,
      background: p.stamp, color: p.paper,
      display: 'grid', placeItems: 'center',
      fontFamily: PAPER_FONTS.display, fontSize: size * 0.6,
      boxShadow: `4px 4px 0 ${p.ink}`,
    }}>
      <span style={{ lineHeight: 1, transform: 'translateY(-1px)' }}>J</span>
      <span style={{
        position: 'absolute', right: 5, top: 5,
        width: size * 0.18, height: size * 0.18, borderRadius: 999,
        background: p.marigold, border: `1.5px solid ${p.ink}`,
      }}/>
      <span style={{
        position: 'absolute', left: 4, bottom: 3,
        fontFamily: PAPER_FONTS.mono, fontSize: size * 0.18,
        color: p.marigold, letterSpacing: '.04em',
      }}>★</span>
    </div>
  );
}

async function startGoogleSignIn() {
  try {
    await signInWithGoogle("/app/compose");
  } catch (e) {
    console.error("Google sign-in failed", e);
    alert("Sign-in is not configured yet. See README for setup.");
  }
}

// eslint-disable @typescript-eslint/no-explicit-any

/* Eight agents in the crew. 4 default in foreground. */
const AGENTS_V3 = [
  {
    id: 'apply', glyph: '↗',
    name: 'Apply',       desi: 'अप्लाई कारवाँ',
    role: 'a job, applied',  color: 'stamp',
    status: 'live',
    teaser: 'One link in. Resume tailored, hiring manager found, email verified, message drafted. Pitch-ready in ~47s.',
    output: { kind: 'doc', title: 'sam-stripe-application.zip', meta: 'pdf · email · candidate · 47s' },
  },
  {
    id: 'lekhak', glyph: '✎',
    name: 'Article Publisher', desi: 'लेखक भाई',
    role: 'an essay, shipped', color: 'marigold',
    status: 'live',
    teaser: 'Drafts essays in your voice from the half-baked notes you keep. Cross-posts to Substack, LinkedIn, and X with the right hooks for each.',
    output: { kind: 'post', title: '"Why batch beats real-time"', meta: '1,840 words · 3 platforms · queued for Tue 9am' },
  },
  {
    id: 'patrakar', glyph: '◐',
    name: 'Research Briefer', desi: 'पत्रकार',
    role: 'a brief, delivered', color: 'leaf',
    status: 'live',
    teaser: 'Daily report on your beats. Primary sources, charts, the bit you would have read if you had the time.',
    output: { kind: 'brief', title: 'Tue brief · AI agents + payments', meta: '4 stories · 7 min read · 12 sources' },
  },
  {
    id: 'guru', glyph: '✦',
    name: 'Upskill Coach', desi: 'गुरु',
    role: 'a skill, sharpened', color: 'tea',
    status: 'live',
    teaser: 'Watches what you ship, picks what to learn next. Lessons sized for a coffee break. Drills, not lectures.',
    output: { kind: 'lesson', title: 'Distributed systems · week 1', meta: '12 min · 3 drills · due thu' },
  },
  {
    id: 'khoji', glyph: '◆',
    name: 'Network Mapper', desi: 'चाचा',
    role: 'an intro, warmed up', color: 'plum',
    status: 'soon',
    teaser: 'Maps who you know, who they know, who can intro. Surfaces dormant ties before they go cold.',
    output: { kind: 'graph', title: '3 warm paths to Anthropic', meta: 'via Anika · 2-hop · last DM 9mo' },
  },
  {
    id: 'mausi', glyph: '$',
    name: 'Salary Negotiator', desi: 'मौसी',
    role: 'a comp, defended', color: 'leaf2',
    status: 'soon',
    teaser: 'When the offer lands she opens a war room. Benchmarks, scripts, the exact line for "your number".',
    output: { kind: 'memo', title: 'Stripe offer · 18% under band', meta: 'L5 · NYC · 3 counter-paths' },
  },
  {
    id: 'pandit_q', glyph: '◊',
    name: 'Interview Pandit', desi: 'पंडित जी',
    role: 'a rep, run', color: 'stamp2',
    status: 'soon',
    teaser: 'Mock interviews on the role you applied to. Tells you, gently, when your answer is cope.',
    output: { kind: 'rep', title: 'Behavioural · 7 rounds', meta: 'last: "biggest failure" · weak · drill again' },
  },
  {
    id: 'opps', glyph: '✶',
    name: 'Opportunities', desi: 'मौके',
    role: 'a door, opened', color: 'marigold2',
    status: 'soon',
    teaser: 'Surfaces roles, RFPs, grants, podcasts, panels — before they hit the board everyone else watches.',
    output: { kind: 'feed', title: '5 leads, 1 ghostwrite gig', meta: 'all matched · 2 expire this week' },
  },
];

const HEADLINE_PRESETS = [
  {
    id: 'leverage',
    eyebrow: 'Vol. I · the personal OS for ambition',
    pre: 'Get a crew.',
    main: 'Save your time.',
    italic: 'Grow on its dime.',
    sub: 'A small staff of agents handles the busywork — applying, publishing, briefing, learning — so the work that compounds becomes the only work you do.',
  },
  {
    id: 'os',
    eyebrow: 'an operating system for the ambitious',
    pre: 'Your unfair',
    main: 'advantage,',
    italic: 'on call.',
    sub: 'Jugaadu is a personal OS. Eight small agents who apply for the job, publish the essay, brief the morning, and pick what you learn next — in your voice, on your beat.',
  },
  {
    id: 'second_self',
    eyebrow: 'be everywhere · ship everything',
    pre: 'Hire the version',
    main: 'of yourself',
    italic: 'who has time.',
    sub: 'You only have so many hours. Jugaadu is the second self that runs alongside you — sending applications, writing essays, reading the internet, drilling you on the next thing.',
  },
  {
    id: 'compound',
    eyebrow: 'leverage today · compounding growth',
    pre: 'Today, leverage.',
    main: 'Tomorrow,',
    italic: 'compound.',
    sub: 'A crew that handles what you do not have time for, and a crew that quietly makes you better while it does. Apply, publish, brief, learn — running in parallel, for you.',
  },
];

/* Map abstract color names to active palette */
function color(p, name) {
  return ({
    stamp:     p.stamp,
    marigold:  p.marigold,
    leaf:      p.leaf,
    tea:       p.tea,
    plum:      '#8a4f6a',
    leaf2:     '#5b7a52',
    stamp2:    '#a83b22',
    marigold2: p.marigoldDeep,
  })[name] || p.ink;
}

/* ─────────────────────── shared primitives ─────────────────────── */

function InkRule3({ p, thick = 3, gap = 3, thin = 1 }) {
  return (
    <div>
      <div style={{ height: thick, background: p.ink }} />
      <div style={{ height: gap }} />
      <div style={{ height: thin, background: p.ink }} />
    </div>
  );
}

function Stamp3({ p, children, rotate = -6, c, style }) {
  const col = c || p.stamp;
  return (
    <span style={{
      display: 'inline-block', border: `2px double ${col}`, color: col,
      padding: '5px 11px', fontFamily: PAPER_FONTS.mono,
      fontWeight: 700, letterSpacing: '.12em', fontSize: 11,
      textTransform: 'uppercase',
      transform: `rotate(${rotate}deg)`,
      background: 'transparent', borderRadius: 2,
      whiteSpace: 'nowrap',
      ...style,
    }}>{children}</span>
  );
}

function Dot3({ color: c }) {
  return <span style={{
    width: 7, height: 7, borderRadius: 999, background: c,
    boxShadow: `0 0 0 4px ${c}22`,
    animation: 'pulseDot 1.6s ease-in-out infinite',
    display: 'inline-block',
  }}/>;
}

/* ─────────────────────── shell + tweaks ─────────────────────── */

function LandingV3() {
  const router = useRouter();
  const { p, t, setTweak } = usePaperTheme();
  const variant = t.variant || 'workspace';
  const headlineIdx = Math.min(HEADLINE_PRESETS.length - 1, t.headlineIdx ?? 0);
  const headline = HEADLINE_PRESETS[headlineIdx];
  const foreground = (t.foreground && t.foreground.length ? t.foreground : ['apply','lekhak','patrakar','guru']);

  useEffect(() => {
    document.body.style.background = p.paper;
    document.body.style.color = p.ink;
  }, [p.paper, p.ink]);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {variant === 'workspace'
        ? <WorkspaceLanding p={p} headline={headline} foreground={foreground} dark={!!t.dark}/>
        : <NewsroomLanding  p={p} headline={headline} foreground={foreground} dark={!!t.dark}/>
      }
      <TweaksV3 p={p} t={t} setTweak={setTweak} variant={variant} headlineIdx={headlineIdx} foreground={foreground}/>
    </div>
  );
}

function TweaksV3() { return null; }

/* ─────────────────────── shared masthead + footer ─────────────────────── */

function Masthead3({ p, mode = 'workspace' }) {
  const router = useRouter();
  return (
    <header style={{ padding: '22px 56px 18px', borderBottom: `1px solid ${p.ink}` }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        fontFamily: PAPER_FONTS.mono, fontSize: 10,
        letterSpacing: '.08em', textTransform: 'uppercase', color: p.inkMute,
        whiteSpace: 'nowrap', gap: 20,
      }}>
        <span>Vol. II · No. 01 · {mode === 'workspace' ? 'Console Edition' : 'Sunday Edition'}</span>
        <span>May 17, 2026 · ₹0 · A personal OS for the ambitious</span>
        <span>"Get a crew. Save time. Grow anyway."</span>
      </div>
      <div style={{ height: 10 }}/>
      <InkRule3 p={p}/>
      <div style={{ height: 14 }}/>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <JugaaduMark p={p}/>
          <div>
            <div style={{
              fontFamily: PAPER_FONTS.devan, fontWeight: 700,
              fontSize: 13, color: p.stamp, lineHeight: 1, letterSpacing: '.02em',
            }}>जुगाडू</div>
            <div style={{
              fontFamily: PAPER_FONTS.display, fontSize: 32, lineHeight: 1, marginTop: 2, color: p.ink,
            }}>Jugaadu<span style={{ color: p.stamp }}>.</span></div>
          </div>
        </div>
        <nav style={{
          display: 'flex', alignItems: 'center', gap: 26,
          fontFamily: PAPER_FONTS.mono, fontSize: 12, color: p.inkSoft,
        }}>
          <button onClick={startGoogleSignIn} style={{
            background: p.ink, color: p.paper, padding: '10px 18px',
            border: `2px solid ${p.ink}`, fontFamily: PAPER_FONTS.display,
            fontSize: 15, cursor: 'pointer', boxShadow: `4px 4px 0 ${p.marigold}`,
          }}>Get a crew →</button>
        </nav>
      </div>
      <div style={{ height: 14 }}/>
      <InkRule3 p={p}/>
    </header>
  );
}

function Footer3({ p }) {
  return (
    <footer style={{ padding: '20px 56px 32px' }}>
      <InkRule3 p={p}/>
      <div style={{
        marginTop: 14, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
        fontFamily: PAPER_FONTS.mono, fontSize: 11, letterSpacing: '.14em',
        textTransform: 'uppercase', color: p.inkMute,
      }}>
        <span>© 2026 Jugaadu · a personal OS for the ambitious</span>
        <span>Built in public · weekly on x</span>
        <span>hello@jugaadu.app</span>
      </div>
    </footer>
  );
}

/* ─────────────────────── shared CTA + ambitions banner ─────────────────────── */

function AmbitionsBanner({ p }) {
  /* a marquee-style strip of who Jugaadu is for */
  const cohorts = [
    'founders', 'staff engineers', 'PMs · L5 → L6', 'designers ratio-ing on X', 'solo consultants',
    'researchers shipping in public', 'first-job hustlers', 'creators with day jobs',
    'IC ladder climbers', 'people writing their first essay', 'people closing their next round',
  ];
  return (
    <div style={{
      borderTop: `1px solid ${p.ink}`, borderBottom: `1px solid ${p.ink}`,
      padding: '12px 0', background: p.ink, color: p.paper, overflow: 'hidden',
      position: 'relative',
    }}>
      <div style={{
        display: 'flex', gap: 36, whiteSpace: 'nowrap', width: 'max-content',
        animation: 'ambition-marquee 38s linear infinite',
        fontFamily: PAPER_FONTS.display, fontSize: 22, alignItems: 'center',
      }}>
        {[...cohorts, ...cohorts, ...cohorts].map((c, i) => (
          <Fragment key={i}>
            <span style={{ color: p.paper }}>{c}</span>
            <span style={{ color: p.marigold, fontFamily: PAPER_FONTS.mono, fontSize: 12 }}>◆</span>
          </Fragment>
        ))}
      </div>
      <style>{`@keyframes ambition-marquee { to { transform: translateX(-33.333%); } }`}</style>
    </div>
  );
}

function CTABlock({ p }) {
  const router = useRouter();
  return (
    <section style={{ padding: '64px 56px 48px', position: 'relative', textAlign: 'center' }}>
      <div style={{
        fontFamily: PAPER_FONTS.devan, fontWeight: 700,
        fontSize: 22, color: p.stamp, marginBottom: 10,
      }}>जो ambitious है, उसके लिए</div>
      <h2 style={{
        margin: 0, fontFamily: PAPER_FONTS.display,
        fontSize: 'clamp(56px, 6.4vw, 108px)', lineHeight: .9, letterSpacing: '-.025em',
        maxWidth: 1100, marginInline: 'auto', color: p.ink,
      }}>
        Your future is on staff <span style={{ fontStyle: 'italic', color: p.stamp }}>now.</span>
      </h2>
      <p style={{
        marginTop: 18, fontFamily: PAPER_FONTS.serifAlt, fontStyle: 'italic',
        fontSize: 22, color: p.tea,
      }}>Free during beta. First 250 keep three agents free forever.</p>
      <div style={{ marginTop: 28, display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <input placeholder="you@anywhere.com" style={{
          background: p.card, border: `3px solid ${p.ink}`, padding: '16px 22px',
          fontFamily: PAPER_FONTS.serifAlt, fontSize: 22, width: 320, outline: 'none',
          color: p.ink,
        }}/>
        <button onClick={() => startGoogleSignIn()} style={{
          background: p.stamp, color: p.paper, padding: '18px 26px',
          border: `3px solid ${p.ink}`, fontFamily: PAPER_FONTS.display, fontSize: 22,
          cursor: 'pointer', boxShadow: `6px 6px 0 ${p.ink}`,
        }}>Hire your crew →</button>
      </div>
    </section>
  );
}

/* ╔══════════════════════════════════════════════════════════════════╗
   ║   VARIANT A · WORKSPACE                                          ║
   ╚══════════════════════════════════════════════════════════════════╝ */

function WorkspaceLanding({ p, headline, foreground, dark }) {
  return (
    <div className="scroll" style={{
      flex: 1, overflow: 'auto', background: p.paper, color: p.ink,
      fontFamily: PAPER_FONTS.sans,
      backgroundImage: dark
        ? `radial-gradient(circle at 14% 18%, rgba(241,231,210,.05) 0, transparent 38%),
           radial-gradient(circle at 86% 64%, rgba(241,231,210,.04) 0, transparent 42%)`
        : `radial-gradient(circle at 12% 18%, rgba(110,80,40,.06) 0, transparent 38%),
           radial-gradient(circle at 88% 64%, rgba(110,80,40,.05) 0, transparent 42%),
           repeating-linear-gradient(0deg, rgba(0,0,0,.012) 0 1px, transparent 1px 3px)`,
    }}>
      <Masthead3 p={p} mode="workspace"/>
      <WorkspaceHero p={p} headline={headline} foreground={foreground}/>
      <AmbitionsBanner p={p}/>
      <AppsOnStage p={p} foreground={foreground}/>
      <WhatShipsToday p={p} foreground={foreground}/>
      <DualityRow p={p}/>
      <CTABlock p={p}/>
      <Footer3 p={p}/>
    </div>
  );
}

function WorkspaceHero({ p, headline, foreground }) {
  const router = useRouter();
  return (
    <section style={{ padding: '40px 56px 28px', position: 'relative', overflow: 'hidden' }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        background: p.ink, color: p.paper, padding: '6px 14px',
        fontFamily: PAPER_FONTS.mono, fontSize: 11, letterSpacing: '.18em',
        textTransform: 'uppercase',
      }}>
        <span style={{
          width: 7, height: 7, borderRadius: 999, background: p.marigold,
          animation: 'pulseDot 1.2s ease-in-out infinite',
        }}/>
        {headline.eyebrow}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 560px)',
        gap: 36, marginTop: 22, alignItems: 'start',
      }}>
        <div>
          <h1 style={{
            margin: 0,
            fontFamily: PAPER_FONTS.display,
            fontSize: 'clamp(56px, 6vw, 104px)',
            lineHeight: .92, letterSpacing: '-.025em', color: p.ink,
            textWrap: 'balance',
          }}>
            {headline.pre}
            <br/>
            <span style={{
              display: 'inline-block', background: p.marigold, color: p.ink,
              padding: '0 .14em', transform: 'skew(-4deg)',
            }}>{headline.main}</span>
            <br/>
            <span style={{ fontStyle: 'italic', color: p.stamp }}>{headline.italic}</span>
          </h1>

          <div style={{ marginTop: 26, display: 'grid', gridTemplateColumns: '6px 1fr', gap: 18 }}>
            <div style={{ background: p.ink }}/>
            <p style={{
              margin: 0, fontFamily: PAPER_FONTS.serifAlt,
              fontSize: 22, lineHeight: 1.35, color: p.inkSoft, maxWidth: 560,
            }}>
              {headline.sub}
            </p>
          </div>

          <div style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <button onClick={() => startGoogleSignIn()} style={{
              background: p.stamp, color: p.paper, padding: '14px 22px',
              border: `2px solid ${p.ink}`, fontFamily: PAPER_FONTS.display, fontSize: 22,
              cursor: 'pointer', boxShadow: `6px 6px 0 ${p.ink}`, display: 'flex', alignItems: 'center', gap: 10,
            }}>Open the workspace <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 18 }}>→</span></button>
            <span style={{
              fontFamily: PAPER_FONTS.caveat, fontSize: 22, color: p.tea,
              transform: 'rotate(-1deg)', display: 'inline-block',
            }}>no card · 14-day no-questions exit ↗</span>
          </div>

          <LiveStrip p={p}/>
        </div>

        <WorkspaceWindow p={p} foreground={foreground}/>
      </div>
    </section>
  );
}

function LiveStrip({ p }) {
  return (
    <div style={{
      marginTop: 36, display: 'flex', gap: 28,
      fontFamily: PAPER_FONTS.mono, fontSize: 12,
      letterSpacing: '.06em', textTransform: 'uppercase', color: p.inkMute,
      flexWrap: 'wrap',
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <Dot3 color={p.stamp}/>
        <span><b style={{ color: p.ink }}>2,847</b> applications sent · 7d</span>
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <Dot3 color={p.marigold}/>
        <span><b style={{ color: p.ink }}>184</b> essays shipped · 7d</span>
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <Dot3 color={p.leaf}/>
        <span><b style={{ color: p.ink }}>1,402</b> briefs read · 7d</span>
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <Dot3 color={p.tea}/>
        <span><b style={{ color: p.ink }}>619</b> drills passed · 7d</span>
      </span>
    </div>
  );
}

/* The visual centerpiece: a mock OS window with 4 agent panes tiled inside. */
function WorkspaceWindow({ p, foreground }) {
  const fg = foreground.map((id) => AGENTS_V3.find((a) => a.id === id)).filter(Boolean);
  while (fg.length < 4) fg.push(AGENTS_V3[fg.length]); // safety
  return (
    <div style={{
      borderRadius: 14, overflow: 'hidden',
      background: p.card, border: `2px solid ${p.ink}`,
      boxShadow: `10px 10px 0 ${p.ink}, 10px 10px 0 3px ${p.marigold}`,
      transform: 'rotate(.4deg)',
    }}>
      {/* title bar */}
      <div style={{
        background: p.ink, color: p.paper,
        padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 12,
        borderBottom: `2px solid ${p.ink}`,
      }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{ width: 11, height: 11, borderRadius: 999, background: p.stamp }}/>
          <span style={{ width: 11, height: 11, borderRadius: 999, background: p.marigold }}/>
          <span style={{ width: 11, height: 11, borderRadius: 999, background: p.leaf }}/>
        </div>
        <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 12, letterSpacing: '.06em' }}>
          sam's crew · 4 agents · 11:42 IST · ~ 2h saved today
        </div>
        <div style={{ marginLeft: 'auto', fontFamily: PAPER_FONTS.mono, fontSize: 11, opacity: .65 }}>
          ⌘K
        </div>
      </div>

      {/* tabbed sub-header */}
      <div style={{
        display: 'flex', gap: 0, borderBottom: `1px solid ${p.rule}`,
        background: p.paperShade,
      }}>
        {['Today', 'Apply', 'Publish', 'Brief', 'Learn'].map((tab, i) => (
          <div key={tab} style={{
            padding: '8px 14px',
            fontFamily: PAPER_FONTS.mono, fontSize: 11, letterSpacing: '.06em',
            color: i === 0 ? p.ink : p.inkMute,
            borderRight: `1px solid ${p.rule}`,
            background: i === 0 ? p.card : 'transparent',
            borderBottom: i === 0 ? `2px solid ${p.stamp}` : '2px solid transparent',
            marginBottom: -1,
          }}>{tab.toUpperCase()}</div>
        ))}
      </div>

      {/* 2x2 agent panes */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr',
        background: p.rule, gap: 1, minHeight: 480,
      }}>
        {fg.slice(0, 4).map((a, i) => (
          <AgentPane key={a.id} p={p} agent={a} idx={i}/>
        ))}
      </div>

      {/* status bar */}
      <div style={{
        background: p.paperDeep, padding: '8px 14px',
        display: 'flex', alignItems: 'center', gap: 16,
        fontFamily: PAPER_FONTS.mono, fontSize: 10, color: p.inkMute,
        letterSpacing: '.08em', textTransform: 'uppercase',
        borderTop: `1px solid ${p.rule}`,
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Dot3 color={p.leaf}/> 4 agents online
        </span>
        <span>· 2h 14m saved today</span>
        <span>· ₹0 spent</span>
        <span style={{ marginLeft: 'auto', color: p.stamp }}>● recording</span>
      </div>
    </div>
  );
}

function AgentPane({ p, agent: a, idx }) {
  const c = color(p, a.color);
  /* Per-agent body — give each pane a distinct, on-brand mini visualization */
  const Body = () => {
    if (a.id === 'apply')    return <ApplyPane    p={p} c={c}/>;
    if (a.id === 'lekhak')   return <LekhakPane   p={p} c={c}/>;
    if (a.id === 'patrakar') return <PatrakarPane p={p} c={c}/>;
    if (a.id === 'guru')     return <GuruPane     p={p} c={c}/>;
    if (a.id === 'khoji')    return <KhojiPane    p={p} c={c}/>;
    if (a.id === 'mausi')    return <MausiPane    p={p} c={c}/>;
    if (a.id === 'pandit_q') return <PanditPane   p={p} c={c}/>;
    if (a.id === 'opps')     return <OppsPane     p={p} c={c}/>;
    return <FallbackPane p={p} c={c} a={a}/>;
  };
  return (
    <div style={{
      background: p.card, position: 'relative', overflow: 'hidden',
      padding: 0, display: 'flex', flexDirection: 'column',
    }}>
      {/* pane header */}
      <div style={{
        padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: `1px solid ${p.rule}`,
      }}>
        <span style={{
          width: 22, height: 22, borderRadius: 5, background: c, color: '#fff',
          display: 'grid', placeItems: 'center', fontFamily: PAPER_FONTS.display, fontSize: 13,
        }}>{a.glyph}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 14, color: p.ink, lineHeight: 1 }}>{a.name}</div>
          <div style={{
            fontFamily: PAPER_FONTS.devan, fontSize: 11, color: p.tea,
            marginTop: 1,
          }}>{a.desi}</div>
        </div>
        <span style={{
          fontFamily: PAPER_FONTS.mono, fontSize: 9, color: c,
          letterSpacing: '.08em',
        }}>● live</span>
      </div>
      <div style={{ flex: 1, padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
        <Body/>
      </div>
    </div>
  );
}

/* Mini pane bodies — each is distinct, not just a card with text */

function ApplyPane({ p, c }) {
  return (
    <>
      <div style={{
        fontFamily: PAPER_FONTS.mono, fontSize: 10, color: p.inkMute,
        letterSpacing: '.06em',
      }}>JOB ↗ stripe.com/jobs/staff-pd-atlas</div>
      <div style={{
        marginTop: 2, padding: 10, background: p.paperShade, borderRadius: 6,
        border: `1px solid ${p.rule}`,
      }}>
        <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 17, color: p.ink, lineHeight: 1.1 }}>
          Staff Product Designer · Atlas
        </div>
        <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 10, color: p.inkMute, marginTop: 4, letterSpacing: '.04em' }}>
          NYC · $260–340k · posted 1d
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
        {[
          ['résumé', 100],
          ['person', 100],
          ['email',  100],
          ['draft',  78],
        ].map(([k, v], i) => (
          <span key={k} style={{
            fontFamily: PAPER_FONTS.mono, fontSize: 10,
            padding: '3px 8px', borderRadius: 999,
            border: `1px solid ${v === 100 ? c : p.rule}`,
            color: v === 100 ? c : p.inkMute, letterSpacing: '.04em',
            background: v === 100 ? `${c}14` : 'transparent',
          }}>{k} · {v}%</span>
        ))}
      </div>
      <div style={{
        marginTop: 'auto', padding: '8px 10px', background: p.ink, color: p.paper,
        borderRadius: 6, fontFamily: PAPER_FONTS.mono, fontSize: 10,
        letterSpacing: '.04em', display: 'flex', justifyContent: 'space-between',
      }}>
        <span>→ anika@stripe.com · 96% verified</span>
        <span style={{ color: p.marigold }}>send ↵</span>
      </div>
    </>
  );
}

function LekhakPane({ p, c }) {
  return (
    <>
      <div style={{
        fontFamily: PAPER_FONTS.mono, fontSize: 10, color: p.inkMute,
        letterSpacing: '.06em',
      }}>DRAFT · 1,840 words · in your voice</div>
      <div style={{
        marginTop: 2, padding: '10px 12px', background: p.paperShade, borderRadius: 6,
        border: `1px solid ${p.rule}`, position: 'relative', minHeight: 110,
      }}>
        <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 16, color: p.ink, lineHeight: 1.1 }}>
          Why batch beats real-time
        </div>
        <p style={{
          margin: '6px 0 0', fontFamily: PAPER_FONTS.serif, fontSize: 11.5,
          color: p.inkSoft, lineHeight: 1.35, fontStyle: 'italic',
        }}>
          We added a queue because we thought latency was the problem. Latency was the symptom. The problem was that we were doing each job as if it were the only job…
        </p>
        <div style={{ position: 'absolute', right: 8, bottom: 8, fontFamily: PAPER_FONTS.mono, fontSize: 9, color: p.inkMute }}>
          p. 1 / 4
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        {[
          ['Substack', 'long form'],
          ['LinkedIn', 'punchier'],
          ['X thread', '8 posts'],
        ].map(([dest, hint]) => (
          <div key={dest} style={{
            flex: 1, padding: '6px 8px', border: `1px solid ${p.rule}`, borderRadius: 6,
            background: p.card,
          }}>
            <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 9, color: c, letterSpacing: '.06em' }}>{dest.toUpperCase()}</div>
            <div style={{ fontFamily: PAPER_FONTS.serif, fontStyle: 'italic', fontSize: 10.5, color: p.inkSoft, lineHeight: 1.2, marginTop: 1 }}>{hint}</div>
          </div>
        ))}
      </div>
      <div style={{
        marginTop: 'auto', padding: '8px 10px', background: `${c}1f`,
        border: `1px solid ${c}4d`, borderRadius: 6,
        fontFamily: PAPER_FONTS.mono, fontSize: 10, color: p.ink,
      }}>queued for Tue 9:00 IST · all platforms</div>
    </>
  );
}

function PatrakarPane({ p, c }) {
  const items = [
    { tag: 'AI · AGENTS', t: 'OpenAI ships agent SDK v2 · breaking change in tool spec' },
    { tag: 'PAYMENTS',    t: 'RBI updates UPI mandate flow · what changes for merchants' },
    { tag: 'PEOPLE',      t: 'Anika Mehta promoted to Sr PD · likely replied within a day' },
    { tag: 'YOUR WORK',   t: 'Linear copied the keyboard pattern you wrote about in feb' },
  ];
  return (
    <>
      <div style={{
        fontFamily: PAPER_FONTS.mono, fontSize: 10, color: p.inkMute,
        letterSpacing: '.06em',
      }}>TUESDAY BRIEF · 4 STORIES · 12 SOURCES</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((it, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            padding: '6px 0',
            borderBottom: i === items.length - 1 ? 'none' : `1px solid ${p.rule}`,
          }}>
            <span style={{
              fontFamily: PAPER_FONTS.mono, fontSize: 9, color: c,
              letterSpacing: '.08em', minWidth: 64, paddingTop: 2,
            }}>{it.tag}</span>
            <span style={{
              fontFamily: PAPER_FONTS.serif, fontSize: 12.5, color: p.ink, lineHeight: 1.3,
            }}>{it.t}</span>
          </div>
        ))}
      </div>
      <div style={{
        marginTop: 'auto', padding: '8px 10px', background: p.paperShade,
        borderRadius: 6, fontFamily: PAPER_FONTS.mono, fontSize: 10, color: p.inkSoft,
        display: 'flex', justifyContent: 'space-between',
      }}>
        <span>7 min read · charts inside</span>
        <span style={{ color: c }}>open ↗</span>
      </div>
    </>
  );
}

function GuruPane({ p, c }) {
  return (
    <>
      <div style={{
        fontFamily: PAPER_FONTS.mono, fontSize: 10, color: p.inkMute,
        letterSpacing: '.06em',
      }}>THIS WEEK · DISTRIBUTED SYSTEMS · WK 1/6</div>
      <div style={{
        padding: 10, background: p.paperShade, borderRadius: 6, border: `1px solid ${p.rule}`,
      }}>
        <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 16, color: p.ink, lineHeight: 1.1 }}>
          When CAP is a smell
        </div>
        <div style={{ fontFamily: PAPER_FONTS.serif, fontStyle: 'italic', fontSize: 12, color: p.inkSoft, marginTop: 4, lineHeight: 1.3 }}>
          12 min read · because Stripe asked you a quorum question on Tue
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {[
          ['DRILL 1', 'design a 3-node bank ledger', 'done'],
          ['DRILL 2', "explain Raft to a PM", 'today'],
          ['DRILL 3', 'spot the split-brain', 'thu'],
        ].map(([n, t, when], i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px',
            border: `1px solid ${p.rule}`, borderRadius: 6,
            background: when === 'done' ? `${c}14` : 'transparent',
          }}>
            <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 9, color: c, letterSpacing: '.06em', minWidth: 48 }}>{n}</span>
            <span style={{ fontFamily: PAPER_FONTS.serif, fontStyle: 'italic', fontSize: 11.5, color: p.ink, flex: 1, lineHeight: 1.2 }}>{t}</span>
            <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 9, color: p.inkMute, letterSpacing: '.06em' }}>{when}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 'auto', fontFamily: PAPER_FONTS.caveat, fontSize: 17, color: p.tea, transform: 'rotate(-1deg)' }}>
        you're 34% sharper than 3 weeks ago ↗
      </div>
    </>
  );
}

function KhojiPane({ p, c }) {
  return (
    <>
      <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 10, color: p.inkMute, letterSpacing: '.06em' }}>
        WARM PATHS · YOU → ANTHROPIC · 3 ROUTES
      </div>
      <div style={{
        flex: 1, padding: 12, background: p.paperShade, borderRadius: 6,
        border: `1px solid ${p.rule}`, position: 'relative', overflow: 'hidden',
      }}>
        <svg viewBox="0 0 240 140" style={{ width: '100%', height: '100%' }}>
          <line x1="20"  y1="70" x2="120" y2="40" stroke={c} strokeWidth="1.5"/>
          <line x1="20"  y1="70" x2="120" y2="100" stroke={c} strokeWidth="1.5" strokeDasharray="3 3"/>
          <line x1="120" y1="40" x2="220" y2="70" stroke={c} strokeWidth="1.5"/>
          <line x1="120" y1="100" x2="220" y2="70" stroke={c} strokeWidth="1.5" strokeDasharray="3 3"/>
          {[[20,70,'you'], [120,40,'Anika'], [120,100,'Ravi'], [220,70,'Anthropic']].map(([x,y,l], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r="9" fill={i === 0 || i === 3 ? p.ink : c}/>
              <text x={x} y={y+22} fill={p.ink} fontSize="9" textAnchor="middle"
                fontFamily="'JetBrains Mono', monospace">{l}</text>
            </g>
          ))}
        </svg>
      </div>
      <div style={{
        padding: '8px 10px', background: p.card, border: `1px solid ${c}44`, borderRadius: 6,
        fontFamily: PAPER_FONTS.mono, fontSize: 10, color: p.ink,
      }}>best path · Anika · 2-hop · last DM 9mo</div>
    </>
  );
}

function MausiPane({ p, c }) {
  return (
    <>
      <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 10, color: p.inkMute, letterSpacing: '.06em' }}>
        STRIPE OFFER · L5 NYC · 18% UNDER BAND
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 88, padding: '4px 4px 0' }}>
        {[60, 72, 78, 86, 92, 100].map((h, i) => (
          <div key={i} style={{ flex: 1, height: `${h}%`, background: i === 3 ? p.stamp : c, opacity: i === 3 ? 1 : .35, borderRadius: '4px 4px 0 0' }}/>
        ))}
      </div>
      <div style={{
        padding: '8px 10px', background: p.paperShade, borderRadius: 6,
        fontFamily: PAPER_FONTS.serif, fontStyle: 'italic', fontSize: 12, color: p.inkSoft, lineHeight: 1.35,
      }}>
        "I'm excited about the role and the team. The number that gets there for me is <b style={{ color: p.ink, fontStyle: 'normal' }}>$315k base</b>…"
      </div>
      <div style={{ marginTop: 'auto', fontFamily: PAPER_FONTS.mono, fontSize: 10, color: c, letterSpacing: '.04em' }}>
        3 counter-paths drafted ↗
      </div>
    </>
  );
}

function PanditPane({ p, c }) {
  return (
    <>
      <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 10, color: p.inkMute, letterSpacing: '.06em' }}>
        MOCK · BEHAVIOURAL · ROUND 7
      </div>
      <div style={{
        padding: 10, background: p.paperShade, borderRadius: 6, border: `1px solid ${p.rule}`,
      }}>
        <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 14, color: p.ink, lineHeight: 1.1 }}>
          "Tell me about your biggest failure."
        </div>
      </div>
      <div style={{
        padding: '8px 10px', background: p.card, border: `1px solid ${c}44`, borderRadius: 6,
        fontFamily: PAPER_FONTS.serif, fontStyle: 'italic', fontSize: 12, color: p.inkSoft, lineHeight: 1.35,
      }}>
        gentle truth — that was a story about being wronged, not about failing. drill again with the Razorpay launch?
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', gap: 6 }}>
        <span style={{ flex: 1, padding: '6px 8px', textAlign: 'center', background: c, color: '#fff', borderRadius: 6, fontFamily: PAPER_FONTS.mono, fontSize: 10 }}>retry ↻</span>
        <span style={{ flex: 1, padding: '6px 8px', textAlign: 'center', border: `1px solid ${p.rule}`, color: p.inkSoft, borderRadius: 6, fontFamily: PAPER_FONTS.mono, fontSize: 10 }}>skip ↷</span>
      </div>
    </>
  );
}

function OppsPane({ p, c }) {
  const rows = [
    { kind: 'ROLE',   t: 'Founding Designer · Recall.ai',  meta: 'YC W24 · $190k' },
    { kind: 'PANEL',  t: "Speak at IndiaFOSS '26",          meta: 'pays · 600 ppl' },
    { kind: 'GHOST',  t: '6-essay ghostwrite for VC fund',  meta: '$2k/essay'      },
  ];
  return (
    <>
      <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 10, color: p.inkMute, letterSpacing: '.06em' }}>
        FRESH · 3 OF 7 MATCHED THIS MORNING
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{
          padding: '7px 10px', background: p.paperShade, borderRadius: 6,
          border: `1px solid ${p.rule}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 9, color: c, letterSpacing: '.08em' }}>{r.kind}</span>
            <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 9, color: p.inkMute }}>{r.meta}</span>
          </div>
          <div style={{ fontFamily: PAPER_FONTS.serif, fontSize: 13, color: p.ink, lineHeight: 1.2, marginTop: 1 }}>{r.t}</div>
        </div>
      ))}
    </>
  );
}

function FallbackPane({ p, c, a }) {
  return (
    <>
      <div style={{ fontFamily: PAPER_FONTS.serif, fontStyle: 'italic', fontSize: 13, color: p.inkSoft, lineHeight: 1.4 }}>
        {a.teaser}
      </div>
      <div style={{
        marginTop: 'auto', padding: '8px 10px', background: `${c}1a`,
        border: `1px solid ${c}44`, borderRadius: 6,
        fontFamily: PAPER_FONTS.mono, fontSize: 10, color: p.ink,
      }}>{a.output.title} · {a.output.meta}</div>
    </>
  );
}

/* ─────────────────────── apps on stage (all 8 agents grid) ─────────────────────── */

function AppsOnStage({ p, foreground }) {
  return (
    <section style={{ padding: '32px 56px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <div style={{
            fontFamily: PAPER_FONTS.mono, fontSize: 11,
            letterSpacing: '.22em', textTransform: 'uppercase', color: p.stamp, marginBottom: 8,
          }}>⸻ Apps on stage · the full crew ⸻</div>
          <h2 style={{
            margin: 0, fontFamily: PAPER_FONTS.display,
            fontSize: 'clamp(40px, 4.4vw, 64px)', lineHeight: .94, letterSpacing: '-.02em', color: p.ink,
          }}>
            Eight agents. <span style={{ fontStyle: 'italic', color: p.stamp }}>One you.</span>
          </h2>
        </div>
        <Stamp3 p={p} c={p.leaf} rotate={-3}>4 live · 4 incoming</Stamp3>
      </div>

      <div style={{
        marginTop: 24, display: 'grid', gap: 10,
        gridTemplateColumns: 'repeat(4, 1fr)',
      }}>
        {AGENTS_V3.map((a) => {
          const c = color(p, a.color);
          const isHero = foreground.includes(a.id);
          const live = a.status === 'live';
          return (
            <div key={a.id} style={{
              padding: '16px 18px', background: live ? p.card : 'transparent',
              border: `2px ${live ? 'solid' : 'dashed'} ${p.ink}`,
              boxShadow: isHero ? `5px 5px 0 ${c}` : (live ? `3px 3px 0 ${p.rule}` : 'none'),
              position: 'relative', minHeight: 156,
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 7, background: live ? c : 'transparent',
                  color: live ? '#fff' : p.inkMute, border: live ? 'none' : `1px dashed ${p.inkMute}`,
                  display: 'grid', placeItems: 'center', fontFamily: PAPER_FONTS.display, fontSize: 18,
                }}>{a.glyph}</div>
                <span style={{
                  fontFamily: PAPER_FONTS.mono, fontSize: 9, letterSpacing: '.14em',
                  padding: '3px 7px', border: `1px solid ${live ? p.ink : p.inkMute}`,
                  color: live ? p.ink : p.inkMute,
                  background: isHero ? p.marigold : 'transparent',
                }}>
                  {isHero ? 'FOREGROUND' : (live ? 'READY' : 'INCOMING')}
                </span>
              </div>
              <div>
                <div style={{ fontFamily: PAPER_FONTS.devan, fontSize: 12, color: p.tea, fontWeight: 700 }}>{a.desi}</div>
                <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 22, lineHeight: 1.05, color: p.ink }}>{a.name}</div>
              </div>
              <p style={{
                margin: 'auto 0 0', fontFamily: PAPER_FONTS.serifAlt,
                fontSize: 14, fontStyle: 'italic', color: p.inkSoft, lineHeight: 1.3,
              }}>{a.role}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ─────────────────────── what ships today (workspace) ─────────────────────── */

function WhatShipsToday({ p, foreground }) {
  const fg = foreground.map((id) => AGENTS_V3.find((a) => a.id === id)).filter(Boolean);
  return (
    <section style={{ padding: '32px 56px 24px', background: p.paperDeep, marginTop: 28 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
        <h2 style={{
          margin: 0, fontFamily: PAPER_FONTS.display,
          fontSize: 'clamp(40px, 4.4vw, 64px)', lineHeight: .94, letterSpacing: '-.02em', color: p.ink,
        }}>
          A normal Tuesday<span style={{ color: p.stamp }}>.</span>
          <div style={{
            fontFamily: PAPER_FONTS.serifAlt, fontStyle: 'italic',
            fontSize: 22, color: p.tea, fontWeight: 400, marginTop: 8, letterSpacing: 0,
          }}>What your crew ships before your second coffee.</div>
        </h2>
        <Stamp3 p={p} c={p.ink} rotate={3}>0 keystrokes from you</Stamp3>
      </div>

      <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {fg.map((a) => {
          const c = color(p, a.color);
          return (
            <div key={a.id} style={{
              padding: 16, background: p.card, border: `2px solid ${p.ink}`,
              boxShadow: `5px 5px 0 ${c}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 9, color: c, letterSpacing: '.14em' }}>
                  {a.output.kind.toUpperCase()}
                </span>
                <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 9, color: p.inkMute, letterSpacing: '.06em' }}>
                  09:0{Math.floor(Math.random()*5)+2} IST
                </span>
              </div>
              <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 22, lineHeight: 1.1, marginTop: 6, color: p.ink }}>
                {a.output.title}
              </div>
              <div style={{ fontFamily: PAPER_FONTS.serif, fontStyle: 'italic', fontSize: 13, color: p.inkSoft, marginTop: 4 }}>
                {a.output.meta}
              </div>
              <div style={{
                marginTop: 14, fontFamily: PAPER_FONTS.mono, fontSize: 10, color: p.ink,
                letterSpacing: '.06em', display: 'flex', justifyContent: 'space-between',
              }}>
                <span>by {a.desi}</span>
                <span style={{ color: c }}>open ↗</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ─────────────────────── duality row · leverage + growth ─────────────────────── */

function DualityRow({ p }) {
  return (
    <section style={{ padding: '60px 56px 28px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={{
          padding: '36px 36px 30px', background: p.ink, color: p.paper,
          position: 'relative',
        }}>
          <div style={{
            fontFamily: PAPER_FONTS.mono, fontSize: 11,
            letterSpacing: '.22em', textTransform: 'uppercase', color: p.marigold,
          }}>⸻ today ⸻</div>
          <h3 style={{
            margin: '10px 0 0', fontFamily: PAPER_FONTS.display,
            fontSize: 'clamp(40px, 4.4vw, 64px)', lineHeight: .94, letterSpacing: '-.02em',
          }}>
            Leverage.
          </h3>
          <p style={{ margin: '14px 0 0', fontFamily: PAPER_FONTS.serifAlt, fontStyle: 'italic', fontSize: 22, lineHeight: 1.35 }}>
            The hours you used to spend on the boring half of your ambition — applications, follow-ups, draft 3, browsing — handled by a crew that doesn't burn out.
          </p>
          <div style={{
            position: 'absolute', right: 24, bottom: 24,
            fontFamily: PAPER_FONTS.devan, fontSize: 32, fontWeight: 700, color: p.marigold,
          }}>आज</div>
        </div>
        <div style={{
          padding: '36px 36px 30px', background: p.card, color: p.ink,
          border: `2px solid ${p.ink}`, position: 'relative',
        }}>
          <div style={{
            fontFamily: PAPER_FONTS.mono, fontSize: 11,
            letterSpacing: '.22em', textTransform: 'uppercase', color: p.stamp,
          }}>⸻ tomorrow ⸻</div>
          <h3 style={{
            margin: '10px 0 0', fontFamily: PAPER_FONTS.display,
            fontSize: 'clamp(40px, 4.4vw, 64px)', lineHeight: .94, letterSpacing: '-.02em',
          }}>
            <span style={{ fontStyle: 'italic', color: p.stamp }}>Compound.</span>
          </h3>
          <p style={{ margin: '14px 0 0', fontFamily: PAPER_FONTS.serifAlt, fontStyle: 'italic', fontSize: 22, lineHeight: 1.35, color: p.inkSoft }}>
            While the crew works, you publish. You're briefed. You drill. A year of this and you are not "less busy" — you are <span style={{ color: p.ink, fontStyle: 'normal', fontWeight: 600 }}>visibly ahead.</span>
          </p>
          <div style={{
            position: 'absolute', right: 24, bottom: 24,
            fontFamily: PAPER_FONTS.devan, fontSize: 32, fontWeight: 700, color: p.stamp,
          }}>कल</div>
        </div>
      </div>
    </section>
  );
}

/* ╔══════════════════════════════════════════════════════════════════╗
   ║   VARIANT B · NEWSROOM                                           ║
   ╚══════════════════════════════════════════════════════════════════╝ */

function NewsroomLanding({ p, headline, foreground }) {
  return (
    <div className="scroll" style={{
      flex: 1, overflow: 'auto', background: p.paper, color: p.ink,
      fontFamily: PAPER_FONTS.sans,
    }}>
      <Masthead3 p={p} mode="newsroom"/>
      <NewsroomHero p={p} headline={headline}/>
      <AmbitionsBanner p={p}/>
      <ChapterStack p={p} foreground={foreground}/>
      <ManifestoBlock p={p}/>
      <CTABlock p={p}/>
      <Footer3 p={p}/>
    </div>
  );
}

function NewsroomHero({ p, headline }) {
  const router = useRouter();
  return (
    <section style={{ padding: '40px 56px 24px' }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        background: p.ink, color: p.paper, padding: '6px 14px',
        fontFamily: PAPER_FONTS.mono, fontSize: 11, letterSpacing: '.18em',
        textTransform: 'uppercase',
      }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: p.marigold, animation: 'pulseDot 1.2s ease-in-out infinite' }}/>
        {headline.eyebrow}
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
        gap: 48, marginTop: 22, alignItems: 'start',
      }}>
        <div>
          <h1 style={{
            margin: 0,
            fontFamily: PAPER_FONTS.display,
            fontSize: 'clamp(64px, 7vw, 132px)',
            lineHeight: .9, letterSpacing: '-.03em', color: p.ink,
            textWrap: 'balance',
          }}>
            {headline.pre}{' '}
            <span style={{
              display: 'inline-block', background: p.marigold, color: p.ink,
              padding: '0 .14em', transform: 'skew(-4deg)',
            }}>{headline.main}</span>
            <br/>
            <span style={{ fontStyle: 'italic', color: p.stamp }}>{headline.italic}</span>
          </h1>
          <div style={{
            marginTop: 28, display: 'grid', gridTemplateColumns: '6px 1fr', gap: 18, maxWidth: 720,
          }}>
            <div style={{ background: p.ink }}/>
            <p style={{
              margin: 0, fontFamily: PAPER_FONTS.serifAlt,
              fontSize: 24, lineHeight: 1.35, color: p.inkSoft,
            }}>
              {headline.sub} <span style={{ fontFamily: PAPER_FONTS.devan, color: p.stamp, fontWeight: 700 }}>आपके लिए, हर रोज़।</span>
            </p>
          </div>

          <div style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <button onClick={() => startGoogleSignIn()} style={{
              background: p.ink, color: p.paper, padding: '14px 22px',
              border: `2px solid ${p.ink}`, fontFamily: PAPER_FONTS.display, fontSize: 22,
              cursor: 'pointer', boxShadow: `6px 6px 0 ${p.marigold}, 6px 6px 0 3px ${p.ink}`,
            }}>Get on the staff →</button>
            <span style={{ fontFamily: PAPER_FONTS.caveat, fontSize: 22, color: p.tea, transform: 'rotate(-1deg)', display: 'inline-block' }}>
              read this week's issue first ↗
            </span>
          </div>
        </div>

        <ContentsCard p={p}/>
      </div>
    </section>
  );
}

function ContentsCard({ p }) {
  const rows = [
    { no: 'Ch. 01', en: 'Apply',   hi: 'अप्लाई कारवाँ', body: 'paste a job, ship a pitch', c: p.stamp },
    { no: 'Ch. 02', en: 'Publish', hi: 'लेखक भाई',       body: 'your essay, on your byline', c: p.marigold },
    { no: 'Ch. 03', en: 'Brief',   hi: 'पत्रकार',          body: 'a daily report on your world', c: p.leaf },
    { no: 'Ch. 04', en: 'Learn',   hi: 'गुरु',               body: 'the next skill, on a drip', c: p.tea },
  ];
  return (
    <div style={{
      background: p.card, border: `2px solid ${p.ink}`,
      boxShadow: `8px 8px 0 ${p.ink}`, padding: '20px 24px',
      transform: 'rotate(-.6deg)',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontFamily: PAPER_FONTS.mono, fontSize: 10, color: p.inkMute, letterSpacing: '.1em',
      }}>
        <span>INSIDE THIS ISSUE</span>
        <span>VOL. II · NO. 01</span>
      </div>
      <div style={{ marginTop: 6, marginBottom: 12 }}>
        <div style={{ height: 1, background: p.ink, marginBottom: 2 }}/>
        <div style={{ height: 1, background: p.ink }}/>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((r, i) => (
          <a key={i} style={{
            display: 'grid', gridTemplateColumns: '52px 1fr auto', gap: 12, alignItems: 'baseline',
            padding: '8px 0', borderBottom: i === rows.length - 1 ? 'none' : `1px dotted ${p.inkMute}`,
            color: p.ink, textDecoration: 'none',
          }}>
            <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 11, color: r.c, letterSpacing: '.06em' }}>{r.no}</span>
            <div>
              <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 22, lineHeight: 1.05 }}>{r.en}</div>
              <div style={{ fontFamily: PAPER_FONTS.serif, fontStyle: 'italic', fontSize: 13.5, color: p.inkSoft }}>
                {r.body}
              </div>
            </div>
            <span style={{
              fontFamily: PAPER_FONTS.devan, fontSize: 13, color: r.c, fontWeight: 700, whiteSpace: 'nowrap',
            }}>{r.hi}</span>
          </a>
        ))}
      </div>
      <div style={{
        marginTop: 14, padding: 10, background: p.paperShade, borderRadius: 4,
        fontFamily: PAPER_FONTS.serif, fontStyle: 'italic', fontSize: 13, color: p.inkSoft, textAlign: 'center',
      }}>
        + four more agents waiting in the wings — <Stamp3 p={p} c={p.ink} rotate={-2} style={{ fontSize: 10, padding: '2px 6px' }}>incoming</Stamp3>
      </div>
    </div>
  );
}

/* The big move of the newsroom: each chapter is its own front page */
function ChapterStack({ p, foreground }) {
  /* Build chapters from the *first four* IDs in this canonical order, if foregrounded.
     Falls back to a fixed sequence so the layout always makes sense. */
  const canonical = ['apply', 'lekhak', 'patrakar', 'guru'];
  const ids = canonical.filter((id) => foreground.includes(id)).concat(
    foreground.filter((id) => !canonical.includes(id))
  ).slice(0, 4);
  while (ids.length < 4) ids.push(canonical[ids.length]);
  const chapters = ids.map((id, i) => ({
    n: String(i + 1).padStart(2, '0'),
    agent: AGENTS_V3.find((a) => a.id === id),
  }));

  return (
    <section style={{ padding: '24px 56px 32px' }}>
      {chapters.map((ch, i) => (
        <ChapterPage key={ch.agent.id} p={p} ch={ch} idx={i}/>
      ))}
    </section>
  );
}

function ChapterPage({ p, ch, idx }) {
  const a = ch.agent;
  const c = color(p, a.color);
  const flip = idx % 2 === 1;
  return (
    <article style={{
      marginTop: idx === 0 ? 0 : 32, padding: '28px 0',
      borderTop: `3px solid ${p.ink}`, borderBottom: `1px solid ${p.ink}`,
      position: 'relative',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        fontFamily: PAPER_FONTS.mono, fontSize: 10, color: p.inkMute,
        letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 10,
      }}>
        <span>Chapter {ch.n} · {a.desi}</span>
        <span>{a.role}</span>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: flip ? '1fr 1.1fr' : '1.1fr 1fr',
        gap: 36, alignItems: 'start',
      }}>
        <div style={{ order: flip ? 2 : 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
            <div style={{
              width: 64, height: 64, borderRadius: 14, background: c, color: '#fff',
              display: 'grid', placeItems: 'center',
              fontFamily: PAPER_FONTS.display, fontSize: 36,
              boxShadow: `4px 4px 0 ${p.ink}`,
            }}>{a.glyph}</div>
            <div>
              <div style={{ fontFamily: PAPER_FONTS.devan, fontSize: 16, color: c, fontWeight: 700 }}>{a.desi}</div>
              <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 36, lineHeight: 1, color: p.ink, marginTop: 2 }}>{a.name}</div>
            </div>
          </div>

          <h3 style={{
            margin: 0, fontFamily: PAPER_FONTS.display,
            fontSize: 'clamp(36px, 4vw, 56px)', lineHeight: .98, letterSpacing: '-.02em', color: p.ink,
          }}>
            <ChapterHeadline id={a.id} p={p}/>
          </h3>

          <p style={{
            margin: '14px 0 0', fontFamily: PAPER_FONTS.serifAlt,
            fontStyle: 'italic', fontSize: 19, lineHeight: 1.4, color: p.inkSoft, maxWidth: 520,
          }}>
            {a.teaser}
          </p>

          <ChapterSteps p={p} c={c} id={a.id}/>

          <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <button style={{
              background: 'transparent', color: p.ink, padding: '10px 16px',
              border: `2px solid ${p.ink}`, fontFamily: PAPER_FONTS.display, fontSize: 18,
              cursor: 'pointer', boxShadow: `4px 4px 0 ${c}`,
            }}>Read more →</button>
            <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.inkMute, letterSpacing: '.06em' }}>
              shipping today
            </span>
          </div>
        </div>

        <div style={{ order: flip ? 1 : 2 }}>
          <ChapterSpecimen p={p} c={c} id={a.id}/>
        </div>
      </div>
    </article>
  );
}

function ChapterHeadline({ id, p }) {
  const map = {
    apply:    <>One link in. <span style={{ fontStyle: 'italic', color: p.stamp }}>A pitch out.</span></>,
    lekhak:   <>Your half-baked notes, <span style={{ fontStyle: 'italic', color: p.marigold }}>published.</span></>,
    patrakar: <>The internet, <span style={{ fontStyle: 'italic', color: p.leaf }}>read for you.</span></>,
    guru:     <>The next skill, <span style={{ fontStyle: 'italic', color: p.tea }}>on a drip.</span></>,
  };
  return map[id] || <>An agent on staff.</>;
}

function ChapterSteps({ p, c, id }) {
  const steps = {
    apply:    ['paste a job link', 'four agents work in parallel', 'open Gmail; hit send'],
    lekhak:   ['drop a thought, a thread, a voice memo', 'lekhak writes a draft in your voice', 'cross-post to substack, x, linkedin'],
    patrakar: ['pick your beats', 'pandit ji reads everything, every day', 'morning brief, 7 minutes, charts inside'],
    guru:     ['guru watches what you ship and skip', 'picks the next skill that pays off', 'drills sized for a coffee break'],
  };
  const list = steps[id] || ['—'];
  return (
    <ol style={{ marginTop: 18, padding: 0, listStyle: 'none', display: 'grid', gap: 8, maxWidth: 520 }}>
      {list.map((s, i) => (
        <li key={i} style={{
          display: 'grid', gridTemplateColumns: '28px 1fr', gap: 12, alignItems: 'baseline',
          fontFamily: PAPER_FONTS.serif, fontSize: 16.5, color: p.ink, lineHeight: 1.4,
        }}>
          <span style={{
            fontFamily: PAPER_FONTS.mono, fontSize: 11, color: c,
            letterSpacing: '.04em', borderTop: `2px solid ${c}`, paddingTop: 4,
          }}>0{i + 1}</span>
          <span>{s}</span>
        </li>
      ))}
    </ol>
  );
}

/* The specimen — a tangible artefact the chapter's agent ships */
function ChapterSpecimen({ p, c, id }) {
  if (id === 'apply')    return <SpecimenApply    p={p} c={c}/>;
  if (id === 'lekhak')   return <SpecimenLekhak   p={p} c={c}/>;
  if (id === 'patrakar') return <SpecimenPatrakar p={p} c={c}/>;
  if (id === 'guru')     return <SpecimenGuru     p={p} c={c}/>;
  /* generic fallback specimen */
  const a = AGENTS_V3.find((x) => x.id === id);
  return (
    <div style={{
      padding: 22, background: p.card, border: `2px solid ${p.ink}`,
      boxShadow: `6px 6px 0 ${c}`, transform: 'rotate(.3deg)',
    }}>
      <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 10, color: c, letterSpacing: '.1em' }}>
        {a.output.kind.toUpperCase()}
      </div>
      <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 26, color: p.ink, lineHeight: 1.05, marginTop: 4 }}>
        {a.output.title}
      </div>
      <div style={{ fontFamily: PAPER_FONTS.serif, fontStyle: 'italic', fontSize: 14, color: p.inkSoft, marginTop: 8 }}>
        {a.output.meta}
      </div>
    </div>
  );
}

function SpecimenApply({ p, c }) {
  return (
    <div style={{
      padding: 22, background: p.card, border: `2px solid ${p.ink}`,
      boxShadow: `6px 6px 0 ${c}`, transform: 'rotate(.4deg)',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontFamily: PAPER_FONTS.mono, fontSize: 10, color: p.inkMute, letterSpacing: '.06em',
      }}>
        <span>FROM: sam@jugaadu.app</span><span>TO: anika@stripe.com</span>
      </div>
      <div style={{ height: 1, background: p.rule, margin: '10px 0' }}/>
      <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 20, color: p.ink, lineHeight: 1.15 }}>
        the bit about pricing tables in Atlas — a 3 min thought
      </div>
      <p style={{ margin: '10px 0 0', fontFamily: PAPER_FONTS.serif, fontSize: 14.5, color: p.inkSoft, lineHeight: 1.5, fontStyle: 'italic' }}>
        Anika — caught the Atlas pricing-table redesign and the way you handled the discount-stacking edge case is the cleanest take I've seen on it. I rebuilt onboarding at Razorpay last year and ran into a similar spec-vs-edge tension…
      </p>
      <div style={{
        marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap',
        fontFamily: PAPER_FONTS.mono, fontSize: 10, color: p.inkMute, letterSpacing: '.04em',
      }}>
        <span style={{ padding: '3px 8px', background: `${c}1f`, color: c, borderRadius: 999 }}>VOICE 96%</span>
        <span style={{ padding: '3px 8px', border: `1px solid ${p.rule}`, borderRadius: 999 }}>spam 0.04</span>
        <span style={{ padding: '3px 8px', border: `1px solid ${p.rule}`, borderRadius: 999 }}>send Tue 10:42</span>
      </div>
    </div>
  );
}

function SpecimenLekhak({ p, c }) {
  return (
    <div style={{
      padding: 0, background: p.card, border: `2px solid ${p.ink}`,
      boxShadow: `6px 6px 0 ${c}`, transform: 'rotate(-.4deg)', overflow: 'hidden',
    }}>
      <div style={{
        padding: '12px 18px', background: p.ink, color: p.paper,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontFamily: PAPER_FONTS.mono, fontSize: 10, letterSpacing: '.1em',
      }}>
        <span>SAM'S SUBSTACK · DRAFT</span>
        <span>1,840 WORDS · 4 PAGES</span>
      </div>
      <div style={{ padding: 22 }}>
        <div style={{ fontFamily: PAPER_FONTS.devan, fontSize: 13, color: p.tea, fontWeight: 700 }}>लेख · निबंध</div>
        <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 32, color: p.ink, lineHeight: 1, marginTop: 4 }}>
          Why batch beats real-time
        </div>
        <div style={{ fontFamily: PAPER_FONTS.serif, fontStyle: 'italic', fontSize: 15, color: p.inkSoft, marginTop: 6 }}>
          A short essay about the seduction of latency.
        </div>
        <p style={{ margin: '14px 0 0', fontFamily: PAPER_FONTS.serif, fontSize: 14, color: p.ink, lineHeight: 1.55 }}>
          We added a queue because we thought latency was the problem. Latency was the symptom. The problem was that we were doing each job as if it were the only job, and the universe was conspiring otherwise…
        </p>
        <div style={{
          marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6,
        }}>
          {['Substack', 'LinkedIn', 'X · 8 posts'].map((dest) => (
            <div key={dest} style={{
              padding: '8px 10px', border: `1px solid ${p.rule}`, borderRadius: 6, textAlign: 'center',
              fontFamily: PAPER_FONTS.mono, fontSize: 10, color: c, letterSpacing: '.06em',
              background: `${c}10`,
            }}>{dest.toUpperCase()}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SpecimenPatrakar({ p, c }) {
  const items = [
    { tag: 'AI · AGENTS', t: 'OpenAI ships agent SDK v2 · breaking change in tool spec', size: 22 },
    { tag: 'PAYMENTS',    t: 'RBI updates UPI mandate flow', size: 16 },
    { tag: 'PEOPLE',      t: 'Anika Mehta → Sr PD at Stripe', size: 16 },
    { tag: 'YOUR WORK',   t: "Linear copied the keyboard pattern you wrote about in feb", size: 16 },
  ];
  return (
    <div style={{
      padding: 0, background: p.card, border: `2px solid ${p.ink}`,
      boxShadow: `6px 6px 0 ${c}`, transform: 'rotate(.3deg)', overflow: 'hidden',
    }}>
      <div style={{
        padding: '12px 18px', borderBottom: `2px solid ${p.ink}`,
        display: 'flex', justifyContent: 'space-between',
        fontFamily: PAPER_FONTS.mono, fontSize: 10, color: p.inkMute, letterSpacing: '.1em',
      }}>
        <span>SAM'S TUESDAY BRIEF</span><span>MAY 17 · 7 MIN</span>
      </div>
      <div style={{ padding: 22 }}>
        <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 28, color: p.ink, lineHeight: 1, letterSpacing: '-.01em' }}>
          {items[0].t}
        </div>
        <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 10, color: c, letterSpacing: '.08em', marginTop: 6 }}>
          {items[0].tag} · 4 SOURCES · 2 CHARTS INSIDE
        </div>
        <div style={{ height: 1, background: p.ink, margin: '14px 0' }}/>
        <div style={{ display: 'grid', gap: 10 }}>
          {items.slice(1).map((it, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 12, alignItems: 'baseline' }}>
              <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 10, color: p.inkMute, letterSpacing: '.06em' }}>{it.tag}</span>
              <span style={{ fontFamily: PAPER_FONTS.serif, fontSize: 15, color: p.ink, lineHeight: 1.3 }}>{it.t}</span>
            </div>
          ))}
        </div>
        <div style={{
          marginTop: 18, padding: '10px 12px', background: p.paperShade, borderRadius: 4,
          fontFamily: PAPER_FONTS.serif, fontStyle: 'italic', fontSize: 13, color: p.inkSoft,
        }}>
          "Sam — the OpenAI thing matters for you specifically because it touches the tool-spec you depend on at work." — पत्रकार
        </div>
      </div>
    </div>
  );
}

function SpecimenGuru({ p, c }) {
  return (
    <div style={{
      padding: 22, background: p.card, border: `2px solid ${p.ink}`,
      boxShadow: `6px 6px 0 ${c}`, transform: 'rotate(-.3deg)',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontFamily: PAPER_FONTS.mono, fontSize: 10, color: p.inkMute, letterSpacing: '.06em',
      }}>
        <span>SYLLABUS · WK 1 / 6</span>
        <span style={{ color: c }}>● distributed systems</span>
      </div>
      <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 28, color: p.ink, lineHeight: 1.05, marginTop: 8 }}>
        When CAP is a smell.
      </div>
      <div style={{ fontFamily: PAPER_FONTS.serif, fontStyle: 'italic', fontSize: 14, color: p.inkSoft, marginTop: 4 }}>
        Because Stripe asked you a quorum question on Tuesday, and your answer was almost right.
      </div>

      <div style={{ marginTop: 16, display: 'grid', gap: 6 }}>
        {[
          ['12 MIN', 'read · with diagrams',         'today',  true],
          ['DRILL',  'design a 3-node bank ledger',  'wed',    false],
          ['DRILL',  'explain Raft to a PM',         'thu',    false],
          ['CHECK',  'where did you split-brain?',   'fri',    false],
        ].map(([k, label, when, done], i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '64px 1fr 64px',
            padding: '8px 10px', border: `1px solid ${p.rule}`, borderRadius: 6,
            background: done ? `${c}1a` : 'transparent', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 10, color: c, letterSpacing: '.06em' }}>{k}</span>
            <span style={{ fontFamily: PAPER_FONTS.serif, fontStyle: 'italic', fontSize: 14, color: p.ink, lineHeight: 1.2 }}>{label}</span>
            <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 10, color: p.inkMute, letterSpacing: '.06em', textAlign: 'right' }}>{when}</span>
          </div>
        ))}
      </div>
      <div style={{
        marginTop: 14, fontFamily: PAPER_FONTS.caveat, fontSize: 20, color: p.tea, transform: 'rotate(-1deg)',
      }}>+ a sharpness report every Sunday ↗</div>
    </div>
  );
}

/* ─────────────────────── manifesto block (newsroom) ─────────────────────── */

function ManifestoBlock({ p }) {
  return (
    <section style={{ padding: '60px 56px 24px', background: p.paperDeep, borderTop: `1px solid ${p.ink}`, borderBottom: `1px solid ${p.ink}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 11, color: p.stamp, letterSpacing: '.22em' }}>⸻ A short manifesto ⸻</div>
        <Stamp3 p={p} c={p.leaf} rotate={-3}>page A1</Stamp3>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: 36, alignItems: 'start' }}>
        <h2 style={{
          margin: 0, fontFamily: PAPER_FONTS.display,
          fontSize: 'clamp(40px, 4.4vw, 64px)', lineHeight: .98, letterSpacing: '-.02em', color: p.ink,
        }}>
          The ambitious are not <span style={{ fontStyle: 'italic', color: p.stamp }}>short on ideas.</span><br/>
          They are short on hours, witnesses, and the next 20 minutes of reading.
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{
            margin: 0, fontFamily: PAPER_FONTS.serif, fontSize: 18, lineHeight: 1.55, color: p.inkSoft,
          }}>
            We grew up in the small towns of big cities. Watching our brilliant friends spend their best years drafting cover letters, googling salary bands, and meaning to start a Substack.
          </p>
          <p style={{
            margin: 0, fontFamily: PAPER_FONTS.serif, fontSize: 18, lineHeight: 1.55, color: p.inkSoft,
          }}>
            Jugaadu is a small crew of agents that does that work for them — and quietly turns their leftover hours into the kind of compounding only the very early in their careers, or very wealthy, used to get.
          </p>
          <p style={{
            margin: 0, fontFamily: PAPER_FONTS.display, fontStyle: 'italic', fontSize: 22, color: p.ink,
          }}>
            <span style={{ fontFamily: PAPER_FONTS.devan, color: p.stamp, fontStyle: 'normal' }}>हम सब के लिए</span> — for the rest of us.
          </p>
        </div>
      </div>
    </section>
  );
}

export default LandingV3;
