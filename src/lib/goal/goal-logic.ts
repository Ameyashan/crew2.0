// Pure, import-free goal model: the structured job-search goal a user settles
// on with the goal coach (src/lib/goal/coach.ts), plus the projections that
// feed it into the parts of the app that already exist (job_preferences, the
// scorer prompt, outreach context). Kept dependency-free so `node --test` can
// import it directly.

export const SENIORITY = [
  "intern",
  "entry",
  "mid",
  "senior",
  "staff_principal",
  "manager",
  "director",
  "vp_plus",
] as const;
export type Seniority = (typeof SENIORITY)[number];

export const SENIORITY_LABEL: Record<Seniority, string> = {
  intern: "Intern",
  entry: "Entry level",
  mid: "Mid level",
  senior: "Senior",
  staff_principal: "Staff / Principal",
  manager: "Manager",
  director: "Director",
  vp_plus: "VP+",
};

export const GOAL_SIZES = ["startup", "medium", "large"] as const;
export type GoalSize = (typeof GOAL_SIZES)[number];

export const GOAL_SIZE_LABEL: Record<GoalSize, string> = {
  startup: "Startup",
  medium: "Mid-size",
  large: "Large company",
};

export const REMOTE_PREFS = ["remote_only", "remote_ok", "onsite_ok"] as const;
export type RemotePref = (typeof REMOTE_PREFS)[number];

export const REMOTE_LABEL: Record<RemotePref, string> = {
  remote_only: "Remote only",
  remote_ok: "Remote or on-site",
  onsite_ok: "On-site is fine",
};

export type CompBasis = "base" | "total";

export interface GoalSpec {
  v: 1;
  summary: string;
  short_label: string;
  target_roles: string[];
  seniority: Seniority[];
  comp_floor_usd: number | null;
  comp_basis: CompBasis;
  industries: string[];
  company_sizes: GoalSize[];
  locations: string[];
  remote: RemotePref | null;
  visa_required: boolean | null;
  target_companies: string[];
  must_haves: string[];
  dealbreakers: string[];
  timeline: string | null;
}

export const GOAL_LIMITS = {
  summary: 300,
  short_label: 48,
  item: 80,
  target_roles: 6,
  industries: 8,
  locations: 8,
  target_companies: 15,
  must_haves: 8,
  dealbreakers: 8,
  timeline: 80,
  comp_min: 10_000,
  comp_max: 5_000_000,
} as const;

export type ValidateResult = { ok: true; goal: GoalSpec } | { ok: false; errors: string[] };

function cleanStr(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

// Trim, drop empties, dedupe case-insensitively (first spelling wins), cap.
// A bare comma-separated string is accepted too — card edits send raw text.
export function cleanList(v: unknown, cap: number, itemMax: number = GOAL_LIMITS.item): string[] {
  const raw = typeof v === "string" ? v.split(",") : Array.isArray(v) ? v : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const s = cleanStr(item, itemMax);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= cap) break;
  }
  return out;
}

function pickEnum<T extends string>(v: unknown, allowed: readonly T[]): T[] {
  const raw = Array.isArray(v) ? v : [];
  const out: T[] = [];
  for (const x of raw) {
    if (typeof x === "string" && (allowed as readonly string[]).includes(x) && !out.includes(x as T)) out.push(x as T);
  }
  return out;
}

// Comp floor in USD per year. Accepts a number or text like "200k", "$200,000",
// "1.2m". Small numbers are read as thousands (the model and people both write
// "200" meaning $200k). Returns undefined for garbage/out-of-range so the
// validator can report it; null means "no floor".
export function normalizeCompFloor(v: unknown): number | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  let n: number;
  if (typeof v === "number") {
    n = v;
  } else if (typeof v === "string") {
    const m = v.toLowerCase().replace(/[$,\s]|usd/g, "").match(/^(\d+(?:\.\d+)?)(k|m)?\+?$/);
    if (!m) return undefined;
    n = Number(m[1]) * (m[2] === "m" ? 1_000_000 : m[2] === "k" ? 1_000 : 1);
  } else {
    return undefined;
  }
  if (!Number.isFinite(n) || n <= 0) return undefined;
  if (n < 1_000) n *= 1_000;
  n = Math.round(n);
  if (n < GOAL_LIMITS.comp_min || n > GOAL_LIMITS.comp_max) return undefined;
  return n;
}

