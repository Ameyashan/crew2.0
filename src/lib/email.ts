// Outbound transactional email via Resend's REST API (no SDK dependency — one
// POST). Configure with:
//   RESEND_API_KEY  — required; without it sends fail soft (logged, not thrown)
//   EMAIL_FROM      — verified sender, e.g. "Jugaadu <jobs@mail.jugaadu.app>".
//                     Defaults to Resend's shared onboarding sender, which only
//                     delivers to the Resend account owner — fine for testing,
//                     set a real verified domain for production.
// Callers treat a failed send as skippable (a digest can wait for tomorrow),
// so this returns an { ok, error } result instead of throwing.

const RESEND_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "Jugaadu <onboarding@resend.dev>";

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<SendEmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY not set" };
  const from = process.env.EMAIL_FROM || DEFAULT_FROM;

  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, html, ...(text ? { text } : {}) }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) return { ok: false, error: body?.message || `HTTP ${res.status}` };
    return { ok: true, id: body?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Minimal HTML escape for interpolating untrusted strings (job titles, company
// names — they come from external ATS boards) into email markup.
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
