"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { PAPER_FONTS_V2 } from "@/components/paper/fonts";
import { TOKENS, RADII } from "@/components/paper/tokens";
import type { GoalSpec } from "@/lib/goal/goal-logic";
import type { DisplayMessage } from "@/lib/goal/chat-logic";
import { GoalProposalCard } from "./GoalProposalCard";
import { parseSseChunk } from "./goal-view-logic";
import { setActiveGoal, type ActiveGoalDTO } from "./use-active-goal";

type Pending = { tool_use_id: string; goal: GoalSpec };

const OPENER_NEW = "What are you going after? A sentence is plenty — e.g. “A PM job paying $200k+” or “Break into climate tech as a senior engineer.” I'll ask a couple of questions and we'll pin it down together.";

const openerRefine = (label: string) =>
  `Your goal right now: “${label}”. What would you like to change — role, pay, industries, places, companies?`;

function Bubble({ role, children }: { role: "user" | "assistant"; children: React.ReactNode }) {
  const mine = role === "user";
  const style: CSSProperties = mine
    ? {
        alignSelf: "flex-end",
        maxWidth: "82%",
        background: TOKENS.ink,
        color: TOKENS.paper,
        fontFamily: PAPER_FONTS_V2.sans,
        fontSize: 14,
        lineHeight: 1.55,
        padding: "10px 14px",
        borderRadius: 14,
        borderBottomRightRadius: 4,
        whiteSpace: "pre-wrap",
      }
    : {
        alignSelf: "flex-start",
        maxWidth: "88%",
        color: TOKENS.ink,
        fontFamily: PAPER_FONTS_V2.serif,
        fontSize: 15.5,
        lineHeight: 1.6,
        whiteSpace: "pre-wrap",
      };
  return <div style={style}>{children}</div>;
}

