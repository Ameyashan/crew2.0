// @ts-nocheck — self-playing "how it works" demo loop for the landing page.
// A coded animation (no video / no GIF) so it stays razor-sharp, tiny, and
// always matches the live product. It replays the core run on a loop:
//   paste a name → the crew researches → it verifies a real email →
//   it drafts in your voice across 3 channels → you hit send.
// Honours prefers-reduced-motion by rendering the finished state, still.
"use client";

import { useEffect, useRef, useState } from "react";
import { PAPER_FONTS } from "@/components/paper/fonts";
import { useIsMobile } from "@/lib/use-is-mobile";

/* ─────────────────────── the script ─────────────────────── */

const STEPS = [
  {
    key: "paste",
    label: "Paste",
    desc: "Drop a name, a LinkedIn URL, or a job post. That's the only thing you type.",
    dur: 3200,
  },
  {
    key: "research",
    label: "Research",
    desc: "Your crew scans the team and ranks who actually makes the decision — no clicks from you.",
    dur: 2800,
  },
  {
    key: "verify",
    label: "Verify",
    desc: "It locks onto the right person and verifies a real, reachable email.",
    dur: 2800,
  },
  {
    key: "draft",
    label: "Draft",
    desc: "Three drafts in your voice — an email, a LinkedIn note, and a follow-up.",
    dur: 3600,
  },
  {
    key: "send",
    label: "Send",
    desc: "You read it and hit send. About two hours of busywork, gone.",
    dur: 2600,
  },
];
const HOLD = 1500; // beat on the finished state before looping
const BOUNDS = STEPS.reduce((acc, s) => {
  acc.push((acc[acc.length - 1] ?? 0) + s.dur);
  return acc;
}, []);
const TOTAL = BOUNDS[BOUNDS.length - 1] + HOLD;

const INPUT_TEXT = "Anika Mehta — Hiring Manager, Stripe";
const SNIPPET =
  "Anika — your Atlas pricing-table redesign is the cleanest take I've seen on discount-stacking…";

/* ─────────────────────── playhead ─────────────────────── */

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

