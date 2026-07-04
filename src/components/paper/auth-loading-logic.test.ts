import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AUTH_LANDING_COOKIE,
  AUTH_LOADING_MS,
  hasAuthLanding,
  clearAuthLandingCookie,
  firstNameOf,
  settingUpLine,
} from "./auth-loading-logic.ts";

test("hasAuthLanding finds the cookie in document.cookie-style strings", () => {
  assert.equal(hasAuthLanding(`${AUTH_LANDING_COOKIE}=1`), true);
  assert.equal(hasAuthLanding(`a=b; ${AUTH_LANDING_COOKIE}=1; c=d`), true);
  // No-whitespace separators (raw Cookie header form) work too.
  assert.equal(hasAuthLanding(`a=b;${AUTH_LANDING_COOKIE}=1`), true);
});

test("hasAuthLanding rejects missing / cleared / lookalike cookies", () => {
  assert.equal(hasAuthLanding(""), false);
  assert.equal(hasAuthLanding(null), false);
  assert.equal(hasAuthLanding(undefined), false);
  assert.equal(hasAuthLanding("crew_onboarded=1"), false);
  // Cleared value must not re-trigger the interstitial.
  assert.equal(hasAuthLanding(`${AUTH_LANDING_COOKIE}=`), false);
  assert.equal(hasAuthLanding(`${AUTH_LANDING_COOKIE}=0`), false);
  // Prefix lookalike is not a match.
  assert.equal(hasAuthLanding(`${AUTH_LANDING_COOKIE}_x=1`), false);
});

test("clearAuthLandingCookie expires the cookie at the root path", () => {
  const s = clearAuthLandingCookie();
  assert.ok(s.startsWith(`${AUTH_LANDING_COOKIE}=;`));
  assert.match(s, /max-age=0/);
  assert.match(s, /path=\//);
  // A string cleared with it no longer reads as a landing.
  assert.equal(hasAuthLanding(s.split(";")[0]), false);
});

test("firstNameOf takes the first word, trimming noise", () => {
  assert.equal(firstNameOf("Ameya Shanbhag"), "Ameya");
  assert.equal(firstNameOf("  Jane   Doe  "), "Jane");
  assert.equal(firstNameOf("Cher"), "Cher");
  assert.equal(firstNameOf(""), "");
  assert.equal(firstNameOf("   "), "");
  assert.equal(firstNameOf(null), "");
  assert.equal(firstNameOf(undefined), "");
});

test("settingUpLine matches the prototype copy, with a nameless fallback", () => {
  assert.equal(settingUpLine("Ameya Shanbhag"), "Setting up your Desk, Ameya…");
  assert.equal(settingUpLine("Cher"), "Setting up your Desk, Cher…");
  assert.equal(settingUpLine(""), "Setting up your Desk…");
  assert.equal(settingUpLine(null), "Setting up your Desk…");
});

test("AUTH_LOADING_MS stays brief — an interstitial, not a loading wall", () => {
  assert.ok(AUTH_LOADING_MS >= 800 && AUTH_LOADING_MS <= 3000);
});
