"use client";

import { useState } from "react";
import Link from "next/link";
import { PAPER_FONTS_V2 } from "@/components/paper/fonts";
import { TOKENS } from "@/components/paper/tokens";
import { useIsMobile } from "@/lib/use-is-mobile";
import { GoalChat } from "@/components/goal/GoalChat";
import { GoalProposalCard } from "@/components/goal/GoalProposalCard";
import { setActiveGoal, useActiveGoal, type ActiveGoalDTO } from "@/components/goal/use-active-goal";
import { useGoalProgress } from "@/components/goal/use-goal-progress";
import { GoalProgress } from "@/components/goal/GoalProgress";
import type { GoalSpec } from "@/lib/goal/goal-logic";

function lockedOn(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// /app/goal — the locked job-search goal (view / edit) and the coach chat to
// set or refine it. Everything else in the app reads the goal from here.
export default function GoalPage() {
  const isMobile = useIsMobile();
  const active = useActiveGoal();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const progress = useGoalProgress(active?.id);
  // "Talk it through" from the refine prompt: remount the chat with a starter
  // message and bring it into view.
  const [refineSeed, setRefineSeed] = useState("");
  async function startRefine() {
    // Fresh chat, so the coach's context includes the latest match feedback.
    await fetch("/api/goal/chat/reset", { method: "POST" }).catch(() => {});
    setRefineSeed("I keep passing on the matches I'm getting — help me refine my goal.");
    setTimeout(() => document.getElementById("goal-coach")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  async function saveEdit(goal: GoalSpec) {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/goal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goal, source: "app", edited: true }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Couldn't save (${res.status}).`);
      setActiveGoal(j.goal as ActiveGoalDTO);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const heading = (text: string) => (
    <div
      style={{
        fontFamily: PAPER_FONTS_V2.mono,
        fontSize: 11,
        letterSpacing: ".06em",
        textTransform: "uppercase",
        color: TOKENS.faint,
        margin: "30px 0 10px",
      }}
    >
      {text}
    </div>
  );

  return (
    <div
      className="scroll"
      style={{
        flex: 1,
        overflow: "auto",
        maxWidth: 760,
        width: "100%",
        margin: "0 auto",
        boxSizing: "border-box",
        padding: isMobile ? "28px 18px 60px" : "44px 44px 60px",
        background: TOKENS.paper,
      }}
    >
      <div
        style={{
          fontFamily: PAPER_FONTS_V2.serif,
          fontSize: 30,
          lineHeight: 1.25,
          letterSpacing: "-.01em",
          color: TOKENS.ink,
        }}
      >
        Your goal
      </div>
      <div
        style={{
          fontFamily: PAPER_FONTS_V2.sans,
          fontSize: 14,
          lineHeight: 1.7,
          color: TOKENS.muted,
          maxWidth: 560,
          margin: "8px 0 0",
        }}
      >
        {active === undefined
          ? "Loading…"
          : active
            ? `Locked ${lockedOn(active.finalized_at)}. The crew ranks roles, picks companies to watch and plans your Desk around it. Change it any time — by editing, or by talking it through below.`
            : "Tell the coach what you're after. It'll ask a couple of questions, then propose a goal you can edit and lock. The crew ranks everything against it."}
      </div>

      {active && (
        <>
          {heading("Locked goal")}
          <GoalProposalCard
            key={active.id}
            goal={active.goal}
            onLock={(g) => void saveEdit(g)}
            lockLabel="Save goal"
            busy={saving}
            error={saveError}
            readOnly
          />
          {progress ? (
            <>
              {heading("Progress since you set it")}
              <GoalProgress progress={progress} onRefine={() => void startRefine()} />
            </>
          ) : (
            <div style={{ marginTop: 12, fontFamily: PAPER_FONTS_V2.sans, fontSize: 13 }}>
              <Link href="/app/jobs" style={{ color: TOKENS.ink }}>
                See roles that fit this goal →
              </Link>
            </div>
          )}
        </>
      )}

      <div id="goal-coach">{heading(active ? "Refine it with the coach" : "Set it with the coach")}</div>
      <GoalChat
        key={refineSeed ? "refine" : "chat"}
        source="app"
        height={isMobile ? 380 : 440}
        activeLabel={active?.goal.short_label ?? null}
        initialText={refineSeed}
      />
    </div>
  );
}
