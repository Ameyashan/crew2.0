import { supabaseAdmin } from "@/lib/supabase";
import { extractStorySeeds } from "@/lib/story/logic";

// Pre-fill a user's Story from their uploaded resume (the prototype's "N entries
// extracted into your Story"). Called from the resume-upload route so BOTH
// onboarding and Settings uploads seed automatically.
//
// Idempotent-ish: only seeds when the Story is currently empty, so replacing a
// resume later never piles duplicate entries onto an established Story. Seeded
// rows land as `raw` — the user's own material, ready to polish on demand.
export async function seedStoryFromResume(userId: string, resumeText: string | null): Promise<number> {
  const seeds = extractStorySeeds(resumeText);
  if (seeds.length === 0) return 0;

  const sb = supabaseAdmin();

  const { count, error: countErr } = await sb
    .from("story_entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (countErr) throw new Error(`story seed count: ${countErr.message}`);
  if ((count ?? 0) > 0) return 0; // already has a Story — don't duplicate

  const rows = seeds.map((raw) => ({ user_id: userId, raw, status: "raw" as const }));
  const { error } = await sb.from("story_entries").insert(rows);
  if (error) throw new Error(`story seed insert: ${error.message}`);
  return rows.length;
}
