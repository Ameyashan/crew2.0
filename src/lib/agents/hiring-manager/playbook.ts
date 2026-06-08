// ─────────────────────────────────────────────────────────────────────────────
// Hiring-manager lookup PLAYBOOK — the knowledge layer.
//
// This file is the editable "how to find the right person to email about a job"
// strategy. When the lookup REASONS or SEARCHES poorly — finds the wrong human,
// misses an obvious manager, ranks badly — revise THIS file. It is the
// equivalent of revising a skill: pure heuristics, no orchestration, no API.
//
// What deliberately does NOT live here: the API call, JSON parsing, and the
// deterministic guardrails (poster seeding / dedupe / never-dead-end fallback).
// Those stay in `claude.ts → sourceHiringManagers` and are kept in code on
// purpose — they must be type-checked and can't be at the mercy of a prompt
// edit. The split mirrors the lesson from the poster bug: many "couldn't find
// X" failures are PLUMBING (the agent never got the input), not heuristics, and
// belong in code; only "had the inputs, searched poorly" failures belong here.
//
// Migration note: if this playbook ever grows reference material (company→team
// maps, worked LinkedIn search patterns) and you want versioning + a publish
// workflow, this file is what becomes an Agent Skill's SKILL.md. A loaded skill
// does NOT block live research — the model can still web_search alongside it;
// only the skill's own scripts run in the no-network sandbox.
// ─────────────────────────────────────────────────────────────────────────────

// The person who publicly posted the opening (e.g. the author of a "we're
// hiring" LinkedIn post). They raised their hand in public, so they're the one
// contact we can almost always reach — usually the hiring manager, the team's
// recruiter, or a teammate one hop from the manager.
export interface HiringManagerPoster {
  name: string;
  role?: string | null;
  company?: string | null;
  linkedin?: string | null;
}

export interface SourceHmPromptInput {
  role?: string | null;
  company: string;
  team?: string | null;
  location?: string | null;
  poster?: HiringManagerPoster | null;
}

// The strategy the model follows. Edit freely — the OUTPUT json contract at the
// bottom is the one part the caller depends on (claude.ts parses it), so keep
// that shape intact when you revise.
export const SOURCE_HM_SYSTEM = `You are a sourcing researcher. Given a job's role, company, (optionally) the team it sits in, and (optionally) the person who publicly POSTED the opening, return a SHORT ranked list of the real people most likely to be the HIRING MANAGER for that role — or, failing that, the most relevant person to cold-email about it. The user will pick one before we draft outreach.

Search strategy (this is how a candidate would do it by hand):
1. If a POSTER is given (someone who publicly announced "we're hiring" for this role), research THEM first: confirm their current role, company, and LinkedIn URL. Whoever posts the opening is usually the hiring manager, the recruiter on the team, or a teammate one hop from the manager — so they are a strong, reachable candidate. ALWAYS include them in the list.
2. Primary query: "[team] [role] [company]" — e.g. "Research Product Manager Thinking Machines Lab". Also run it as "site:linkedin.com/in [team] [role] [company]".
3. The hiring manager usually MANAGES this role, so also search for the team's leader: "[company] head of [team]", "[company] [team] lead/director/VP", and "site:linkedin.com/in [company] [team] manager".
4. If no team is given, fall back to "[role] [company]" and "[company] hiring manager [role]". A poster's own posts/comments often name the team — use that to seed the team search.
5. Check the company's team/about/leadership pages when LinkedIn is thin.

Ranking:
- If the poster is plausibly the hiring manager or the recruiter for THIS role, rank them at or near the top.
- Otherwise rank by likelihood of being the person who hires/manages this role (team leads, EMs, directors, founders at small companies) first, then close-adjacent senior people on the same team — but still keep the poster in the list as a reachable fallback contact.
- Prefer people whose current company clearly matches the company named below.

Rules:
- ALWAYS include the poster when one is given — research and fill in their details, even if you also surface a more senior manager.
- NEVER fabricate anyone else. Only return OTHER people you actually found evidence for. If the poster is the only person you can stand behind, return just them.
- Fill role, company, location, and the linkedin URL whenever you can find them.
- "why" is one short line tying them to this role/team ("Head of Research at Thinking Machines — likely manager for this PM role", or "posted this opening — start here"). Keep it factual.

Output strict JSON only, no prose:
{
  "candidates": [
    { "name": string, "role": string|null, "company": string|null, "location": string|null, "linkedin": string|null, "why": string|null }
  ]
}`;

// Assemble the per-run user message: the known facts about the job, plus the
// poster line (when present) and the primary query to run first. Kept here next
// to the strategy it feeds so the whole "what we tell the model" surface is in
// one revisable place.
export function buildSourceHmUserPrompt(input: SourceHmPromptInput): string {
  const teamRolePhrase = [input.team, input.role].filter(Boolean).join(" ");
  const poster = input.poster?.name?.trim() ? input.poster : null;
  return [
    `Company: ${input.company}`,
    input.role && `Role: ${input.role}`,
    input.team
      ? `Team / org: ${input.team}`
      : `Team / org: (not stated in the posting — fall back to "[role] [company]")`,
    input.location && `Location: ${input.location}`,
    poster &&
      `Poster (publicly announced this opening — research first and always include): ${[
        poster.name,
        poster.role,
        poster.company,
        poster.linkedin,
      ]
        .filter(Boolean)
        .join(" · ")}`,
    `Primary search to run first: "${[teamRolePhrase, input.company].filter(Boolean).join(" ")}"`,
  ]
    .filter(Boolean)
    .join("\n");
}
