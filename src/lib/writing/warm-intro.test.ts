import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWarmIntroTarget, warmIntroGuide, warmIntroIntent } from "./warm-intro.ts";

test("warm intro: target parsing drops junk and non-http URLs", () => {
  assert.equal(parseWarmIntroTarget(null), null);
  assert.equal(parseWarmIntroTarget({ role: "SWE" }), null);
  assert.deepEqual(parseWarmIntroTarget({ company: " Stripe ", role: "SWE", job_url: "javascript:alert(1)" }), {
    company: "Stripe",
    role: "SWE",
    team: null,
    job_url: null,
  });
  assert.equal(parseWarmIntroTarget({ company: "Stripe", job_url: "https://stripe.com/jobs/1" })?.job_url, "https://stripe.com/jobs/1");
});

test("warm intro: intent names the role when there is one", () => {
  assert.equal(
    warmIntroIntent({ company: "Goldman Sachs", role: "Software Engineer" }),
    "Warm intro ask: introduce me to the right person for the Software Engineer role at Goldman Sachs.",
  );
  assert.equal(warmIntroIntent({ company: "Stripe" }), "Warm intro ask: introduce me to the right person for a role at Stripe.");
});

test("warm intro: guide asks for a forwardable blurb except on X", () => {
  assert.match(warmIntroGuide("linkedin"), /forwardable blurb last/);
  assert.match(warmIntroGuide("email"), /forwardable blurb last/);
  assert.match(warmIntroGuide("x_dm"), /skip the forwardable blurb/);
});
