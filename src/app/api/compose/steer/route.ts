import { NextRequest } from "next/server";
import { redraft, type Channel } from "@/lib/claude";
import { resolveUserId } from "@/lib/auth";
import { runWithUser } from "@/lib/user-context";
import { getProfile } from "@/lib/profile";

export const runtime = "nodejs";
export const maxDuration = 60;

// "Steer the draft" — apply ONE free-form directive (e.g. "focus on their
// pottery side project", "mention we both went to Cornell") to email + LinkedIn
// + X DM in parallel, so all three channels stay consistent with the new angle.
// Skips channels whose current body is empty.
export async function POST(req: NextRequest) {
  const userId = await resolveUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const payload = await req.json().catch(() => ({}));
  const directive = (payload?.directive ?? "").toString().trim();
  const recipientName =
    typeof payload?.recipient_name === "string" ? payload.recipient_name : null;
  const incoming = Array.isArray(payload?.drafts) ? payload.drafts : [];

  if (!directive) {
    return Response.json({ error: "missing directive" }, { status: 400 });
  }

  // Normalize incoming drafts keyed by API channel ('email' | 'linkedin' | 'x_dm').
  const byChannel: Record<Channel, { subject: string | null; body: string }> = {
    email: { subject: null, body: "" },
    linkedin: { subject: null, body: "" },
    x_dm: { subject: null, body: "" },
  };
  for (const d of incoming) {
    const uiCh = (d?.channel ?? "").toString();
    const apiCh: Channel | null =
      uiCh === "email" ? "email"
      : uiCh === "linkedin" ? "linkedin"
      : uiCh === "x" || uiCh === "x_dm" ? "x_dm"
      : null;
    if (!apiCh) continue;
    byChannel[apiCh] = {
      subject: typeof d?.subject === "string" ? d.subject : null,
      body: typeof d?.body === "string" ? d.body : "",
    };
  }

  const hasAny = (["email", "linkedin", "x_dm"] as Channel[]).some(
    (c) => byChannel[c].body.trim().length > 0,
  );
  if (!hasAny) {
    return Response.json({ error: "nothing to rewrite yet" }, { status: 400 });
  }

  return runWithUser(userId, async () => {
    try {
      const profile = await getProfile();
      const channels: Channel[] = ["email", "linkedin", "x_dm"];
      const results = await Promise.all(
        channels.map(async (channel) => {
          const current = byChannel[channel];
          if (!current.body.trim()) return null;
          const result = await redraft({
            channel,
            subject: current.subject,
            body: current.body,
            directive,
            recipient_name: recipientName,
            sender_full_name: profile?.full_name ?? undefined,
            sender_linkedin: profile?.linkedin_url ?? undefined,
          });
          return { channel, subject: result.subject, body: result.body };
        }),
      );
      const out: Record<string, { subject: string | null; body: string } | null> = {
        email: null, linkedin: null, x_dm: null,
      };
      for (const r of results) if (r) out[r.channel] = { subject: r.subject, body: r.body };
      return Response.json(out);
    } catch (e) {
      return Response.json({ error: String(e) }, { status: 500 });
    }
  });
}
