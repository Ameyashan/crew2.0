import { supabaseAdmin } from "@/lib/supabase";
import { USER_ID } from "@/lib/utils";

export interface UserProfile {
  user_id: string;
  full_name: string | null;
  linkedin_url: string | null;
  resume_text: string | null;
  resume_filename: string | null;
  writing_samples: string | null;
  followup_days: number | null;
  context_prompt: string | null;
  context_structured: Record<string, unknown> | null;
  onboarded_at: string | null;
  updated_at: string;
}

export async function getProfile(): Promise<UserProfile | null> {
  const { data } = await supabaseAdmin()
    .from("user_profile")
    .select("*")
    .eq("user_id", USER_ID)
    .maybeSingle();
  return (data as UserProfile | null) ?? null;
}

export interface ProfilePatch {
  full_name?: string | null;
  linkedin_url?: string | null;
  resume_text?: string | null;
  resume_filename?: string | null;
  writing_samples?: string | null;
  followup_days?: number | null;
  context_prompt?: string | null;
  context_structured?: Record<string, unknown> | null;
  onboarded_at?: string | null;
}

export async function upsertProfile(patch: ProfilePatch) {
  const sb = supabaseAdmin();
  const { error } = await sb
    .from("user_profile")
    .upsert(
      { user_id: USER_ID, ...patch, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  if (error) throw new Error(`profile upsert: ${error.message}`);
}

// Returns just the parts of the profile we want to inject as sender context
// in drafts. Truncates resume to keep the prompt tight.
export function senderContextFromProfile(p: UserProfile | null): string {
  if (!p) return "";
  const parts: string[] = [];
  if (p.full_name) parts.push(`Name: ${p.full_name}`);
  if (p.linkedin_url) parts.push(`LinkedIn: ${p.linkedin_url}`);
  if (p.resume_text) {
    const trimmed = p.resume_text.replace(/\s+/g, " ").trim().slice(0, 2400);
    parts.push(`Background (from resume):\n${trimmed}`);
  }
  if (p.context_prompt) {
    const trimmed = p.context_prompt.replace(/\s+/g, " ").trim().slice(0, 2400);
    parts.push(`Goals & context (in their own words):\n${trimmed}`);
  }
  return parts.join("\n\n");
}
