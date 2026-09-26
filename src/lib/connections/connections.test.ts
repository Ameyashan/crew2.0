import { test } from "node:test";
import assert from "node:assert/strict";
import { csvRows, parseConnectionsCsv, parseConnectedOn, cleanLinkedinUrl } from "./csv.ts";
import { companyCore, companyKey, employerCores, isRealEmployer } from "./match.ts";

const EXPORT = `Notes:
"When exporting your connection data, you may notice that some of the email addresses are missing. You will only see email addresses for connections who have allowed their connections to see or download their email address using this setting https://www.linkedin.com/psettings/privacy/email. You can learn more about this here https://www.linkedin.com/help/linkedin/answer/261"

First Name,Last Name,URL,Email Address,Company,Position,Connected On
Priya,Raman,https://www.linkedin.com/in/priyaraman,priya@example.com,Goldman Sachs,"Vice President, Engineering",15 Mar 2024
Dan,O'Neil,https://www.linkedin.com/in/dan-oneil/,,JPMorganChase,Software Engineer,02 Jan 2023
,,,,,,
Sam,,https://www.linkedin.com/in/sam,,Self-employed,Consultant,1 Jul 2021
`;

test("csv: quoted fields, embedded commas and newlines", () => {
  assert.deepEqual(csvRows('a,"b,c","d ""e"""\r\n1,2,3'), [
    ["a", "b,c", 'd "e"'],
    ["1", "2", "3"],
  ]);
  assert.deepEqual(csvRows('x,"line1\nline2"\n'), [["x", "line1\nline2"]]);
});

test("connections export: header found past the notes, emails dropped", () => {
  const r = parseConnectionsCsv(EXPORT);
  assert.equal(r.error, null);
  assert.equal(r.connections.length, 3);
  assert.deepEqual(r.connections[0], {
    full_name: "Priya Raman",
    linkedin_url: "https://www.linkedin.com/in/priyaraman",
    company: "Goldman Sachs",
    position: "Vice President, Engineering",
    connected_on: "2024-03-15",
  });
  assert.equal(r.connections[1].linkedin_url, "https://www.linkedin.com/in/dan-oneil");
  assert.ok(!JSON.stringify(r).includes("priya@example.com"));
  assert.ok(parseConnectionsCsv("name,company\nx,y").error);
});

test("dates and profile URLs", () => {
  assert.equal(parseConnectedOn("5 Sep 2025"), "2025-09-05");
  assert.equal(parseConnectedOn("2025-09-05"), "2025-09-05");
  assert.equal(parseConnectedOn("yesterday"), null);
  assert.equal(cleanLinkedinUrl("linkedin.com/in/abc/"), "https://www.linkedin.com/in/abc");
  assert.equal(cleanLinkedinUrl("https://evil.com/in/abc"), null);
  assert.equal(cleanLinkedinUrl("https://www.linkedin.com/company/x"), null);
});

test("company matching: LinkedIn spellings meet catalog names", () => {
  assert.equal(companyCore("Goldman Sachs"), companyCore("Goldman Sachs Group"));
  assert.equal(companyCore("JPMorganChase"), companyCore("JPMorgan Chase"));
  assert.equal(companyCore("JPMorgan Chase & Co."), companyCore("JPMorgan Chase"));
  assert.equal(companyCore("Stripe, Inc."), companyCore("Stripe"));
  assert.equal(companyCore("Scale AI"), companyCore("Scale"));
  assert.equal(companyCore("Palantir Technologies"), companyCore("Palantir"));
  assert.notEqual(companyCore("Relativity Space"), companyCore("Relativity"));
  assert.equal(companyKey("Goldman Sachs Group"), "goldmansachs");
  assert.deepEqual(employerCores(["Goldman Sachs Group", "GOLDMAN SACHS & CO. LLC", null]), ["goldmansachs"]);
  assert.ok(!isRealEmployer("Self-employed"));
  assert.ok(!isRealEmployer("Stealth Startup"));
  assert.ok(isRealEmployer("Stripe"));
});
