import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/people/:id → person + interactions timeline. Used by the dossier
// panel on /app/people.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withUser(async (userId) => {
    const { id } = await params;
    const sb = supabaseAdmin();

    const { data: person, error } = await sb
      .from("people")
      .select(
        "id, name, role, company, email, email_confidence, email_source, links, notes, enrichment, created_at",
      )
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!person) return Response.json({ error: "not found" }, { status: 404 });

    const [eventsRes, workflowsRes, followupsRes] = await Promise.all([
      sb
        .from("interactions")
        .select(
          "id, agent_type, interaction_type, channel, created_at, draft:drafts(subject, body)",
        )
        .eq("person_id", id)
        .order("created_at", { ascending: false }),
      sb
        .from("compose_runs")
        .select(
          "id, kind, input, intent, outcome, error, created_at, completed_at, output",
        )
        .eq("user_id", userId)
        .eq("person_id", id)
        .order("created_at", { ascending: false }),
      sb
        .from("followups")
        .select("id, due_at, status, draft:drafts(subject)")
        .eq("user_id", userId)
        .eq("person_id", id)
        .eq("status", "pending")
        .order("due_at", { ascending: true })
        .limit(1),
    ]);

    return Response.json({
      person,
      events: eventsRes.data ?? [],
      workflows: workflowsRes.data ?? [],
      nextFollowup: followupsRes.data?.[0] ?? null,
    });
  });
}
