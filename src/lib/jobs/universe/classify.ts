// Company universe (the curated "track these employers" list) — pure parsing +
// classification, no deps beyond other pure modules (node --test safe, and
// importable from scripts/ via Node's type stripping).
//
// Source: data/company-universe.csv, an export of the "All Companies (Unique)"
// sheet that unions three public lists (Fortune 500, top-500 startups by
// valuation, top-500 H-1B sponsors). This module turns those raw rows into
// UniverseEntry records: display names cleaned, subsidiaries folded into their
// parent, an org type (company / IT staffing / academic / hospital), interest
// sectors mapped from the sheet's industry, and a size bucket.
//
// The same logic runs in two places, so they can't drift:
//   * scripts/build-company-universe.ts — generates the seed migration.
//   * src/lib/jobs/universe/* — the server resolver and feed badges.

import { splitCsvLine } from "../h1b/parse.ts";
import { normalizeEmployerName } from "../h1b/normalize.ts";

export type OrgType = "company" | "staffing" | "academic" | "hospital";
export type UniverseSize = "large" | "medium" | "startup";

export interface UniverseEntry {
  name: string; // cleaned display name
  match_key: string; // normalizeEmployerName(name) — dedupe + catalog join key
  aliases: string[]; // raw sheet names folded into this entry
  in_fortune500: boolean;
  in_top_startups: boolean;
  in_top_h1b: boolean;
  fortune_rank: number | null;
  revenue_musd: number | null;
  startup_rank: number | null;
  valuation_busd: number | null;
  investors: string | null;
  h1b_rank: number | null;
  h1b_approvals: number | null;
  h1b_entities: string[]; // USCIS petitioning entity names, as listed
  industry: string | null;
  hq: string | null;
  org_type: OrgType;
  sectors: string[];
  size_bucket: UniverseSize | null;
}

// ── CSV → raw rows ───────────────────────────────────────────────────────────

export interface RawUniverseRow {
  company: string;
  fortune500: boolean;
  topStartup: boolean;
  topH1b: boolean;
  industry: string | null;
  hq: string | null;
  fortuneRank: number | null;
  revenue: number | null;
  startupRank: number | null;
  valuation: number | null;
  investors: string | null;
  h1bRank: number | null;
  h1bApprovals: number | null;
  h1bEntities: string[];
}

function num(v: string | undefined): number | null {
  if (v == null) return null;
  const n = Number(v.replace(/[,$\s]/g, ""));
  return v.trim() && Number.isFinite(n) ? n : null;
}

function text(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  return s ? s : null;
}

const yes = (v: string | undefined) => /^y(es)?$/i.test((v ?? "").trim());

// Loose header lookup so a re-export with slightly different headers still
// parses ("H-1B Rank" / "H1B Rank" / "h1b_rank").
const hkey = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

export function parseUniverseCsv(csv: string): RawUniverseRow[] {
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const header = splitCsvLine(lines[0]).map(hkey);
  const col = (...names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(hkey(n));
      if (i >= 0) return i;
    }
    return -1;
  };
  const idx = {
    company: col("Company"),
    f500: col("Fortune 500"),
    startup: col("Top 500 Startup"),
    h1b: col("Top 500 H-1B Sponsor"),
    industry: col("Industry"),
    hq: col("HQ (US State / Country)", "HQ"),
    fRank: col("Fortune 500 Rank"),
    revenue: col("Revenue ($M)"),
    sRank: col("Startup Rank (by valuation)", "Startup Rank"),
    valuation: col("Valuation ($B)"),
    investors: col("Select Investors"),
    hRank: col("H-1B Rank"),
    hApprovals: col("H-1B Approvals"),
    hEntities: col("H-1B Petitioning Entities"),
  };
  if (idx.company < 0) throw new Error("universe CSV has no Company column");

  const out: RawUniverseRow[] = [];
  for (const line of lines.slice(1)) {
    const c = splitCsvLine(line);
    const at = (i: number) => (i >= 0 ? c[i] : undefined);
    const company = text(at(idx.company));
    if (!company) continue;
    out.push({
      company,
      fortune500: yes(at(idx.f500)),
      topStartup: yes(at(idx.startup)),
      topH1b: yes(at(idx.h1b)),
      industry: text(at(idx.industry)),
      hq: text(at(idx.hq)),
      fortuneRank: num(at(idx.fRank)),
      revenue: num(at(idx.revenue)),
      startupRank: num(at(idx.sRank)),
      valuation: num(at(idx.valuation)),
      investors: text(at(idx.investors)),
      h1bRank: num(at(idx.hRank)),
      h1bApprovals: num(at(idx.hApprovals)),
      h1bEntities: (at(idx.hEntities) ?? "")
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean),
    });
  }
  return out;
}

