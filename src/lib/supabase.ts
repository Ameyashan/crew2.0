import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _admin: SupabaseClient | null = null;

// Trusted server-side client. Uses the SERVICE ROLE key, whose Postgres role
// has BYPASSRLS — required now that RLS is enabled (migration 0007). The anon
// key must NOT be used here: without a user session auth.uid() is null and the
// owner policies would deny every query. User-scoped access goes through
// supabaseServer() / supabaseBrowser() (anon key + session) instead.
export function supabaseAdmin(): SupabaseClient {
  if (_admin) return _admin;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("Missing SUPABASE_URL in env");
  if (!key) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY in env — required for the server (RLS-bypassing) client",
    );
  }
  _admin = createClient(url, key, { auth: { persistSession: false } });
  return _admin;
}
