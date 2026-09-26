"use client";

// "Ask for intro" on a person the user already knows (an imported LinkedIn
// connection): starts a warm-intro Compose run — research the connection,
// then draft a short ask for an introduction at their company, with a blurb
// they can forward (src/lib/writing/warm-intro.ts) — and opens the Desk on it.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PAPER_FONTS_V2 } from "@/components/paper/fonts";
import { TOKENS, RADII } from "@/components/paper/tokens";
import { startRun, setFocusedRun } from "@/lib/runs-store";
import { track } from "@/lib/analytics/client";
import { warmIntroIntent, type WarmIntroTarget } from "@/lib/writing/warm-intro";
import type { Connection } from "@/lib/connections/store";

export function AskForIntroButton({ person, target }: { person: Connection; target: WarmIntroTarget }) {
  const router = useRouter();
  const [hover, setHover] = useState(false);
  const [busy, setBusy] = useState(false);

  function go() {
    if (busy) return;
    setBusy(true);
    const runId = startRun(person.linkedin_url || person.full_name, {
      kind: "person",
      intent: warmIntroIntent(target),
      picked: {
        name: person.full_name,
        role: person.position,
        company: person.company ?? target.company,
        linkedin: person.linkedin_url,
      },
      warmIntro: target,
    });
    if (runId) setFocusedRun(runId);
    track("warm_intro_started", { has_role: !!target.role });
    router.push("/app/compose");
  }

  return (
    <button
      type="button"
      onClick={go}
      disabled={busy}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={`Draft a note asking ${person.full_name.split(/\s+/)[0]} for an intro at ${target.company}`}
      style={{
        flex: "none",
        fontFamily: PAPER_FONTS_V2.mono,
        fontSize: 11,
        letterSpacing: ".04em",
        color: hover ? TOKENS.paper : TOKENS.ink,
        background: hover ? TOKENS.ink : "transparent",
        border: `1px solid ${hover ? TOKENS.ink : TOKENS.line}`,
        borderRadius: RADII.buttonTight,
        padding: "6px 10px",
        cursor: busy ? "default" : "pointer",
        opacity: busy ? 0.6 : 1,
        whiteSpace: "nowrap",
      }}
    >
      {busy ? "Starting…" : "Ask for intro →"}
    </button>
  );
}
