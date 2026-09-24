import { test } from "node:test";
import assert from "node:assert/strict";

import { canonicalJobUrls, jobUrlsMatch } from "./job-url-normalize.ts";

test("greenhouse boards. and job-boards. hosts match each other", () => {
  assert.ok(
    jobUrlsMatch(
      "https://boards.greenhouse.io/acme/jobs/4567890",
      "https://job-boards.greenhouse.io/acme/jobs/4567890?utm_source=x"
    )
  );
});

test("greenhouse gh_jid embed matches the boards paste", () => {
  assert.ok(
    jobUrlsMatch(
      "https://acme.com/careers?gh_jid=4567890",
      "https://boards.greenhouse.io/acme/jobs/4567890"
    )
  );
});

test("ashby application page matches the posting page", () => {
  assert.ok(
    jobUrlsMatch(
      "https://jobs.ashbyhq.com/acme/1b9a92d4-9f0e-4a1b-8a5e-000000000000/application",
      "https://jobs.ashbyhq.com/Acme/1b9a92d4-9f0e-4a1b-8a5e-000000000000"
    )
  );
});

test("lever apply and thanks pages match the posting", () => {
  const posting = "https://jobs.lever.co/acme/abc-123";
  assert.ok(jobUrlsMatch(`${posting}/apply`, posting));
  assert.ok(jobUrlsMatch(`${posting}/thanks`, posting));
});

test("query strings, trailing slash, and www are ignored", () => {
  assert.ok(
    jobUrlsMatch(
      "https://www.example.com/careers/analyst/?src=li",
      "https://example.com/careers/analyst"
    )
  );
});

test("different postings do not match", () => {
  assert.ok(
    !jobUrlsMatch(
      "https://boards.greenhouse.io/acme/jobs/111",
      "https://boards.greenhouse.io/acme/jobs/222"
    )
  );
  assert.ok(!jobUrlsMatch("https://jobs.lever.co/acme/a", "https://jobs.lever.co/acme/b"));
});

test("garbage input yields no candidates and never matches", () => {
  assert.equal(canonicalJobUrls("::not a url::").length, 0);
  assert.ok(!jobUrlsMatch("::not a url::", "https://jobs.lever.co/acme/a"));
});
