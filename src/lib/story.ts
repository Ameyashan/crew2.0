import { supabaseAdmin } from "@/lib/supabase";
import { currentUserId } from "@/lib/user-context";

// Server-side data access for Story entries (Phase E). Mirrors the profile.ts
// pattern: the service-role admin client + currentUserId() for scoping, RLS is a
// backstop. Every function assumes it runs inside withUser()/runWithUser().

export type StoryStatus = "raw" | "pending" | "proposed" | "polished";

export interface StoryEntry {
  id: string;
  user_id: string;
  raw: string;
  bullet: string | null;
  status: StoryStatus;
  tags: string[];
  created_at: string;
  updated_at: string;
}

const COLS = "id, user_id, raw, bullet, status, tags, created_at, updated_at";

// Newest-first list for the Story timeline.
export async function listStoryEntries(): Promise<StoryEntry[]> {
  const { data, error } = await supabaseAdmin()
    .from("story_entries")
    .select(COLS)
    .eq("user_id", currentUserId())
    .order("created_at", { ascending: false });
  if (error) throw new Error(`story list: ${error.message}`);
  return (data as StoryEntry[] | null) ?? [];
}

export async function getStoryEntry(id: string): Promise<StoryEntry | null> {
  const { data, error } = await supabaseAdmin()
    .from("story_entries")
    .select(COLS)
    .eq("user_id", currentUserId())
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`story get: ${error.message}`);
  return (data as StoryEntry | null) ?? null;
}

export async function countStoryEntries(): Promise<number> {
  const { count, error } = await supabaseAdmin()
    .from("story_entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", currentUserId());
  if (error) throw new Error(`story count: ${error.message}`);
  return count ?? 0;
}

export interface NewStoryEntry {
  raw: string;
  bullet?: string | null;
  status?: StoryStatus;
  tags?: string[];
}

export async function createStoryEntry(entry: NewStoryEntry): Promise<StoryEntry> {
  const { data, error } = await supabaseAdmin()
    .from("story_entries")
    .insert({
      user_id: currentUserId(),
      raw: entry.raw,
      bullet: entry.bullet ?? null,
      status: entry.status ?? "raw",
      tags: entry.tags ?? [],
    })
    .select(COLS)
    .single();
  if (error) throw new Error(`story create: ${error.message}`);
  return data as StoryEntry;
}

// Bulk insert used by the resume-upload seed. Best-effort: returns how many rows
// landed. Skips entirely when given an empty list.
export async function createStoryEntries(entries: NewStoryEntry[]): Promise<number> {
  if (!entries.length) return 0;
  const uid = currentUserId();
  const rows = entries.map((e) => ({
    user_id: uid,
    raw: e.raw,
    bullet: e.bullet ?? null,
    status: e.status ?? "raw",
    tags: e.tags ?? [],
  }));
  const { data, error } = await supabaseAdmin()
    .from("story_entries")
    .insert(rows)
    .select("id");
  if (error) throw new Error(`story bulk create: ${error.message}`);
  return data?.length ?? 0;
}

export interface StoryPatch {
  raw?: string;
  bullet?: string | null;
  status?: StoryStatus;
  tags?: string[];
}

export async function updateStoryEntry(id: string, patch: StoryPatch): Promise<StoryEntry | null> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.raw !== undefined) update.raw = patch.raw;
  if (patch.bullet !== undefined) update.bullet = patch.bullet;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.tags !== undefined) update.tags = patch.tags;
  const { data, error } = await supabaseAdmin()
    .from("story_entries")
    .update(update)
    .eq("user_id", currentUserId())
    .eq("id", id)
    .select(COLS)
    .maybeSingle();
  if (error) throw new Error(`story update: ${error.message}`);
  return (data as StoryEntry | null) ?? null;
}

export async function deleteStoryEntry(id: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("story_entries")
    .delete()
    .eq("user_id", currentUserId())
    .eq("id", id);
  if (error) throw new Error(`story delete: ${error.message}`);
}
