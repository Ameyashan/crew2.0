import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AUTH_ERROR_PARAM,
  parseAuthError,
  stripAuthError,
} from "./auth-error-logic.ts";

test("parseAuthError reads the param from a location.search string", () => {
  assert.equal(parseAuthError(`?${AUTH_ERROR_PARAM}=boom`), "boom");
  // With a leading "?" and other params, in any position.
  assert.equal(parseAuthError(`?next=%2Fapp&${AUTH_ERROR_PARAM}=boom`), "boom");
  assert.equal(parseAuthError(`${AUTH_ERROR_PARAM}=boom&x=1`), "boom");
});

test("parseAuthError decodes percent- and plus-encoding", () => {
  assert.equal(
    parseAuthError(`?${AUTH_ERROR_PARAM}=invalid%20request`),
    "invalid request",
  );
  assert.equal(parseAuthError(`?${AUTH_ERROR_PARAM}=code+verifier`), "code verifier");
});

test("parseAuthError returns null when absent, empty, or lookalike", () => {
  assert.equal(parseAuthError(""), null);
  assert.equal(parseAuthError(null), null);
  assert.equal(parseAuthError(undefined), null);
  assert.equal(parseAuthError("?next=%2Fapp"), null);
  // Present but empty value → nothing to show.
  assert.equal(parseAuthError(`?${AUTH_ERROR_PARAM}=`), null);
  assert.equal(parseAuthError(`?${AUTH_ERROR_PARAM}`), null);
  // Prefix lookalike is not a match.
  assert.equal(parseAuthError(`?${AUTH_ERROR_PARAM}_x=boom`), null);
});

test("parseAuthError tolerates malformed percent-encoding", () => {
  assert.equal(parseAuthError(`?${AUTH_ERROR_PARAM}=%E0%A4%A`), "%E0%A4%A");
});

test("stripAuthError removes only the auth_error param, keeping the rest", () => {
  assert.equal(stripAuthError(`?${AUTH_ERROR_PARAM}=boom`), "");
  assert.equal(
    stripAuthError(`?next=%2Fapp&${AUTH_ERROR_PARAM}=boom`),
    "?next=%2Fapp",
  );
  assert.equal(
    stripAuthError(`?${AUTH_ERROR_PARAM}=boom&next=%2Fapp`),
    "?next=%2Fapp",
  );
  // A scrubbed string no longer parses as an error.
  assert.equal(parseAuthError(stripAuthError(`?${AUTH_ERROR_PARAM}=boom`)), null);
});

test("stripAuthError is a no-op when there is no error param", () => {
  assert.equal(stripAuthError(""), "");
  assert.equal(stripAuthError(null), "");
  assert.equal(stripAuthError("?next=%2Fapp"), "?next=%2Fapp");
});