function Marker({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        alignSelf: "center",
        fontFamily: PAPER_FONTS_V2.mono,
        fontSize: 10.5,
        letterSpacing: ".05em",
        color: TOKENS.faint2,
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

// The goal coach chat. Loads the open chat from /api/goal, streams turns from
// /api/goal/chat, and locks proposals via POST /api/goal. Used in onboarding
// (source "onboarding", refresh:false — onboarding's finish() re-scans) and on
// the goal page.
export function GoalChat({
  source,
  onLocked,
  height = 420,
  activeLabel,
}: {
  source: "onboarding" | "app";
  onLocked?: (goal: ActiveGoalDTO) => void;
  height?: number;
  activeLabel?: string | null;
}) {
  const [loaded, setLoaded] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [streaming, setStreaming] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  // The opener is fixed for the life of a chat (set on load / Start over), so
  // locking mid-conversation doesn't rewrite the first bubble.
  const [opener, setOpener] = useState<string | null>(null);
  const labelRef = useRef<string | null>(activeLabel ?? null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const seqRef = useRef(1_000_000); // local keys for optimistic messages

  useEffect(() => {
    let cancelled = false;
    fetch("/api/goal")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return;
        setChatId(j.chat?.id ?? null);
        setMessages(Array.isArray(j.chat?.messages) ? j.chat.messages : []);
        setPending(j.pending_proposal ?? null);
        if (j.goal?.goal?.short_label) labelRef.current = j.goal.goal.short_label;
      })
      .catch(() => {})
      .finally(() => {
        if (cancelled) return;
        setOpener(labelRef.current ? openerRefine(labelRef.current) : OPENER_NEW);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming, pending, drafting]);

  const send = useCallback(async () => {
    const msg = text.trim();
    if (!msg || sending) return;
    setSending(true);
    setError(null);
    setText("");
    // Replying to an open proposal answers it — keep it in the transcript as a
    // marker (unless the loaded history already has it).
    const answered = pending;
    setPending(null);
    const userKey = ++seqRef.current;
    const markerKey = ++seqRef.current;
    setMessages((m) => [
      ...m,
      ...(answered && !m.some((x) => x.kind === "proposal" && x.tool_use_id === answered.tool_use_id)
        ? [{ kind: "proposal" as const, goal: answered.goal, tool_use_id: answered.tool_use_id, seq: markerKey }]
        : []),
      { kind: "text", role: "user", text: msg, seq: userKey },
    ]);

    let acc = "";
    let proposal: Pending | null = null;
    let failed: string | null = null;
    let finished = false;
    try {
      const res = await fetch("/api/goal/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: msg, source }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Something went wrong (${res.status}).`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const { events, rest } = parseSseChunk(buf);
        buf = rest;
        for (const raw of events) {
          const e = raw as { type: string; [k: string]: unknown };
          if (e.type === "chat") setChatId(String(e.chat_id));
          else if (e.type === "delta") {
            acc += String(e.text ?? "");
            setStreaming(acc);
          } else if (e.type === "reset") {
            acc = "";
            setStreaming("");
          } else if (e.type === "retry") {
            setDrafting(true);
          } else if (e.type === "proposal_start") setDrafting(true);
          else if (e.type === "goal_proposal") {
            proposal = { tool_use_id: String(e.tool_use_id), goal: e.goal as GoalSpec };
          } else if (e.type === "error") failed = String(e.message || "Something went wrong.");
          else if (e.type === "done") finished = true;
        }
      }
    } catch (e) {
      failed = e instanceof Error ? e.message : String(e);
    }

    setStreaming("");
    setDrafting(false);
    if (failed) {
      // Nothing was saved for this turn: take the message back so it can be
      // resent, and reopen the proposal it would have answered.
      setMessages((m) => m.filter((x) => x.seq !== userKey && x.seq !== markerKey));
      if (answered) setPending(answered);
      setText(msg);
      setError(failed);
    } else {
      const reply = acc.trim();
      const found = proposal as Pending | null;
      setMessages((m) => [
        ...m,
        ...(reply ? [{ kind: "text" as const, role: "assistant" as const, text: reply, seq: ++seqRef.current }] : []),
      ]);
      if (found) setPending(found);
      // The server keeps going if the connection drops, so the turn may still
      // have saved — point at a reload rather than a resend.
      if (!finished) setError("Connection dropped — reload if the reply looks cut off.");
    }
    setSending(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [text, sending, source, pending]);

  async function lock(goal: GoalSpec, edited: boolean) {
    if (!pending) return;
    setLocking(true);
    setLockError(null);
    try {
      const res = await fetch("/api/goal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          goal,
          chat_id: chatId,
          tool_use_id: pending.tool_use_id,
          refresh: source !== "onboarding",
          source,
          edited,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Couldn't save (${res.status}).`);
      const dto = j.goal as ActiveGoalDTO;
      setActiveGoal(dto);
      labelRef.current = dto.goal.short_label;
      const lockedId = pending.tool_use_id;
      setMessages((m) => [
        ...m,
        ...(m.some((x) => x.kind === "proposal" && x.tool_use_id === lockedId)
          ? []
          : [{ kind: "proposal" as const, goal: dto.goal, tool_use_id: lockedId, seq: ++seqRef.current }]),
        { kind: "locked", seq: ++seqRef.current },
      ]);
      setPending(null);
      onLocked?.(dto);
    } catch (e) {
      setLockError(e instanceof Error ? e.message : String(e));
    } finally {
      setLocking(false);
    }
  }

  async function startOver() {
    if (sending) return;
    await fetch("/api/goal/chat/reset", { method: "POST" }).catch(() => {});
    setMessages([]);
    setPending(null);
    setChatId(null);
    setError(null);
    setOpener(labelRef.current ? openerRefine(labelRef.current) : OPENER_NEW);
  }

  return (
    <div
      style={{
        border: `1px solid ${TOKENS.lineSoft}`,
        borderRadius: RADII.card,
        background: TOKENS.card,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        ref={scrollRef}
        className="scroll"
        style={{
          height,
          overflowY: "auto",
          padding: "18px 18px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {!loaded ? (
          <Marker>Loading…</Marker>
        ) : (
          <>
            {opener && <Bubble role="assistant">{opener}</Bubble>}
            {messages.map((m) =>
              m.kind === "text" ? (
                <Bubble key={`${m.seq}-${m.role}-${m.text.slice(0, 12)}`} role={m.role}>
                  {m.text}
                </Bubble>
              ) : m.kind === "proposal" ? (
                // The open proposal renders as the card below, not a marker.
                pending?.tool_use_id === m.tool_use_id ? null : <Marker key={`${m.seq}-p-${m.tool_use_id}`}>Proposed · {m.goal.short_label}</Marker>
              ) : (
                <Marker key={`${m.seq}-l`}>✓ Goal locked</Marker>
              ),
            )}
            {streaming && <Bubble role="assistant">{streaming}</Bubble>}
            {sending && !streaming && !drafting && <Marker>Thinking…</Marker>}
            {drafting && <Marker>Drafting your goal…</Marker>}
            {pending && (
              <GoalProposalCard
                key={pending.tool_use_id}
                goal={pending.goal}
                onLock={lock}
                onKeepChatting={() => inputRef.current?.focus()}
                busy={locking}
                error={lockError}
                compact
              />
            )}
          </>
        )}
      </div>

      <div style={{ borderTop: `1px solid ${TOKENS.lineRow}`, padding: 10, display: "flex", gap: 8, alignItems: "flex-end" }}>
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={2}
          maxLength={2000}
          placeholder={pending ? "Want changes? Tell me here…" : "Type your answer…"}
          disabled={!loaded}
          style={{
            flex: 1,
            resize: "none",
            border: "none",
            outline: "none",
            background: "transparent",
            color: TOKENS.ink,
            fontFamily: PAPER_FONTS_V2.sans,
            fontSize: 14,
            lineHeight: 1.5,
            padding: "6px 8px",
          }}
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={sending || !text.trim()}
          style={{
            fontFamily: PAPER_FONTS_V2.sans,
            fontSize: 13,
            fontWeight: 500,
            color: TOKENS.paper,
            background: TOKENS.ink,
            border: "none",
            borderRadius: RADII.button,
            padding: "10px 16px",
            cursor: sending ? "wait" : "pointer",
            opacity: sending || !text.trim() ? 0.5 : 1,
          }}
        >
          Send
        </button>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          padding: "0 14px 10px",
          fontFamily: PAPER_FONTS_V2.mono,
          fontSize: 10.5,
          color: error ? TOKENS.red : TOKENS.faint,
        }}
      >
        <span>{error ?? "Enter to send · Shift+Enter for a new line"}</span>
        {messages.length > 0 && (
          <span onClick={startOver} style={{ cursor: sending ? "wait" : "pointer", color: TOKENS.faint2, whiteSpace: "nowrap" }}>
            Start over
          </span>
        )}
      </div>
    </div>
  );
}