// "$200k" / "$1.2M" — compact money for labels and prompts.
export function formatUsdCompact(n: number): string {
  if (n >= 1_000_000) return `$${Number((n / 1_000_000).toFixed(2))}M`;
  return `$${Math.round(n / 1_000)}k`;
}

export function formatCompFloor(goal: Pick<GoalSpec, "comp_floor_usd" | "comp_basis">): string | null {
  if (goal.comp_floor_usd == null) return null;
  return `${formatUsdCompact(goal.comp_floor_usd)}+ ${goal.comp_basis === "total" ? "total comp" : "base"}`;
}

// Fallback card label when the model didn't give one (or it was too long):
// "Senior Product Manager · hedge funds · $200k+".
export function deriveShortLabel(goal: Omit<GoalSpec, "short_label" | "v">): string {
  const role = goal.target_roles[0] ?? "Your next role";
  const level = goal.seniority.length === 1 ? SENIORITY_LABEL[goal.seniority[0]] : "";
  const senior = level && !role.toLowerCase().includes(level.toLowerCase()) ? `${level} ` : "";
  const parts = [`${senior}${role}`];
  if (goal.industries[0]) parts.push(goal.industries[0]);
  if (goal.comp_floor_usd != null) parts.push(`${formatUsdCompact(goal.comp_floor_usd)}+`);
  let label = parts.join(" · ");
  while (label.length > GOAL_LIMITS.short_label && parts.length > 1) {
    parts.splice(1, 1);
    label = parts.join(" · ");
  }
  return label.slice(0, GOAL_LIMITS.short_label);
}

// Validate + normalize untrusted goal input (model tool input or a user's card
// edit). Unknown keys are dropped; enums are filtered; lists are capped.
export function validateGoalSpec(input: unknown): ValidateResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: ["goal must be an object"] };
  }
  const o = input as Record<string, unknown>;
  const errors: string[] = [];

  const summary = cleanStr(o.summary, GOAL_LIMITS.summary);
  if (summary.length < 3) errors.push("summary is required");

  const target_roles = cleanList(o.target_roles, GOAL_LIMITS.target_roles);
  if (!target_roles.length) errors.push("at least one target role is required");

  const comp = normalizeCompFloor(o.comp_floor_usd);
  if (comp === undefined) {
    errors.push(`comp_floor_usd must be a yearly USD amount between ${GOAL_LIMITS.comp_min} and ${GOAL_LIMITS.comp_max}, or null`);
  }

  const remote = REMOTE_PREFS.includes(o.remote as RemotePref) ? (o.remote as RemotePref) : null;
  const visa_required = typeof o.visa_required === "boolean" ? o.visa_required : null;
  const timeline = cleanStr(o.timeline, GOAL_LIMITS.timeline) || null;

  if (errors.length) return { ok: false, errors };

  const base = {
    summary,
    target_roles,
    seniority: pickEnum(o.seniority, SENIORITY),
    comp_floor_usd: comp ?? null,
    comp_basis: (o.comp_basis === "total" ? "total" : "base") as CompBasis,
    industries: cleanList(o.industries, GOAL_LIMITS.industries),
    company_sizes: pickEnum(o.company_sizes, GOAL_SIZES),
    locations: cleanList(o.locations, GOAL_LIMITS.locations),
    remote,
    visa_required,
    target_companies: cleanList(o.target_companies, GOAL_LIMITS.target_companies),
    must_haves: cleanList(o.must_haves, GOAL_LIMITS.must_haves, 120),
    dealbreakers: cleanList(o.dealbreakers, GOAL_LIMITS.dealbreakers, 120),
    timeline,
  };
  const label = cleanStr(o.short_label, GOAL_LIMITS.short_label);
  return { ok: true, goal: { v: 1, short_label: label || deriveShortLabel(base), ...base } };
}

