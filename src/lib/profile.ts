import { supabaseAdmin } from "@/lib/supabase";
import { USER_ID } from "@/lib/utils";

export const CONTEXT_PROMPT_TEMPLATE = `I'm using a tool that drafts outreach messages on my behalf. Help me write a self-summary it can use as context. Cover:
- My current role, background, and what I'm working on
- What I'm looking for next (roles, companies, kinds of people to meet)
- My motivations and what excites me professionally
- How I communicate (tone, formality, things I'd never say)
- Anything else that would help someone write a message that sounds like me

Ask me questions if you need to. When we're done, give me a single block of text I can paste back.`;

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
  if (p.context_structured && typeof p.context_structured === "object") {
    const formatted = formatStructuredContext(p.context_structured);
    if (formatted) parts.push(`Goals & context:\n${formatted}`);
  } else if (p.context_prompt) {
    const trimmed = p.context_prompt.replace(/\s+/g, " ").trim().slice(0, 2400);
    parts.push(`Goals & context (in their own words):\n${trimmed}`);
  }
  return parts.join("\n\n");
}

function formatStructuredContext(c: Record<string, unknown>): string {
  const lines: string[] = [];
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const arr = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];

  const role = str(c.current_role);
  if (role) lines.push(`Current role: ${role}`);
  const bg = str(c.background_summary);
  if (bg) lines.push(`Background: ${bg}`);
  const lookingFor = arr(c.looking_for);
  if (lookingFor.length) lines.push(`Looking for: ${lookingFor.join("; ")}`);
  const motivations = arr(c.motivations);
  if (motivations.length) lines.push(`Motivated by: ${motivations.join("; ")}`);
  const companies = arr(c.target_companies);
  if (companies.length) lines.push(`Target companies: ${companies.join(", ")}`);
  const roles = arr(c.target_roles);
  if (roles.length) lines.push(`Target roles: ${roles.join(", ")}`);
  const projects = arr(c.notable_projects);
  if (projects.length) lines.push(`Notable projects: ${projects.join("; ")}`);

  const voice = c.voice as Record<string, unknown> | undefined;
  if (voice && typeof voice === "object") {
    const tone = str(voice.tone);
    const formality = str(voice.formality);
    const avoid = arr(voice.avoid);
    const voiceBits: string[] = [];
    if (tone) voiceBits.push(`tone ${tone}`);
    if (formality) voiceBits.push(`${formality} register`);
    if (avoid.length) voiceBits.push(`avoid: ${avoid.join(", ")}`);
    if (voiceBits.length) lines.push(`Voice: ${voiceBits.join("; ")}`);
  }

  const other = arr(c.other);
  if (other.length) lines.push(`Other: ${other.join("; ")}`);

  return lines.join("\n");
}
