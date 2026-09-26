import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";
import { connectionsAt, connectionsSummary, employerNames } from "@/lib/connections/store";

export const runtime = "nodejs";

// GET /api/connections/at?company_id=… (or ?company=Name)
//   -> { total, people: Connection[], imported: boolean }
// People from the user's imported LinkedIn connections who work at that
// employer, matched on any of its names (catalog, universe, aliases).
export async function GET(req: NextRequest) {
  return withUser(async (userId) => {
    const sb = supabaseAdmin();
    const companyId = req.nextUrl.searchParams.get("company_id");
    const companyName = (req.nextUrl.searchParams.get("company") ?? "").trim().slice(0, 200);
    let names: string[] = companyName ? [companyName] : [];
    if (companyId) names = [...((await employerNames(sb, [companyId])).get(companyId) ?? []), ...names];
    if (!names.length) return Response.json({ error: "company_id or company required" }, { status: 400 });
    const [found, summary] = await Promise.all([connectionsAt(sb, userId, names), connectionsSummary(sb, userId)]);
    return Response.json({ ...found, imported: summary.count > 0 });
  });
}
