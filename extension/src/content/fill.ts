// Fill primitives shared by every ATS adapter.
import type { PackageAnswer, PackageProfile } from "../shared/messages";

// Fields we never touch, marked or not: demographics/EEO plus compensation and
// referral-source. Mirrors the spirit of NON_ESSAY_LABEL_RE in the app's
// src/lib/job-fetch.ts.
export const NEVER_TOUCH_RE =
  /\b(gender|race|ethnicity|veteran|disabilit|sexual orientation|pronoun|transgender|hispanic|latino|salary|compensation|expected pay|desired pay|referr|how did you hear)\b/i;

// React-controlled inputs ignore a plain `.value =` write (React's internal
// value tracker swallows it) — go through the native prototype setter, then
// fire the events React listens for.
export function setNativeValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string
): void {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

export function attachFile(input: HTMLInputElement, file: File): boolean {
  try {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  } catch {
    return false;
  }
}

// Best-effort human label for a form control.
export function labelFor(el: Element): string {
  const id = el.getAttribute("id");
  if (id) {
    // CSS.escape guards ids with dots/brackets (Lever uses cards[…] names).
    const lab = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (lab?.textContent?.trim()) return lab.textContent.trim();
  }
  const wrapped = el.closest("label");
  if (wrapped?.textContent?.trim()) return wrapped.textContent.trim();
  const aria = el.getAttribute("aria-label");
  if (aria?.trim()) return aria.trim();
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((lid) => document.getElementById(lid)?.textContent?.trim() ?? "")
      .filter(Boolean)
      .join(" ");
    if (text) return text;
  }
  const placeholder = el.getAttribute("placeholder");
  if (placeholder?.trim()) return placeholder.trim();
  return (el.getAttribute("name") ?? el.getAttribute("id") ?? "").replace(/[_-]+/g, " ");
}

export function markFilled(el: Element): void {
  el.classList.add("jga-filled");
}

interface Rule {
  re: RegExp;
  value: string | null;
}

// Ordered: first match wins. "last name" must beat the bare "name" rule, etc.
export function profileRules(p: PackageProfile): Rule[] {
  const full = (p.full_name ?? "").trim();
  const space = full.lastIndexOf(" ");
  const first = space > 0 ? full.slice(0, space) : full;
  const last = space > 0 ? full.slice(space + 1) : "";
  return [
    { re: /first\s*name|given\s*name/i, value: first || null },
    { re: /last\s*name|family\s*name|surname/i, value: last || null },
    { re: /full\s*name|your\s*name|^name\b/i, value: full || null },
    { re: /e-?mail/i, value: p.email },
    { re: /phone|mobile/i, value: p.phone },
    { re: /location|city|where\s+are\s+you\s+based/i, value: p.location },
    { re: /linked\s*in/i, value: p.linkedin_url },
    { re: /github/i, value: p.github_url },
    { re: /portfolio|personal\s*(web)?site|website|\burl\b/i, value: p.portfolio_url },
  ];
}

export interface FillReport {
  filled: number;
  answersFilled: number;
  resumeAttached: boolean;
  needsYou: string[];
}

function normalizeQuestion(s: string): string {
  return s
    .toLowerCase()
    .replace(/[*✱]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function answerFor(label: string, answers: PackageAnswer[]): string | null {
  const norm = normalizeQuestion(label);
  if (!norm) return null;
  for (const a of answers) {
    const q = normalizeQuestion(a.question);
    if (!q) continue;
    if (q === norm || q.includes(norm) || norm.includes(q)) return a.body;
  }
  return null;
}

// Fill every text-like control under `root`. Textareas try drafted answers
// first, then profile rules; inputs use profile rules only. Untouched required
// fields land in `needsYou` so the panel can point the human at them.
export function fillTextControls(
  root: ParentNode,
  profile: PackageProfile,
  answers: PackageAnswer[],
  report: FillReport
): void {
  const rules = profileRules(profile);
  const controls = root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    'input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input:not([type]), textarea'
  );
  for (const el of controls) {
    if (el.value.trim()) continue; // never clobber what the user typed
    if (el.readOnly || el.disabled || el.getAttribute("aria-hidden") === "true") continue;
    const label = labelFor(el);
    if (NEVER_TOUCH_RE.test(label)) continue;

    if (el instanceof HTMLTextAreaElement) {
      const body = answerFor(label, answers);
      if (body) {
        setNativeValue(el, body);
        markFilled(el);
        report.answersFilled++;
        continue;
      }
    }

    const rule = rules.find((r) => r.re.test(label));
    if (rule?.value) {
      setNativeValue(el, rule.value);
      markFilled(el);
      report.filled++;
    } else if (el.required && label) {
      report.needsYou.push(label.slice(0, 80));
    }
  }
}

// Real <select> elements only (custom comboboxes are per-adapter or skipped).
// v1 answers only the explicit sponsorship question — "authorized to work" is
// NOT the inverse of needing sponsorship (think F-1 OPT), so it stays manual.
export function fillSelects(
  root: ParentNode,
  profile: PackageProfile,
  report: FillReport
): void {
  if (typeof profile.needs_sponsorship !== "boolean") return;
  const want = profile.needs_sponsorship ? /^yes\b/i : /^no\b/i;
  for (const sel of root.querySelectorAll<HTMLSelectElement>("select")) {
    if (sel.disabled || sel.value) continue;
    const label = labelFor(sel);
    if (NEVER_TOUCH_RE.test(label) || !/sponsor/i.test(label)) continue;
    const opt = [...sel.options].find((o) => want.test(o.textContent?.trim() ?? ""));
    if (!opt) continue;
    sel.value = opt.value;
    sel.dispatchEvent(new Event("input", { bubbles: true }));
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    markFilled(sel);
    report.filled++;
  }
}

// Ashby-style Yes/No button toggles, sponsorship question only (same
// conservatism as fillSelects). Pairs of adjacent Yes/No buttons are grouped by
// their nearest shared container and matched against that container's text.
export function fillYesNoToggles(
  root: ParentNode,
  profile: PackageProfile,
  report: FillReport
): void {
  if (typeof profile.needs_sponsorship !== "boolean") return;
  const want = profile.needs_sponsorship ? /^yes$/i : /^no$/i;
  const isYesNo = (b: Element) => /^(yes|no)$/i.test(b.textContent?.trim() ?? "");
  const seen = new Set<Element>();
  for (const btn of root.querySelectorAll("button")) {
    if (!isYesNo(btn)) continue;
    const group = btn.closest("fieldset, [role='group'], div");
    if (!group || seen.has(group)) continue;
    seen.add(group);
    const pair = [...group.querySelectorAll("button")].filter(isYesNo);
    if (pair.length !== 2) continue;
    const label = (group.textContent ?? "").slice(0, 300);
    if (NEVER_TOUCH_RE.test(label) || !/sponsor/i.test(label)) continue;
    const alreadyPicked = pair.some(
      (b) =>
        b.getAttribute("aria-pressed") === "true" || b.getAttribute("aria-checked") === "true"
    );
    if (alreadyPicked) continue;
    const target = pair.find((b) => want.test(b.textContent?.trim() ?? ""));
    if (target instanceof HTMLElement) {
      target.click();
      markFilled(target);
      report.filled++;
    }
  }
}

export function base64ToFile(b64: string, filename: string): File {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], filename, { type: "application/pdf" });
}
