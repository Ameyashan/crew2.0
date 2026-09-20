// Pure display formatters for the job feed UI (Module 6). No React — safe to
// import into client components.

import type { VisaConfidence, VisaEvidence, SizeBucket } from "@/lib/jobs/types";

// "Posted 3d ago" / "Updated 3d ago" (Greenhouse only exposes updated_at, so the
// caller passes approx=true and we say "Updated" to stay honest).
export function relativePosted(iso: string | null, approx: boolean): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const verb = approx ? "Updated" : "Posted";
  const diff = Date.now() - t;
  const day = 86_400_000;
  if (diff < 0) return `${verb} just now`;
  if (diff < day) {
    const h = Math.floor(diff / 3_600_000);
    return h <= 1 ? `${verb} today` : `${verb} ${h}h ago`;
  }
  const d = Math.floor(diff / day);
  if (d < 30) return `${verb} ${d}d ago`;
  const mo = Math.floor(d / 30);
  return mo <= 1 ? `${verb} 1mo ago` : `${verb} ${mo}mo ago`;
}

// Feed badge: only surface a positive signal to avoid clutter. The detail view
// renders the full "visa unclear" wording itself.
export function visaBadge(v: VisaConfidence | null): string | null {
  if (v === "sponsors_verified") return "sponsors visas";
  return v === "likely_sponsors" ? "likely sponsors" : null;
}

export function visaLabelFull(v: VisaConfidence | null): string {
  if (v === "sponsors_verified") return "Sponsors visas — USCIS-verified";
  if (v === "no_sponsorship") return "Does not sponsor visas";
  return v === "likely_sponsors" ? "Likely sponsors visas" : "Visa sponsorship unclear";
}

export function sizeLabel(s: SizeBucket | null): string | null {
  if (!s) return null;
  return s === "startup" ? "startup" : s === "medium" ? "mid-size" : "large";
}

export function scoreTier(score: number): "high" | "mid" | "low" {
  if (score >= 80) return "high";
  if (score >= 50) return "mid";
  return "low";
}

// ── Prototype presentation helpers (Phase D — Jobs feed + detail) ─────────────
// These mirror the handoff prototype (lines 423–505). The prototype's FIT box
// uses tighter thresholds than scoreTier above and its own colour tiers.

export type FitTier = "strong" | "fair" | "weak";

// Prototype FIT tiers: ≥85 green, ≥75 amber, else muted.
export function fitTier(score: number): FitTier {
  if (score >= 85) return "strong";
  if (score >= 75) return "fair";
  return "weak";
}

// text/border pair for the FIT box, matching the prototype hexes exactly.
export function fitColors(score: number): { color: string; border: string } {
  switch (fitTier(score)) {
    case "strong":
      return { color: "#3d7a4f", border: "#bcd6c2" };
    case "fair":
      return { color: "#8a6d2f", border: "#e6d5ab" };
    default:
      return { color: "#8b8171", border: "#ddd5c4" };
  }
}

export type VisaKind = "sponsors" | "tbd" | "none";

// "sponsors" covers both the USCIS-verified signal and the softer JD-parse one
// (same green chip; the label carries the difference). "none" is Phase 3 —
// nothing emits 'no_sponsorship' yet, but the chip is ready.
export function visaKind(v: VisaConfidence | null): VisaKind {
  if (v === "sponsors_verified" || v === "likely_sponsors") return "sponsors";
  if (v === "no_sponsorship") return "none";
  return "tbd"; // "unclear" | null
}

// "9.5K" / "214" — chip-sized count of recent-FY petitions.
export function filedCount(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return `${k >= 10 ? Math.round(k) : Math.round(k * 10) / 10}K`;
  }
  return String(n);
}

// When the enrichment attached USCIS evidence, the chip states it: the number
// is the trust ("SPONSORS · 214 FILED FY25" beats a vibe). Without evidence the
// three prototype labels stand.
export function visaChipLabel(v: VisaConfidence | null, evidence?: VisaEvidence | null): string {
  if (visaKind(v) === "sponsors" && evidence && evidence.recent_filed > 0) {
    return `SPONSORS · ${filedCount(evidence.recent_filed)} FILED FY${String(evidence.recent_fy).slice(-2)}`;
  }
  switch (visaKind(v)) {
    case "sponsors":
      return "SPONSORS VISA";
    case "none":
      return "NO SPONSORSHIP";
    default:
      return "VISA · TBD";
  }
}

// Detail-view sentence under the chip, e.g.
// "214 H-1B petitions decided in FY2025 · 96% approved · USCIS Employer Data Hub".
export function visaEvidenceLine(evidence: VisaEvidence | null): string | null {
  if (!evidence || evidence.recent_filed <= 0) return null;
  const parts = [
    `${evidence.recent_filed.toLocaleString("en-US")} H-1B petition${evidence.recent_filed === 1 ? "" : "s"} decided in FY${evidence.recent_fy}`,
  ];
  if (evidence.approval_rate != null) parts.push(`${Math.round(evidence.approval_rate * 100)}% approved`);
  parts.push("USCIS Employer Data Hub");
  return parts.join(" · ");
}

// text/bg pair for the visa chip, matching the prototype token palette.
export function visaChipColors(v: VisaConfidence | null): { color: string; bg: string } {
  switch (visaKind(v)) {
    case "sponsors":
      return { color: "#3d7a4f", bg: "#e9f1e9" };
    case "none":
      return { color: "#a03d2e", bg: "#f6e9e6" };
    default:
      return { color: "#8a6d2f", bg: "#f4ecda" };
  }
}

