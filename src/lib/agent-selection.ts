// Phase 2 of the compose crew selector: the UI lets users pick which agents
// fire (see src/app/app/compose/page.tsx). The selection is an allow-list of
// agent keys, frozen onto the run client-side and forwarded to the compose
// APIs, which gate each agent against it.
//
// Back-compat contract: undefined / empty → run EVERYTHING. History replays,
// candidate re-picks, and any older client that doesn't send a selection all
// fall through to the original "run the whole crew" behaviour.

export type AgentKey = "resume" | "person" | "email" | "outreach";

export const ALL_AGENT_KEYS: AgentKey[] = ["resume", "person", "email", "outreach"];

export function agentEnabled(
  agents: readonly string[] | null | undefined,
  key: AgentKey,
): boolean {
  if (!Array.isArray(agents) || agents.length === 0) return true;
  return agents.includes(key);
}

// Normalise an untrusted request body field into a clean string[] or undefined.
// Drops anything that isn't a recognised agent key so a bad payload can't, say,
// disable every agent by sending junk.
export function parseAgents(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const keys = raw.filter(
    (a): a is AgentKey => typeof a === "string" && (ALL_AGENT_KEYS as string[]).includes(a),
  );
  return keys.length ? keys : undefined;
}
