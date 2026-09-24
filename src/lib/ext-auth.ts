import { createHash, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { runWithUser } from "@/lib/user-context";

// Bearer-token auth for the Chrome extension. Tokens are minted from a
// signed-in web session (see /api/ext/token), shown once, and stored only as a
// sha256 hash. The extension's background service worker sends them as
// `Authorization: Bearer jga_…` — cookie auth never crosses origins, so this
// path is fully independent of the Supabase session.

const TOKEN_PREFIX = "jga_";

export function mintToken(): { token: string; hash: string } {
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Route-handler boundary for /api/ext/* — mirrors withUser() in lib/auth.ts so
// currentUserId()/getProfile() work unchanged downstream.
export async function withExtensionToken(
  req: NextRequest,
  fn: (userId: string) => Promise<Response> | Response,
): Promise<Response> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token.startsWith(TOKEN_PREFIX)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const sb = supabaseAdmin();
  const { data } = await sb
    .from("extension_tokens")
    .select("id, user_id")
    .eq("token_hash", hashToken(token))
    .is("revoked_at", null)
    .maybeSingle();
  if (!data?.user_id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // Best-effort freshness marker; never blocks the request.
  sb.from("extension_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(undefined, () => {});

  return runWithUser(data.user_id, () => fn(data.user_id));
}
