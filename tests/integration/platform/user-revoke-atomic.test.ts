/**
 * A role change, a SCIM deprovision (#2126), and a SCIM group delete (#2914)
 * are all-or-nothing. Each used to update `users` and then run its DELETE as
 * separate statements, so a failure on the DELETE answered an error with the
 * user rows already changed: a demoted user kept sessions holding the old
 * permissions, a deprovisioned user kept live API keys, and a group whose
 * delete failed lost its members to the Default team.
 *
 * The failure is injected at the DELETEs on the plain `db` handle and on the
 * handle a transaction passes to its callback, as in
 * password-change-atomic.test.ts, so the test is meaningful whichever way the
 * handler runs.
 */
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { TestApp } from "../test-server.js";

const SCIM_TOKEN = `so_scim_v2_${"c".repeat(64)}`;

type DbModule = typeof import("../../../apps/api/src/db/index.js");
type DeleteFn = (table: unknown) => unknown;

let testApp: TestApp;
let adminToken: string;
let db: DbModule["db"];
let schema: DbModule["schema"];
/** The table whose DELETE throws while armed, or null for none. */
let failDeleteOn: unknown = null;

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
  // SCIM is enterprise-gated; licence it, then load the app and the db module
  // it uses, so the spies below sit on the same instance as the handlers.
  vi.resetModules();
  const { mockEnterpriseFeatures } = await import("../../helpers/enterprise-mock.js");
  mockEnterpriseFeatures(["scim"]);
  const server = await import("../test-server.js");
  ({ db, schema } = await import("../../../apps/api/src/db/index.js"));
  const { hashPassword } = await import("../../../apps/api/src/plugins/auth.js");

  testApp = await server.buildTestApp();
  adminToken = await server.loginAsAdmin(testApp.app);
  await db
    .insert(schema.settings)
    .values({ key: "scim_token_hash", value: await hashPassword(SCIM_TOKEN) })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: await hashPassword(SCIM_TOKEN) },
    });

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
});

afterAll(async () => {
  vi.restoreAllMocks();
  await testApp.cleanup();
});

afterEach(() => {
  failDeleteOn = null;
});

async function userRow(id: string) {
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  return row;
}

async function sessionCount(userId: string): Promise<number> {
  return (await db.select().from(schema.sessions).where(eq(schema.sessions.userId, userId))).length;
}

async function apiKeyCount(userId: string): Promise<number> {
  return (await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.userId, userId))).length;
}

async function seedSessionAndKey(userId: string): Promise<void> {
  await db.insert(schema.sessions).values({
    id: randomUUID(),
    userId,
    expiresAt: new Date(Date.now() + 60 * 60_000),
  });
  await db.insert(schema.apiKeys).values({
    id: randomUUID(),
    userId,
    keyHash: "not-a-real-hash",
    name: "atomic-test",
  });
}

describe("a role change is all-or-nothing (#2126)", () => {
  it("keeps the old role and the sessions when the session revoke fails, then succeeds on retry", async () => {
    const username = `revoke_atomic_${Date.now().toString(36)}`;
    const create = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username, password: "ValidPass1", role: "user" },
    });
    expect(create.statusCode, create.body).toBe(201);
    const userId = JSON.parse(create.body).id as string;
    await seedSessionAndKey(userId);

    failDeleteOn = schema.sessions;
    const failed = await testApp.app.inject({
      method: "PUT",
      url: `/api/auth/users/${userId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { role: "editor" },
    });
    failDeleteOn = null;

    expect(failed.statusCode).toBe(500);
    expect((await userRow(userId))?.role).toBe("user");
    expect(await sessionCount(userId)).toBe(1);

    const retry = await testApp.app.inject({
      method: "PUT",
      url: `/api/auth/users/${userId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { role: "editor" },
    });
    expect(retry.statusCode, retry.body).toBe(200);
    expect((await userRow(userId))?.role).toBe("editor");
    expect(await sessionCount(userId)).toBe(0);
  });
});

