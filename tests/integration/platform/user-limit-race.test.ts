/**
 * Issue #928: the MAX_USERS cap was enforced with a plain count-then-insert,
 * so two concurrent creates could both pass the check and overshoot the cap
 * by one, with no error anywhere. Covers both counted paths: POST
 * /api/auth/register and the external-auth resolver's auto-create (OIDC/SAML).
 *
 * The requests genuinely race: register has scrypt hashing between check and
 * insert, the resolver has username/team lookups, so both requests pass the
 * count before either insert commits unless the two are serialized.
 */
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { resolveExternalUser } from "../../../apps/api/src/lib/external-auth-resolver.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

let testApp: TestApp;
let adminToken: string;

const uid = () => `limit_race_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

async function userCount(): Promise<number> {
  const [row] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(schema.users);
  return row?.count ?? 0;
}

const origMaxUsers = env.MAX_USERS;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  (env as Record<string, unknown>).MAX_USERS = origMaxUsers;
  // Optional chaining so a beforeAll boot failure surfaces instead of being
  // buried under a TypeError from the cleanup.
  await testApp?.cleanup();
}, 10_000);

describe("MAX_USERS under concurrency (issue #928)", () => {
  it("concurrent registers get one 201 and one 403, never overshoot the cap", async () => {
    const cap = (await userCount()) + 1;
    (env as Record<string, unknown>).MAX_USERS = cap;
    try {
      const register = (username: string) =>
        testApp.app.inject({
          method: "POST",
          url: "/api/auth/register",
          headers: { authorization: `Bearer ${adminToken}` },
          payload: { username, password: "ValidPass1" },
        });

      const [first, second] = await Promise.all([register(uid()), register(uid())]);
      const statuses = [first.statusCode, second.statusCode].sort();
      expect(statuses).toEqual([201, 403]);

      const denied = first.statusCode === 403 ? first : second;
      expect(JSON.parse(denied.body)).toEqual({
        error: `User limit reached (${cap} max)`,
        code: "USER_LIMIT_REACHED",
      });

      expect(await userCount()).toBe(cap);
    } finally {
      (env as Record<string, unknown>).MAX_USERS = origMaxUsers;
    }
  });

  it("concurrent auto-creates stop at the cap with one denied user_limit_reached", async () => {
    const cap = (await userCount()) + 1;
    (env as Record<string, unknown>).MAX_USERS = cap;
    try {
      const resolve = (name: string) =>
        resolveExternalUser({
          provider: "oidc",
          externalId: `ext-${name}`,
          email: `${name}@example.com`,
          emailVerified: true,
          username: name,
          autoCreate: true,
          autoLink: false,
          defaultRole: "user",
          logger: testApp.app.log,
          ip: "127.0.0.1",
          requestId: `req-${name}`,
        });

      const [first, second] = await Promise.all([resolve(uid()), resolve(uid())]);
      const actions = [first.action, second.action].sort();
      expect(actions).toEqual(["created", "denied"]);

      const denied = first.action === "denied" ? first : second;
      expect(denied.deniedReason).toBe("user_limit_reached");

      expect(await userCount()).toBe(cap);
    } finally {
      (env as Record<string, unknown>).MAX_USERS = origMaxUsers;
    }
  });

  it("register racing an auto-create still stops at the cap (shared lock)", async () => {
    // Pins the invariant that both counted paths serialize on the SAME lock.
    // If one path ever moves to its own key or an inlined check, the two
    // same-path tests above stay green while this mixed race overshoots.
    const cap = (await userCount()) + 1;
    (env as Record<string, unknown>).MAX_USERS = cap;
    try {
      const registerName = uid();
      const [reg, sso] = await Promise.all([
        testApp.app.inject({
          method: "POST",
          url: "/api/auth/register",
          headers: { authorization: `Bearer ${adminToken}` },
          payload: { username: registerName, password: "ValidPass1" },
        }),
        resolveExternalUser({
          provider: "oidc",
          externalId: `ext-${registerName}`,
          email: `${registerName}@example.com`,
          emailVerified: true,
          username: `sso_${registerName}`,
          autoCreate: true,
          autoLink: false,
          defaultRole: "user",
          logger: testApp.app.log,
          ip: "127.0.0.1",
          requestId: `req-${registerName}`,
        }),
      ]);

      const registerWon = reg.statusCode === 201;
      if (registerWon) {
        expect(sso.action).toBe("denied");
        expect(sso.deniedReason).toBe("user_limit_reached");
      } else {
        expect(reg.statusCode).toBe(403);
        expect(sso.action).toBe("created");
      }

      expect(await userCount()).toBe(cap);
    } finally {
      (env as Record<string, unknown>).MAX_USERS = origMaxUsers;
    }
  });
});
