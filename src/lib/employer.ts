import { lookupEmployerApollo, guessDomain, type EmployerLookup } from "@/lib/apollo";
import { logAgentRun } from "@/lib/agent-runs";

export type { EmployerLookup };

export interface EmployerLookupInput {
  name?: string | null;
  company?: string | null;
  linkedin_url?: string | null;
}

// Resolve a person's CURRENT employer from a structured people-data provider,
// keyed on their LinkedIn URL. An LLM web-search can rank a PAST employer as
// current (e.g. tagging Anthropic as "previously" and inventing a new current
// company); these providers read the current position straight off the profile.
//
// Tries each CONFIGURED provider in turn and returns the first confident hit:
//   1. Apollo (people/match)          — gives a clean org name + primary domain.
//   2. PeopleDataLabs (person/enrich) — LinkedIn-derived current job + domain.
//   3. Proxycurl (LinkedIn profile)   — current experience; domain inferred.
// Returns null when none is configured or nobody matches — callers then fall
// back to the research model's company exactly as before.
export async function lookupEmployer(
  input: EmployerLookupInput,
): Promise<EmployerLookup | null> {
  if (!input.linkedin_url && !input.name) return null;
  const providers = [
    lookupEmployerApollo,
    lookupEmployerPdl,
    lookupEmployerProxycurl,
  ];
  for (const provider of providers) {
    const hit = await provider(input).catch(() => null);
    if (hit?.company) return hit;
  }
  return null;
}

// ── PeopleDataLabs ──────────────────────────────────────────────────────────
// Person Enrichment API. Strongest with a LinkedIn URL; a bare name is too
// ambiguous to trust here, so we skip it without one.
async function lookupEmployerPdl(
  input: EmployerLookupInput,
): Promise<EmployerLookup | null> {
  const apiKey = process.env.PDL_API_KEY || process.env.PEOPLEDATALABS_API_KEY;
  if (!apiKey || !input.linkedin_url) return null;

  const started = Date.now();
  let outcome: "ok" | "error" | "no_match" = "ok";
  let err: string | null = null;
  try {
    const params = new URLSearchParams({
      profile: withHttps(input.linkedin_url),
      min_likelihood: "6",
    });
    const resp = await fetch(
      `https://api.peopledatalabs.com/v5/person/enrich?${params.toString()}`,
      { headers: { "X-Api-Key": apiKey, Accept: "application/json" } },
    );
    if (resp.status === 404) {
      outcome = "no_match";
      return null;
    }
    const raw = (await resp.json().catch(() => null)) as {
      data?: {
        job_title?: unknown;
        job_company_name?: unknown;
        job_company_website?: unknown;
      };
    } | null;
    if (!resp.ok) {
      outcome = "error";
      err = `pdl ${resp.status}`;
      return null;
    }
    const data = raw?.data;
    const company = str(data?.job_company_name);
    if (!company) {
      outcome = "no_match";
      return null;
    }
    const website = str(data?.job_company_website);
    return {
      company,
      domain: (website ? hostname(website) : null) ?? guessDomain(company),
      title: str(data?.job_title),
      linkedin_url: input.linkedin_url,
    };
  } catch (e) {
    outcome = "error";
    err = String(e);
    return null;
  } finally {
    await logAgentRun({
      agent_type: "pdl:lookup_employer",
      latency_ms: Date.now() - started,
      outcome,
      error: err,
      meta: { input },
    });
  }
}

// ── Proxycurl ───────────────────────────────────────────────────────────────
// LinkedIn Profile endpoint. LinkedIn-keyed, so it needs a LinkedIn URL. The
// current role is the experience with no end date (else the first listed).
// Proxycurl's basic profile doesn't carry a company domain, so we infer it.
async function lookupEmployerProxycurl(
  input: EmployerLookupInput,
): Promise<EmployerLookup | null> {
  const apiKey = process.env.PROXYCURL_API_KEY;
  if (!apiKey || !input.linkedin_url) return null;

  const started = Date.now();
  let outcome: "ok" | "error" | "no_match" = "ok";
  let err: string | null = null;
  try {
    const params = new URLSearchParams({
      linkedin_profile_url: withHttps(input.linkedin_url),
      use_cache: "if-present",
    });
    const resp = await fetch(
      `https://nubela.co/proxycurl/api/v2/linkedin?${params.toString()}`,
      { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } },
    );
    if (!resp.ok) {
      outcome = resp.status === 404 ? "no_match" : "error";
      err = resp.ok ? null : `proxycurl ${resp.status}`;
      return null;
    }
    const raw = (await resp.json().catch(() => null)) as {
      experiences?: { company?: unknown; title?: unknown; ends_at?: unknown }[];
    } | null;
    const exps = Array.isArray(raw?.experiences) ? raw!.experiences : [];
    const current =
      exps.find((e) => str(e?.company) && !e?.ends_at) ??
      exps.find((e) => str(e?.company)) ??
      null;
    const company = str(current?.company);
    if (!company) {
      outcome = "no_match";
      return null;
    }
    return {
      company,
      domain: guessDomain(company),
      title: str(current?.title),
      linkedin_url: input.linkedin_url,
    };
  } catch (e) {
    outcome = "error";
    err = String(e);
    return null;
  } finally {
    await logAgentRun({
      agent_type: "proxycurl:lookup_employer",
      latency_ms: Date.now() - started,
      outcome,
      error: err,
      meta: { input },
    });
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function withHttps(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function hostname(url: string): string | null {
  try {
    return new URL(withHttps(url)).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
