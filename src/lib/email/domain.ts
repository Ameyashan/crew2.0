// ───────────────────────────── email domain + guess helpers ─────────────────────────────
//
// Pure functions for turning a company name / website into a mail domain, and a
// domain + person name into format guesses. Deliberately dependency-free (no
// network, no logging, no `@/` imports) so the provider modules (apollo, hunter,
// employer) can share them AND they can be unit-tested directly under `node --test`.
//
// Re-exported from `@/lib/apollo` for backwards compatibility, so existing
// importers keep working unchanged.

export interface EmailGuess {
  email: string;
  pattern: string; // e.g. "firstname.lastname"
}

export function hostnameFrom(url: string): string | null {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// Best-effort domain inference: prefer a real website URL (the company's ACTUAL
// domain — decagon.ai, not a name-mangled .com), then fall back to the
// company-name heuristic. Centralized so callers can reach for it even when a
// structured provider (Apollo/Hunter) gave us no organization data.
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

// Last-resort domain guess from a company name. Only used when no real website
// or organization domain is available — it blindly assumes `.com`, which is
// WRONG for the whole `.ai`/`.io`/`.co` cohort (e.g. Decagon → decagon.ai), so a
// real website link must always win over this. The name often carries a
// qualifier the domain doesn't — "Clay (previously Anthropic)", "Stripe, Inc.",
// "Acme — Payments" — so take only the primary name before any parenthetical or
// separator, THEN lowercase + strip.
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
