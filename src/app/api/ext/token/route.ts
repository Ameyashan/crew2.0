import { NextRequest } from "next/server";
import { withUser } from "@/lib/auth";
import { mintToken } from "@/lib/ext-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

// Called same-origin from /app/settings/extension (cookie auth) — the plaintext
// token is returned exactly once and handed to the extension by the page.

export async function POST(req: NextRequest) {
  return withUser(async (userId) => {
    const body = await req.json().catch(() => ({}));
    const label =
      typeof body?.label === "string" && body.label.trim()
        ? body.label.trim().slice(0, 80)
        : null;

    const sb = supabaseAdmin();
    // One active token per user: revoke-and-replace keeps the story simple and
    // makes "connect" on a new machine invalidate the old one.
    const now = new Date().toISOString();
    await sb
      .from("extension_tokens")
      .update({ revoked_at: now })
      .eq("user_id", userId)
      .is("revoked_at", null);

    const { token, hash } = mintToken();
    const { error } = await sb
      .from("extension_tokens")
      .insert({ user_id: userId, token_hash: hash, label });
    if (error) {
      return Response.json({ error: "token mint failed" }, { status: 500 });
    }
    return Response.json({ token });
  });
}

export async function DELETE() {
  return withUser(async (userId) => {
    await supabaseAdmin()
      .from("extension_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("revoked_at", null);
    return Response.json({ ok: true });
  });
}

// Lets the settings page show connected state without re-minting.
export async function GET() {
  return withUser(async (userId) => {
    const { data } = await supabaseAdmin()
      .from("extension_tokens")
      .select("label, created_at, last_used_at")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .maybeSingle();
    return Response.json({ active: data ?? null });
  });
}