describe("a SCIM deprovision is all-or-nothing (#2126)", () => {
  for (const [name, table] of [
    ["sessions", () => schema.sessions],
    ["api_keys", () => schema.apiKeys],
  ] as const) {
    it(`keeps the user, sessions and keys when the ${name} revoke fails, then succeeds on retry`, async () => {
      const create = await testApp.app.inject({
        method: "POST",
        url: "/api/v1/scim/v2/Users",
        headers: { authorization: `Bearer ${SCIM_TOKEN}` },
        payload: { userName: `scim_atomic_${name}_${Date.now().toString(36)}`, active: true },
      });
      expect(create.statusCode, create.body).toBe(201);
      const userId = JSON.parse(create.body).id as string;
      await seedSessionAndKey(userId);
      const before = await userRow(userId);

      failDeleteOn = table();
      const failed = await testApp.app.inject({
        method: "DELETE",
        url: `/api/v1/scim/v2/Users/${userId}`,
        headers: { authorization: `Bearer ${SCIM_TOKEN}` },
      });
      failDeleteOn = null;

      expect(failed.statusCode).toBe(500);
      expect(JSON.parse(failed.body)).toEqual({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        status: 500,
        detail: "Internal server error",
      });
      expect((await userRow(userId))?.role).toBe(before?.role);
      expect(await sessionCount(userId)).toBe(1);
      expect(await apiKeyCount(userId)).toBe(1);

      const retry = await testApp.app.inject({
        method: "DELETE",
        url: `/api/v1/scim/v2/Users/${userId}`,
        headers: { authorization: `Bearer ${SCIM_TOKEN}` },
      });
      expect(retry.statusCode, retry.body).toBe(204);
      expect((await userRow(userId))?.role).not.toBe(before?.role);
      expect(await sessionCount(userId)).toBe(0);
      expect(await apiKeyCount(userId)).toBe(0);
    });
  }
});

describe("a SCIM group delete is all-or-nothing (#2914)", () => {
  it("keeps the group and its members when the team delete fails, then succeeds on retry", async () => {
    const createUser = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/scim/v2/Users",
      headers: { authorization: `Bearer ${SCIM_TOKEN}` },
      payload: { userName: `scim_grp_del_atomic_${Date.now().toString(36)}`, active: true },
    });
    expect(createUser.statusCode, createUser.body).toBe(201);
    const userId = JSON.parse(createUser.body).id as string;

    const createGroup = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/scim/v2/Groups",
      headers: { authorization: `Bearer ${SCIM_TOKEN}` },
      payload: {
        displayName: `scim_grp_del_${Date.now().toString(36)}`,
        members: [{ value: userId }],
      },
    });
    expect(createGroup.statusCode, createGroup.body).toBe(201);
    const groupId = JSON.parse(createGroup.body).id as string;
    expect((await userRow(userId))?.team).toBe(groupId);

    failDeleteOn = schema.teams;
    const failed = await testApp.app.inject({
      method: "DELETE",
      url: `/api/v1/scim/v2/Groups/${groupId}`,
      headers: { authorization: `Bearer ${SCIM_TOKEN}` },
    });
    failDeleteOn = null;

    expect(failed.statusCode).toBe(500);
    expect(JSON.parse(failed.body)).toEqual({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      status: 500,
      detail: "Internal server error",
    });
    const [teamStillThere] = await db
      .select()
      .from(schema.teams)
      .where(eq(schema.teams.id, groupId));
    expect(teamStillThere?.id).toBe(groupId);
    expect((await userRow(userId))?.team).toBe(groupId);
    const deletedAuditAfterFail = await db
      .select()
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.action, "SCIM_GROUP_SYNCED"),
          sql`${schema.auditLog.details}->>'teamId' = ${groupId}`,
          sql`${schema.auditLog.details}->>'action' = 'deleted'`,
        ),
      );
    expect(deletedAuditAfterFail).toHaveLength(0);

    const retry = await testApp.app.inject({
      method: "DELETE",
      url: `/api/v1/scim/v2/Groups/${groupId}`,
      headers: { authorization: `Bearer ${SCIM_TOKEN}` },
    });
    expect(retry.statusCode, retry.body).toBe(204);
    const [teamAfterRetry] = await db
      .select()
      .from(schema.teams)
      .where(eq(schema.teams.id, groupId));
    expect(teamAfterRetry).toBeUndefined();
    expect((await userRow(userId))?.team).toBe(schema.DEFAULT_TEAM_ID);
    const deletedAuditAfterRetry = await db
      .select()
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.action, "SCIM_GROUP_SYNCED"),
          sql`${schema.auditLog.details}->>'teamId' = ${groupId}`,
          sql`${schema.auditLog.details}->>'action' = 'deleted'`,
        ),
      );
    expect(deletedAuditAfterRetry).toHaveLength(1);
  });
});
