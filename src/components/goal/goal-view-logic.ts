// Pure helpers for the goal chat UI: the editable goal-card form model and the
// SSE frame parser. No React, so `node --test` can import it.

import {
  formatUsdCompact,
  type CompBasis,
  type GoalSize,
  type GoalSpec,
  type RemotePref,
  type Seniority,
} from "../../lib/goal/goal-logic.ts";

// The card's edit form. List fields are raw comma-separated text so typing
// keeps spaces ("Product Manager"); they're split only on submit.
export interface GoalForm {
  summary: string;
  short_label: string;
  target_roles: string;
  seniority: Seniority[];
  comp_floor: string;
  comp_basis: CompBasis;
  industries: string;
  company_sizes: GoalSize[];
  locations: string;
  remote: RemotePref | "";
  visa: "yes" | "no" | "";
  target_companies: string;
  must_haves: string;
  dealbreakers: string;
  timeline: string;
}

export function specToForm(g: GoalSpec): GoalForm {
  return {
    summary: g.summary,
    short_label: g.short_label,
    target_roles: g.target_roles.join(", "),
    seniority: g.seniority.slice(),
    comp_floor: g.comp_floor_usd == null ? "" : formatUsdCompact(g.comp_floor_usd).replace("$", ""),
    comp_basis: g.comp_basis,
    industries: g.industries.join(", "),
    company_sizes: g.company_sizes.slice(),
    locations: g.locations.join(", "),
    remote: g.remote ?? "",
    visa: g.visa_required == null ? "" : g.visa_required ? "yes" : "no",
    target_companies: g.target_companies.join(", "),
    must_haves: g.must_haves.join("; "),
    dealbreakers: g.dealbreakers.join("; "),
    timeline: g.timeline ?? "",
  };
}

const splitList = (s: string, sep: RegExp = /,/) =>
  s
    .split(sep)
    .map((x) => x.trim())
    .filter(Boolean);

// Raw input for validateGoalSpec (which normalizes + caps). short_label is
// cleared when anything label-worthy changed, so the server re-derives it
// instead of keeping a stale "…$200k+" after the floor was edited.
export function formToSpecInput(f: GoalForm, original?: GoalSpec): Record<string, unknown> {
  const input: Record<string, unknown> = {
    summary: f.summary,
    short_label: f.short_label,
    target_roles: splitList(f.target_roles),
    seniority: f.seniority,
    comp_floor_usd: f.comp_floor.trim() || null,
    comp_basis: f.comp_basis,
    industries: splitList(f.industries),
    company_sizes: f.company_sizes,
    locations: splitList(f.locations),
    remote: f.remote || null,
    visa_required: f.visa === "" ? null : f.visa === "yes",
    target_companies: splitList(f.target_companies),
    must_haves: splitList(f.must_haves, /;/),
    dealbreakers: splitList(f.dealbreakers, /;/),
    timeline: f.timeline.trim() || null,
  };
  if (original) {
    const before = specToForm(original);
    const labelInputs: Array<keyof GoalForm> = ["target_roles", "industries", "comp_floor"];
    if (f.short_label === before.short_label && labelInputs.some((k) => f[k] !== before[k])) {
      input.short_label = "";
    }
  }
  return input;
}

export function toggleIn<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

// Split an SSE byte-stream buffer into complete `data:` JSON events plus the
// unconsumed tail (a frame may arrive split across reads).
export function parseSseChunk(buf: string): { events: unknown[]; rest: string } {
  const parts = buf.split("\n\n");
  const rest = parts.pop() ?? "";
  const events: unknown[] = [];
  for (const raw of parts) {
    const line = raw.split("\n").find((l) => l.startsWith("data: "));
    if (!line) continue;
    try {
      events.push(JSON.parse(line.slice(6)));
    } catch {
      // malformed frame — skip it
    }
  }
  return { events, rest };
}

// Chips shown on the goal card, in reading order.
export function goalChips(g: GoalSpec): string[] {
  const chips: string[] = [];
  if (g.comp_floor_usd != null) chips.push(`${formatUsdCompact(g.comp_floor_usd)}+ ${g.comp_basis === "total" ? "total" : "base"}`);
  chips.push(...g.industries);
  chips.push(...g.locations);
  if (g.remote === "remote_only") chips.push("Remote only");
  else if (g.remote === "remote_ok") chips.push("Remote OK");
  if (g.visa_required) chips.push("Needs sponsorship");
  return chips;
}