// ── display names ────────────────────────────────────────────────────────────

// The H-1B list carries USCIS-derived names ("Maplebear Inc dba Instacart",
// "T-mobile Usa,", "Mongodb"). Subsidiaries and filing entities of a company
// that's already on the list fold into it (keyed by the raw name's
// normalizeEmployerName); the rest get a readable display name. Keep this
// conservative: a wrong fold merges two employers' jobs.
export const FOLD_INTO: Record<string, string> = {
  "cvs pharmacy": "CVS Health",
  caremark: "CVS Health",
  "cvs rx services": "CVS Health",
  "aetna resources": "CVS Health",
  "optum services": "UnitedHealth Group",
  "lowes companies": "Lowe’s",
  "dell products": "Dell Technologies",
  emc: "Dell Technologies",
  "fedex freight": "FedEx",
  "bofa securities": "Bank of America",
  "citigroup global markets": "Citigroup",
  "federal home loan mortgage": "Freddie Mac",
  cybersource: "Visa",
  "amazon advertising": "Amazon",
  "annapurna labs": "Amazon",
  "rockwell collins inc dba collins aerospace": "RTX",
  xilinx: "Advanced Micro Devices",
  vmware: "Broadcom",
  "ppd development": "Thermo Fisher Scientific",
  "tiktok usds joint venture": "TikTok",
  "deloitte consulting": "Deloitte",
  "deloitte and touche": "Deloitte",
  "deloitte tax": "Deloitte",
  "pwc advisory services": "PwC",
  "pwc us tax": "PwC",
  "pwc us consulting": "PwC",
  pricewaterhousecoopers: "PwC",
  "moodys analytics": "Moody’s",
  "moodys investors service": "Moody’s",
  "barclays services": "Barclays",
  "barclays capital": "Barclays",
  "ubs business solutions": "UBS",
  "ubs securities": "UBS",
  "db global technology": "Deutsche Bank",
  "db usa core": "Deutsche Bank",
  "deutsche bank securities": "Deutsche Bank",
  "hcl america": "HCLTech",
  "hcl global systems": "HCLTech",
  "persistent systems": "Persistent Systems",
  "persistent systems limited dba persistent systems limited usa branch": "Persistent Systems",
  "virtusa consulting svcs pvt": "Virtusa",
  "dish wireless": "EchoStar",
  "dish network": "EchoStar",
  "samsung austin semiconductor": "Samsung",
  "samsung electronics america": "Samsung",
  "samsung semiconductor": "Samsung",
  "ascendion inc formerly known as collabera": "Ascendion",
  collabera: "Ascendion",
};

