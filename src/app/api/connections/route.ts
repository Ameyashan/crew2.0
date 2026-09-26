import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";
import { trackServer } from "@/lib/analytics/server";
import {
  IMPORT_CHUNK,
  clearConnections,
  connectionsSummary,
  sanitizeUpload,
  stageConnections,
} from "@/lib/connections/store";

export const runtime = "nodejs";

// GET /api/connections -> { count, imported_at }
export async function GET() {
  return withUser(async (userId) => Response.json(await connectionsSummary(supabaseAdmin(), userId)));
}

// POST /api/connections { rows, first, final } -> { staged, committed }
// One chunk (≤ IMPORT_CHUNK rows) of a LinkedIn connections import, parsed in
// the browser (src/lib/connections/csv.ts — emails already dropped). The
// final chunk replaces the user's previous set.
export async function POST(req: NextRequest) {
  return withUser(async (userId) => {
    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.rows) || body.rows.length > IMPORT_CHUNK) {
      return Response.json({ error: `Send up to ${IMPORT_CHUNK} rows per request.` }, { status: 400 });
    }
    const rows = sanitizeUpload(body.rows);
    try {
      const out = await stageConnections(supabaseAdmin(), userId, rows, {
        first: body.first === true,
        final: body.final === true,
      });
      if (out.committed !== null) await trackServer("connections_imported", { count: out.committed });
      return Response.json(out);
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  });
}

// DELETE /api/connections -> { ok }
export async function DELETE() {
  return withUser(async (userId) => {
    try {
      await clearConnections(supabaseAdmin(), userId);
      await trackServer("connections_cleared", {});
      return Response.json({ ok: true });
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  });
}
