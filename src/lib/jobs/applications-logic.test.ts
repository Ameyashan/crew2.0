import { test } from "node:test";
import assert from "node:assert/strict";
import { applicationItem, applicationStage, applicationsSummary, type ApplicationRow } from "./applications-logic.ts";

const ROW: ApplicationRow = {
  id: "a1",
  job_url: " https://jobs.ashbyhq.com/acme/123 ",
  job_json: { role: "Head of Product", company: "Acme AI" },
  status: "drafted",
  created_at: "2026-09-30T12:00:00Z",
  submitted_at: null,
  application_qa: { questions: ["Why Acme?", "A project you're proud of"], answers: [{}] },
  resume_generation: { target_role: "Product Lead", target_company: "Acme" },
};

test("applicationStage: submitted_at or status wins over drafted; sent is still drafted", () => {
  assert.equal(applicationStage("drafted", null), "drafted");
  assert.equal(applicationStage("sent", null), "drafted");
  assert.equal(applicationStage("submitted", null), "submitted");
  assert.equal(applicationStage("drafted", "2026-09-30T13:00:00Z"), "submitted");
  assert.equal(applicationStage("replied", "2026-09-30T13:00:00Z"), "replied");
});

test("applicationItem: posting meta first, résumé target as fallback, Q&A counts", () => {
  const item = applicationItem(ROW, { run_id: "r1", contact: " Priya Shah " });
  assert.equal(item.role, "Head of Product");
  assert.equal(item.company, "Acme AI");
  assert.equal(item.job_url, "https://jobs.ashbyhq.com/acme/123");
  assert.equal(item.run_id, "r1");
  assert.equal(item.contact, "Priya Shah");
  assert.equal(item.questions, 2);
  assert.equal(item.answers, 1);

  const bare = applicationItem({ ...ROW, job_json: null, application_qa: null });
  assert.equal(bare.role, "Product Lead");
  assert.equal(bare.company, "Acme");
  assert.equal(bare.run_id, null);
  assert.equal(bare.questions, 0);

  const empty = applicationItem({ ...ROW, job_json: { role: " " }, resume_generation: null, job_url: null });
  assert.equal(empty.role, "Application");
  assert.equal(empty.company, null);
  assert.equal(empty.job_url, null);
});

test("applicationsSummary counts submitted vs ready", () => {
  assert.equal(applicationsSummary([]), "");
  assert.equal(applicationsSummary([{ stage: "drafted" }]), "1 ready to submit");
  assert.equal(
    applicationsSummary([{ stage: "submitted" }, { stage: "replied" }, { stage: "drafted" }]),
    "2 submitted · 1 ready to submit",
  );
});