// Readable names for H-1B-list entries whose USCIS casing/suffixes are ugly.
// Keyed like FOLD_INTO (normalizeEmployerName of the raw name).
export const RENAME: Record<string, string> = {
  tiktok: "TikTok",
  "t mobile": "T-Mobile",
  mongodb: "MongoDB",
  hubspot: "HubSpot",
  docusign: "DocuSign",
  "godaddy com": "GoDaddy",
  netapp: "NetApp",
  "x ai": "xAI",
  "sap america": "SAP",
  asml: "ASML",
  "zoom communications": "Zoom",
  spotify: "Spotify",
  "sk hynix nand product solutions corp dba solidigm": "Solidigm",
  "government employee insurance company geico": "GEICO",
  fca: "FCA US (Stellantis)",
  "semiconductor components industries": "onsemi",
  "computer sciences": "DXC Technology",
  "environmental systems research institute": "Esri",
  "te connectivity": "TE Connectivity",
  "epam systems": "EPAM Systems",
  "ntt data americas": "NTT DATA",
  "ltimindtree": "LTIMindtree",
  "l and t technology services": "L&T Technology Services",
  "exlservice com": "EXL",
  "tech mahindra americas": "Tech Mahindra",
  "capgemini america": "Capgemini",
  "ernst and young": "EY",
  "kpmg": "KPMG",
  "cgi technologies and solutions": "CGI",
  "ust global": "UST",
  "zs associates": "ZS Associates",
  "adp technology services": "ADP",
  mathworks: "MathWorks",
  "cox automotive corporate services": "Cox Automotive",
  "fis management services": "FIS",
  "dfs corporate services": "Discover Financial Services",
  "htc global services": "HTC Global Services",
  "globallogic": "GlobalLogic",
  wsp: "WSP",
  "slk america": "SLK",
  arcadis: "Arcadis",
  "options clearing": "The Options Clearing Corporation",
  "depository trust and clearing": "DTCC",
  "citadel americas services": "Citadel",
  "citadel securities americas services": "Citadel Securities",
  "robinhood markets": "Robinhood",
  "palantir technologies": "Palantir",
  "maplebear inc dba instacart": "Instacart",
  "relx inc dba lexisnexis": "LexisNexis",
  "nordstrom inc dba nordstrom": "Nordstrom",
  "pacific investment management company llc dba pimco": "PIMCO",
  "general hosp corp dba mass general hosp": "Massachusetts General Hospital",
  "henry ford health system dba henry ford health": "Henry Ford Health",
  yahoo: "Yahoo",
  "rbc capital markets": "RBC Capital Markets",
  "aptiv us services general partnership dba aptiv": "Aptiv",
  "mastech digital technologies inc a mastech digital": "Mastech Digital",
  "genesis corp dba genesis10": "Genesis10",
  "artech llc aka artech information systems": "Artech",
  "management health systems llc dba medpro": "MedPro International",
  "fidelity technology group llc dba fidelity investments": "Fidelity Investments",
  "infinite computer solutions": "Infinite Computer Solutions",
  "rocket limited partnership": "Rocket Companies",
};

// Generic cleanup for everything not in the maps: take the "dba" name, drop
// trailing punctuation.
export function cleanDisplayName(raw: string): string {
  let s = raw.trim();
  const dba = s.match(/\bdba\s+(.+)$/i);
  if (dba) s = dba[1];
  return s.replace(/[\s,.;]+$/, "").trim();
}

// The canonical display name for a raw sheet name: fold target, curated rename,
// or the generic cleanup.
export function canonicalName(raw: string): string {
  const key = normalizeEmployerName(raw);
  return FOLD_INTO[key] ?? RENAME[key] ?? cleanDisplayName(raw);
}

// ── org type ─────────────────────────────────────────────────────────────────

