/**
 * Changing or resetting a password is all-or-nothing (#2089). The handlers
 * used to write the new hash and then revoke sessions and API keys as separate
 * statements, so a failure on a later one answered 500 ("the change failed")
 * with the new password already in place and the old sessions still alive.
 * The user retried with the old password and got INVALID_PASSWORD.
 *
 * The failure is injected at the sessions DELETE and at the API-keys DELETE in
 * turn, on the plain `db` handle and on the handle a transaction passes to its
 * callback, so the same test is meaningful whichever way the handler runs.
 */
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { buildTestApp, createUserAndLogin, loginAsAdmin, type TestApp } from "../test-server.js";

let testApp: TestApp;
let adminToken: string;
/** The table whose DELETE throws while armed, or null for none. */
let failDeleteOn: unknown = null;

const uid = () => `pw_atomic_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

type DeleteFn = (table: unknown) => unknown;

/** Wraps a db or transaction handle so its DELETE on the armed table throws. */
function failingDelete<T extends object>(handle: T): T {
  return new Proxy(handle, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (prop !== "delete") return typeof value === "function" ? value.bind(target) : value;
      return (table: unknown) => {
        if (failDeleteOn !== null && table === failDeleteOn) {
          throw new Error("simulated lock timeout");
        }
        return (value as DeleteFn).call(target, table);
      };
    },
  });
}

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);

  const realDelete = db.delete.bind(db) as DeleteFn;
  vi.spyOn(db, "delete").mockImplementation(((table: unknown) => {
    if (failDeleteOn !== null && table === failDeleteOn) throw new Error("simulated lock timeout");
    return realDelete(table);
  }) as unknown as typeof db.delete);

  const realTransaction = db.transaction.bind(db) as (
    cb: (tx: object) => Promise<unknown>,
    config?: unknown,
  ) => Promise<unknown>;
  vi.spyOn(db, "transaction").mockImplementation(((
    cb: (tx: object) => Promise<unknown>,
    config?: unknown,
  ) => realTransaction((tx) => cb(failingDelete(tx)), config)) as unknown as typeof db.transaction);
}, 30_000);

afterAll(async () => {
  vi.restoreAllMocks();
  await testApp.cleanup();
}, 10_000);

beforeEach(() => {
  failDeleteOn = null;
});

afterEach(() => {
  failDeleteOn = null;
});

async function loginAgain(username: string, password: string): Promise<string> {
  const res = await testApp.app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username, password },
  });
  return JSON.parse(res.body).token as string;
}

async function createApiKey(token: string): Promise<void> {
  const res = await testApp.app.inject({
    method: "POST",
    url: "/api/v1/api-keys",
    headers: { authorization: `Bearer ${token}` },
    payload: { name: "atomic-test" },
  });
  expect(res.statusCode).toBe(201);
}

async function passwordHash(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ hash: schema.users.passwordHash })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return row?.hash ?? null;
}

async function liveSessionCount(userId: string): Promise<number> {
  const rows = await db.select().from(schema.sessions).where(eq(schema.sessions.userId, userId));
  return rows.length;
}

async function apiKeyCount(userId: string): Promise<number> {
  const rows = await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.userId, userId));
  return rows.length;
}

/** Each revoke statement in turn: the group is atomic, not just its last statement. */
const REVOKES = [
  ["api_keys", schema.apiKeys],
  ["sessions", schema.sessions],
] as const;

describe("change-password is all-or-nothing (#2089)", () => {
  it.each(REVOKES)(
    "keeps the old password, sessions and keys when the %s delete fails, then succeeds on retry",
    async (_name, failingTable) => {
      const username = uid();
      const { token, userId } = await createUserAndLogin(testApp.app, username);
      const otherToken = await loginAgain(username, "Userpass1");
      await createApiKey(token);
      const hashBefore = await passwordHash(userId);
      expect(await liveSessionCount(userId)).toBe(2);

      failDeleteOn = failingTable;
      const failed = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/change-password",
        headers: { authorization: `Bearer ${token}` },
        payload: { currentPassword: "Userpass1", newPassword: "NewValid1" },
      });
      failDeleteOn = null;

      expect(failed.statusCode).toBe(500);
      expect(await passwordHash(userId)).toBe(hashBefore);
      expect(await liveSessionCount(userId)).toBe(2);
      expect(await apiKeyCount(userId)).toBe(1);
      const stillWorks = await testApp.app.inject({
        method: "GET",
        url: "/api/auth/session",
        headers: { authorization: `Bearer ${otherToken}` },
      });
      expect(stillWorks.statusCode).toBe(200);

      const retry = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/change-password",
        headers: { authorization: `Bearer ${token}` },
        payload: { currentPassword: "Userpass1", newPassword: "NewValid1" },
      });
      expect(retry.statusCode).toBe(200);
      expect(await passwordHash(userId)).not.toBe(hashBefore);
      expect(await liveSessionCount(userId)).toBe(1);
      expect(await apiKeyCount(userId)).toBe(0);
      expect(await loginAgain(username, "NewValid1")).toBeTruthy();
      expect(await loginAgain(username, "Userpass1")).toBeUndefined();
    },
  );
});

describe("admin reset-password is all-or-nothing (#2089)", () => {
  it.each(REVOKES)(
    "keeps the old password, sessions and keys when the %s delete fails, then succeeds on retry",
    async (_name, failingTable) => {
      const username = uid();
      const { token, userId } = await createUserAndLogin(testApp.app, username);
      await createApiKey(token);
      const hashBefore = await passwordHash(userId);

      failDeleteOn = failingTable;
      const failed = await testApp.app.inject({
        method: "POST",
        url: `/api/auth/users/${userId}/reset-password`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { newPassword: "ResetPass1" },
      });
      failDeleteOn = null;

      expect(failed.statusCode).toBe(500);
      expect(await passwordHash(userId)).toBe(hashBefore);
      expect(await liveSessionCount(userId)).toBe(1);
      expect(await apiKeyCount(userId)).toBe(1);
      const [row] = await db
        .select({ must: schema.users.mustChangePassword })
        .from(schema.users)
        .where(eq(schema.users.id, userId));
      expect(row?.must).toBe(false);

      const retry = await testApp.app.inject({
        method: "POST",
        url: `/api/auth/users/${userId}/reset-password`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { newPassword: "ResetPass1" },
      });
      expect(retry.statusCode).toBe(200);
      expect(await passwordHash(userId)).not.toBe(hashBefore);
      expect(await liveSessionCount(userId)).toBe(0);
      expect(await apiKeyCount(userId)).toBe(0);
      expect(await loginAgain(username, "ResetPass1")).toBeTruthy();
      expect(await loginAgain(username, "Userpass1")).toBeUndefined();
    },
  );
});
