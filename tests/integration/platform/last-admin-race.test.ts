/**
 * The last admin can't be removed by two requests at once (#2231). Every path
 * that takes a user out of the admin role (demotion, deletion, SCIM
 * deactivation) checked the admin count and then wrote, with nothing ordering
 * two of them: each saw two admins, each wrote, and none was left.
 *
 * Each test creates two admins, X and Y, parks every other admin as a plain
 * user for its duration, and races two removals. raceRowLocks parks both
 * contenders on the users table, so both have passed any check made before
 * their write.
 */
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { TestApp } from "../test-server.js";

const SCIM_TOKEN = `so_scim_v2_${"d".repeat(64)}`;

type DbModule = typeof import("../../../apps/api/src/db/index.js");
type RaceModule = typeof import("../../helpers/pg-race.js");
type ServerModule = typeof import("../test-server.js");

let testApp: TestApp;
let server: ServerModule;
let db: DbModule["db"];
let schema: DbModule["schema"];
let raceRowLocks: RaceModule["raceRowLocks"];
/** Admins demoted to leave exactly two, restored after each test. */
let parked: string[] = [];
/** Users a test created, removed after it so later files see the admins they expect. */
let created: string[] = [];

beforeAll(async () => {
  // SCIM is enterprise-gated; licence it, then load the app, the db module and
  // the race helper from the same module graph.
  vi.resetModules();
  const { mockEnterpriseFeatures } = await import("../../helpers/enterprise-mock.js");
  mockEnterpriseFeatures(["scim", "gdpr_lifecycle"]);
  server = await import("../test-server.js");
  ({ db, schema } = await import("../../../apps/api/src/db/index.js"));
  ({ raceRowLocks } = await import("../../helpers/pg-race.js"));
  const { hashPassword } = await import("../../../apps/api/src/plugins/auth.js");

  testApp = await server.buildTestApp();

  const hash = await hashPassword(SCIM_TOKEN);
  await db
    .insert(schema.settings)
    .values({ key: "scim_token_hash", value: hash })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: hash } });
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

afterEach(async () => {
  // Put back every admin a test parked, so the seeded admin can log in again.
  if (parked.length > 0) {
    await db.update(schema.users).set({ role: "admin" }).where(inArray(schema.users.id, parked));
    parked = [];
  }
  if (created.length > 0) {
    await db.delete(schema.users).where(inArray(schema.users.id, created));
    created = [];
  }
});

interface Admin {
  id: string;
  token: string;
}

/** Two fresh admins, X and Y, left as the only admins. */
async function exactlyTwoAdmins(): Promise<{ x: Admin; y: Admin }> {
  const make = async (): Promise<Admin> => {
    const { token, userId } = await server.createUserAndLogin(
      testApp.app,
      `race_admin_${randomUUID().slice(0, 8)}`,
      "admin",
    );
    created.push(userId);
    return { id: userId, token };
  };
  const x = await make();
  const y = await make();
  const admins = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.role, "admin"));
  parked = admins.map((row) => row.id).filter((id) => id !== x.id && id !== y.id);
  if (parked.length > 0) {
    await db.update(schema.users).set({ role: "user" }).where(inArray(schema.users.id, parked));
  }
  return { x, y };
}

async function adminCount(): Promise<number> {
  const rows = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.role, "admin"));
  return rows.length;
}

describe("the last admin can't be removed by two requests at once (#2231)", () => {
  it("two admins demoting each other: one wins, the other is refused", async () => {
    const { x, y } = await exactlyTwoAdmins();

    const results = await raceRowLocks("users", 2, () =>
      Promise.all([
        testApp.app.inject({
          method: "PUT",
          url: `/api/auth/users/${y.id}`,
          headers: { authorization: `Bearer ${x.token}` },
          payload: { role: "user" },
        }),
        testApp.app.inject({
          method: "PUT",
          url: `/api/auth/users/${x.id}`,
          headers: { authorization: `Bearer ${y.token}` },
          payload: { role: "user" },
        }),
      ]),
    );

    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 400]);
    const refused = results.find((r) => r.statusCode === 400);
    expect(JSON.parse(refused?.body ?? "{}").code).toBe("LAST_ADMIN");
    expect(await adminCount()).toBe(1);
  });

  it("two admins deleting each other: one wins, the other is refused", async () => {
    const { x, y } = await exactlyTwoAdmins();

    const results = await raceRowLocks("users", 2, () =>
      Promise.all([
        testApp.app.inject({
          method: "DELETE",
          url: `/api/auth/users/${y.id}`,
          headers: { authorization: `Bearer ${x.token}` },
        }),
        testApp.app.inject({
          method: "DELETE",
          url: `/api/auth/users/${x.id}`,
          headers: { authorization: `Bearer ${y.token}` },
        }),
      ]),
    );

    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 400]);
    const refused = results.find((r) => r.statusCode === 400);
    expect(JSON.parse(refused?.body ?? "{}").code).toBe("LAST_ADMIN");
    expect(await adminCount()).toBe(1);

    // The admin whose deletion was refused is still there, sessions and all.
    const survivorId = results[0].statusCode === 400 ? y.id : x.id;
    const [survivor] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, survivorId));
    expect(survivor?.id).toBe(survivorId);
    const sessions = await db
      .select({ id: schema.sessions.id })
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, survivorId));
    expect(sessions.length).toBeGreaterThan(0);
  });

  it("two SCIM deactivations of the last two admins: one wins, the other is refused", async () => {
    const { x, y } = await exactlyTwoAdmins();

    const results = await raceRowLocks("users", 2, () =>
      Promise.all(
        [x.id, y.id].map((id) =>
          testApp.app.inject({
            method: "DELETE",
            url: `/api/v1/scim/v2/Users/${id}`,
            headers: { authorization: `Bearer ${SCIM_TOKEN}` },
          }),
        ),
      ),
    );

    expect(results.map((r) => r.statusCode).sort()).toEqual([204, 409]);
    expect(await adminCount()).toBe(1);
  });

  it("two SCIM PATCH deactivations of the last two admins: one wins, the other is refused", async () => {
    const { x, y } = await exactlyTwoAdmins();

    const results = await raceRowLocks("users", 2, () =>
      Promise.all(
        [x.id, y.id].map((id) =>
          testApp.app.inject({
            method: "PATCH",
            url: `/api/v1/scim/v2/Users/${id}`,
            headers: { authorization: `Bearer ${SCIM_TOKEN}` },
            payload: {
              schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
              Operations: [{ op: "replace", path: "active", value: false }],
            },
          }),
        ),
      ),
    );

    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(await adminCount()).toBe(1);
  });

  it("two admins purging each other under GDPR: one wins, the other is refused", async () => {
    const { x, y } = await exactlyTwoAdmins();

    const results = await raceRowLocks("users", 2, () =>
      Promise.all([
        testApp.app.inject({
          method: "DELETE",
          url: `/api/v1/enterprise/users/${y.id}/purge`,
          headers: { authorization: `Bearer ${x.token}` },
        }),
        testApp.app.inject({
          method: "DELETE",
          url: `/api/v1/enterprise/users/${x.id}/purge`,
          headers: { authorization: `Bearer ${y.token}` },
        }),
      ]),
    );

    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(await adminCount()).toBe(1);
  });
});
