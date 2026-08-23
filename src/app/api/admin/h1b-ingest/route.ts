import { gunzipSync } from "node:zlib";
import { NextRequest } from "next/server";
import { runWithUser } from "@/lib/user-context";
import { ingestH1bCsv, type IngestResult } from "@/lib/jobs/h1b/ingest";
import { matchCompaniesToH1b, applyTrackRecordToJobs } from "@/lib/jobs/h1b/match";

export const runtime = "nodejs";
export const maxDuration = 300;

// POST /api/admin/h1b-ingest — operator entry point for the H-1B track record.
// Loads a USCIS Employer Data Hub export, re-matches the whole catalog against
// it, and pushes fresh evidence onto active jobs. Guarded by CRON_SECRET (same
// scheme as the cron routes). USCIS refreshes the files ~quarterly.
//
// Accepts one of:
//   * raw CSV body (content-type text/csv; gzip via content-encoding: gzip —
//     Vercel caps request bodies at ~4.5MB and a full-year export can exceed
//     that uncompressed):
//       curl -X POST -H "authorization: Bearer $CRON_SECRET" -H "content-type: text/csv" \
//            -H "content-encoding: gzip" --data-binary @h1b_datahubexport-2025.csv.gz \
//            https://<host>/api/admin/h1b-ingest
//   * JSON {"url": "https://…csv"} — the server fetches it (USCIS may block
//     datacenter IPs; fall back to posting the CSV body if this 403s).
//   * JSON {} / empty body — skip ingestion, just re-match + re-apply (useful
//     after the catalog has grown).

async function readCsv(req: NextRequest): Promise<{ csv: string | null; error?: string }> {
  const ctype = req.headers.get("content-type") ?? "";
  if (ctype.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as { url?: unknown; csv?: unknown };
    if (typeof body.csv === "string" && body.csv.trim()) return { csv: body.csv };
    if (typeof body.url === "string" && body.url.trim()) {
      const res = await fetch(body.url, { headers: { Accept: "text/csv,*/*" } });
      if (!res.ok) return { csv: null, error: `fetch ${body.url} failed: HTTP ${res.status} — POST the CSV body instead` };
      return { csv: await res.text() };
    }
    return { csv: null }; // {} → match/apply only
  }
  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length) return { csv: null };
  const encoding = req.headers.get("content-encoding") ?? "";
  const text = encoding.includes("gzip") || (buf[0] === 0x1f && buf[1] === 0x8b)
    ? gunzipSync(buf).toString("utf8")
    : buf.toString("utf8");
  return { csv: text };
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  const authed = !!expected && (auth === `Bearer ${expected}` || req.headers.get("x-cron-secret") === expected);
  if (!authed) return Response.json({ error: "unauthorized" }, { status: 401 });

  // Anonymous user context: the pipeline's LLM logging (logAgentRun) requires a
  // context to exist, and an operator run has no user to bill.
  return runWithUser(null, async () => {
    try {
      const { csv, error } = await readCsv(req);
      if (error) return Response.json({ ok: false, error }, { status: 502 });

      let ingested: IngestResult | null = null;
      if (csv) ingested = await ingestH1bCsv(csv);

      // Re-match everything after fresh data; only catalog newcomers otherwise.
      const matched = await matchCompaniesToH1b({ onlyUnmatched: !ingested });
      const applied = await applyTrackRecordToJobs();

      return Response.json({ ok: true, ingested, matched, applied });
    } catch (e) {
      return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  });
}
