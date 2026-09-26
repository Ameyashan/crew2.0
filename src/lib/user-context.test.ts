import { test } from "node:test";
import assert from "node:assert/strict";
import { runWithUser, runAsSystem, isSystemRun, maybeUserId } from "./user-context.ts";

test("runAsSystem is user-less and flagged system", () => {
  runAsSystem(() => {
    assert.equal(maybeUserId(), null);
    assert.equal(isSystemRun(), true);
  });
});

test("per-user work inside a system run is not system", () => {
  runAsSystem(() => {
    runWithUser("u1", () => {
      assert.equal(maybeUserId(), "u1");
      assert.equal(isSystemRun(), false);
    });
  });
});

test("anonymous and context-free runs are not system", () => {
  runWithUser(null, () => assert.equal(isSystemRun(), false));
  assert.equal(isSystemRun(), false);
});
