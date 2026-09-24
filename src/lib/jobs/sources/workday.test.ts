import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseWorkdaySlug,
  workdaySlugFromUrl,
  usCountryFacet,
  postedOnToIso,
  listingLocation,
  workdayLocation,
} from "./workday.ts";
import { boardLinksIn } from "../universe/careers.ts";

test("slug parse + URL extraction", () => {
  assert.deepEqual(parseWorkdaySlug("nvidia/wd5/NVIDIAExternalCareerSite"), {
    tenant: "nvidia",
    wd: "wd5",
    site: "NVIDIAExternalCareerSite",
  });
  assert.equal(parseWorkdaySlug("nvidia"), null);
  assert.equal(parseWorkdaySlug("a/b/c"), null);
  assert.equal(workdaySlugFromUrl("https://homedepot.wd5.myworkdayjobs.com/CareerDepot/login"), "homedepot/wd5/CareerDepot");
  assert.equal(workdaySlugFromUrl("https://ghr.wd1.myworkdayjobs.com/en-US/Lateral-US/job/x"), "ghr/wd1/Lateral-US");
  assert.equal(workdaySlugFromUrl("https://ghr.wd1.myworkdayjobs.com/wday/cxs/ghr/Lateral-US/jobs"), null);
  assert.equal(workdaySlugFromUrl("https://example.com/careers"), null);
});

test("US country facet: top-level and nested, else null", () => {
  const top = [
    { facetParameter: "jobFamilyGroup", values: [{ descriptor: "Engineering", id: "e1" }] },
    {
      facetParameter: "Location_Country",
      values: [
        { descriptor: "India", id: "in1" },
        { descriptor: "United States of America", id: "bc33" },
      ],
    },
  ];
  assert.deepEqual(usCountryFacet(top), { Location_Country: ["bc33"] });
  const nested = [
    {
      facetParameter: "locationMainGroup",
      values: [{ facetParameter: "locationCountry", values: [{ descriptor: "United States", id: "us9" }] }],
    },
  ];
  assert.deepEqual(usCountryFacet(nested), { locationCountry: ["us9"] });
  // A city list is not a country facet.
  const cities = [
    { facetParameter: "locationMainGroup", values: [{ facetParameter: "locations", values: [{ descriptor: "US", id: "x" }] }] },
  ];
  assert.equal(usCountryFacet(cities), null);
  assert.equal(usCountryFacet(undefined), null);
});

test("postedOn → approximate ISO date", () => {
  const now = new Date("2026-09-24T12:00:00Z");
  assert.equal(postedOnToIso("Posted Today", now), "2026-09-24T12:00:00.000Z");
  assert.equal(postedOnToIso("Posted Yesterday", now), "2026-09-23T12:00:00.000Z");
  assert.equal(postedOnToIso("Posted 3 Days Ago", now), "2026-09-21T12:00:00.000Z");
  assert.equal(postedOnToIso("Posted 30+ Days Ago", now), "2026-08-25T12:00:00.000Z");
  assert.equal(postedOnToIso(undefined, now), null);
  assert.equal(postedOnToIso("Recently", now), null);
});

test("listing location: text as given, else first path location", () => {
  assert.equal(listingLocation({ locationsText: "US, CA, Santa Clara" }), "US, CA, Santa Clara");
  assert.equal(
    listingLocation({ locationsText: "4 Locations", externalPath: "/job/US-CA-Santa-Clara/Engineer_JR1" }),
    "US, CA, Santa Clara (+3 more)",
  );
  assert.equal(
    listingLocation({ locationsText: "2 Locations", externalPath: "/job/Bangalore/Engineer_JR2" }),
    "Bangalore (+1 more)",
  );
});

test("country-first US locations are reordered", () => {
  const l = workdayLocation("US, CA, Santa Clara (+3 more)");
  assert.equal(l.country, "United States");
  assert.equal(l.region, "CA");
  assert.equal(l.city, "Santa Clara");
  assert.equal(l.location_raw, "US, CA, Santa Clara (+3 more)");
  const dash = workdayLocation("USA - Texas - Austin");
  assert.equal(dash.city, "Austin");
  assert.equal(dash.region, "Texas");
  const plain = workdayLocation("Seattle, WA");
  assert.equal(plain.city, "Seattle");
  assert.equal(plain.region, "WA");
});

test("careers page: board links of every kind, deduped", () => {
  const html = `
    <a href="https://homedepot.wd5.myworkdayjobs.com/CareerDepot">Search jobs</a>
    <a href="https://homedepot.wd5.myworkdayjobs.com/en-US/CareerDepot/job/1">dup</a>
    <script src="https://boards.greenhouse.io/embed/job_board?for=acme"></script>
    <a href="https://job-boards.greenhouse.io/acme">GH</a>
    <a href="https://jobs.lever.co/widgetco/123">Lever</a>
    <a href="https://jobs.ashbyhq.com/Ramp">Ashby</a>`;
  assert.deepEqual(boardLinksIn(html), [
    { ats: "workday", slug: "homedepot/wd5/CareerDepot" },
    { ats: "greenhouse", slug: "acme" },
    { ats: "lever", slug: "widgetco" },
    { ats: "ashby", slug: "Ramp" },
  ]);
  assert.deepEqual(boardLinksIn("<p>no boards here</p>"), []);
});
