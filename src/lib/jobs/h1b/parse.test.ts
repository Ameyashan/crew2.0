import { test } from "node:test";
import assert from "node:assert/strict";
import { parseH1bCsv, splitCsvLine } from "./parse.ts";

// A faithful slice of the USCIS Employer Data Hub export shape: quoted employer
// names with commas, a location per row, occasional blank counts.
const SAMPLE = [
  `Fiscal Year,Employer,Initial Approval,Initial Denial,Continuing Approval,Continuing Denial,NAICS,Tax ID,State,City,ZIP`,
  `2025,"AMAZON.COM SERVICES, LLC",4085,54,"9,265",120,45,1234,WA,SEATTLE,98109`,
  `2025,STRIPE INC,214,3,180,2,52,5678,CA,SOUTH SAN FRANCISCO,94080`,
  `2024,STRIPE INC,190,8,160,4,52,5678,CA,SOUTH SAN FRANCISCO,94080`,
  `2025,,1,0,0,0,52,,CA,,`, // no employer -> skipped
  `bogus,ACME LLC,1,0,0,0,52,,CA,,`, // unparsable FY -> skipped
].join("\r\n");

test("splitCsvLine handles quoted fields, embedded commas, doubled quotes", () => {
  assert.deepEqual(splitCsvLine(`a,"b,c",d`), ["a", "b,c", "d"]);
  assert.deepEqual(splitCsvLine(`"say ""hi""",x`), [`say "hi"`, "x"]);
  assert.deepEqual(splitCsvLine(``), [""]);
});

test("parseH1bCsv reads the hub export shape", () => {
  const { rows, skipped, fiscalYears } = parseH1bCsv(SAMPLE);
  assert.equal(rows.length, 3);
  assert.equal(skipped, 2);
  assert.deepEqual(fiscalYears, [2024, 2025]);

  const amazon = rows[0];
  assert.equal(amazon.employer_name, "AMAZON.COM SERVICES, LLC");
  assert.equal(amazon.fiscal_year, 2025);
  assert.equal(amazon.initial_approvals, 4085);
  assert.equal(amazon.continuing_approvals, 9265); // thousands separator stripped
  assert.equal(amazon.state, "WA");
});

test("parseH1bCsv tolerates header wording drift", () => {
  const alt = [
    `Fiscal Year,Employer (Petitioner) Name,Initial Approvals,Initial Denials,Continuing Approvals,Continuing Denials,Petitioner State,Petitioner City,Petitioner Zip Code`,
    `2023,FIGMA INC,40,1,25,0,CA,SAN FRANCISCO,94103`,
  ].join("\n");
  const { rows } = parseH1bCsv(alt);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].employer_name, "FIGMA INC");
  assert.equal(rows[0].initial_approvals, 40);
  assert.equal(rows[0].city, "SAN FRANCISCO");
});

test("parseH1bCsv rejects a CSV without the key columns", () => {
  assert.throws(() => parseH1bCsv("foo,bar\n1,2"), /unrecognized H-1B CSV header/);
});

test("parseH1bCsv treats blank/garbage counts as zero", () => {
  const csv = [
    `Fiscal Year,Employer,Initial Approval,Initial Denial,Continuing Approval,Continuing Denial`,
    `2025,ACME LLC,,-,D,3`,
  ].join("\n");
  const { rows } = parseH1bCsv(csv);
  assert.equal(rows[0].initial_approvals, 0);
  assert.equal(rows[0].initial_denials, 0);
  assert.equal(rows[0].continuing_approvals, 0);
  assert.equal(rows[0].continuing_denials, 3);
});
