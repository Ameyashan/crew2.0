import { NextRequest } from "next/server";
import { identify } from "@/lib/claude";
import { withUser } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  return withUser(async () => {
    const body = await req.json().catch(() => ({}));
    const text = (body?.text ?? "").toString();
    const intent = body?.intent ? body.intent.toString() : undefined;
    if (!text.trim()) {
      return Response.json({ error: "empty input" }, { status: 400 });
    }
    try {
      const result = await identify({ text, intent });
      return Response.json(result);
    } catch (e) {
      return Response.json({ error: String(e) }, { status: 500 });
    }
  });
}