// ── Projection into job_preferences ──────────────────────────────────────────

// Known location ids the feed's hard filter understands (see LOC_MATCHERS in
// src/lib/jobs/scan.ts). Kept in sync by hand; the matcher list is tiny.
const LOCATION_ALIASES: Array<[string, RegExp]> = [
  ["nyc", /^(new york( city)?|nyc|ny|manhattan|brooklyn)(,? ?(ny|usa?))?$/i],
  ["sf", /^(san francisco|sf|bay area|sf bay area|silicon valley|palo alto|mountain view|menlo park|oakland)(,? ?(ca|usa?))?$/i],
  ["boston", /^(boston|cambridge)(,? ?(ma|usa?))?$/i],
  ["seattle", /^(seattle|bellevue|redmond)(,? ?(wa|usa?))?$/i],
  ["la", /^(los angeles|la|santa monica)(,? ?(ca|usa?))?$/i],
  ["remote", /^(remote|anywhere remote|remote us|remote \(us\)|us remote|fully remote)$/i],
];

export function mapLocationId(loc: string): string | null {
  const s = loc.trim();
  for (const [id, re] of LOCATION_ALIASES) if (re.test(s)) return id;
  return null;
}

// The feed's location filter only knows a handful of metros. Map the goal's
// free-text locations to those ids ONLY when every one maps — a partial map
// ("NYC, London") would silently hide London roles, so in that case apply no
// hard filter and let the scorer judge location from the goal text instead.
export function mapGoalLocations(goal: Pick<GoalSpec, "locations" | "remote">): string[] {
  if (goal.remote === "remote_only") return ["remote"];
  if (!goal.locations.length) return [];
  const ids: string[] = [];
  for (const loc of goal.locations) {
    const id = mapLocationId(loc);
    if (!id) return [];
    if (!ids.includes(id)) ids.push(id);
  }
  if (goal.remote === "remote_ok" && !ids.includes("remote")) ids.push("remote");
  return ids;
}

export interface GoalPrefsPatch {
  role_mode: "different";
  target_roles: string[];
  company_sizes: GoalSize[];
  locations: string[];
  visa_required?: boolean;
}

// The job_preferences columns a locked goal owns. Everything else (sectors,
// posted_within, daily email, universe/staffing toggles) stays the user's.
export function goalToPrefsPatch(goal: GoalSpec): GoalPrefsPatch {
  const patch: GoalPrefsPatch = {
    role_mode: "different",
    target_roles: goal.target_roles.slice(0, GOAL_LIMITS.target_roles),
    company_sizes: goal.company_sizes.slice(),
    locations: mapGoalLocations(goal),
  };
  if (goal.visa_required !== null) patch.visa_required = goal.visa_required;
  return patch;
}

// ── Prompt projections ───────────────────────────────────────────────────────

// Goal context for OUTREACH/answers (via senderContextFromProfile). Leaves out
// the comp floor and dealbreakers on purpose: a cold email must never mention
// the salary someone is holding out for or what they refuse to do.
export function formatGoalBrief(goal: GoalSpec): string {
  const lines = [`Goal: ${goal.summary}`];
  lines.push(`Target roles: ${goal.target_roles.join(", ")}`);
  if (goal.seniority.length) lines.push(`Level: ${goal.seniority.map((s) => SENIORITY_LABEL[s]).join(", ")}`);
  if (goal.industries.length) lines.push(`Industries: ${goal.industries.join(", ")}`);
  if (goal.target_companies.length) lines.push(`Companies of interest: ${goal.target_companies.join(", ")}`);
  const where = [...goal.locations, ...(goal.remote ? [REMOTE_LABEL[goal.remote]] : [])];
  if (where.length) lines.push(`Location: ${where.join(", ")}`);
  if (goal.must_haves.length) lines.push(`Wants: ${goal.must_haves.join("; ")}`);
  return lines.join("\n");
}

