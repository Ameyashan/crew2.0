// USCIS H-1B Employer Data Hub ingestion. Takes the raw CSV text of one or more
// annual exports and loads it into h1b_employer_records. Idempotent per fiscal
// year: every FY present in the file is deleted and re-inserted wholesale, so
// re-running the same export (or a corrected one) converges instead of duping.
//
// Invoked from POST /api/admin/h1b-ingest — USCIS updates these files roughly
// quarterly, so ingestion is an operator action, not a cron.

import { supabaseAdmin } from "@/lib/supabase";
import { parseH1bCsv } from "@/lib/jobs/h1b/parse";
import { normalizeEmployerName } from "@/lib/jobs/h1b/normalize";

const INSERT_BATCH = 1000;

export interface IngestResult {
  fiscalYears: number[];
  inserted: number;
  skipped: number; // unparsable data lines in the CSV
}

export async function ingestH1bCsv(csvText: string): Promise<IngestResult> {
  const sb = supabaseAdmin();
  const { rows, skipped, fiscalYears } = parseH1bCsv(csvText);
  if (!rows.length) return { fiscalYears: [], inserted: 0, skipped };

  for (const fy of fiscalYears) {
    const { error } = await sb.from("h1b_employer_records").delete().eq("fiscal_year", fy);
    if (error) throw new Error(`clear FY${fy} failed: ${error.message}`);
  }

  const toInsert = rows.map((r) => ({ ...r, normalized_name: normalizeEmployerName(r.employer_name) }));
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += INSERT_BATCH) {
    const batch = toInsert.slice(i, i + INSERT_BATCH);
    const { error } = await sb.from("h1b_employer_records").insert(batch);
    if (error) throw new Error(`insert batch at ${i} failed: ${error.message}`);
    inserted += batch.length;
  }

  return { fiscalYears, inserted, skipped };
}