// IT outsourcing / staffing firms: their postings are mostly client-placed
// contract roles and they file H-1Bs at volume, so they would dominate a visa
// seeker's feed. Flagged so the feed can exclude them by default (step 4 of the
// universe plan). Deliberately excludes consultancies that hire into their own
// practices (Accenture, Big 4, MBB, EPAM, Slalom, …). Keyed by
// normalizeEmployerName of the canonical name.
const STAFFING = new Set(
  [
    "Tata Consultancy Services", "Infosys", "Capgemini", "HCLTech", "Cognizant Technology Solutions",
    "Wipro", "LTIMindtree", "Tech Mahindra", "Mphasis", "TT Commerce and Global Services",
    "Compunnel Software Group", "UST", "Randstad Digital", "Virtusa", "Kforce",
    "Infinite Computer Solutions", "L&T Technology Services", "Hexaware Technologies", "EXL",
    "NTT DATA", "Synechron", "Birlasoft", "Innova Solutions", "Insight Global", "Coforge",
    "CitiusTech", "HTC Global Services", "Zensar Technologies", "Persistent Systems", "Atos Syntel",
    "Populus Group", "Intellectt", "Brillio", "V-soft Consulting Group", "SLK", "Erp Analysts",
    "Intraedge", "Cosmic Healthcare", "Beacon Hill Solutions Group", "Photon Infotech",
    "Quadrant Technologies", "Mastech Digital", "Digipulse Technologies", "Kpit Technologies",
    "Pyramid Consulting", "Comtrix Solutions", "Experis Us", "Tata Technologies", "Eficens Systems",
    "Artech", "Pioneer Consulting Services", "Sapphire Software Solutions", "Strategic Systems",
    "Valuemomentum", "Beaconfire Staffing Solutions", "Infogain", "Akkodis", "Avco Consulting",
    "Quest Global Services-na", "Tavant Technologies", "Tata Elxsi", "Miracle Software Systems",
    "Denken Solutions", "Genesis10", "Cyient", "Eliassen Group", "Squad Software", "Natsoft",
    "Sage It", "Incedo", "Xoriant", "System Soft Technologies", "Ascendion", "Yash Technologies",
    "Tek Leaders", "MedPro International", "Genpact", "CGI", "iGate", "Hitachi Digital Services",
  ].map((n) => normalizeEmployerName(n)),
);

const ACADEMIC_RE =
  /universit|college|polytechnic|institute of technology|school district|public schools|department of education|school of medicine|medical school|trustees of|regents|national laborator|battelle|argonne|brookhaven|howard hughes|national institutes of health|research foundation|ut-battelle|\bcurators\b/i;
const HOSPITAL_RE =
  /hospital|medical center|clinic\b|clinic foundation|health system|cancer center|cancer institute|children'?s|\bmayo\b|northwell|montefiore|cedars|sloan kettering|upmc|ochsner|dana-farber|cleveland clinic|medical college|st jude|health care service|henry ford health|arup laboratories/i;

export function orgTypeFor(canonical: string, raw: string[] = []): OrgType {
  if (STAFFING.has(normalizeEmployerName(canonical))) return "staffing";
  const hay = [canonical, ...raw].join(" | ");
  if (ACADEMIC_RE.test(hay)) return "academic";
  if (HOSPITAL_RE.test(hay)) return "hospital";
  return "company";
}

// ── sectors ──────────────────────────────────────────────────────────────────

// Sheet industry → interest sector ids (src/lib/jobs/catalog/sectors.ts). A
// first pass only: the server refines sectors with an LLM batch (see
// universe/sectors.ts) since "Enterprise Tech" alone can't tell AI from
// security. Unmapped industries (industrials, energy, …) get no sector — those
// companies still reach users through the universe candidate pool.
const INDUSTRY_SECTORS: Array<[RegExp, string[]]> = [
  [/^enterprise tech$|computer software|information technology services/i, ["enterprise_saas"]],
  [/semiconductor|computers, office|network and other communications|telecommunications/i, ["data_infra"]],
  [/financial|bank|securities|insurance|financial data/i, ["fintech"]],
  [/internet services and retailing/i, ["ecommerce", "consumer"]],
  [/consumer|retail|merchandis|apparel|food and drug stores|household|beverage|food consumer|food services|hotels|entertainment|media/i, ["consumer"]],
  [/health|pharma|medical|life sciences/i, ["healthcare"]],
  [/utilities|^energy$/i, ["climate"]],
  [/transportation and logistics|mail, package|trucking/i, ["ecommerce"]],
];

export function sectorsForIndustry(industry: string | null, orgType: OrgType): string[] {
  if (orgType === "hospital") return ["healthcare"];
  if (!industry) return [];
  for (const [re, sectors] of INDUSTRY_SECTORS) if (re.test(industry)) return sectors;
  return [];
}

// ── size ─────────────────────────────────────────────────────────────────────

// Fortune 500 or a ≥$50B private valuation → large; ≥$5B → medium; smaller
// unicorns → startup. H-1B-only rows carry no size signal → null (enrichment
// then falls back to the YC team-size map).
export function sizeFor(e: { in_fortune500: boolean; valuation_busd: number | null }): UniverseSize | null {
  if (e.in_fortune500) return "large";
  if (e.valuation_busd == null) return null;
  if (e.valuation_busd >= 50) return "large";
  if (e.valuation_busd >= 5) return "medium";
  return "startup";
}

