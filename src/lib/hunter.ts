import { logAgentRun } from "@/lib/agent-runs";
import {
  buildGuesses,
  inferDomain,
  type FindEmailInput,
  type FindEmailResult,
} from "@/lib/apollo";

const HUNTER_BASE = "https://api.hunter.io/v2";

// Drop-in replacement for the Apollo findEmail. Same FindEmailResult shape,
// so the agent and the UI don't need to know the provider changed.
export async function findEmailHunter(input: FindEmailInput): Promise<FindEmailResult> {
  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) {
    return blank("apollo_error", "HUNTER_API_KEY not set");
  }

  const started = Date.now();
  let outcome: "ok" | "error" | "no_match" = "ok";
  let err: string | null = null;
  let raw: unknown = null;
  let result: FindEmailResult = blank("apollo_no_match");

  try {
    const [first, ...rest] = (input.name || "").trim().split(/\s+/);
    const last = rest.join(" ");

    // Hunter needs a domain. Try the explicit company hint, then fall back to
    // a domain inference from the LinkedIn host or the company name.
    let domain: string | null =
      inferDomain({ company: input.company ?? null, links: null }) ?? null;
    if (input.linkedin_url && !domain) {
      // not common but cheap to try
      domain = inferDomain({ company: input.company ?? null, links: null });
    }

    if (!first || !last || !domain) {
      // Hunter cannot run without (first, last, domain). Return a clean miss
      // so the agent can fall back to format guesses if it has a domain.
      const guesses = domain ? buildGuesses(input.name, domain) : [];
      return {
        email: null,
        confidence: 0,
        source: "apollo_no_match",
        domain,
        guesses,
        message: !domain
          ? "Could not infer a company domain"
          : "Need first and last name to query Hunter",
      };
    }

    const url =
      `${HUNTER_BASE}/email-finder?` +
      new URLSearchParams({
        domain,
        first_name: first,
        last_name: last,
        api_key: apiKey,
      }).toString();
    const resp = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
    raw = await resp.json().catch(() => null);

    if (!resp.ok) {
      outcome = "error";
      const errMsg =
        (raw as { errors?: { details?: string }[] } | null)?.errors?.[0]?.details ??
        `hunter ${resp.status}`;
      err = errMsg;
      const guesses = buildGuesses(input.name, domain);
      result = { ...blank("apollo_error", errMsg), domain, guesses, raw };
    } else {
      const data = (raw as { data?: Record<string, unknown> } | null)?.data ?? null;
      const email = (data?.email as string | undefined) ?? null;
      const score = (data?.score as number | undefined) ?? null;     // 0-100
      const verifStatus =
        (data?.verification as { status?: string } | undefined)?.status ?? null;
      const sourceType = (data?.source_type as string | undefined) ?? null; // "personal" | "generated"

      if (!email) {
        outcome = "no_match";
        result = {
          ...blank("apollo_no_match"),
          domain,
          guesses: buildGuesses(input.name, domain),
          raw,
        };
      } else {
        const confidence = score != null ? Math.max(0, Math.min(1, score / 100)) : 0.5;
        // Map Hunter's verification + source_type into our existing source enum
        const source: FindEmailResult["source"] =
          verifStatus === "valid"
            ? "apollo_verified"
            : sourceType === "generated"
              ? "apollo_guessed"
              : "apollo_unverified";
        result = {
          email,
          confidence,
          source,
          domain,
          guesses: buildGuesses(input.name, domain),
          message: verifStatus ? `hunter verification: ${verifStatus}` : null,
          raw,
        };
      }
    }
  } catch (e) {
    outcome = "error";
    err = String(e);
    result = blank("apollo_error", String(e));
  } finally {
    await logAgentRun({
      agent_type: "hunter:find_email",
      latency_ms: Date.now() - started,
      outcome,
      error: err,
      meta: { input, source: result.source, domain: result.domain },
    });
  }

  return result;
}

function blank(source: FindEmailResult["source"], message?: string): FindEmailResult {
  return { email: null, confidence: 0, source, domain: null, guesses: [], message: message ?? null };
}
