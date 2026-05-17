import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { USER_ID } from "@/lib/utils";

export const runtime = "nodejs";

// GET /api/people/:id → person + interactions timeline. Used by the dossier
// panel on /app/people.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sb = supabaseAdmin();

  const { data: person, error } = await sb
    .from("people")
    .select(
      "id, name, role, company, email, email_confidence, email_source, links, notes, enrichment, created_at",
    )
    .eq("id", id)
    .eq("user_id", USER_ID)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!person) return Response.json({ error: "not found" }, { status: 404 });

  const { data: events } = await sb
    .from("interactions")
    .select(
      "id, agent_type, interaction_type, channel, created_at, draft:drafts(subject, body)",
    )
    .eq("person_id", id)
    .order("created_at", { ascending: false });

  return Response.json({ person, events: events ?? [] });
}
