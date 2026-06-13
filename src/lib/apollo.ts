import { logAgentRun } from "@/lib/agent-runs";

export interface FindEmailInput {
  name: string;
  company?: string;
  linkedin_url?: string;
  // An authoritative company domain (e.g. from Apollo's organization record).
  // When set, providers use it directly instead of guessing a domain from the
  // company name — which is unreliable for companies whose name ≠ domain.
  domain?: string | null;
}

export interface EmailGuess {
  email: string;
  pattern: string;             // e.g. "firstname.lastname"
}

export interface FindEmailResult {
  email: string | null;
  confidence: number;          // 0..1
  source:
    | "apollo_verified"
    | "apollo_guessed"
    | "apollo_unverified"
    | "apollo_catch_all"      // domain accepts mail for any address; can't verify mailbox
    | "apollo_no_match"
    | "apollo_inaccessible"   // free plan blocks people endpoints
    | "apollo_error"
    | "public_web"            // address the person published themselves (GitHub/site/blog)
    | "public_web_unverified" // found on the open web but not on a source they control
    | "user_provided"          // user supplied the email up front, no lookup performed
    | "skipped";
  domain: string | null;       // company domain — used to power guesses
  guesses: EmailGuess[];       // format guesses for the user when no verified email
  message?: string | null;
  raw?: unknown;
}

const APOLLO_BASE = "https://api.apollo.io/api/v1";

// Apollo's people/match by default does NOT return business emails. You must
// pass reveal_personal_emails to get the email field populated. (This consumes
// a credit on revealed matches; safe for personal use, watch the budget if you
// scale up.)
export async function findEmail(input: FindEmailInput): Promise<FindEmailResult> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    return blank("apollo_error");
  }

  const started = Date.now();
  let outcome: "ok" | "error" | "no_match" = "ok";
  let err: string | null = null;
  let raw: unknown = null;
  let result: FindEmailResult = blank("apollo_no_match");

  try {
    const body: Record<string, unknown> = {
      reveal_personal_emails: true,
      reveal_phone_number: false,
    };
    const [first, ...rest] = (input.name || "").trim().split(/\s+/);
    if (first) body.first_name = first;
    if (rest.length) body.last_name = rest.join(" ");
    if (input.company) body.organization_name = input.company;
    if (input.linkedin_url) body.linkedin_url = input.linkedin_url;

    const resp = await fetch(`${APOLLO_BASE}/people/match`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(body),
    });

    raw = await resp.json().catch(() => null);

    if (!resp.ok) {
      outcome = "error";
      err = `apollo ${resp.status}`;
      const code = (raw as { error_code?: string } | null)?.error_code;
      const msg = (raw as { error?: string } | null)?.error ?? null;
      if (resp.status === 403 || code === "API_INACCESSIBLE") {
        const domain = input.domain ?? guessDomain(input.company);
        const guesses = domain ? buildGuesses(input.name, domain) : [];
        result = {
          ...blank("apollo_inaccessible"),
          message: msg ?? "Apollo plan does not allow people lookups",
          domain,
          guesses,
          raw,
        };
      } else {
        result = { ...blank("apollo_error"), message: msg, raw };
      }
    } else {
      const person = (raw as { person?: Record<string, unknown> } | null)?.person;
      const rawEmail = (person?.email as string | undefined) ?? null;
      const status = (person?.email_status as string | undefined) ?? null;
      const personalEmails = (person?.personal_emails as string[] | undefined) ?? [];
      // Apollo returns "email_not_unlocked@domain.com" as a placeholder when the
      // mailbox isn't revealed; treat that as no email.
      const email =
        rawEmail && !/^email_not_unlocked@/i.test(rawEmail)
          ? rawEmail
          : personalEmails.find((e) => e && !/^email_not_unlocked@/i.test(e)) ?? null;
      const org = person?.organization as Record<string, unknown> | undefined;
      const domain =
        input.domain ??
        (org?.primary_domain as string | undefined) ??
        (org?.website_url ? hostnameFrom(org.website_url as string) : null) ??
        guessDomain(input.company);

      if (!email) {
        outcome = "no_match";
        const guesses = domain ? buildGuesses(input.name, domain) : [];
        result = { ...blank("apollo_no_match"), domain, guesses, raw };
      } else {
        let source: FindEmailResult["source"];
        let confidence: number;
        if (status === "verified") {
          source = "apollo_verified";
          confidence = 0.95;
        } else if (status === "guessed") {
          source = "apollo_guessed";
          confidence = 0.4;
        } else if (
          status === "catch_all" ||
          status === "catchall" ||
          status === "unavailable"
        ) {
          source = "apollo_catch_all";
          confidence = 0.5;
        } else {
          source = "apollo_unverified";
          confidence = 0.6;
        }
        result = {
          email,
          confidence,
          source,
          domain,
          guesses: domain ? buildGuesses(input.name, domain) : [],
          raw,
        };
      }
    }
  } catch (e) {
    outcome = "error";
    err = String(e);
    result = blank("apollo_error");
  } finally {
    await logAgentRun({
      agent_type: "apollo:find_email",
      latency_ms: Date.now() - started,
      outcome,
      error: err,
      meta: { input, source: result.source, domain: result.domain },
    });
  }

  return result;
}

function blank(source: FindEmailResult["source"]): FindEmailResult {
  return { email: null, confidence: 0, source, domain: null, guesses: [] };
}

