// Enrichment pass (Module 3). Deferred, separate from fetch. Fills the columns
// the feeds don't carry — company_size and visa_confidence — on a bounded batch
// of not-yet-enriched jobs (newest first). All best-effort + nullable: the feed
// renders fine when these are null.
//
//   company_size: prefer the catalog company's curated size_bucket, else the YC
//                 team-size map, else null.
//   visa:         precedence per job — an EXPLICIT JD "no sponsorship"
//                 ('no_sponsorship', job-level truth) beats the company's USCIS
//                 track record ('sponsors_verified' + evidence snapshot, see
//                 src/lib/jobs/h1b/), which beats the JD positive parse
//                 ('likely_sponsors'), else 'unclear'. The JD parse is cheap:
//                 inferVisa keyword-screens before calling the LLM.

import { supabaseAdmin } from "@/lib/supabase";
import { jdText, mapPool, mentionsVisa } from "@/lib/jobs/util";
import { getYcSizeMap } from "@/lib/jobs/enrich/yc";
import { inferVisa } from "@/lib/jobs/enrich/visa";
import { evidenceFromStats } from "@/lib/jobs/h1b/normalize";
import { hydrateJobs } from "@/lib/jobs/hydrate";
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
  visaNone: number;
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
  if (!jobs.length) return { enriched: 0, sized: 0, visaLikely: 0, visaVerified: 0, visaNone: 0 };

  // Workday listings have no JD until their detail is fetched (hydrate.ts);
  // the visa parse below needs it.
  await hydrateJobs(jobs).catch(() => 0);

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
  const counts = { enriched: 0, sized: 0, visaLikely: 0, visaVerified: 0, visaNone: 0 };

  await mapPool(jobs, VISA_CONCURRENCY, async (job) => {
    const curated = job.company_id ? sizeByCompanyId.get(job.company_id) ?? null : null;
    const norm = (job.company_id && normByCompanyId.get(job.company_id)) || job.company.toLowerCase().trim();
    const size: SizeBucket | null = curated ?? ycMap.get(norm) ?? null;

    // Precedence: an explicit JD "no sponsorship" is job-level truth and beats
    // the company's USCIS track record (a verified company can still post reqs
    // it won't sponsor); the track record beats the JD positive parse.
    const jdVisa = await inferVisa(jdText(job.ats, job.raw_json));
    const trackRecord = (job.company_id && evidenceByCompanyId.get(job.company_id)) || null;
    const negative = jdVisa === "no_sponsorship";
    const visa: VisaConfidence = negative ? "no_sponsorship" : trackRecord ? "sponsors_verified" : jdVisa;
    const evidence: VisaEvidence | null = negative ? null : trackRecord;

    const { error: upErr } = await sb
      .from("jobs")
      .update({ company_size: size, visa_confidence: visa, visa_evidence: evidence, enriched_at: nowIso })
      .eq("id", job.id);
    if (upErr) return;

    counts.enriched++;
    if (size) counts.sized++;
    if (visa === "likely_sponsors") counts.visaLikely++;
    if (visa === "sponsors_verified") counts.visaVerified++;
    if (visa === "no_sponsorship") counts.visaNone++;
  });

  return counts;
}

// ── One-off / operator rescan for the negative signal ────────────────────────
// Jobs enriched before the 'no_sponsorship' bucket existed never had their JD
// read for a negative statement. This pass pages through active jobs,
// keyword-screens the JD text in code (cheap), LLM-reads only the mentions,
// and flips explicit "no sponsorship" postings — clearing any evidence
// snapshot, since the JD statement overrides the company track record.
// Triggered from POST /api/admin/h1b-ingest {"rescan_negatives": true}.

const RESCAN_PAGE = 1000;
// LLM-call budget per invocation, sized to fit the route's maxDuration; the
// route reports `screened` so the operator can re-invoke until it goes to 0.
const RESCAN_DEFAULT_LIMIT = 400;

export interface RescanResult {
  scanned: number; // active jobs examined
  screened: number; // JDs that mention visas -> sent to the LLM
  flipped: number; // jobs marked no_sponsorship
}

export async function rescanVisaNegatives(opts?: { limit?: number }): Promise<RescanResult> {
  const sb = supabaseAdmin();
  const maxLlm = opts?.limit ?? RESCAN_DEFAULT_LIMIT;

  const candidates: Array<{ id: string; text: string }> = [];
  let scanned = 0;
  // Only already-enriched jobs (new ones get the negative check in the normal
  // enrichJobs pass), oldest-enriched first. Every screened job gets its
  // enriched_at bumped below, so repeated bounded runs cycle through the corpus
  // instead of re-reading the same mentions. mentionsVisa keeps the scan cheap:
  // non-mention jobs never reach the LLM.
  for (let offset = 0; candidates.length < maxLlm; offset += RESCAN_PAGE) {
    const { data, error } = await sb
      .from("jobs")
      .select("id, ats, raw_json")
      .eq("is_active", true)
      .not("enriched_at", "is", null)
      .or("visa_confidence.is.null,visa_confidence.neq.no_sponsorship")
      .order("enriched_at", { ascending: true })
      .range(offset, offset + RESCAN_PAGE - 1);
    if (error) throw new Error(`rescan page load failed: ${error.message}`);
    const rows = data ?? [];
    scanned += rows.length;
    for (const row of rows) {
      const text = jdText(row.ats as string, row.raw_json as Record<string, unknown>);
      if (text && mentionsVisa(text)) {
        candidates.push({ id: row.id as string, text });
        if (candidates.length >= maxLlm) break;
      }
    }
    if (rows.length < RESCAN_PAGE) break;
  }

  let flipped = 0;
  const nowIso = new Date().toISOString();
  await mapPool(candidates, VISA_CONCURRENCY, async (c) => {
    const negative = (await inferVisa(c.text)) === "no_sponsorship";
    const update = negative
      ? { visa_confidence: "no_sponsorship", visa_evidence: null, enriched_at: nowIso }
      : { enriched_at: nowIso }; // bump so the next bounded run moves on
    const { error } = await sb.from("jobs").update(update).eq("id", c.id);
    if (!error && negative) flipped++;
  });

  return { scanned, screened: candidates.length, flipped };
}
