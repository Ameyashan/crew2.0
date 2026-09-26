import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";
import { trackServer } from "@/lib/analytics/server";
import { CONTACTS_REFRESH_MS, findJobContacts, loadCachedContacts } from "@/lib/jobs/contacts";

export const runtime = "nodejs";
export const maxDuration = 90;

// Fresh lookups per user per day (each spends a web search + Apollo credits).
const DAILY_LOOKUPS = 25;

// GET /api/jobs/[id]/contacts -> { contacts: JobContactsDTO | null }
// The cached "who to reach out to" result, if this user ran it for this job.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withUser(async (userId) => {
    const { id } = await params;
    return Response.json({ contacts: await loadCachedContacts(supabaseAdmin(), userId, id) });
  });
}

// POST /api/jobs/[id]/contacts -> { contacts: JobContactsDTO }
// Find people for this job (connections + web search + Apollo) and write a
// LinkedIn note for each. Returns the cache when it's under an hour old.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withUser(async (userId) => {
    const { id } = await params;
    const sb = supabaseAdmin();
    const cached = await loadCachedContacts(sb, userId, id);
    if (cached && Date.now() - Date.parse(cached.generated_at) < CONTACTS_REFRESH_MS) {
      return Response.json({ contacts: cached });
    }
    const { count } = await sb
      .from("job_contacts")
      .select("job_id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
    if ((count ?? 0) >= DAILY_LOOKUPS) {
      return Response.json({ error: `That's ${DAILY_LOOKUPS} lookups today — try again tomorrow.` }, { status: 429 });
    }
    try {
      const contacts = await findJobContacts(sb, userId, id);
      await trackServer("job_contacts_found", { count: contacts.contacts.length, apollo: contacts.apollo });
      return Response.json({ contacts });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return Response.json({ error: message }, { status: message === "not found" ? 404 : 500 });
    }
  });
}
