import { AsyncLocalStorage } from "node:async_hooks";

// Request-scoped current user. Set once at the route boundary (see withUser /
// runWithUser in lib/auth.ts) and read anywhere down the call stack — including
// deep inside the agent pipeline — without threading userId through every
// signature. Node.js runtime only; every route that relies on this declares
// `export const runtime = "nodejs"`.
//
// `userId` is nullable: the signed-out blur-gate lets an anonymous visitor run
// the crew for a teaser (no account, no persistence). Such a run establishes a
// context with userId = null. Persistence paths must gate on maybeUserId() /
// isAnonymousRun() and skip their writes when anonymous — currentUserId() stays
// strict so an ungated write fails loudly instead of inserting a null-owned row.
type UserStore = { userId: string | null };

const storage = new AsyncLocalStorage<UserStore>();

export function runWithUser<T>(userId: string | null, fn: () => T): T {
  return storage.run({ userId }, fn);
}

// Throws if called outside a user context, OR while the run is anonymous — a
// programming error (an ungated persistence path), not a 401. Anonymous-safe
// code paths must read maybeUserId() instead.
export function currentUserId(): string {
  const store = storage.getStore();
  if (!store) {
    throw new Error(
      "currentUserId() called outside a user context — wrap the request in withUser()/runWithUser()",
    );
  }
  if (store.userId === null) {
    throw new Error(
      "currentUserId() called in an anonymous run — gate this path on maybeUserId()/isAnonymousRun()",
    );
  }
  return store.userId;
}

// The current user id, or null when the run is anonymous. Still throws if there
// is no user context at all (that remains a programming error). Use this in any
// path that may run for a signed-out visitor.
export function maybeUserId(): string | null {
  const store = storage.getStore();
  if (!store) {
    throw new Error(
      "maybeUserId() called outside a user context — wrap the request in withUser()/runWithUser()",
    );
  }
  return store.userId;
}

// True when the current run was started by a signed-out visitor (blur-gate
// teaser). Persistence is skipped for these runs.
export function isAnonymousRun(): boolean {
  return maybeUserId() === null;
}
