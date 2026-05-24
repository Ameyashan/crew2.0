import { AsyncLocalStorage } from "node:async_hooks";

// Request-scoped current user. Set once at the route boundary (see withUser /
// runWithUser in lib/auth.ts) and read anywhere down the call stack — including
// deep inside the agent pipeline — without threading userId through every
// signature. Node.js runtime only; every route that relies on this declares
// `export const runtime = "nodejs"`.
type UserStore = { userId: string };

const storage = new AsyncLocalStorage<UserStore>();

export function runWithUser<T>(userId: string, fn: () => T): T {
  return storage.run({ userId }, fn);
}

// Throws if called outside a user context — a programming error, not a 401.
export function currentUserId(): string {
  const store = storage.getStore();
  if (!store) {
    throw new Error(
      "currentUserId() called outside a user context — wrap the request in withUser()/runWithUser()",
    );
  }
  return store.userId;
}
