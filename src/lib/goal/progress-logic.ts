// Pure model for goal progress: the funnel from "strong matches" to "replies"
// since the goal was set, plus one next-step nudge and the "time to refine?"
// threshold. Counts come from src/lib/goal/progress.ts. Import-free.

export interface GoalProgressCounts {
  strong_matches: number; // roles clearing the fit bar on the Jobs tab (STRONG_SCORE in src/lib/jobs/format.ts)
  applications: number; // job_applications created since the goal started
  submitted: number; // … and confirmed submitted on the ATS
  outreach_sent: number; // interactions "sent" since the goal started
  replies: number; // interactions "replied" since the goal started
  dismissed_since_lock: number; // matches passed on under the CURRENT goal
}

export const REFINE_AFTER_DISMISSALS = 10;

export interface ProgressStep {
  id: keyof Omit<GoalProgressCounts, "dismissed_since_lock">;
  label: string;
  count: number;
}

export interface GoalProgressModel {
  steps: ProgressStep[];
  nudge: string;
  suggestRefine: boolean;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function shouldSuggestRefine(c: Pick<GoalProgressCounts, "dismissed_since_lock">): boolean {
  return c.dismissed_since_lock >= REFINE_AFTER_DISMISSALS;
}

// The single most useful next move, picked from the first gap in the funnel.
export function progressNudge(c: GoalProgressCounts): string {
  if (c.strong_matches === 0 && c.applications === 0) {
    return "No strong matches yet — give the crew a refresh on Jobs, or widen the goal a little.";
  }
  if (c.applications === 0) {
    return `${plural(c.strong_matches, "strong match", "strong matches")} and no applications yet — start with the top one.`;
  }
  if (c.submitted === 0) {
    return `${plural(c.applications, "application")} prepared — submit one today so it counts.`;
  }
  if (c.outreach_sent === 0) {
    return `${plural(c.submitted, "application")} out — reach a person at each company to double your odds.`;
  }
  if (c.replies === 0) {
    return `${plural(c.outreach_sent, "message")} sent — follow up on the oldest in a few days.`;
  }
  return `${plural(c.replies, "reply", "replies")} in — keep the conversations moving.`;
}

export function goalProgressModel(c: GoalProgressCounts): GoalProgressModel {
  return {
    steps: [
      { id: "strong_matches", label: "strong matches", count: c.strong_matches },
      { id: "applications", label: "applications", count: c.applications },
      { id: "submitted", label: "submitted", count: c.submitted },
      { id: "outreach_sent", label: "messages sent", count: c.outreach_sent },
      { id: "replies", label: "replies", count: c.replies },
    ],
    nudge: progressNudge(c),
    suggestRefine: shouldSuggestRefine(c),
  };
}

// One-line summary for the Desk strip: "12 strong matches · 2 applied".
export function progressSummary(c: GoalProgressCounts): string {
  const parts = [plural(c.strong_matches, "strong match", "strong matches")];
  if (c.applications) parts.push(`${c.applications} applied`);
  if (c.replies) parts.push(plural(c.replies, "reply", "replies"));
  return parts.join(" · ");
}

export interface MatchSignal {
  title: string;
  company: string;
}

// "Recent feedback" block for the goal coach's context: what the user passed
// on vs pursued under the current goal, so it can spot a pattern ("every bank
// role dismissed") and suggest one tweak. Empty string when there's nothing.
export function formatMatchFeedback(dismissed: MatchSignal[], pursued: MatchSignal[]): string {
  const line = (m: MatchSignal) => `- ${m.title} — ${m.company}`;
  const parts: string[] = [];
  if (dismissed.length) parts.push(`Passed on (${dismissed.length}):\n${dismissed.map(line).join("\n")}`);
  if (pursued.length) parts.push(`Pursued (${pursued.length}):\n${pursued.map(line).join("\n")}`);
  return parts.length ? `Recent feedback on matches since this goal was locked:\n${parts.join("\n")}` : "";
}
