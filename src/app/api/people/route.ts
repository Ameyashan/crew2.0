import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/people → list of contacts + last_interaction timestamp.
// Used by /app/people for the searchable list panel.
export async function GET() {
  return withUser(async (userId) => {
    const sb = supabaseAdmin();
    const { data: people, error } = await sb
      .from("people")
      .select("id, name, role, company, email, email_confidence, links, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) return Response.json({ error: error.message }, { status: 500 });

    // One-shot rollup of latest interaction per person — small N so a single
    // grouped query is fine. Scoped to the current user above.
    const ids = (people ?? []).map((p) => p.id);
    const latestByPerson: Record<string, { last: string; type: string }> = {};
    if (ids.length) {
      const { data: ixs } = await sb
        .from("interactions")
        .select("person_id, interaction_type, created_at")
        .eq("user_id", userId)
        .in("person_id", ids)
        .order("created_at", { ascending: false });
      for (const ix of ixs ?? []) {
        const pid = ix.person_id as string | null;
        if (!pid || latestByPerson[pid]) continue;
        latestByPerson[pid] = {
          last: ix.created_at as string,
          type: ix.interaction_type as string,
        };
      }
    }

    // Next pending follow-up per person — the People tracker's NEXT column
    // ("auto follow-up · {date}"). Earliest-due wins; same grouped-query shape.
    const nextFollowupByPerson: Record<string, string> = {};
    if (ids.length) {
      const { data: fus } = await sb
        .from("followups")
        .select("person_id, due_at")
        .eq("user_id", userId)
        .eq("status", "pending")
        .in("person_id", ids)
        .order("due_at", { ascending: true });
      for (const fu of fus ?? []) {
        const pid = fu.person_id as string | null;
        if (!pid || nextFollowupByPerson[pid]) continue;
        nextFollowupByPerson[pid] = fu.due_at as string;
      }
    }

    const enriched = (people ?? []).map((p) => ({
      ...p,
      last_interaction: latestByPerson[p.id]?.last ?? null,
      last_interaction_type: latestByPerson[p.id]?.type ?? null,
      next_followup_due: nextFollowupByPerson[p.id] ?? null,
    }));

    return Response.json({ people: enriched });
  });
}
