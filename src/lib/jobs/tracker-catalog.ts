// Company tracker (pick side): the typeahead and the preset lists shown in
// setup. Everything here reads the catalog we already hold — `companies` (a
// verified job board we can fetch) and `company_universe` (the curated
// Fortune 500 / top startups / top H-1B sponsors list, with ranks). No LLM: a
// name we can't find, or an employer whose board we never found, is reported
// as "can't track yet" instead of being resolved on the spot.

import { sectorLabel } from "@/lib/jobs/catalog/sectors";
import { universeBadges, type UniverseBadgeInput } from "@/lib/jobs/universe/classify";
import { normalizeEmployerName } from "@/lib/jobs/h1b/normalize";
import type { TrackerCompanyOption, TrackerPreset } from "@/lib/jobs/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const PRESET_SIZE = 10;
const SEARCH_SIZE = 8;
const UNIVERSE_BADGE_COLS = "in_fortune500, in_top_startups, in_top_h1b, fortune_rank, startup_rank, valuation_busd, h1b_rank";

interface UniverseRow extends UniverseBadgeInput {
  id: string;
  name: string;
}

interface BoardRow {
  id: string;
  name: string;
  universe_id: string | null;
  company_universe?: UniverseBadgeInput | null;
}

const nameKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

// ilike wildcards and PostgREST or() syntax out of user input.
function cleanQuery(q: string): string {
  return q.replace(/[%_,()"'*\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

// Active boards for these universe employers, keyed by universe id (the first
// board wins when an employer has several).
async function boardsForUniverse(sb: SupabaseClient, universeIds: string[]): Promise<Map<string, BoardRow>> {
  const out = new Map<string, BoardRow>();
  if (!universeIds.length) return out;
  const { data } = await sb
    .from("companies")
    .select("id, name, universe_id")
    .eq("active", true)
    .in("universe_id", universeIds)
    .order("created_at", { ascending: true });
  for (const b of (data ?? []) as BoardRow[]) {
    if (b.universe_id && !out.has(b.universe_id)) out.set(b.universe_id, b);
  }
  return out;
}

// Universe rows (already in rank order) → the first `size` we can track.
async function trackableFromUniverse(
  sb: SupabaseClient,
  rows: UniverseRow[],
  size: number,
): Promise<TrackerCompanyOption[]> {
  const boards = await boardsForUniverse(
    sb,
    rows.map((r) => r.id),
  );
  const out: TrackerCompanyOption[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const b = boards.get(r.id);
    if (!b || seen.has(b.id)) continue;
    seen.add(b.id);
    out.push({ company_id: b.id, name: r.name, badge: universeBadges(r, 1)[0] ?? null });
    if (out.length >= size) break;
  }
  return out;
}

// Typeahead: trackable boards first, then known employers we can't track yet.
export async function searchTrackable(sb: SupabaseClient, rawQuery: string): Promise<TrackerCompanyOption[]> {
  const q = cleanQuery(rawQuery);
  if (q.length < 2) return [];
  const key = normalizeEmployerName(q);

  const [{ data: boardData }, { data: uniData }] = await Promise.all([
    sb
      .from("companies")
      .select(`id, name, universe_id, company_universe(${UNIVERSE_BADGE_COLS})`)
      .eq("active", true)
      .ilike("name", `%${q}%`)
      .limit(25),
    sb
      .from("company_universe")
      .select(`id, name, ${UNIVERSE_BADGE_COLS}`)
      .or(key ? `name.ilike.%${q}%,match_key.ilike.%${key}%` : `name.ilike.%${q}%`)
      .limit(25),
  ]);
  const boards = (boardData ?? []) as unknown as BoardRow[];
  const universe = (uniData ?? []) as UniverseRow[];

  // Universe employers whose board didn't match by name (the board is named
  // differently, e.g. a slug-derived name) still resolve through universe_id.
  const linked = await boardsForUniverse(
    sb,
    universe.map((u) => u.id),
  );

  const qk = nameKey(q);
  const rank = (name: string) => {
    const k = nameKey(name);
    return k === qk ? 0 : k.startsWith(qk) ? 1 : 2;
  };

  const options: Array<TrackerCompanyOption & { r: number }> = [];
  const seenBoards = new Set<string>();
  const seenNames = new Set<string>();
  const push = (o: TrackerCompanyOption) => {
    const nk = nameKey(o.name);
    if (seenNames.has(nk) || (o.company_id && seenBoards.has(o.company_id))) return;
    seenNames.add(nk);
    if (o.company_id) seenBoards.add(o.company_id);
    options.push({ ...o, r: rank(o.name) + (o.company_id ? 0 : 0.5) });
  };

  for (const b of boards) {
    push({ company_id: b.id, name: b.name, badge: universeBadges(b.company_universe, 1)[0] ?? null });
  }
  for (const u of universe) {
    const b = linked.get(u.id);
    push({ company_id: b?.id ?? null, name: u.name, badge: universeBadges(u, 1)[0] ?? null });
  }

  return options
    .sort((a, b) => a.r - b.r || a.name.length - b.name.length)
    .slice(0, SEARCH_SIZE)
    .map((o) => ({ company_id: o.company_id, name: o.name, badge: o.badge }));
}

async function topStartups(sb: SupabaseClient): Promise<TrackerCompanyOption[]> {
  const { data } = await sb
    .from("company_universe")
    .select(`id, name, ${UNIVERSE_BADGE_COLS}`)
    .eq("in_top_startups", true)
    .not("startup_rank", "is", null)
    .order("startup_rank", { ascending: true })
    .limit(80);
  return trackableFromUniverse(sb, (data ?? []) as UniverseRow[], PRESET_SIZE);
}

// Top H-1B sponsors that hire directly — staffing / academic / hospital
// employers file at volume but aren't what "companies that sponsor" means.
async function topVisaSponsors(sb: SupabaseClient): Promise<TrackerCompanyOption[]> {
  const { data } = await sb
    .from("company_universe")
    .select(`id, name, ${UNIVERSE_BADGE_COLS}`)
    .eq("in_top_h1b", true)
    .eq("org_type", "company")
    .not("h1b_rank", "is", null)
    .order("h1b_rank", { ascending: true })
    .limit(80);
  return trackableFromUniverse(sb, (data ?? []) as UniverseRow[], PRESET_SIZE);
}

// The most prominent trackable employers tagged with a sector: best of their
// Fortune / startup / H-1B ranks; curated boards outside the universe last.
async function topInSector(sb: SupabaseClient, sector: string): Promise<TrackerCompanyOption[]> {
  const { data } = await sb
    .from("companies")
    .select(`id, name, universe_id, company_universe(${UNIVERSE_BADGE_COLS})`)
    .eq("active", true)
    .neq("org_type", "staffing")
    .contains("sectors", [sector])
    .limit(1000);
  const best = (u: UniverseBadgeInput | null | undefined) => {
    if (!u) return Number.POSITIVE_INFINITY;
    const ranks = [u.fortune_rank, u.startup_rank, u.h1b_rank].filter((r): r is number => typeof r === "number");
    return ranks.length ? Math.min(...ranks) : 10_000;
  };
  const rows = ((data ?? []) as unknown as BoardRow[]).sort(
    (a, b) => best(a.company_universe) - best(b.company_universe) || a.name.localeCompare(b.name),
  );
  const out: TrackerCompanyOption[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const k = nameKey(r.name);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ company_id: r.id, name: r.name, badge: universeBadges(r.company_universe, 1)[0] ?? null });
    if (out.length >= PRESET_SIZE) break;
  }
  return out;
}

// Target companies the user named during onboarding, where we have a board.
async function fromProfile(sb: SupabaseClient, pins: string[]): Promise<TrackerCompanyOption[]> {
  if (!pins.length) return [];
  const norms = [...new Set(pins.map((p) => p.toLowerCase().trim()))].slice(0, 30);
  const { data } = await sb
    .from("companies")
    .select(`id, name, normalized, company_universe(${UNIVERSE_BADGE_COLS})`)
    .eq("active", true)
    .in("normalized", norms);
  const out: TrackerCompanyOption[] = [];
  const seen = new Set<string>();
  for (const r of (data ?? []) as unknown as Array<BoardRow & { normalized: string }>) {
    if (seen.has(r.normalized)) continue;
    seen.add(r.normalized);
    out.push({ company_id: r.id, name: r.name, badge: universeBadges(r.company_universe, 1)[0] ?? null });
  }
  return out.slice(0, PRESET_SIZE);
}

export async function trackerPresets(
  sb: SupabaseClient,
  opts: { sector: string | null; pins: string[] },
): Promise<TrackerPreset[]> {
  const [profile, startups, sector, visa] = await Promise.all([
    fromProfile(sb, opts.pins),
    topStartups(sb),
    opts.sector ? topInSector(sb, opts.sector) : Promise.resolve([] as TrackerCompanyOption[]),
    topVisaSponsors(sb),
  ]);
  const presets: TrackerPreset[] = [];
  if (profile.length) presets.push({ id: "profile", label: "From your profile", companies: profile });
  presets.push({ id: "startups", label: "Top 10 startups", companies: startups });
  if (opts.sector) {
    presets.push({ id: "sector", label: `Top 10 in ${sectorLabel(opts.sector)}`, companies: sector });
  }
  presets.push({ id: "visa", label: "Top 10 visa sponsors", companies: visa });
  return presets;
}
