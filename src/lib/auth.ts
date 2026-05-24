import { supabaseServer } from "@/lib/supabase-server";
import { runWithUser } from "@/lib/user-context";

// Validates the Supabase session against the auth server (not just a local
// JWT decode) and returns the user id, or null if unauthenticated.
export async function resolveUserId(): Promise<string | null> {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  return user?.id ?? null;
}

// Route-handler boundary. Resolves the session user, 401s if absent, and runs
// the handler inside a user context so currentUserId() works everywhere below.
// Wrap the handler *body* (not the exported GET/POST) so Next's route-type
// checker still sees the canonical handler signature.
export async function withUser(
  fn: (userId: string) => Promise<Response> | Response,
): Promise<Response> {
  const userId = await resolveUserId();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return runWithUser(userId, () => fn(userId));
}