// The structured employer-of-record for a person: their CURRENT organization as
// Apollo's people/match returns it (a real field on their profile), plus that
// org's primary domain. This is far more reliable than asking an LLM to
// web_search and synthesize "where do they work" — the model can rank a past
// employer as current (e.g. tagging Anthropic as "previously" and inventing a
// new current company). Keyed on the LinkedIn URL when available, which Apollo
// treats as a strong identity anchor.
//
// This does NOT request an email reveal (no reveal_personal_emails), so it's the
// cheaper enrichment mode — email finding stays on the Hunter/public path. Returns
// null on any miss, error, or when the Apollo plan blocks people lookups, so the
// caller cleanly falls back to the research model's company.
export interface EmployerLookup {
  company: string | null; // current organization name
  domain: string | null; // its primary domain
  title: string | null; // their current title
  linkedin_url: string | null;
}

export async function lookupEmployerApollo(input: {
  name?: string | null;
  company?: string | null;
  linkedin_url?: string | null;
}): Promise<EmployerLookup | null> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) return null;
  // Need at least one identity anchor. A LinkedIn URL is by far the strongest.
  if (!input.linkedin_url && !input.name) return null;

  const started = Date.now();
  let outcome: "ok" | "error" | "no_match" = "ok";
  let err: string | null = null;
  try {
    const body: Record<string, unknown> = {};
    const [first, ...rest] = (input.name || "").trim().split(/\s+/);
    if (first) body.first_name = first;
    if (rest.length) body.last_name = rest.join(" ");
    // Pass the (possibly stale) company only as a hint; the linkedin_url is what
    // actually pins the match, so a wrong company hint can't mislead it.
    if (input.company) body.organization_name = input.company;
    if (input.linkedin_url) body.linkedin_url = input.linkedin_url;

    const resp = await fetch(`${APOLLO_BASE}/people/match`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(body),
    });
    const raw = (await resp.json().catch(() => null)) as
      | { person?: Record<string, unknown> }
      | null;
    if (!resp.ok) {
      outcome = "error";
      err = `apollo ${resp.status}`;
      return null;
    }
    const person = raw?.person;
    if (!person) {
      outcome = "no_match";
      return null;
    }
    const org = person.organization as Record<string, unknown> | undefined;
    const company = (org?.name as string | undefined) ?? null;
    const domain =
      (org?.primary_domain as string | undefined) ??
      (org?.website_url ? hostnameFrom(org.website_url as string) : null) ??
      null;
    const title = (person.title as string | undefined) ?? null;
    const linkedin_url =
      (person.linkedin_url as string | undefined) ?? input.linkedin_url ?? null;
    if (!company && !domain) {
      outcome = "no_match";
      return null;
    }
    return { company, domain, title, linkedin_url };
  } catch (e) {
    outcome = "error";
    err = String(e);
    return null;
  } finally {
    await logAgentRun({
      agent_type: "apollo:lookup_employer",
      latency_ms: Date.now() - started,
      outcome,
      error: err,
      meta: { input },
    });
  }
}

function hostnameFrom(url: string): string | null {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// Best-effort domain inference: prefer a real website URL from research, then
// the company-name heuristic. Centralized so the agent can call it even when
// Apollo is unavailable (free plan).
export function inferDomain(args: {
  company?: string | null;
  links?: Record<string, string> | null;
}): string | null {
  const links = args.links ?? {};
  const candidate =
    links.website ??
    links.company_website ??
    links.homepage ??
    null;
  if (candidate) {
    const h = hostnameFrom(candidate);
    if (h) return h;
  }
  return guessDomain(args.company);
}

// Last-resort domain guess from a company name. Only used when Apollo/Hunter
// gave us no organization data. The name often carries a qualifier the domain
// doesn't — "Clay (previously Anthropic)", "Stripe, Inc.", "Acme — Payments" —
// so take only the primary name before any parenthetical or separator, THEN
// lowercase + strip. ("Clay (previously Anthropic)" → clay.com, not the old
// claypreviouslyanthropic.com.)
export function guessDomain(company: string | null | undefined): string | null {
  if (!company) return null;
  const primary = company
    .replace(/\([^)]*\)/g, " ") // drop "(previously …)" / "(formerly …)" qualifiers
    .split(/\s[-–—|/]\s|[,/|]/)[0] // cut at the first separator (comma, slash, dash, pipe)
    .trim();
  const cleaned = (primary || company)
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|co|the)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
  if (!cleaned) return null;
  return `${cleaned}.com`;
}

const PATTERNS: { pattern: string; build: (f: string, l: string) => string | null }[] = [
  { pattern: "firstname.lastname", build: (f, l) => (f && l ? `${f}.${l}` : null) },
  { pattern: "firstname",          build: (f) =>     (f ? f : null) },
  { pattern: "flastname",          build: (f, l) => (f && l ? `${f[0]}${l}` : null) },
  { pattern: "firstnamel",         build: (f, l) => (f && l ? `${f}${l[0]}` : null) },
  { pattern: "firstname_lastname", build: (f, l) => (f && l ? `${f}_${l}` : null) },
  { pattern: "firstname-lastname", build: (f, l) => (f && l ? `${f}-${l}` : null) },
  { pattern: "lastname.firstname", build: (f, l) => (f && l ? `${l}.${f}` : null) },
];

export function buildGuesses(fullName: string, domain: string): EmailGuess[] {
  const parts = fullName.toLowerCase().split(/\s+/).filter(Boolean);
  if (!parts.length) return [];
  const first = parts[0].replace(/[^a-z]/g, "");
  const last = parts.length > 1 ? parts[parts.length - 1].replace(/[^a-z]/g, "") : "";
  const seen = new Set<string>();
  const out: EmailGuess[] = [];
  for (const p of PATTERNS) {
    const local = p.build(first, last);
    if (!local) continue;
    const email = `${local}@${domain}`;
    if (seen.has(email)) continue;
    seen.add(email);
    out.push({ email, pattern: p.pattern });
  }
  return out.slice(0, 5);
}
