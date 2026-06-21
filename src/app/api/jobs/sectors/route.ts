import { SECTORS } from "@/lib/jobs/catalog/sectors";

export const runtime = "nodejs";

// GET /api/jobs/sectors — the interest taxonomy for the preferences UI. Static,
// non-sensitive reference data; no auth needed.
export async function GET() {
  return Response.json({ sectors: SECTORS });
}
