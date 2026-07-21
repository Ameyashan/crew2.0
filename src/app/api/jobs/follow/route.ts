import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";
import { loadFollowedCompanyIds } from "@/lib/jobs/scan";

export const runtime = "nodejs";

// GET /api/jobs/follow -> { company_ids }
// The set of companies the user follows, so the feed/detail can render each
// Follow button in the right state without a per-card round-trip.
export async function GET() {
  return withUser(async (userId) => {
    const sb = supabaseAdmin();
    const company_ids = await loadFollowedCompanyIds(sb, userId);
    return Response.json({ company_ids });
  });
}

function readCompanyId(body: unknown): string | null {
  if (body && typeof body === "object") {
    const v = (body as Record<string, unknown>).company_id;
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

// POST /api/jobs/follow { company_id } -> { following: true }
// Idempotent: a duplicate follow is a no-op. The FK to companies(id) rejects a
// company_id that isn't a real catalog row, so a junk id 400s rather than
// inserting an orphan.
export async function POST(req: NextRequest) {
  return withUser(async (userId) => {
    const company_id = readCompanyId(await req.json().catch(() => ({})));
    if (!company_id) return Response.json({ error: "company_id required" }, { status: 400 });

    const sb = supabaseAdmin();
    const { error } = await sb
      .from("followed_companies")
      .upsert({ user_id: userId, company_id }, { onConflict: "user_id,company_id", ignoreDuplicates: true });
    if (error) {
      // 23503 = FK violation (unknown company_id) -> client error, not a 500.
      const status = (error as { code?: string }).code === "23503" ? 400 : 500;
      return Response.json({ error: error.message }, { status });
    }
    return Response.json({ following: true });
  });
}

// DELETE /api/jobs/follow { company_id } -> { following: false }
export async function DELETE(req: NextRequest) {
  return withUser(async (userId) => {
    const company_id = readCompanyId(await req.json().catch(() => ({})));
    if (!company_id) return Response.json({ error: "company_id required" }, { status: 400 });

    const sb = supabaseAdmin();
    const { error } = await sb
      .from("followed_companies")
      .delete()
      .eq("user_id", userId)
      .eq("company_id", company_id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ following: false });
  });
}
