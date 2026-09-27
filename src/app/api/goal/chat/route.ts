import { NextRequest } from "next/server";
import { withUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { runWithUser } from "@/lib/user-context";
import { trackServer } from "@/lib/analytics/server";
import { runCoachTurn } from "@/lib/goal/coach";
import { buildUserTurn, type StoredMessage } from "@/lib/goal/chat-logic";
import {
  appendMessages,
  archiveOpenChat,
  loadMessages,
  openChat,
  userTurnsToday,
  SeqConflictError,
} from "@/lib/goal/store";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_MESSAGE_CHARS = 2000;
const MAX_TURNS_PER_DAY = 60;
// A chat that runs this long starts over (the new chat's context carries the
// locked goal), keeping each request's prompt bounded.
const MAX_CHAT_MESSAGES = 60;

// POST /api/goal/chat — one coach turn, streamed as SSE:
//   {type:"chat", chat_id} → {type:"delta", text}* → {type:"proposal_start"}?
//   → {type:"goal_proposal", tool_use_id, goal}? → {type:"done"} | {type:"error", message}
// History is always loaded from the database (never trusted from the client);
// the user turn and the coach's reply are persisted together, only on success.
export async function POST(req: NextRequest) {
  return withUser(async (userId) => {
    const body = await req.json().catch(() => ({}));
    const text = typeof body?.message === "string" ? body.message.trim() : "";
    if (!text) return Response.json({ error: "Say something first." }, { status: 400 });
    if (text.length > MAX_MESSAGE_CHARS) {
      return Response.json({ error: `Keep it under ${MAX_MESSAGE_CHARS} characters.` }, { status: 400 });
    }
    const source = body?.source === "onboarding" ? "onboarding" : "app";

    const sb = supabaseAdmin();
    if ((await userTurnsToday(sb, userId)) >= MAX_TURNS_PER_DAY) {
      return Response.json({ error: "That's a lot of goal-talk for one day — pick it up tomorrow." }, { status: 429 });
    }

    let chat = await openChat(sb, userId, source);
    let history = await loadMessages(sb, chat.id);
    if (history.length >= MAX_CHAT_MESSAGES) {
      await archiveOpenChat(sb, userId);
      chat = await openChat(sb, userId, source);
      history = [];
    }
    const lastSeq = history.length ? history[history.length - 1].seq : -1;
    const userMsg: StoredMessage = { seq: lastSeq + 1, role: "user", content: buildUserTurn(history, text) };
    if (!history.length) await trackServer("goal_chat_started", { source });

    const encoder = new TextEncoder();
    const chatId = chat.id;
    const snapshot = chat.context_snapshot;
    const stream = new ReadableStream({
      async start(controller) {
        await runWithUser(userId, async () => {
          const send = (obj: unknown) => {
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
            } catch {
              // client went away — keep going so the turn still persists
            }
          };
          send({ type: "chat", chat_id: chatId });
          try {
            const result = await runCoachTurn({
              snapshot,
              history: [...history, userMsg],
              onEvent: send,
            });
            if (result.refused) {
              send({ type: "error", message: "I couldn't work with that one — try rephrasing?", discard: true });
            } else {
              await appendMessages(sb, chatId, userId, lastSeq, [
                { role: "user", content: userMsg.content },
                ...result.appended,
              ]);
              if (result.proposal) {
                send({ type: "goal_proposal", ...result.proposal });
                await trackServer("goal_proposed", { source });
              }
              send({ type: "done" });
            }
          } catch (e) {
            if (e instanceof SeqConflictError) {
              send({ type: "error", message: "This chat changed in another tab — reload to continue.", discard: true });
            } else {
              console.error("[goal/chat] turn failed", e);
              send({ type: "error", message: "The coach hit a snag — try again.", discard: true });
            }
          }
          try {
            controller.close();
          } catch {
            // already closed
          }
        });
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  });
}