// Bare relative age ("3d ago", "today", "just now") — the card/detail supply the
// literal "posted" prefix. Greenhouse only exposes updated_at (approx=true); we
// widen those to "~3d ago" to stay honest without a different verb.
export function postedAgo(iso: string | null, approx: boolean): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const tilde = approx ? "~" : "";
  const diff = Date.now() - t;
  const day = 86_400_000;
  if (diff < 0) return "just now";
  if (diff < day) {
    const h = Math.floor(diff / 3_600_000);
    return h <= 1 ? "today" : `${tilde}${h}h ago`;
  }
  const d = Math.floor(diff / day);
  if (d < 30) return `${tilde}${d}d ago`;
  const mo = Math.floor(d / 30);
  return mo <= 1 ? `${tilde}1mo ago` : `${tilde}${mo}mo ago`;
}

// Compensation display for the "loc · comp" line. When a board lists comp we
// show it in green-ish ink; otherwise a muted "comp undisclosed".
export function compDisplay(comp: string | null): { label: string; listed: boolean } {
  const c = comp?.trim();
  return c ? { label: c, listed: true } : { label: "comp undisclosed", listed: false };
}

// The italic goal echoed in the feed sub-line ("…what you said you're after: X").
// Takes the user's interest-sector *labels* (resolved by the caller via
// sectorLabel — kept out of this module so it stays import-free for node --test).
// Falls back to a generic phrase when the user hasn't picked any.
export function goalPhrase(labels: string[]): string {
  labels = labels.filter(Boolean);
  if (labels.length === 0) return "roles that fit your Story";
  if (labels.length === 1) return `${labels[0]} roles`;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]} roles`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]} roles`;
}

// Split the one-line `reasons` string into "→" bullets for the detail view's
// "WHY IT MATTERS TO YOU" card. Splits on newlines / bullet glyphs / semicolons;
// a single-sentence reason stays one bullet.
export function whyBullets(reasons: string | null): string[] {
  if (!reasons) return [];
  return reasons
    .split(/\n+|\s*[•·;]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Short, human label for a source link ("greenhouse.io ↗"). Falls back to a
// generic label when the URL can't be parsed.
export function sourceHost(url: string | null): string {
  if (!url) return "source";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

// Best-effort company domain guessed from a display name, e.g. "Y Combinator"
// -> "ycombinator.com". We don't store a real domain anywhere, so this is only
// used to *try* a brand-logo lookup; the UI always falls back to a monogram
// when the guess misses, so a wrong guess is harmless. Common corporate
// suffixes are dropped before collapsing to a slug.
export function companyDomain(company: string | null): string | null {
  if (!company) return null;
  const cleaned = company
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\b(inc|llc|ltd|co|corp|corporation|group|holdings|labs|technologies|technology|the)\b/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]/g, "");
  return cleaned ? `${cleaned}.com` : null;
}

// First alphanumeric character of a company name, uppercased — the monogram
// shown when no logo is available. Falls back to "?" for empty/odd names.
export function companyMonogram(company: string | null): string {
  if (!company) return "?";
  const ch = company.trim().replace(/[^A-Za-z0-9]/g, "").charAt(0);
  return ch ? ch.toUpperCase() : "?";
}

// Keep the feed varied when one company floods the ranking (LinkedIn-style):
// walk the score-ordered list picking at most `cap` jobs per company, then
// append the overflow at the tail. Order is preserved within both parts, so the
// top of the feed mixes companies while nothing is ever hidden outright.
export function diversifyByCompany<T extends { company: string }>(items: T[], cap: number): T[] {
  if (cap <= 0) return [...items];
  const counts = new Map<string, number>();
  const picked: T[] = [];
  const overflow: T[] = [];
  for (const item of items) {
    const key = item.company.trim().toLowerCase();
    const n = counts.get(key) ?? 0;
    if (n < cap) {
      counts.set(key, n + 1);
      picked.push(item);
    } else {
      overflow.push(item);
    }
  }
  return [...picked, ...overflow];
}

// Client-side feed filters mapped onto the prototype's pill row.
export interface FeedFilters {
  sponsorsVisa: boolean;
  remote: boolean;
  compListed: boolean;
  // Free-text / picked location. Empty string = no location filter. Matched as a
  // case-insensitive substring against the job's location string, so both a
  // dropdown pick ("Remote", "San Francisco") and typed text ("benga") work.
  location: string;
}

export const NO_FILTERS: FeedFilters = {
  sponsorsVisa: false,
  remote: false,
  compListed: false,
  location: "",
};

interface FilterableJob {
  visa_confidence: VisaConfidence | null;
  remote_type: string;
  compensation: string | null;
  location: string | null;
}

export function jobPassesFilters(job: FilterableJob, f: FeedFilters): boolean {
  if (f.sponsorsVisa && visaKind(job.visa_confidence) !== "sponsors") return false;
  if (f.remote && !(job.remote_type === "remote" || job.remote_type === "hybrid")) return false;
  if (f.compListed && !compDisplay(job.compensation).listed) return false;
  const needle = f.location.trim().toLowerCase();
  if (needle) {
    // "Remote" is a work-type, not a place, so also honor a remote-typed job when
    // the user filters by "remote" even if its location string omits the word.
    const isRemoteQuery = needle === "remote";
    const hay = (job.location ?? "").toLowerCase();
    const matches =
      hay.includes(needle) ||
      (isRemoteQuery && (job.remote_type === "remote" || job.remote_type === "hybrid"));
    if (!matches) return false;
  }
  return true;
}

export function filterJobs<T extends FilterableJob>(jobs: T[], f: FeedFilters): T[] {
  return jobs.filter((j) => jobPassesFilters(j, f));
}
