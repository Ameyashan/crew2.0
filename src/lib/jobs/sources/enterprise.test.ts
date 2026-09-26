import { test } from "node:test";
import assert from "node:assert/strict";
import { oracleSlugFromUrl, parseOracleSlug, oracleJob, usLocationId, oracleTenant } from "./oracle.ts";
import { smartRecruitersSlugFromUrl, smartRecruitersJob } from "./smartrecruiters.ts";
import { eightfoldSlugFromUrl, parseEightfoldSlug, eightfoldJob } from "./eightfold.ts";
import { icimsSlugFromUrl, icimsTenant, icimsLocation, parseIcimsSearchPage, icimsPageCount } from "./icims.ts";
import { boardLinksIn } from "../universe/careers.ts";
import { canonicalSlug } from "../universe/probe.ts";
import { jsonLdJobPosting } from "./http.ts";

test("oracle: slug parse pins the host family", () => {
  assert.deepEqual(parseOracleSlug("jpmc.fa.oraclecloud.com/CX_1001"), { host: "jpmc.fa.oraclecloud.com", site: "CX_1001" });
  assert.deepEqual(parseOracleSlug("hdpc.fa.us2.oraclecloud.com/LateralHiring"), {
    host: "hdpc.fa.us2.oraclecloud.com",
    site: "LateralHiring",
  });
  assert.ok(parseOracleSlug("x.fa.ocs.oraclecloud26.com/CX_1"));
  assert.equal(parseOracleSlug("evil.com/CX_1"), null);
  assert.equal(parseOracleSlug("jpmc.fa.oraclecloud.com.evil.com/CX_1"), null);
  assert.equal(parseOracleSlug("jpmc.fa.oraclecloud.com"), null);
  assert.equal(oracleTenant("hdpc.fa.us2.oraclecloud.com/LateralHiring"), "hdpc");
  assert.equal(canonicalSlug("oracle", "JPMC.fa.oraclecloud.com/CX_1001"), "jpmc.fa.oraclecloud.com/CX_1001");
});

test("oracle: URL → slug, US facet, requisition → job", () => {
  assert.equal(
    oracleSlugFromUrl("https://hdpc.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/LateralHiring/job/182440/apply/email"),
    "hdpc.fa.us2.oraclecloud.com/LateralHiring",
  );
  assert.equal(oracleSlugFromUrl("https://example.com/hcmUI/CandidateExperience/en/sites/CX_1"), null);
  assert.equal(
    usLocationId({ locationsFacet: [{ Id: 1, Name: "United Kingdom" }, { Id: 300000000289738, Name: "United States" }] }),
    "300000000289738",
  );
  assert.equal(usLocationId({ locationsFacet: [{ Id: 1, Name: "NY, United States" }] }), null);
  const s = { host: "jpmc.fa.oraclecloud.com", site: "CX_1001" };
  const j = oracleJob(s, { Id: "210766638", Title: "Associate", PostedDate: "2026-09-26", PrimaryLocation: "Plano, TX, United States", WorkplaceTypeCode: "ORA_HYBRID" }, "JPMorgan Chase");
  assert.equal(j?.external_job_id, "jpmc.fa.oraclecloud.com:210766638");
  assert.equal(j?.url, "https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/job/210766638");
  assert.equal(j?.city, "Plano");
  assert.equal(j?.remote_type, "hybrid");
  assert.equal(j?.posted_date_approx, false);
  assert.equal(oracleJob(s, { Title: "no id" }, "x"), null);
});

test("smartrecruiters: URL → slug, posting → job", () => {
  assert.equal(smartRecruitersSlugFromUrl("https://jobs.smartrecruiters.com/ServiceNow/744000151981339-sr-staff"), "ServiceNow");
  assert.equal(smartRecruitersSlugFromUrl("https://careers.smartrecruiters.com/BoschGroup"), "BoschGroup");
  assert.equal(smartRecruitersSlugFromUrl("https://jobs.smartrecruiters.com/oneclick-ui/company/x"), null);
  const j = smartRecruitersJob("servicenow", {
    id: "744000151981339",
    name: "Sr. Staff Product Designer",
    releasedDate: "2026-09-26T03:12:04.607Z",
    company: { identifier: "ServiceNow", name: "ServiceNow" },
    location: { city: "Santa Clara", region: "CA", country: "us", remote: true, fullLocation: "Santa Clara, CA, United States" },
  });
  assert.equal(j?.url, "https://jobs.smartrecruiters.com/ServiceNow/744000151981339-sr-staff-product-designer");
  assert.equal(j?.remote_type, "remote");
  assert.equal(j?.company, "ServiceNow");
  assert.equal(j?.external_job_id, "servicenow:744000151981339");
});

