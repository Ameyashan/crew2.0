// ─────────────────────────────────────────────────────────────────────────────
// Hiring-manager lookup EVALS — regression fixtures for the playbook.
//
// When you revise playbook.ts to fix a "couldn't find the right person" report,
// add the failing scenario here FIRST, then change the playbook until it passes.
// That's the safety net that lets you iterate on the heuristics without quietly
// regressing an earlier fix.
//
// Two kinds of expectation, split by what's cheap to check:
//
//  1. DETERMINISTIC guarantees (poster always reachable, never dead-end when we
//     had a name in hand). These are produced by the guardrails in
//     claude.ts → sourceHiringManagers and can be checked WITHOUT calling the
//     API — feed a candidate list into `checkDeterministic()` below. The Charu
//     case (#1) is exactly the bug we fixed: a named poster at a huge company.
//
//  2. SEARCH-QUALITY expectations (did it surface the actual manager, rank well)
//     are inherently live — they need a real web_search run — so they're recorded
//     as `note` only, to be driven by a human or a future live harness. We do NOT
//     fabricate an "expected" LinkedIn URL the model must hit; that would be a
//     brittle, dishonest assertion.
// ─────────────────────────────────────────────────────────────────────────────

import type { IdentifyCandidate } from "@/lib/claude";
import type { SourceHmPromptInput } from "./playbook";

export interface HiringManagerEval {
  id: string;
  description: string;
  input: SourceHmPromptInput;
  expect: {
    // Deterministic — checkable offline against a candidate list.
    mustIncludeName?: string; // a name that must appear among the candidates
    mustNotBeEmpty?: boolean; // a contact must exist (no honest dead-end allowed)
    deadEndAllowed?: boolean; // true only when there's genuinely nobody to reach
    // Search-quality — for a human / live harness to judge, not auto-asserted.
    note?: string;
  };
}

export const HIRING_MANAGER_EVALS: HiringManagerEval[] = [
  {
    id: "charu-google-pm",
    description:
      "“We're hiring” LinkedIn post by a named poster at a large company — the original failure.",
    input: {
      role: "Senior Product Manager, AI Foundations Data",
      company: "Google",
      team: "AI Foundations Data",
      poster: {
        name: "Charu Lalwani",
        role: "Product Leader",
        company: "Google",
        linkedin: null,
      },
    },
    expect: {
      mustIncludeName: "Charu Lalwani",
      mustNotBeEmpty: true,
      note: "Before the poster fix this dead-ended with 'couldn't pin down a hiring manager' and no cold email, even though the poster was right there in the screenshot. The poster must always survive as a reachable contact; a genuine team manager, if found, may legitimately outrank her.",
    },
  },
  {
    id: "small-startup-team-lead",
    description:
      "Small company, no poster — the team lead should be findable by '[team] [role] [company]'.",
    input: {
      role: "Research Product Manager",
      company: "Thinking Machines Lab",
      team: "Research",
      poster: null,
    },
    expect: {
      // No poster to guarantee, and sourcing quality is live — so we don't force
      // non-empty here. The point of this fixture is the search-quality note.
      note: "At a small lab the head of the named team is usually the manager and is publicly findable. A live run should surface a plausible Research lead, not dead-end.",
    },
  },
  {
    id: "unreadable-posting-no-poster",
    description:
      "Auth-walled posting AND no poster — an honest dead-end is the correct outcome.",
    input: {
      role: null,
      company: "Unknown Co",
      team: null,
      poster: null,
    },
    expect: {
      deadEndAllowed: true,
      note: "With no readable company signal and nobody who raised their hand, returning nothing (so the UI asks for a team name / LinkedIn) is correct — do NOT fabricate a contact to look helpful.",
    },
  },
];

export interface DeterministicCheck {
  id: string;
  passed: boolean;
  failures: string[];
}

// Offline checker for the deterministic guarantees only. Pass the candidate list
// a run produced (live, or a recorded fixture) and it verifies the invariants
// the code guardrails promise — no API call, no token cost. Search-quality
// expectations (the `note`s) are intentionally not asserted here.
export function checkDeterministic(
  ev: HiringManagerEval,
  candidates: IdentifyCandidate[],
): DeterministicCheck {
  const failures: string[] = [];
  const names = candidates.map((c) => c.name?.trim().toLowerCase() ?? "");

  if (ev.expect.mustIncludeName) {
    const want = ev.expect.mustIncludeName.trim().toLowerCase();
    if (!names.includes(want)) {
      failures.push(`expected "${ev.expect.mustIncludeName}" among candidates, got [${names.join(", ")}]`);
    }
  }
  if (ev.expect.mustNotBeEmpty && candidates.length === 0) {
    failures.push("expected at least one reachable contact, got an empty list");
  }
  if (!ev.expect.deadEndAllowed && ev.input.poster && candidates.length === 0) {
    failures.push("a poster was provided but the result dead-ended — the poster guardrail should guarantee a contact");
  }

  return { id: ev.id, passed: failures.length === 0, failures };
}
