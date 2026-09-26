import { test } from "node:test";
import assert from "node:assert/strict";
import { mentionsVisa, htmlToText, slugToName } from "./util.ts";

test("mentionsVisa catches sponsorship language, positive and negative", () => {
  assert.equal(mentionsVisa("We are unable to sponsor visas for this role."), true);
  assert.equal(mentionsVisa("Visa sponsorship available."), true);
  assert.equal(mentionsVisa("Must be authorized to work in the US without sponsorship."), true);
  assert.equal(mentionsVisa("We support H-1B and H1B transfers."), true);
  assert.equal(mentionsVisa("We will not sponsor applicants for work visas."), true);
  assert.equal(mentionsVisa("Candidates must not require a visa now or in the future."), true);
  assert.equal(mentionsVisa("The company is not able to sponsor at this time."), true);
  assert.equal(mentionsVisa("STEM OPT and CPT candidates welcome."), true);
  assert.equal(mentionsVisa("Green card process starts day one."), true);
  assert.equal(mentionsVisa("Immigration support provided."), true);
});

test("mentionsVisa skips JDs that never touch the topic", () => {
  assert.equal(mentionsVisa("We optimize distributed systems and accept remote candidates."), false);
  assert.equal(mentionsVisa("Great opportunity for leadership growth."), false);
  assert.equal(mentionsVisa(""), false);
  // Short acronyms only match as standalone words.
  assert.equal(mentionsVisa("Adopt modern tooling; exceptional headroom."), false);
  assert.equal(mentionsVisa("OPT holders encouraged to apply"), true);
});

test("mentionsVisa ignores boilerplate that can't yield a verdict", () => {
  // A bare work-authorization requirement is 'unclear' by the inference rules.
  assert.equal(mentionsVisa("Must be legally authorized to work in the United States."), false);
  assert.equal(mentionsVisa("Work authorisation required (UK spelling)."), false);
  assert.equal(mentionsVisa("Employer-sponsored health plans and a sponsored gym membership."), false);
  assert.equal(mentionsVisa("Help Visa merchants accept payments across the Visa network."), false);
  assert.equal(mentionsVisa("Users can opt out of marketing emails."), false);
});

// Pin the existing helpers this module also exports (previously untested here).
test("htmlToText flattens escaped and real HTML", () => {
  assert.equal(htmlToText("&lt;p&gt;Hello &amp; welcome&lt;/p&gt;"), "Hello & welcome");
  assert.equal(htmlToText("<div>a<br>b</div>"), "a\nb");
});

test("slugToName title-cases slugs", () => {
  assert.equal(slugToName("scale-ai"), "Scale Ai");
  assert.equal(slugToName("anthropic"), "Anthropic");
});