test("eightfold: slug parse, URL → slug (domain defaults to tenant.com), both API shapes", () => {
  assert.deepEqual(parseEightfoldSlug("micron/micron.com"), { tenant: "micron", domain: "micron.com" });
  assert.equal(parseEightfoldSlug("micron"), null);
  assert.equal(eightfoldSlugFromUrl("https://bayer.eightfold.ai/careers?domain=bayer.com&pid=1"), "bayer/bayer.com");
  assert.equal(eightfoldSlugFromUrl("https://micron.eightfold.ai/careers"), "micron/micron.com");
  assert.equal(eightfoldSlugFromUrl("https://eightfold.ai/careers"), null);
  const s = { tenant: "micron", domain: "micron.com" };
  const pcsx = eightfoldJob(s, "pcsx", { id: 43877830, name: "Staff Engineer", locations: ["Longmont, Colorado, United States of America"], postedTs: 1787011200, positionUrl: "/careers/job/43877830", workLocationOption: "hybrid" }, "Micron");
  assert.equal(pcsx?.url, "https://micron.eightfold.ai/careers/job/43877830");
  assert.equal(pcsx?.remote_type, "hybrid");
  assert.equal(pcsx?.posted_date, new Date(1787011200 * 1000).toISOString());
  const v2 = eightfoldJob({ tenant: "bayer", domain: "bayer.com" }, "v2", { id: "5629", name: "Intern", location: "Chesterfield,Missouri,United States", canonicalPositionUrl: "https://talent.bayer.com/careers/job/5629", t_create: 1788480000 }, "Bayer");
  assert.equal(v2?.url, "https://talent.bayer.com/careers/job/5629");
  assert.equal(v2?.external_job_id, "bayer:5629");
});

test("icims: slug, tenant, location, search-page cards", () => {
  assert.equal(icimsSlugFromUrl("https://careers-quest.icims.com/jobs/search?ss=1"), "careers-quest.icims.com");
  assert.equal(icimsSlugFromUrl("https://www.icims.com/jobs"), null);
  assert.equal(icimsTenant("careers-quest.icims.com"), "quest");
  assert.equal(icimsTenant("us-erac.icims.com"), "erac");
  assert.equal(icimsLocation("US-TX-Abilene"), "Abilene, TX, United States");
  assert.equal(icimsLocation("AMER-CA-NS-Remote"), "AMER-CA-NS-Remote");
  const html = `<title>Job Listings at Quest</title> Page 1 of 2
    <li class="iCIMS_JobCardItem"><a href="https://careers-quest.icims.com/jobs/13742/qa-engineer/job?in_iframe=1" class="iCIMS_Anchor">
      <span class="sr-only field-label">Title</span><h3 > QA Engineer</h3></a>
      <div class="col-xs-12 description"> Quest Software is looking for a QA &amp; Test Engineer...</div>
      <dt class="iCIMS_JobHeaderField"><span class="sr-only field-label">Location</span></dt><dd class="iCIMS_JobHeaderData"><span > US-TX-Austin</span></dd>
    </li>
    <li class="iCIMS_JobCardItem"><a href="https://evil.example/jobs/1/x/job"><h3>Off-host</h3></a></li>`;
  const cards = parseIcimsSearchPage(html, "careers-quest.icims.com");
  assert.equal(cards.length, 1);
  assert.deepEqual(cards[0], {
    id: "13742",
    title: "QA Engineer",
    url: "https://careers-quest.icims.com/jobs/13742/qa-engineer/job",
    location: "US-TX-Austin",
    teaser: "Quest Software is looking for a QA & Test Engineer...",
  });
  assert.equal(icimsPageCount(html), 2);
});

test("careers page: finds the new board links", () => {
  const html = `
    <a href="https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/jobs">Search jobs</a>
    <a href="https://jobs.smartrecruiters.com/ServiceNow">Careers</a>
    <a href="https://bayer.eightfold.ai/careers?domain=bayer.com&amp;pid=1">Jobs</a>
    <iframe src="https://careers-quest.icims.com/jobs/search?ss=1"></iframe>`;
  assert.deepEqual(boardLinksIn(html), [
    { ats: "oracle", slug: "jpmc.fa.oraclecloud.com/CX_1001" },
    { ats: "smartrecruiters", slug: "ServiceNow" },
    { ats: "eightfold", slug: "bayer/bayer.com" },
    { ats: "icims", slug: "careers-quest.icims.com" },
  ]);
});

test("json-ld: JobPosting from a bare node or a graph", () => {
  const bare = `<script type="application/ld+json">{"@type":"JobPosting","datePosted":"2026-09-23"}</script>`;
  assert.equal(jsonLdJobPosting(bare)?.datePosted, "2026-09-23");
  const graph = `<script nonce="x" type="application/ld+json">{"@graph":[{"@type":"Organization"},{"@type":"JobPosting","title":"T"}]}</script>`;
  assert.equal(jsonLdJobPosting(graph)?.title, "T");
  assert.equal(jsonLdJobPosting("<p>none</p>"), null);
});