// ── fold raw rows into entries ───────────────────────────────────────────────

const minN = (a: number | null, b: number | null) => (a == null ? b : b == null ? a : Math.min(a, b));

export function buildUniverse(rows: RawUniverseRow[]): UniverseEntry[] {
  const byKey = new Map<string, UniverseEntry>();
  for (const r of rows) {
    const name = canonicalName(r.company);
    const key = normalizeEmployerName(name);
    if (!key) continue;
    const cur = byKey.get(key);
    if (!cur) {
      byKey.set(key, {
        name,
        match_key: key,
        aliases: [r.company],
        in_fortune500: r.fortune500,
        in_top_startups: r.topStartup,
        in_top_h1b: r.topH1b,
        fortune_rank: r.fortuneRank,
        revenue_musd: r.revenue,
        startup_rank: r.startupRank,
        valuation_busd: r.valuation,
        investors: r.investors,
        h1b_rank: r.h1bRank,
        h1b_approvals: r.h1bApprovals,
        h1b_entities: [...r.h1bEntities],
        industry: r.industry,
        hq: r.hq,
        org_type: "company",
        sectors: [],
        size_bucket: null,
      });
      continue;
    }
    // Fold a subsidiary / duplicate into the existing entry.
    cur.aliases.push(r.company);
    cur.in_fortune500 ||= r.fortune500;
    cur.in_top_startups ||= r.topStartup;
    cur.in_top_h1b ||= r.topH1b;
    cur.fortune_rank = minN(cur.fortune_rank, r.fortuneRank);
    cur.revenue_musd ??= r.revenue;
    cur.startup_rank = minN(cur.startup_rank, r.startupRank);
    cur.valuation_busd ??= r.valuation;
    cur.investors ??= r.investors;
    cur.h1b_rank = minN(cur.h1b_rank, r.h1bRank);
    cur.h1b_approvals =
      cur.h1b_approvals == null && r.h1bApprovals == null ? null : (cur.h1b_approvals ?? 0) + (r.h1bApprovals ?? 0);
    for (const e of r.h1bEntities) if (!cur.h1b_entities.includes(e)) cur.h1b_entities.push(e);
    cur.industry ??= r.industry;
    cur.hq ??= r.hq;
  }

  const out = [...byKey.values()];
  for (const e of out) {
    e.org_type = orgTypeFor(e.name, e.aliases);
    e.sectors = sectorsForIndustry(e.industry, e.org_type);
    e.size_bucket = sizeFor(e);
  }
  return out;
}

// ── list badges (feed) ───────────────────────────────────────────────────────

export interface UniverseBadgeInput {
  in_fortune500: boolean;
  in_top_startups: boolean;
  in_top_h1b: boolean;
  fortune_rank: number | null;
  startup_rank: number | null;
  valuation_busd: number | null;
  h1b_rank: number | null;
}

// Short "why this company is tracked" labels, strongest first. Rendered as
// chips on feed cards; at most two so a card never turns into a badge wall.
export function universeBadges(u: UniverseBadgeInput | null | undefined, max = 2): string[] {
  if (!u) return [];
  const out: string[] = [];
  if (u.in_fortune500 && u.fortune_rank != null) out.push(`Fortune 500 #${u.fortune_rank}`);
  else if (u.in_fortune500) out.push("Fortune 500");
  if (u.in_top_h1b && u.h1b_rank != null) {
    out.push(u.h1b_rank <= 100 ? `Top-100 H-1B sponsor` : `Top-500 H-1B sponsor`);
  } else if (u.in_top_h1b) out.push("Top H-1B sponsor");
  if (u.in_top_startups) {
    const v = u.valuation_busd;
    out.push(v != null ? `Startup · $${v >= 10 ? Math.round(v) : v}B valuation` : "Top startup");
  }
  return out.slice(0, max);
}
