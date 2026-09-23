import { NextRequest } from "next/server";
import { withExtensionToken } from "@/lib/ext-auth";
import { supabaseAdmin } from "@/lib/supabase";

import { trackServer } from "@/lib/analytics/server";

export const runtime = "nodejs";

// The extension confirmed a real submission (ATS success page seen after the
// user clicked Submit). Idempotent: re-confirming a submitted row is a no-op.
export async function POST(req: NextRequest) {
  return withExtensionToken(req, async (userId) => {
    const body = await req.json().catch(() => ({}));
    const applicationId = typeof body?.application_id === "string" ? body.application_id : "";
    if (!applicationId) {
      return Response.json({ error: "application_id required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin()
      .from("job_applications")
      .update({ status: "submitted", submitted_at: new Date().toISOString() })
      .eq("id", applicationId)
      .eq("user_id", userId)
      .neq("status", "submitted")
      .select("id");
    if (error) {
      return Response.json({ error: "update failed" }, { status: 500 });
    }
    if (!data?.length) {
      // Either not this user's row (404) or already submitted (idempotent ok).
      const { data: existing } = await supabaseAdmin()
        .from("job_applications")
        .select("status")
        .eq("id", applicationId)
        .eq("user_id", userId)
        .maybeSingle();
      if (existing?.status === "submitted") return Response.json({ ok: true, already: true });
      return Response.json({ error: "not found" }, { status: 404 });
    }

    void trackServer("application_submitted", { surface: "extension" });
    return Response.json({ ok: true });
  });
}
