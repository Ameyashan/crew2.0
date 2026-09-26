// ─────────────────────────── the warm-intro skill ───────────────────────────
//
// Sibling of the cold-outreach skill for the OTHER message: asking someone the
// sender already knows (a LinkedIn connection) to introduce them to — or
// forward a note to — the right person at the connection's company.
//
// Borrowed from high-leverage-job-hunt (paulklayvc/skills), Move 3 "Access":
// prefer a warm path over a cold one, and make the intro request concrete —
// name the company and the team/person, give ONE line on why the sender is a
// fit, and make the ask explicit and easy to decline. The connection should
// be able to act on it in under a minute, so the draft carries a short blurb
// they can forward as-is.

export type IntroChannel = "email" | "x_dm" | "linkedin";

export interface WarmIntroTarget {
  company: string;
  role?: string | null; // the opening, when the ask is about a specific job
  team?: string | null;
  job_url?: string | null;
}

interface Principle {
  title: string;
  detail: string;
}

export const WARM_INTRO_PRINCIPLES: Principle[] = [
  {
    title: "Honest about the relationship",
    detail:
      "The recipient is a 1st-degree connection, not a close friend unless the sender's notes say so. Don't invent shared history, a last conversation, or warmth that isn't there. A light, true opener ('it's been a while' only if plausible, otherwise straight to the point) beats fake familiarity.",
  },
  {
    title: "Name the target",
    detail:
      "Say exactly what the sender is after: the specific role (if given) and company, and the team or person they'd most like to reach. A vague 'any openings?' is work for the connection; a named target is a thirty-second favor.",
  },
  {
    title: "One line on why you're a fit",
    detail:
      "Give the single most relevant, concrete proof from the sender's own background: something they built or moved, with a number if there is one. One sentence. This is what lets the connection vouch without checking your résumé.",
  },
  {
    title: "One explicit, easy ask",
    detail:
      "Ask for exactly one of: an intro to the hiring manager / team, or permission to send them a short note they can forward (or a referral if the company has a referral program). Make it easy to say no ('totally fine if it's not your area').",
  },
  {
    title: "Hand them a forwardable blurb",
    detail:
      "In email and LinkedIn, end with a 2–3 sentence blurb written about the sender in the third person that the connection can paste as-is ('<Name> is a … who …, and is interested in the <role> role on <team>.'). No blurb in an X DM.",
  },
  {
    title: "Don't pitch the connection",
    detail:
      "The connection isn't the one hiring. Don't sell to them, flatter them, or ask them for a job. Never ask them to 'put in a good word' for something they know nothing about; give them what they'd need to do it.",
  },
];

// Guidance block injected into the drafting system prompt instead of the
// cold-outreach craft when the run is a warm-intro ask.
export function warmIntroGuide(channel: IntroChannel = "linkedin"): string {
  const body = WARM_INTRO_PRINCIPLES.map((p, i) => `${i + 1}. ${p.title}: ${p.detail}`).join("\n");
  const blurb =
    channel === "x_dm"
      ? "This is an X DM: skip the forwardable blurb and keep it to the ask."
      : "Put the forwardable blurb last, set off on its own lines after the ask (e.g. introduced by 'If it helps, here's something you can forward:').";
  return `WARM INTRO CRAFT: this ${channel === "email" ? "email" : channel === "x_dm" ? "X DM" : "LinkedIn message"} goes to someone the sender already knows, asking them to connect the sender with the right person at their company. Treat each rule as a hard constraint:

${body}

${blurb}

The bar: could the connection act on this in under a minute without writing anything themselves?`;
}

export function warmIntroIntent(t: WarmIntroTarget): string {
  const what = t.role ? `the ${t.role} role${t.team ? ` (${t.team})` : ""} at ${t.company}` : `a role at ${t.company}`;
  return `Warm intro ask: introduce me to the right person for ${what}.`;
}

// Untrusted request body → target (null when unusable).
export function parseWarmIntroTarget(raw: unknown): WarmIntroTarget | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const s = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
  const company = s(r.company, 200);
  if (!company) return null;
  const url = s(r.job_url, 1000);
  return {
    company,
    role: s(r.role, 200),
    team: s(r.team, 200),
    job_url: url && /^https?:\/\//i.test(url) ? url : null,
  };
}
