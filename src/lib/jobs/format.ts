// Pure display formatters for the job feed UI (Module 6). No React — safe to
// import into client components.

import type { VisaConfidence, SizeBucket } from "@/lib/jobs/types";

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
  return v === "likely_sponsors" ? "likely sponsors" : null;
}

export function visaLabelFull(v: VisaConfidence | null): string {
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

// Current data only carries "likely_sponsors" | "unclear" | null, but the
// prototype specs a red "NO SPONSORSHIP" state for future data — handle it now
// so the UI is ready when the enrichment layer starts emitting it.
export function visaKind(v: VisaConfidence | null): VisaKind {
  if (v === "likely_sponsors") return "sponsors";
  if ((v as string) === "no_sponsorship") return "none";
  return "tbd"; // "unclear" | null
}

export function visaChipLabel(v: VisaConfidence | null): string {
  switch (visaKind(v)) {
    case "sponsors":
      return "SPONSORS VISA";
    case "none":
      return "NO SPONSORSHIP";
    default:
      return "VISA · TBD";
  }
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

// Client-side feed filters mapped onto the prototype's pill row.
export interface FeedFilters {
  sponsorsVisa: boolean;
  remote: boolean;
  compListed: boolean;
}

export const NO_FILTERS: FeedFilters = { sponsorsVisa: false, remote: false, compListed: false };

interface FilterableJob {
  visa_confidence: VisaConfidence | null;
  remote_type: string;
  compensation: string | null;
}

export function jobPassesFilters(job: FilterableJob, f: FeedFilters): boolean {
  if (f.sponsorsVisa && visaKind(job.visa_confidence) !== "sponsors") return false;
  if (f.remote && !(job.remote_type === "remote" || job.remote_type === "hybrid")) return false;
  if (f.compListed && !compDisplay(job.compensation).listed) return false;
  return true;
}

export function filterJobs<T extends FilterableJob>(jobs: T[], f: FeedFilters): T[] {
  return jobs.filter((j) => jobPassesFilters(j, f));
}
