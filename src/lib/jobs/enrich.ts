// Enrichment pass (Module 3). Deferred, separate from fetch. Fills the columns
// the feeds don't carry — company_size and visa_confidence — on a bounded batch
// of not-yet-enriched jobs (newest first). All best-effort + nullable: the feed
// renders fine when these are null.
//
//   company_size: prefer the catalog company's curated size_bucket, else the YC
//                 team-size map, else null.
//   visa:         company has a current USCIS track record (companies.h1b_stats,
//                 see src/lib/jobs/h1b/) -> 'sponsors_verified' + evidence
//                 snapshot, no LLM call; else LLM JD text-parse ->
//                 'likely_sponsors' | 'unclear'.

import { supabaseAdmin } from "@/lib/supabase";
import { jdText, mapPool } from "@/lib/jobs/util";
import { getYcSizeMap } from "@/lib/jobs/enrich/yc";
import { inferVisa } from "@/lib/jobs/enrich/visa";
import { evidenceFromStats } from "@/lib/jobs/h1b/normalize";
import type { SizeBucket, VisaConfidence, VisaEvidence, H1bStats } from "@/lib/jobs/types";

const DEFAULT_LIMIT = 40;
const VISA_CONCURRENCY = 4;

interface EnrichJob {
  id: string;
  company_id: string | null;
  company: string;
  ats: string;
  raw_json: Record<string, unknown>;
}

export interface EnrichResult {
  enriched: number;
  sized: number;
  visaLikely: number;
  visaVerified: number;
}

export async function enrichJobs(opts?: { limit?: number }): Promise<EnrichResult> {
  const sb = supabaseAdmin();
  const limit = opts?.limit ?? DEFAULT_LIMIT;

  const { data: jobsData, error } = await sb
    .from("jobs")
    .select("id, company_id, company, ats, raw_json")
    .is("enriched_at", null)
    .eq("is_active", true)
    .order("first_seen_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`load jobs for enrichment failed: ${error.message}`);

  const jobs = (jobsData ?? []) as EnrichJob[];
  if (!jobs.length) return { enriched: 0, sized: 0, visaLikely: 0, visaVerified: 0 };

  // Curated company sizes + H-1B track records for the referenced companies.
  const companyIds = [...new Set(jobs.map((j) => j.company_id).filter(Boolean))] as string[];
  const sizeByCompanyId = new Map<string, SizeBucket | null>();
  const normByCompanyId = new Map<string, string>();
  const evidenceByCompanyId = new Map<string, VisaEvidence>();
  if (companyIds.length) {
    const now = new Date();
    const { data: comps } = await sb
      .from("companies")
      .select("id, normalized, size_bucket, h1b_stats")
      .in("id", companyIds);
    for (const c of comps ?? []) {
      sizeByCompanyId.set(c.id as string, (c.size_bucket as SizeBucket | null) ?? null);
      normByCompanyId.set(c.id as string, c.normalized as string);
      const evidence = evidenceFromStats((c.h1b_stats as H1bStats | null) ?? null, now);
      if (evidence) evidenceByCompanyId.set(c.id as string, evidence);
    }
  }

  const ycMap = await getYcSizeMap();
  const nowIso = new Date().toISOString();
  const counts = { enriched: 0, sized: 0, visaLikely: 0, visaVerified: 0 };

  await mapPool(jobs, VISA_CONCURRENCY, async (job) => {
    const curated = job.company_id ? sizeByCompanyId.get(job.company_id) ?? null : null;
    const norm = (job.company_id && normByCompanyId.get(job.company_id)) || job.company.toLowerCase().trim();
    const size: SizeBucket | null = curated ?? ycMap.get(norm) ?? null;

    // Evidence beats inference: a current USCIS track record settles the visa
    // question without an LLM call. JD-parse remains the fallback signal.
    const evidence = (job.company_id && evidenceByCompanyId.get(job.company_id)) || null;
    const visa: VisaConfidence = evidence ? "sponsors_verified" : await inferVisa(jdText(job.ats, job.raw_json));

    const { error: upErr } = await sb
      .from("jobs")
      .update({ company_size: size, visa_confidence: visa, visa_evidence: evidence, enriched_at: nowIso })
      .eq("id", job.id);
    if (upErr) return;

    counts.enriched++;
    if (size) counts.sized++;
    if (visa === "likely_sponsors") counts.visaLikely++;
    if (visa === "sponsors_verified") counts.visaVerified++;
  });

  return counts;
}
