// Server-side access to the user's imported LinkedIn connections (0034).
// All calls take the service-role client + the session user id (withUser).

import { cleanLinkedinUrl, type ParsedConnection } from "@/lib/connections/csv";
import { companyCore, companyKey, employerCores, isRealEmployer } from "@/lib/connections/match";
import type { SupabaseClient } from "@supabase/supabase-js";

// LinkedIn caps connections at 30k.
export const MAX_CONNECTIONS = 30_000;
const INSERT_BATCH = 1000;

export interface Connection {
  id: string;
  full_name: string;
  linkedin_url: string | null;
  company: string | null;
  position: string | null;
  connected_on: string | null;
}

const COLS = "id, full_name, linkedin_url, company, position, connected_on";

const text = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, n) : null);

// Untrusted upload → rows we store (anything malformed is dropped).
export function sanitizeUpload(raw: unknown): ParsedConnection[] {
  if (!Array.isArray(raw)) return [];
  const out: ParsedConnection[] = [];
  for (const r of raw.slice(0, MAX_CONNECTIONS) as Array<Record<string, unknown>>) {
    const full_name = text(r?.full_name, 160);
    if (!full_name) continue;
    const on = text(r?.connected_on, 10);
    out.push({
      full_name,
      linkedin_url: typeof r?.linkedin_url === "string" ? cleanLinkedinUrl(r.linkedin_url) : null,
      company: text(r?.company, 200),
      position: text(r?.position, 200),
      connected_on: on && /^\d{4}-\d{2}-\d{2}$/.test(on) ? on : null,
    });
  }
  return out;
}

// Imports arrive in chunks (a 30k-row export is past serverless request-size
// limits). Chunk rows are staged with pending = true; the final chunk swaps
// them in for the previous set. Readers skip pending rows, so an abandoned or
// failed import never shows, and the next import's first chunk clears it.
export const IMPORT_CHUNK = 4000;

export async function stageConnections(
  sb: SupabaseClient,
  uid: string,
  rows: ParsedConnection[],
  opts: { first: boolean; final: boolean },
): Promise<{ staged: number; committed: number | null }> {
  if (opts.first) {
    const { error } = await sb.from("connections").delete().eq("user_id", uid).eq("pending", true);
    if (error) throw new Error(`import failed: ${error.message}`);
  }
  const payload = rows.map((r) => ({
    user_id: uid,
    ...r,
    company_key: isRealEmployer(r.company) ? companyKey(r.company) : null,
    company_core: isRealEmployer(r.company) ? companyCore(r.company) : null,
    pending: true,
  }));
  for (let i = 0; i < payload.length; i += INSERT_BATCH) {
    const { error } = await sb.from("connections").insert(payload.slice(i, i + INSERT_BATCH));
    if (error) throw new Error(`import failed: ${error.message}`);
  }
  if (!opts.final) return { staged: payload.length, committed: null };

  const { count: staged } = await sb
    .from("connections")
    .select("id", { count: "exact", head: true })
    .eq("user_id", uid)
    .eq("pending", true);
  if ((staged ?? 0) > MAX_CONNECTIONS) {
    await sb.from("connections").delete().eq("user_id", uid).eq("pending", true);
    throw new Error(`That's more than ${MAX_CONNECTIONS.toLocaleString()} connections.`);
  }
  const del = await sb.from("connections").delete().eq("user_id", uid).eq("pending", false);
  if (del.error) throw new Error(`import failed: ${del.error.message}`);
  const upd = await sb.from("connections").update({ pending: false }).eq("user_id", uid).eq("pending", true);
  if (upd.error) throw new Error(`import failed: ${upd.error.message}`);
  return { staged: payload.length, committed: staged ?? 0 };
}

export async function clearConnections(sb: SupabaseClient, uid: string): Promise<void> {
  const { error } = await sb.from("connections").delete().eq("user_id", uid);
  if (error) throw new Error(error.message);
}

export async function connectionsSummary(
  sb: SupabaseClient,
  uid: string,
): Promise<{ count: number; imported_at: string | null }> {
  const [{ count }, { data }] = await Promise.all([
    sb.from("connections").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("pending", false),
    sb
      .from("connections")
      .select("created_at")
      .eq("user_id", uid)
      .eq("pending", false)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  return { count: count ?? 0, imported_at: (data?.[0]?.created_at as string | undefined) ?? null };
}

// Every name a catalog company may appear under: its own name plus its
// universe row's display name and aliases.
export async function employerNames(sb: SupabaseClient, companyIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!companyIds.length) return out;
  const { data } = await sb
    .from("companies")
    .select("id, name, company_universe(name, aliases)")
    .in("id", companyIds);
  for (const c of (data ?? []) as unknown as Array<{
    id: string;
    name: string;
    company_universe: { name: string; aliases: string[] | null } | null;
  }>) {
    out.set(c.id, [c.name, c.company_universe?.name ?? "", ...(c.company_universe?.aliases ?? [])].filter(Boolean));
  }
  return out;
}

// People the user knows at an employer (by any of its names).
export async function connectionsAt(
  sb: SupabaseClient,
  uid: string,
  names: string[],
  limit = 25,
): Promise<{ total: number; people: Connection[] }> {
  const cores = employerCores(names);
  if (!cores.length) return { total: 0, people: [] };
  const { data, count } = await sb
    .from("connections")
    .select(COLS, { count: "exact" })
    .eq("user_id", uid)
    .eq("pending", false)
    .in("company_core", cores)
    .order("connected_on", { ascending: false, nullsFirst: false })
    .limit(limit);
  return { total: count ?? 0, people: (data ?? []) as Connection[] };
}

// How many people the user knows at each company (tracker chips).
export async function knownCounts(sb: SupabaseClient, uid: string, companyIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!companyIds.length) return counts;
  const names = await employerNames(sb, companyIds);
  const coreToCompanies = new Map<string, string[]>();
  for (const [id, ns] of names) {
    for (const core of employerCores(ns)) coreToCompanies.set(core, [...(coreToCompanies.get(core) ?? []), id]);
  }
  if (!coreToCompanies.size) return counts;
  const { data } = await sb
    .from("connections")
    .select("company_core")
    .eq("user_id", uid)
    .eq("pending", false)
    .in("company_core", [...coreToCompanies.keys()])
    .limit(5000);
  for (const r of (data ?? []) as Array<{ company_core: string }>) {
    for (const id of coreToCompanies.get(r.company_core) ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}
