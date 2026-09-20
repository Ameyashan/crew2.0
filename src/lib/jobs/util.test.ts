import { test } from "node:test";
import assert from "node:assert/strict";
import { mentionsVisa, htmlToText, slugToName } from "./util.ts";

test("mentionsVisa catches sponsorship language, positive and negative", () => {
  assert.equal(mentionsVisa("We are unable to sponsor visas for this role."), true);
  assert.equal(mentionsVisa("Visa sponsorship available."), true);
  assert.equal(mentionsVisa("Must be authorized to work in the US without sponsorship."), true);
  assert.equal(mentionsVisa("We support H-1B and H1B transfers."), true);
  assert.equal(mentionsVisa("Work authorisation required (UK spelling)."), true);
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

// Pin the existing helpers this module also exports (previously untested here).
test("htmlToText flattens escaped and real HTML", () => {
  assert.equal(htmlToText("&lt;p&gt;Hello &amp; welcome&lt;/p&gt;"), "Hello & welcome");
  assert.equal(htmlToText("<div>a<br>b</div>"), "a\nb");
});

test("slugToName title-cases slugs", () => {
  assert.equal(slugToName("scale-ai"), "Scale Ai");
  assert.equal(slugToName("anthropic"), "Anthropic");
});
