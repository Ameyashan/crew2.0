import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";
import { applicationItem, type ApplicationRow } from "@/lib/jobs/applications-logic";

export const runtime = "nodejs";

const LIMIT = 50;

// GET /api/jobs/applications
// The signed-in user's applications (one job_applications row per Compose job
// run), newest first, for the Jobs tab's goal view. Each row carries the
// compose run that built it (matched on its tailored résumé) so the UI can
// reopen the full package, and the hiring contact's name. Archived rows hide.
export async function GET() {
  return withUser(async (userId) => {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("job_applications")
      .select(
        "id, job_url, job_json, status, created_at, submitted_at, application_qa, resume_generation_id, person_id, resume_generation:resume_generations(target_role, target_company)",
      )
      .eq("user_id", userId)
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    const rows = (data ?? []) as unknown as (ApplicationRow & {
      resume_generation_id: string | null;
      person_id: string | null;
    })[];
    const genIds = [...new Set(rows.map((r) => r.resume_generation_id).filter((x): x is string => !!x))];
    const personIds = [...new Set(rows.map((r) => r.person_id).filter((x): x is string => !!x))];

    // Both lookups are best-effort: a missing run or contact only drops the
    // "open package" action or the contact line.
    const [runs, people] = await Promise.all([
      genIds.length
        ? sb
            .from("compose_runs")
            .select("id, resume_generation_id")
            .eq("user_id", userId)
            .is("picked", null)
            .in("resume_generation_id", genIds)
        : Promise.resolve({ data: [] as { id: string; resume_generation_id: string }[] }),
      personIds.length
        ? sb.from("people").select("id, name").eq("user_id", userId).in("id", personIds)
        : Promise.resolve({ data: [] as { id: string; name: string | null }[] }),
    ]);
    const runByGen = new Map((runs.data ?? []).map((r) => [r.resume_generation_id as string, r.id as string]));
    const nameById = new Map((people.data ?? []).map((p) => [p.id as string, (p.name as string | null) ?? null]));

    const applications = rows.map((r) =>
      applicationItem(r, {
        run_id: r.resume_generation_id ? runByGen.get(r.resume_generation_id) ?? null : null,
        contact: r.person_id ? nameById.get(r.person_id) ?? null : null,
      }),
    );
    return Response.json({ applications });
  });
}
