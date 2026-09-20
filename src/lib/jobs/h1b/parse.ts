// USCIS H-1B Employer Data Hub CSV/TSV parsing (pure — no deps, node --test
// safe).
//
// The hub publishes one export per fiscal year (uscis.gov → Reports and
// studies → H-1B Employer Data Hub → Files), in two generations both handled
// here:
//   * classic CSV (h1b_datahubexport-YYYY.csv): Fiscal Year, Employer,
//     Initial Approval/Denial, Continuing Approval/Denial, NAICS, Tax ID,
//     State, City, ZIP.
//   * "Employer Information" export: tab-separated (often UTF-16 on disk —
//     decode before calling; see decodeH1bExport in the admin route), with the
//     counts split by petition type: New Employment, Continuation, Change with
//     Same Employer, New Concurrent, Change of Employer, Amended — each
//     Approval/Denial. Those roll up exactly the way USCIS's classic files
//     did: Initial = New Employment + New Concurrent; Continuing = the rest.
// Header wording has drifted across years ("Employer (Petitioner) Name",
// pluralized counts, trailing spaces), so headers are matched loosely and
// several columns may sum into one count field. Employer names contain commas
// ("AMAZON.COM SERVICES, LLC") and are quoted in the CSV generation; counts
// occasionally carry thousands separators. Rows without an employer or fiscal
// year are skipped.

export interface H1bCsvRow {
  employer_name: string;
  fiscal_year: number;
  initial_approvals: number;
  initial_denials: number;
  continuing_approvals: number;
  continuing_denials: number;
  state: string | null;
  city: string | null;
  zip: string | null;
  naics: string | null;
}

// RFC-4180-ish line splitter: quoted fields, doubled quotes, CRLF tolerant.
// `delim` supports both hub generations (comma CSV, tab TSV).
export function splitCsvLine(line: string, delim: string = ","): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

// Loose header key: lowercase alphanumerics only, so "Initial Approval",
// "Initial Approvals" and "initial_approvals" all collapse to the same key.
function headerKey(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

type Field = keyof H1bCsvRow;
type CountField = "initial_approvals" | "initial_denials" | "continuing_approvals" | "continuing_denials";

// Several source columns can SUM into one count field (the "Employer
// Information" export splits counts by petition type); text fields keep the
// first non-empty value.
const HEADER_MAP: Record<string, Field> = {
  fiscalyear: "fiscal_year",
  employer: "employer_name",
  employerpetitionername: "employer_name",
  petitionername: "employer_name",
  // classic export
  initialapproval: "initial_approvals",
  initialapprovals: "initial_approvals",
  initialdenial: "initial_denials",
  initialdenials: "initial_denials",
  continuingapproval: "continuing_approvals",
  continuingapprovals: "continuing_approvals",
  continuingdenial: "continuing_denials",
  continuingdenials: "continuing_denials",
  // "Employer Information" export — USCIS's own classic aggregation:
  // Initial = New Employment + New Concurrent; Continuing = the rest.
  newemploymentapproval: "initial_approvals",
  newconcurrentapproval: "initial_approvals",
  newemploymentdenial: "initial_denials",
  newconcurrentdenial: "initial_denials",
  continuationapproval: "continuing_approvals",
  changewithsameemployerapproval: "continuing_approvals",
  changeofemployerapproval: "continuing_approvals",
  amendedapproval: "continuing_approvals",
  continuationdenial: "continuing_denials",
  changewithsameemployerdenial: "continuing_denials",
  changeofemployerdenial: "continuing_denials",
  amendeddenial: "continuing_denials",
  // location / industry
  state: "state",
  petitionerstate: "state",
  city: "city",
  petitionercity: "city",
  zip: "zip",
  zipcode: "zip",
  petitionerzipcode: "zip",
  naics: "naics",
  naicscode: "naics",
  industrynaicscode: "naics",
};

const COUNT_FIELDS = new Set<Field>([
  "initial_approvals",
  "initial_denials",
  "continuing_approvals",
  "continuing_denials",
]);

function toCount(v: string | undefined): number {
  const n = parseInt((v ?? "").replace(/[",\s]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export interface ParseResult {
  rows: H1bCsvRow[];
  skipped: number; // data lines dropped (no employer / unparsable fiscal year)
  fiscalYears: number[]; // distinct FYs seen, ascending
}

export function parseH1bCsv(text: string): ParseResult {
  // Strip a BOM if the decode left one, then split lines.
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r\n|\n|\r/)
    .filter((l) => l.trim().length > 0);
  if (!lines.length) return { rows: [], skipped: 0, fiscalYears: [] };

  const delim = lines[0].includes("\t") ? "\t" : ",";
  const header = splitCsvLine(lines[0], delim).map(headerKey);
  const cols: Array<Field | null> = header.map((h) => HEADER_MAP[h] ?? null);
  if (!cols.includes("employer_name") || !cols.includes("fiscal_year")) {
    throw new Error(
      `unrecognized H-1B CSV header — expected Employer + Fiscal Year columns, got: ${splitCsvLine(lines[0], delim).join(" | ")}`,
    );
  }

  const rows: H1bCsvRow[] = [];
  let skipped = 0;
  const fys = new Set<number>();

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], delim);
    const text2: Partial<Record<Field, string>> = {};
    const counts: Record<CountField, number> = {
      initial_approvals: 0,
      initial_denials: 0,
      continuing_approvals: 0,
      continuing_denials: 0,
    };
    for (let c = 0; c < cols.length; c++) {
      const field = cols[c];
      if (!field) continue;
      const cell = (cells[c] ?? "").trim();
      if (COUNT_FIELDS.has(field)) {
        counts[field as CountField] += toCount(cell);
      } else if (!text2[field] && cell) {
        text2[field] = cell;
      }
    }
    const employer = (text2.employer_name ?? "").trim();
    const fy = parseInt((text2.fiscal_year ?? "").replace(/\D/g, ""), 10);
    if (!employer || !Number.isFinite(fy) || fy < 2000 || fy > 2100) {
      skipped++;
      continue;
    }
    fys.add(fy);
    rows.push({
      employer_name: employer,
      fiscal_year: fy,
      ...counts,
      state: text2.state || null,
      city: text2.city || null,
      zip: text2.zip || null,
      naics: text2.naics || null,
    });
  }

  return { rows, skipped, fiscalYears: [...fys].sort((a, b) => a - b) };
}
