import { test } from "node:test";
import assert from "node:assert/strict";
import { inferDomain, guessDomain, buildGuesses } from "./domain.ts";

// Regression for the Decagon bug: research found the company's real website
// (decagon.ai), but the email lookup guessed decagon.com and returned pattern
// guesses on the wrong domain. inferDomain must prefer the real website over the
// name-mangled .com guess.
test("inferDomain prefers the research website over the .com name-guess", () => {
  assert.equal(
    inferDomain({ company: "Decagon", links: { website: "https://decagon.ai" } }),
    "decagon.ai",
  );
  // bare host, no scheme, with a www. prefix → still the real domain
  assert.equal(
    inferDomain({ company: "Decagon", links: { website: "www.decagon.ai" } }),
    "decagon.ai",
  );
});

test("inferDomain falls back to the .com guess only when there is no website", () => {
  assert.equal(inferDomain({ company: "Decagon", links: null }), "decagon.com");
  assert.equal(inferDomain({ company: "Decagon" }), "decagon.com");
  assert.equal(inferDomain({ company: null, links: null }), null);
});

test("guessDomain strips legal/qualifier noise before assuming .com", () => {
  assert.equal(guessDomain("Stripe, Inc."), "stripe.com");
  assert.equal(guessDomain("Clay (previously Anthropic)"), "clay.com");
  assert.equal(guessDomain("Acme — Payments"), "acme.com");
  assert.equal(guessDomain(null), null);
});

test("buildGuesses produces the expected pattern set on the resolved domain", () => {
  const domain = inferDomain({
    company: "Decagon",
    links: { website: "https://decagon.ai" },
  });
  assert.equal(domain, "decagon.ai");

  const guesses = buildGuesses("Ashwin Sreenivas", domain!);
  const emails = guesses.map((g) => g.email);

  // Every guess is on the real domain — none leak the wrong decagon.com.
  assert.ok(
    emails.every((e) => e.endsWith("@decagon.ai")),
    `expected all guesses on decagon.ai, got ${emails.join(", ")}`,
  );
  assert.ok(!emails.some((e) => e.endsWith("@decagon.com")));

  // The primary firstname.lastname guess is the correct address.
  assert.equal(guesses[0].email, "ashwin.sreenivas@decagon.ai");
  assert.equal(guesses[0].pattern, "firstname.lastname");
});
