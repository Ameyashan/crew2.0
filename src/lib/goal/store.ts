// Goal persistence: the locked career goal, the coach chat + its append-only
// transcript, and the projection that feeds a locked goal into the rest of the
// app (job_preferences, user_profile.goal_brief, fresh rankings).
//
// Server-only (service-role client). Callers run inside withUser/runWithUser.

import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase";
import { runWithUser } from "@/lib/user-context";
import { getProfile, senderContextFromProfile } from "@/lib/profile";
import { sectorLabel } from "@/lib/jobs/catalog/sectors";
import { runUserScan } from "@/lib/jobs/scan";
import { getActiveGoal, type ActiveGoal } from "@/lib/goal/active";
import {
  goalToPrefsPatch,
  formatGoalBrief,
  formatGoalForScoring,
  type GoalSpec,
} from "@/lib/goal/goal-logic";
import { lockedTurn, unansweredProposal, type StoredMessage } from "@/lib/goal/chat-logic";
import { formatMatchFeedback, type MatchSignal } from "@/lib/goal/progress-logic";

export { getActiveGoal, type ActiveGoal };

export interface GoalChat {
  id: string;
  source: "onboarding" | "app";
  context_snapshot: string;
}

// A chat's context is frozen when it opens (prompt caching), so one left idle
// for a day goes stale — the locked goal and match feedback have moved on. It
// is archived on the next read and the next message starts a fresh chat.
const CHAT_STALE_MS = 24 * 3_600_000;

export async function getOpenChat(sb: SupabaseClient, uid: string): Promise<GoalChat | null> {
  const { data } = await sb
    .from("goal_chats")
    .select("id, source, context_snapshot, updated_at")
    .eq("user_id", uid)
    .eq("status", "open")
    .maybeSingle();
  if (!data) return null;
  if (Date.now() - Date.parse(data.updated_at) > CHAT_STALE_MS) {
    await sb
      .from("goal_chats")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("status", "open");
    return null;
  }
  return { id: data.id, source: data.source, context_snapshot: data.context_snapshot };
}

export async function loadMessages(sb: SupabaseClient, chatId: string): Promise<StoredMessage[]> {
  const { data } = await sb
    .from("goal_chat_messages")
    .select("seq, role, content")
    .eq("chat_id", chatId)
    .order("seq", { ascending: true });
  return (data ?? []) as StoredMessage[];
}

// Profile context frozen into the chat when it opens. Everything the coach
// should NOT re-ask: background, work authorization, current job filters and
// (when refining) the goal already locked.
export async function buildContextSnapshot(sb: SupabaseClient, uid: string): Promise<string> {
  const [profile, prefsRes, active] = await Promise.all([
    getProfile(),
    sb.from("job_preferences").select("*").eq("user_id", uid).maybeSingle(),
    getActiveGoal(sb, uid),
  ]);
  const parts: string[] = [];
  const sender = senderContextFromProfile(profile, { omitGoal: true });
  if (sender) parts.push(sender);

  const facts: string[] = [];
  if (profile?.location) facts.push(`Lives in: ${profile.location}`);
  if (profile?.work_authorization) facts.push(`Work authorization: ${profile.work_authorization}`);
  if (profile?.needs_sponsorship != null) facts.push(`Needs visa sponsorship: ${profile.needs_sponsorship ? "yes" : "no"}`);
  if (facts.length) parts.push(facts.join("\n"));

  const p = prefsRes.data;
  if (p) {
    const lines: string[] = [];
    if (Array.isArray(p.interests) && p.interests.length) lines.push(`Sectors: ${p.interests.map(sectorLabel).join(", ")}`);
    if (Array.isArray(p.target_roles) && p.target_roles.length) lines.push(`Roles: ${p.target_roles.join(", ")}`);
    if (Array.isArray(p.locations) && p.locations.length) lines.push(`Locations: ${p.locations.join(", ")}`);
    if (lines.length) parts.push(`Current job-feed settings:\n${lines.join("\n")}`);
  }

  if (active) {
    parts.push(`Their CURRENT locked goal (they're refining it):\n${formatGoalForScoring(active.goal)}`);
    const feedback = await loadMatchFeedback(sb, uid, active);
    if (feedback) parts.push(feedback);
  }
  return parts.join("\n\n") || "(No profile information yet.)";
}

const FEEDBACK_DISMISSED = 15;
const FEEDBACK_PURSUED = 10;

// Matches the user dismissed / started outreach on under the current goal
// (scored_at ≥ finalized_at: a lock clears and re-scores matches). Lets the
// coach notice a pattern and suggest a tweak — the user still confirms.
async function loadMatchFeedback(sb: SupabaseClient, uid: string, active: ActiveGoal): Promise<string> {
  const pick = async (status: string, limit: number): Promise<MatchSignal[]> => {
    const { data, error } = await sb
      .from("job_matches")
      .select("scored_at, jobs!inner(title, company)")
      .eq("user_id", uid)
      .eq("status", status)
      .gte("scored_at", active.finalized_at)
      .order("scored_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("[goal/snapshot] feedback query failed", error.message);
      return [];
    }
    return ((data ?? []) as unknown as Array<{ jobs: { title: string; company: string } | null }>)
      .map((r) => r.jobs)
      .filter((j): j is MatchSignal => !!j);
  };
  const [dismissed, pursued] = await Promise.all([
    pick("dismissed", FEEDBACK_DISMISSED),
    pick("outreach_started", FEEDBACK_PURSUED),
  ]);
  return formatMatchFeedback(dismissed, pursued);
}