// Goal block for the job SCORER — everything, including comp and dealbreakers,
// since this never leaves the ranking prompt.
export function formatGoalForScoring(goal: GoalSpec): string {
  const lines = [`Goal (confirmed by candidate): ${goal.summary}`];
  lines.push(`- Target roles: ${goal.target_roles.join(", ")} (role family is the primary axis)`);
  if (goal.seniority.length) lines.push(`- Level: ${goal.seniority.map((s) => SENIORITY_LABEL[s]).join(", ")}`);
  const comp = formatCompFloor(goal);
  if (comp) lines.push(`- Pay floor: ${comp}`);
  if (goal.industries.length) lines.push(`- Industries / company types: ${goal.industries.join(", ")}`);
  if (goal.company_sizes.length) lines.push(`- Company size: ${goal.company_sizes.map((s) => GOAL_SIZE_LABEL[s]).join(", ")}`);
  if (goal.target_companies.length) lines.push(`- Priority companies: ${goal.target_companies.join(", ")}`);
  const where = [...goal.locations, ...(goal.remote ? [REMOTE_LABEL[goal.remote]] : [])];
  if (where.length) lines.push(`- Location: ${where.join(", ")}`);
  if (goal.visa_required) lines.push(`- Needs visa sponsorship`);
  if (goal.must_haves.length) lines.push(`- Must-haves: ${goal.must_haves.join("; ")}`);
  if (goal.dealbreakers.length) lines.push(`- Dealbreakers: ${goal.dealbreakers.join("; ")}`);
  return lines.join("\n");
}

// ── Tool schema ──────────────────────────────────────────────────────────────

const strList = (description: string, maxItems: number) => ({
  type: "array",
  items: { type: "string" },
  maxItems,
  description,
});

// input_schema for the coach's propose_goal tool. Mirrors GoalSpec (minus `v`);
// validateGoalSpec re-checks everything server-side.
export const PROPOSE_GOAL_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "short_label",
    "target_roles",
    "seniority",
    "comp_floor_usd",
    "comp_basis",
    "industries",
    "company_sizes",
    "locations",
    "remote",
    "visa_required",
    "target_companies",
    "must_haves",
    "dealbreakers",
    "timeline",
  ],
  properties: {
    summary: { type: "string", description: "One sentence in the user's own framing, e.g. 'Senior PM role at a hedge fund or top fintech paying $200k+ base in NYC.'" },
    short_label: { type: "string", description: "Max 48 chars, e.g. 'Senior PM · hedge funds · $200k+'." },
    target_roles: strList("Role titles to match, most important first.", GOAL_LIMITS.target_roles),
    seniority: { type: "array", items: { type: "string", enum: [...SENIORITY] }, description: "Acceptable levels." },
    comp_floor_usd: { type: ["integer", "null"], description: "Minimum yearly pay in USD the user stated. null if they gave none — never invent one." },
    comp_basis: { type: "string", enum: ["base", "total"], description: "Whether the floor is base salary or total comp." },
    industries: strList("Free-text industries / company types, e.g. 'hedge funds', 'investment banks', 'Series B+ fintech startups'.", GOAL_LIMITS.industries),
    company_sizes: { type: "array", items: { type: "string", enum: [...GOAL_SIZES] }, description: "Empty if any size is fine." },
    locations: strList("Cities/regions they'd work in, e.g. 'New York', 'London'. Empty if anywhere.", GOAL_LIMITS.locations),
    remote: { type: ["string", "null"], enum: [...REMOTE_PREFS, null], description: "Remote preference, or null if not discussed." },
    visa_required: { type: ["boolean", "null"], description: "True if they need visa sponsorship, null if unknown." },
    target_companies: strList("Specific companies to prioritize (the user picked or accepted these).", GOAL_LIMITS.target_companies),
    must_haves: strList("Things the role must have.", GOAL_LIMITS.must_haves),
    dealbreakers: strList("Things that rule a role out.", GOAL_LIMITS.dealbreakers),
    timeline: { type: ["string", "null"], description: "When they want to land it, if they said." },
  },
} as const;