// Drives the loop with requestAnimationFrame (auto-pauses when the tab is
// hidden). Returns the current step index and 0→1 progress within it.
function usePlayhead(reduced) {
  const [state, setState] = useState({ step: 0, local: 0 });
  const startRef = useRef(null);
  useEffect(() => {
    if (reduced) return; // render the finished state, still — no loop
    let raf;
    const tick = (now) => {
      if (startRef.current == null) startRef.current = now;
      const elapsed = (now - startRef.current) % TOTAL;
      let step = STEPS.length - 1;
      let local = 1;
      for (let i = 0; i < STEPS.length; i++) {
        if (elapsed < BOUNDS[i]) {
          const lo = i === 0 ? 0 : BOUNDS[i - 1];
          step = i;
          local = Math.min(1, (elapsed - lo) / STEPS[i].dur);
          break;
        }
      }
      setState((prev) => (prev.step === step && Math.abs(prev.local - local) < 0.01 ? prev : { step, local }));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);
  return reduced ? { step: STEPS.length - 1, local: 1 } : state;
}

/* ─────────────────────── section ─────────────────────── */

export function HowItWorks({ p }) {
  const isMobile = useIsMobile();
  const reduced = useReducedMotion();
  const { step, local } = usePlayhead(reduced);

  return (
    <section style={{ padding: isMobile ? "28px 20px 12px" : "40px 56px 20px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
        <div>
          <div style={{
            fontFamily: PAPER_FONTS.mono, fontSize: 11, letterSpacing: ".22em",
            textTransform: "uppercase", color: p.stamp, marginBottom: 8,
          }}>⸻ How it works · in 30 seconds ⸻</div>
          <h2 style={{
            margin: 0, fontFamily: PAPER_FONTS.display,
            fontSize: "clamp(40px, 4.4vw, 64px)", lineHeight: .94, letterSpacing: "-.02em", color: p.ink,
          }}>
            One name in. <span style={{ fontStyle: "italic", color: p.stamp }}>A sent message out.</span>
          </h2>
        </div>
        <span style={{
          display: "inline-block", border: `2px double ${p.leaf}`, color: p.leaf,
          padding: "5px 11px", fontFamily: PAPER_FONTS.mono, fontWeight: 700,
          letterSpacing: ".12em", fontSize: 11, textTransform: "uppercase",
          transform: "rotate(-3deg)", borderRadius: 2, whiteSpace: "nowrap",
        }}>watch it run ↓</span>
      </div>

      {/* On mobile the per-step descriptions are hidden in the rail, so surface
          the active one here — it carries the "what do I do?" narrative. */}
      {isMobile && (
        <p key={step} style={{
          margin: "16px 0 0", fontFamily: PAPER_FONTS.serif, fontStyle: "italic",
          fontSize: 15, lineHeight: 1.45, color: p.inkSoft,
          animation: "hiwFade .5s ease both",
        }}>
          <span style={{ fontFamily: PAPER_FONTS.mono, fontStyle: "normal", fontSize: 12, color: p.stamp, letterSpacing: ".06em" }}>0{step + 1} · {STEPS[step].label.toUpperCase()} — </span>
          {STEPS[step].desc}
          <style>{`@keyframes hiwFade { from { opacity: 0 } to { opacity: 1 } }`}</style>
        </p>
      )}

      <div style={{
        marginTop: isMobile ? 16 : 24, display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 300px) minmax(0, 1fr)",
        gap: isMobile ? 22 : 36, alignItems: "start",
      }}>
        <StepRail p={p} active={step} isMobile={isMobile} />
        <RunWindow p={p} step={step} local={local} isMobile={isMobile} />
      </div>
    </section>
  );
}

/* ─────────────────────── hero embed: just the window ─────────────────────── */

// The self-playing window on its own, for the hero's right column — where the
// numbered rail and section header would be redundant. The window narrates
// itself via its title/status bars and the per-agent labels on each revealed
// block, so it reads as "watch the crew run" the moment you land.
export function CrewRunWindow({ p }) {
  const isMobile = useIsMobile();
  const reduced = useReducedMotion();
  const { step, local } = usePlayhead(reduced);
  return <RunWindow p={p} step={step} local={local} isMobile={isMobile} />;
}

/* ─────────────────────── left: numbered narrative ─────────────────────── */

function StepRail({ p, active, isMobile }) {
  return (
    <ol style={{
      margin: 0, padding: 0, listStyle: "none",
      display: isMobile ? "grid" : "flex",
      gridTemplateColumns: isMobile ? "1fr 1fr" : undefined,
      flexDirection: isMobile ? undefined : "column",
      gap: isMobile ? 10 : 14,
    }}>
      {STEPS.map((s, i) => {
        const on = i === active;
        const done = i < active;
        return (
          <li key={s.key} style={{
            display: "grid", gridTemplateColumns: "30px 1fr", gap: 12, alignItems: "start",
            opacity: on || done ? 1 : .5, transition: "opacity .4s ease",
          }}>
            <span style={{
              fontFamily: PAPER_FONTS.mono, fontSize: 11,
              color: on ? p.stamp : done ? p.leaf : p.inkMute,
              letterSpacing: ".04em",
              borderTop: `2px solid ${on ? p.stamp : done ? p.leaf : p.rule}`,
              paddingTop: 4, transition: "color .4s ease, border-color .4s ease",
            }}>0{i + 1}</span>
            <div>
              <div style={{
                fontFamily: PAPER_FONTS.display, fontSize: 18, lineHeight: 1.1,
                color: on ? p.ink : p.inkSoft,
              }}>
                {s.label}
                {on && <span style={{ color: p.stamp }}> ●</span>}
              </div>
              {!isMobile && (
                <div style={{
                  marginTop: 3, fontFamily: PAPER_FONTS.serif, fontStyle: "italic",
                  fontSize: 13.5, lineHeight: 1.4,
                  color: on ? p.inkSoft : p.inkMute,
                  maxHeight: on ? 60 : 0, overflow: "hidden",
                  opacity: on ? 1 : 0, transition: "max-height .45s ease, opacity .35s ease",
                }}>{s.desc}</div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ─────────────────────── right: the playing window ─────────────────────── */

function RunWindow({ p, step, local, isMobile }) {
  const caret = `<span class="hiw-caret" style="background:${p.stamp}"></span>`;
  const typedInput = step === 0 ? INPUT_TEXT.slice(0, Math.ceil(local * INPUT_TEXT.length)) : INPUT_TEXT;
  const typedSnippet = step === 3 ? SNIPPET.slice(0, Math.ceil(local * SNIPPET.length)) : step > 3 ? SNIPPET : "";

  return (
    <div style={{
      borderRadius: 14, overflow: "hidden", background: p.card, border: `2px solid ${p.ink}`,
      boxShadow: isMobile ? `5px 5px 0 ${p.ink}, 5px 5px 0 2px ${p.marigold}` : `10px 10px 0 ${p.ink}, 10px 10px 0 3px ${p.marigold}`,
      transform: isMobile ? "none" : "rotate(-.3deg)", maxWidth: "100%",
    }}>
      {/* title bar */}
      <div style={{
        background: p.ink, color: p.paper, padding: "10px 14px",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <div style={{ display: "flex", gap: 6 }}>
          <span style={{ width: 11, height: 11, borderRadius: 999, background: p.stamp }} />
          <span style={{ width: 11, height: 11, borderRadius: 999, background: p.marigold }} />
          <span style={{ width: 11, height: 11, borderRadius: 999, background: p.leaf }} />
        </div>
        <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 12, letterSpacing: ".06em" }}>
          sam&apos;s crew · compose
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7, fontFamily: PAPER_FONTS.mono, fontSize: 11, opacity: .8 }}>
          <span style={{
            width: 7, height: 7, borderRadius: 999, background: p.leaf,
            boxShadow: `0 0 0 4px ${p.leaf}33`, animation: "hiwPulse 1.6s ease-in-out infinite",
          }} />
          live demo
        </div>
      </div>

      <div style={{ padding: isMobile ? "16px 16px 14px" : "18px 20px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* the one input you touch */}
        <div>
          <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 10, color: p.inkMute, letterSpacing: ".1em", marginBottom: 6 }}>
            PASTE A PERSON, A LINK, OR A JOB
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
            background: p.paper, border: `1.5px solid ${step === 0 ? p.stamp : p.rule}`,
            transition: "border-color .3s ease", minHeight: 22,
          }}>
            <span style={{
              fontFamily: PAPER_FONTS.sans, fontSize: 15, color: p.ink, lineHeight: 1.3,
            }} dangerouslySetInnerHTML={{ __html: (typedInput || "&nbsp;") + (step === 0 ? caret : "") }} />
          </div>
        </div>

        {/* run log — blocks reveal as each step begins */}
        <Reveal show={step >= 1} p={p}>
          <ResearchBlock p={p} step={step} local={local} />
        </Reveal>
        <Reveal show={step >= 2} p={p}>
          <VerifyBlock p={p} step={step} local={local} />
        </Reveal>
        <Reveal show={step >= 3} p={p}>
          <DraftBlock p={p} step={step} typed={typedSnippet} />
        </Reveal>
        <Reveal show={step >= 4} p={p}>
          <DoneBlock p={p} />
        </Reveal>
      </div>

      {/* status bar */}
      <div style={{
        background: p.paperDeep, padding: "8px 14px", display: "flex", alignItems: "center", gap: 14,
        fontFamily: PAPER_FONTS.mono, fontSize: 10, color: p.inkMute,
        letterSpacing: ".08em", textTransform: "uppercase", borderTop: `1px solid ${p.rule}`,
      }}>
        <span>{STEPS[step].key} · step {step + 1} / {STEPS.length}</span>
        <span style={{ marginLeft: "auto", color: step >= 4 ? p.leaf : p.stamp }}>
          {step >= 4 ? "● done · ~2h saved" : "● working"}
        </span>
      </div>

      <style>{`
        @keyframes hiwPulse { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
        @keyframes hiwBlink { 0%,49% { opacity: 1 } 50%,100% { opacity: 0 } }
        @keyframes hiwSpin  { to { transform: rotate(360deg) } }
        .hiw-caret { display:inline-block; width:2px; height:1.05em; margin-left:1px; vertical-align:-2px; animation: hiwBlink 1s step-end infinite; }
      `}</style>
    </div>
  );
}

// Wrapper that fades + slides a block in once its step is reached.
function Reveal({ show, p, children }) {
  return (
    <div style={{
      opacity: show ? 1 : 0,
      transform: show ? "translateY(0)" : "translateY(8px)",
      maxHeight: show ? 600 : 0, overflow: "hidden",
      transition: "opacity .45s ease, transform .45s ease, max-height .5s ease",
    }}>
      {/* small top divider so stacked blocks read as a transcript */}
      <div style={{ height: 1, background: p.rule, margin: "2px 0 10px" }} />
      {children}
    </div>
  );
}

/* ─────────────────────── per-step bodies ─────────────────────── */

function Spinner({ c, size = 12 }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: 999, flexShrink: 0,
      border: `2px solid ${c}40`, borderTopColor: c, display: "inline-block",
      animation: "hiwSpin .7s linear infinite",
    }} />
  );
}

function ResearchBlock({ p, step, local }) {
  const working = step === 1 && local < 1;
  const c = p.leaf;
  const lines = [
    "scanning the team · 6 profiles",
    "ranking by who decides · staff PD",
    "match locked · Anika Mehta · #1 of 6",
  ];
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        {working ? <Spinner c={c} /> : <Tick c={c} />}
        <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 10, color: p.inkMute, letterSpacing: ".1em" }}>
          PERSON KHOJI · खोजी
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {lines.map((l, i) => {
          const shown = step > 1 || (step === 1 && local > i * 0.3 + 0.05);
          const last = i === lines.length - 1;
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "6px 9px",
              border: `1px solid ${last && shown ? c : p.rule}`, borderRadius: 6,
              background: last && shown ? `${c}14` : "transparent",
              opacity: shown ? 1 : 0, transform: shown ? "none" : "translateX(-6px)",
              transition: "opacity .3s ease, transform .3s ease",
            }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: c, flexShrink: 0 }} />
              <span style={{ fontFamily: PAPER_FONTS.serif, fontStyle: "italic", fontSize: 13, color: p.ink, flex: 1, lineHeight: 1.3 }}>{l}</span>
              {last && shown && <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 9, color: c, letterSpacing: ".06em" }}>TARGET</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VerifyBlock({ p, step, local }) {
  const c = p.stamp;
  const rows = [
    ["Apollo match", "found", 0.1],
    ["Hunter score", "96%", 0.32],
    ["MX record", "ok", 0.54],
    ["catch-all", "no", 0.76],
  ];
  const allDone = step > 2;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        {step === 2 && local < 0.85 ? <Spinner c={c} /> : <Tick c={c} />}
        <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 10, color: p.inkMute, letterSpacing: ".1em" }}>
          EMAIL WALLAH · ईमेल वाला
        </span>
      </div>
      <div style={{
        padding: "10px 12px", background: p.paper, border: `1.5px solid ${p.rule}`, borderRadius: 6,
        display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6,
      }}>
        <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 13, color: p.ink }}>anika@stripe.com</span>
        <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 10, color: c, letterSpacing: ".04em" }}>96% ✓</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
        {rows.map(([k, v, thr], i) => {
          const ok = allDone || (step === 2 && local > thr);
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 7, padding: "5px 8px",
              border: `1px solid ${p.rule}`, borderRadius: 6,
            }}>
              <span style={{
                width: 13, height: 13, borderRadius: 999, flexShrink: 0,
                background: ok ? c : "transparent", border: `1.5px solid ${ok ? c : p.inkMute}`,
                color: "#fff", fontSize: 9, display: "grid", placeItems: "center",
                transition: "background .25s ease, border-color .25s ease",
              }}>{ok ? "✓" : ""}</span>
              <span style={{ fontFamily: PAPER_FONTS.serif, fontStyle: "italic", fontSize: 12, color: p.ink, flex: 1 }}>{k}</span>
              <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 9, color: p.inkMute }}>{v}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DraftBlock({ p, typed }) {
  const c = p.tea;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Tick c={c} />
        <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 10, color: p.inkMute, letterSpacing: ".1em" }}>
          OUTREACH BHAI · आउटरीच भाई · IN YOUR VOICE
        </span>
      </div>
      <div style={{
        padding: "10px 12px", background: p.paper, border: `1.5px solid ${p.rule}`, borderRadius: 6, marginBottom: 6,
      }}>
        <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 9, color: c, letterSpacing: ".06em", marginBottom: 4 }}>EMAIL · TO ANIKA</div>
        <p style={{
          margin: 0, fontFamily: PAPER_FONTS.serif, fontSize: 12.5, color: p.inkSoft,
          lineHeight: 1.4, fontStyle: "italic", minHeight: 34,
        }}>{typed}<span className="hiw-caret" style={{ background: c }} /></p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}>
        {[["Email", "ready"], ["LinkedIn", "shorter"], ["Followup", "in 4d"]].map(([dest, hint]) => (
          <div key={dest} style={{ padding: "6px 8px", border: `1px solid ${p.rule}`, borderRadius: 6, background: p.card }}>
            <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 9, color: c, letterSpacing: ".06em" }}>{dest.toUpperCase()}</div>
            <div style={{ fontFamily: PAPER_FONTS.serif, fontStyle: "italic", fontSize: 10.5, color: p.inkSoft, marginTop: 1 }}>{hint}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DoneBlock({ p }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
      background: p.ink, color: p.paper, borderRadius: 6,
    }}>
      <Tick c={p.leaf} size={20} bg />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: PAPER_FONTS.display, fontSize: 17, lineHeight: 1.1 }}>3 channels ready to send</div>
        <div style={{ fontFamily: PAPER_FONTS.mono, fontSize: 10, color: p.marigold, letterSpacing: ".04em", marginTop: 2 }}>
          followup queued · ~2h saved · ₹0 spent
        </div>
      </div>
      <span style={{
        fontFamily: PAPER_FONTS.mono, fontSize: 11, letterSpacing: ".06em",
        padding: "8px 12px", background: p.marigold, color: p.ink, borderRadius: 4, whiteSpace: "nowrap",
      }}>copy & open Gmail ↵</span>
    </div>
  );
}

function Tick({ c, size = 14, bg }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: 999, flexShrink: 0,
      background: bg ? c : `${c}22`, border: `1.5px solid ${c}`,
      color: bg ? "#fff" : c, display: "grid", placeItems: "center",
      fontSize: size * 0.6, fontWeight: 700,
    }}>✓</span>
  );
}