export async function openChat(
  sb: SupabaseClient,
  uid: string,
  source: "onboarding" | "app",
): Promise<GoalChat> {
  const existing = await getOpenChat(sb, uid);
  if (existing) return existing;
  const context_snapshot = await buildContextSnapshot(sb, uid);
  const { data, error } = await sb
    .from("goal_chats")
    .insert({ user_id: uid, source, context_snapshot })
    .select("id, source, context_snapshot")
    .single();
  if (error) {
    // Lost a race with another tab — the unique open-chat index fired.
    const again = await getOpenChat(sb, uid);
    if (again) return again;
    throw error;
  }
  return data as GoalChat;
}

export async function archiveOpenChat(sb: SupabaseClient, uid: string): Promise<void> {
  await sb
    .from("goal_chats")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("user_id", uid)
    .eq("status", "open");
}

export class SeqConflictError extends Error {
  constructor() {
    super("chat changed underneath this turn");
  }
}

// Append turns after `afterSeq`. The (chat_id, seq) unique key turns a race
// between two tabs into a SeqConflictError instead of interleaved history.
export async function appendMessages(
  sb: SupabaseClient,
  chatId: string,
  uid: string,
  afterSeq: number,
  msgs: Array<Pick<StoredMessage, "role" | "content"> & { meta?: Record<string, unknown> }>,
): Promise<number> {
  if (!msgs.length) return afterSeq;
  const rows = msgs.map((m, i) => ({
    chat_id: chatId,
    user_id: uid,
    seq: afterSeq + 1 + i,
    role: m.role,
    content: m.content,
    meta: m.meta ?? {},
  }));
  const { error } = await sb.from("goal_chat_messages").insert(rows);
  if (error) {
    if (error.code === "23505") throw new SeqConflictError();
    throw error;
  }
  await sb.from("goal_chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId);
  return afterSeq + msgs.length;
}

// User-authored turns in the last 24h, across chats — the daily chat cap.
export async function userTurnsToday(sb: SupabaseClient, uid: string): Promise<number> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await sb
    .from("goal_chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", uid)
    .eq("role", "user")
    .gte("created_at", since);
  return count ?? 0;
}

export interface LockResult {
  goal: ActiveGoal;
  refined: boolean;
}

// Lock a goal: archive the current one, insert the new one, close the loop in
// the chat transcript, project into job_preferences + goal_brief, clear stale
// rankings, and (unless refresh=false) re-scan in the background.
export async function lockGoal(
  uid: string,
  input: { goal: GoalSpec; chatId?: string | null; toolUseId?: string | null; refresh?: boolean },
): Promise<LockResult> {
  const sb = supabaseAdmin();
  const { goal } = input;
  const prev = await getActiveGoal(sb, uid);
  const nowIso = new Date().toISOString();

  if (prev) {
    const { error } = await sb
      .from("career_goals")
      .update({ status: "archived", archived_at: nowIso })
      .eq("id", prev.id);
    if (error) throw error;
  }
  const { data, error } = await sb
    .from("career_goals")
    .insert({
      user_id: uid,
      spec: goal,
      summary: goal.summary,
      short_label: goal.short_label,
      chat_id: input.chatId ?? null,
      started_at: prev?.started_at ?? nowIso,
      finalized_at: nowIso,
    })
    .select("id, started_at, finalized_at")
    .single();
  if (error) throw error;

  // Answer the proposal the user just locked, so the transcript stays a valid
  // tool_use → tool_result sequence if they keep chatting. Only when it's still
  // the open proposal; an older one was already answered by a later turn.
  if (input.chatId && input.toolUseId) {
    const history = await loadMessages(sb, input.chatId);
    const open = unansweredProposal(history);
    if (open?.tool_use_id === input.toolUseId) {
      const lastSeq = history.length ? history[history.length - 1].seq : -1;
      try {
        await appendMessages(sb, input.chatId, uid, lastSeq, [{ role: "user", content: lockedTurn(input.toolUseId, goal) }]);
      } catch (e) {
        // A concurrent turn answered it first — nothing left to close.
        if (!(e instanceof SeqConflictError)) throw e;
      }
    }
  }

  // Projection. Partial upsert: only the columns the goal owns.
  const patch = goalToPrefsPatch(goal);
  const { error: prefErr } = await sb
    .from("job_preferences")
    .upsert({ user_id: uid, ...patch, updated_at: nowIso }, { onConflict: "user_id" });
  if (prefErr) console.error("[goal/lock] prefs projection failed", prefErr);

  const { error: profErr } = await sb
    .from("user_profile")
    .upsert({ user_id: uid, goal_brief: formatGoalBrief(goal) }, { onConflict: "user_id" });
  if (profErr) console.error("[goal/lock] goal_brief failed", profErr);

  // The scorer never re-scores a job that already has a match row, so the old
  // rankings (and their reasons) must go. Dismissed / outreach rows carry user
  // intent and stay.
  const { error: delErr } = await sb
    .from("job_matches")
    .delete()
    .eq("user_id", uid)
    .in("status", ["new", "seen"]);
  if (delErr) console.error("[goal/lock] clear matches failed", delErr);

  if (input.refresh !== false) {
    after(() =>
      runWithUser(uid, () => runUserScan(uid)).catch((e) => console.error("[goal/lock] rescan failed", e)),
    );
  }

  return {
    goal: { id: data.id, goal, started_at: data.started_at, finalized_at: data.finalized_at },
    refined: !!prev,
  };
}
