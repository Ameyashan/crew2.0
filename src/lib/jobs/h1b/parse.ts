// USCIS H-1B Employer Data Hub CSV parsing (pure — no deps, node --test safe).
//
// The hub publishes one CSV per fiscal year (uscis.gov → Reports and studies →
// H-1B Employer Data Hub → Files), e.g. h1b_datahubexport-2024.csv. Columns as
// published: Fiscal Year, Employer, Initial Approval, Initial Denial,
// Continuing Approval, Continuing Denial, NAICS, Tax ID, State, City, ZIP.
// Header wording has drifted across years ("Employer (Petitioner) Name",
// pluralized counts), so headers are matched loosely. Employer names contain
// commas ("AMAZON.COM SERVICES, LLC") and are quoted; counts occasionally carry
// thousands separators. Rows without an employer or fiscal year are skipped.

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
export function splitCsvLine(line: string): string[] {
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
    } else if (ch === ",") {
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

const HEADER_MAP: Record<string, Field> = {
  fiscalyear: "fiscal_year",
  employer: "employer_name",
  employerpetitionername: "employer_name",
  petitionername: "employer_name",
  initialapproval: "initial_approvals",
  initialapprovals: "initial_approvals",
  initialdenial: "initial_denials",
  initialdenials: "initial_denials",
  continuingapproval: "continuing_approvals",
  continuingapprovals: "continuing_approvals",
  continuingdenial: "continuing_denials",
  continuingdenials: "continuing_denials",
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
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0);
  if (!lines.length) return { rows: [], skipped: 0, fiscalYears: [] };

  const header = splitCsvLine(lines[0]).map(headerKey);
  const cols: Array<Field | null> = header.map((h) => HEADER_MAP[h] ?? null);
  if (!cols.includes("employer_name") || !cols.includes("fiscal_year")) {
    throw new Error(
      `unrecognized H-1B CSV header — expected Employer + Fiscal Year columns, got: ${splitCsvLine(lines[0]).join(" | ")}`,
    );
  }

  const rows: H1bCsvRow[] = [];
  let skipped = 0;
  const fys = new Set<number>();

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const raw: Partial<Record<Field, string>> = {};
    for (let c = 0; c < cols.length; c++) {
      const field = cols[c];
      if (field) raw[field] = (cells[c] ?? "").trim();
    }
    const employer = (raw.employer_name ?? "").trim();
    const fy = parseInt((raw.fiscal_year ?? "").replace(/\D/g, ""), 10);
    if (!employer || !Number.isFinite(fy) || fy < 2000 || fy > 2100) {
      skipped++;
      continue;
    }
    fys.add(fy);
    rows.push({
      employer_name: employer,
      fiscal_year: fy,
      initial_approvals: toCount(raw.initial_approvals as string),
      initial_denials: toCount(raw.initial_denials as string),
      continuing_approvals: toCount(raw.continuing_approvals as string),
      continuing_denials: toCount(raw.continuing_denials as string),
      state: raw.state || null,
      city: raw.city || null,
      zip: raw.zip || null,
      naics: raw.naics || null,
    });
  }

  return { rows, skipped, fiscalYears: [...fys].sort((a, b) => a - b) };
}
