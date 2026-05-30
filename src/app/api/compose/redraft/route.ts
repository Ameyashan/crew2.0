import { NextRequest } from "next/server";
import { redraft, type Channel } from "@/lib/claude";
import { resolveUserId } from "@/lib/auth";
import { runWithUser } from "@/lib/user-context";
import { getProfile } from "@/lib/profile";

export const runtime = "nodejs";
export const maxDuration = 60;

const CHANNELS = new Set<Channel>(["email", "x_dm", "linkedin"]);

// "Another angle" — rewrite a single existing draft with one preset directive
// ("make it shorter", "more founder-like", a fresh angle, …). Non-streaming: the
// client already has the draft on screen and just swaps in the rewrite.
export async function POST(req: NextRequest) {
  const userId = await resolveUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const channel = body?.channel as Channel;
  const directive = (body?.directive ?? "").toString().trim();
  const draftBody = (body?.body ?? "").toString();

  if (!CHANNELS.has(channel)) {
    return Response.json({ error: "invalid channel" }, { status: 400 });
  }
  if (!directive) {
    return Response.json({ error: "missing directive" }, { status: 400 });
  }
  if (!draftBody.trim()) {
    return Response.json({ error: "nothing to rewrite yet" }, { status: 400 });
  }

  return runWithUser(userId, async () => {
    try {
      const profile = await getProfile();
      const result = await redraft({
        channel,
        subject: typeof body?.subject === "string" ? body.subject : null,
        body: draftBody,
        directive,
        recipient_name:
          typeof body?.recipient_name === "string" ? body.recipient_name : null,
        sender_full_name: profile?.full_name ?? undefined,
        sender_linkedin: profile?.linkedin_url ?? undefined,
      });
      return Response.json({ subject: result.subject, body: result.body });
    } catch (e) {
      return Response.json({ error: String(e) }, { status: 500 });
    }
  });
}
