// LinkedIn "Connections.csv" parser (Settings → Data privacy → Get a copy of
// your data → Connections). Pure and dependency-free: it runs in the browser
// so the file never leaves the user's machine whole — only the columns we
// keep are uploaded. Email addresses are deliberately dropped here.
//
// The export starts with a few "Notes:" lines, then the header:
//   First Name,Last Name,URL,Email Address,Company,Position,Connected On
// Values may be quoted (RFC 4180: "" escapes a quote, commas/newlines inside
// quotes are literal).
//
// Relative imports only (node --test).

export interface ParsedConnection {
  full_name: string;
  linkedin_url: string | null;
  company: string | null;
  position: string | null;
  connected_on: string | null; // YYYY-MM-DD
}

export interface ParseResult {
  connections: ParsedConnection[];
  skipped: number; // rows without a name
  error: string | null; // set when the file isn't a Connections export at all
}

// Split CSV text into rows of fields (quote-aware).
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

// "15 Mar 2024" (LinkedIn's format) or ISO → "2024-03-15"; else null.
export function parseConnectedOn(v: string): string | null {
  const t = v.trim();
  const m = t.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})$/);
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}`;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

// Only public LinkedIn profile URLs survive.
export function cleanLinkedinUrl(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    if (!/(^|\.)linkedin\.com$/i.test(u.hostname) || !u.pathname.startsWith("/in/")) return null;
    return `https://www.linkedin.com${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

const norm = (h: string) => h.trim().toLowerCase().replace(/[^a-z]/g, "");
const cap = (s: string | undefined, n: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, n) : null;
};

export function parseConnectionsCsv(text: string): ParseResult {
  const rows = csvRows(text);
  const headerIdx = rows.findIndex((r) => {
    const h = r.map(norm);
    return h.includes("firstname") && h.includes("lastname");
  });
  if (headerIdx === -1) {
    return {
      connections: [],
      skipped: 0,
      error: "This doesn't look like LinkedIn's Connections.csv (no First Name / Last Name header).",
    };
  }
  const header = rows[headerIdx].map(norm);
  const col = (name: string) => header.indexOf(name);
  const iFirst = col("firstname");
  const iLast = col("lastname");
  const iUrl = col("url");
  const iCompany = col("company");
  const iPosition = col("position");
  const iOn = col("connectedon");

  const connections: ParsedConnection[] = [];
  let skipped = 0;
  for (const r of rows.slice(headerIdx + 1)) {
    if (r.every((f) => !f.trim())) continue;
    const full = cap(`${r[iFirst] ?? ""} ${r[iLast] ?? ""}`, 160);
    if (!full) {
      skipped++;
      continue;
    }
    connections.push({
      full_name: full,
      linkedin_url: iUrl >= 0 ? cleanLinkedinUrl(r[iUrl] ?? "") : null,
      company: iCompany >= 0 ? cap(r[iCompany], 200) : null,
      position: iPosition >= 0 ? cap(r[iPosition], 200) : null,
      connected_on: iOn >= 0 ? parseConnectedOn(r[iOn] ?? "") : null,
    });
  }
  return { connections, skipped, error: null };
}
