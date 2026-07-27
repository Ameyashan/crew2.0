import { test } from "node:test";
import assert from "node:assert/strict";

import { mergeRepickOutput } from "./repick-merge.ts";

test("single-contact run: re-pick replaces person/enrichment/drafts, keeps the résumé", () => {
  const prev = {
    parsed: { resume: { meta: { target_role: "Staff PD" } }, target_role: "Staff PD" },
    candidates: [{ name: "Alia" }, { name: "Bo" }],
    questions: ["Why us?"],
    person: { name: "Alia" },
    enrichment: { email: "alia@acme.com" },
    drafts: [{ channel: "email", body: "hi Alia" }],
  };
  const out = mergeRepickOutput(prev, {
    person: { name: "Bo" },
    enrichment: { email: "bo@acme.com" },
    drafts: [{ channel: "email", body: "hi Bo" }],
  });
  // The picked contact is swapped in…
  assert.deepEqual(out.person, { name: "Bo" });
  assert.deepEqual(out.enrichment, { email: "bo@acme.com" });
  assert.deepEqual(out.drafts, [{ channel: "email", body: "hi Bo" }]);
  // …while the rest of the package is preserved untouched.
  assert.deepEqual(out.parsed, prev.parsed);
  assert.deepEqual(out.candidates, prev.candidates);
  assert.deepEqual(out.questions, prev.questions);
});

test("dual-contact run: re-pick updates only the hiring_manager slot", () => {
  const prev = {
    parsed: { target_role: "Designer" },
    contacts: {
      poster: { person: { name: "Poster" }, drafts: [{ body: "hi poster" }] },
      hiring_manager: { person: { name: "Old HM" }, enrichment: { email: "old@x.com" }, drafts: [{ body: "hi old" }], sameAsPoster: false },
    },
  };
  const out = mergeRepickOutput(prev, {
    person: { name: "New HM" },
    enrichment: { email: "new@x.com" },
    drafts: [{ body: "hi new" }],
  });
  const contacts = out.contacts as any;
  // Poster slot is untouched…
  assert.deepEqual(contacts.poster, prev.contacts.poster);
  // …hiring_manager is the newly-picked contact.
  assert.deepEqual(contacts.hiring_manager.person, { name: "New HM" });
  assert.deepEqual(contacts.hiring_manager.enrichment, { email: "new@x.com" });
  assert.deepEqual(contacts.hiring_manager.drafts, [{ body: "hi new" }]);
  assert.equal(contacts.hiring_manager.sameAsPoster, false);
  // The top-level person/drafts of a dual run are not introduced.
  assert.equal(out.person, undefined);
});

test("a draftless amendment leaves the prior contact's drafts intact", () => {
  const prev = { person: { name: "Alia" }, drafts: [{ body: "keep me" }] };
  const out = mergeRepickOutput(prev, { person: { name: "Bo" }, enrichment: null, drafts: [] });
  assert.deepEqual(out.person, { name: "Bo" });
  assert.deepEqual(out.drafts, [{ body: "keep me" }]);
});

test("null / non-object prior output degrades to a fresh single-contact bundle", () => {
  const out = mergeRepickOutput(null, {
    person: { name: "Bo" },
    enrichment: { email: "bo@acme.com" },
    drafts: [{ body: "hi" }],
  });
  assert.deepEqual(out, {
    person: { name: "Bo" },
    enrichment: { email: "bo@acme.com" },
    drafts: [{ body: "hi" }],
  });
});

test("does not mutate the input output object", () => {
  const prev = { person: { name: "Alia" }, drafts: [{ body: "orig" }], parsed: { target_role: "PD" } };
  const snapshot = JSON.parse(JSON.stringify(prev));
  mergeRepickOutput(prev, { person: { name: "Bo" }, enrichment: null, drafts: [{ body: "new" }] });
  assert.deepEqual(prev, snapshot);
});
