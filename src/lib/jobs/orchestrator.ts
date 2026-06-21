// Fetch orchestrator (Module 1). Pulls every active catalog company's board,
// normalizes the listings, and idempotently upserts them into `jobs`.
//
// Idempotency / delta tracking:
//   * Upsert conflict key is (ats, external_job_id).
//   * `first_seen_at` and the enrichment columns are intentionally OMITTED from
//     the payload: DB defaults fill them on insert, and they're preserved on
//     update (PostgREST only updates columns present in the payload).
//   * Every seen job gets last_seen_at = runTs; a per-company stale-out then
//     flips is_active=false on rows whose last_seen_at predates this run.
//   * A company whose fetch throws is isolated (recorded in `errors`) and skips
//     stale-out, so a transient outage never deactivates its jobs.

import { supabaseAdmin } from "@/lib/supabase";
import { mapPool } from "@/lib/jobs/util";
import { fetchGreenhouseBoard } from "@/lib/jobs/sources/greenhouse";
import { fetchLeverBoard } from "@/lib/jobs/sources/lever";
import { fetchAshbyBoard } from "@/lib/jobs/sources/ashby";
import type { Ats, BoardTarget, FetchResult, NormalizedJob } from "@/lib/jobs/types";

const CONCURRENCY = 5;

// Dispatch to the right adapter. Reused by the catalog validator (Module 2).
export async function fetchBoard(
  ats: Ats,
  slug: string,
  companyName?: string,
): Promise<NormalizedJob[]> {
  switch (ats) {
    case "greenhouse":
      return fetchGreenhouseBoard(slug, companyName);
    case "lever":
      return fetchLeverBoard(slug, companyName);
    case "ashby":
      return fetchAshbyBoard(slug, companyName);
    default:
      return [];
  }
}

export async function fetchAllListings(): Promise<FetchResult> {
  const sb = supabaseAdmin();
  const runTs = new Date().toISOString();

  const { data: companies, error } = await sb
    .from("companies")
    .select("id, name, ats, slug")
    .eq("active", true);
  if (error) throw new Error(`load companies failed: ${error.message}`);

  const targets: BoardTarget[] = (companies ?? []).map((c) => ({
    company_id: c.id as string,
    name: c.name as string,
    ats: c.ats as Ats,
    slug: c.slug as string,
  }));

  const result: FetchResult = { inserted: 0, updated: 0, newJobIds: [], errors: [] };

  await mapPool(targets, CONCURRENCY, async (t) => {
    try {
      const normalized = await fetchBoard(t.ats, t.slug, t.name);

      // Pre-existing ids for this company -> accurate new-vs-seen classification.
      const { data: existingRows } = await sb
        .from("jobs")
        .select("external_job_id")
        .eq("company_id", t.company_id);
      const existing = new Set((existingRows ?? []).map((r) => r.external_job_id as string));

      if (normalized.length) {
        const rows = normalized.map((n) => ({
          company_id: t.company_id,
          ats: n.ats,
          external_job_id: n.external_job_id,
          title: n.title,
          company: n.company,
          location_raw: n.location_raw,
          city: n.city,
          region: n.region,
          country: n.country,
          remote_type: n.remote_type,
          compensation: n.compensation,
          posted_date: n.posted_date,
          posted_date_approx: n.posted_date_approx,
          url: n.url,
          source: n.ats,
          raw_json: n.raw_json,
          last_seen_at: runTs,
          is_active: true,
          updated_at: runTs,
        }));

        const { data: upserted, error: upErr } = await sb
          .from("jobs")
          .upsert(rows, { onConflict: "ats,external_job_id" })
          .select("id, external_job_id");
        if (upErr) throw new Error(upErr.message);

        for (const r of upserted ?? []) {
          if (existing.has(r.external_job_id as string)) {
            result.updated++;
          } else {
            result.inserted++;
            result.newJobIds.push(r.id as string);
          }
        }
      }

      // Stale-out: still-active jobs for this company we didn't see this run.
      await sb
        .from("jobs")
        .update({ is_active: false, updated_at: runTs })
        .eq("company_id", t.company_id)
        .eq("is_active", true)
        .lt("last_seen_at", runTs);
    } catch (e) {
      result.errors.push({
        company: t.name,
        ats: t.ats,
        slug: t.slug,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  return result;
}
