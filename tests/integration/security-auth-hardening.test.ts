/**
 * Integration tests for security auth hardening:
 * - Oversized input rejection at the API level
 * - Session invalidation on role change
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../apps/api/src/db/index.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "./test-server.js";

let testApp: TestApp;
let adminToken: string;

const uid = () => `sec_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

// Helper: register a user, clear mustChangePassword, return credentials
async function createUser(
  opts: { role?: string } = {},
): Promise<{ username: string; password: string; id: string }> {
  const username = uid();
  const password = "ValidPass1";
  const res = await testApp.app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { username, password, ...opts },
  });
  const body = JSON.parse(res.body);
  if (res.statusCode !== 201) {
    throw new Error(`createUser failed: ${res.statusCode} ${res.body}`);
  }
  await db
    .update(schema.users)
    .set({ mustChangePassword: false })
    .where(eq(schema.users.username, username));
  return { username, password, id: body.id };
}

// Helper: login and return token
async function loginAs(username: string, password: string): Promise<string> {
  const res = await testApp.app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username, password },
  });
  const body = JSON.parse(res.body);
  if (!body.token) throw new Error(`loginAs failed: ${res.body}`);
  return body.token as string;
}

describe("Oversized input rejection", () => {
  it("rejects login with oversized password (>1024 chars)", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        username: "admin",
        password: "a".repeat(1025),
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects login with oversized username (>255 chars)", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        username: "a".repeat(256),
        password: "ValidPass1",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("accepts login with valid-length credentials", async () => {
    // This should either succeed (valid creds) or fail with 401 (invalid creds),
    // but NOT 400 (validation error)
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        username: "admin",
        password: "WrongButValid1",
      },
    });
    expect([200, 401]).toContain(res.statusCode);
  });
});

describe("Session invalidation on role change", () => {
  it("invalidates sessions when user role is changed", async () => {
    // 1. Create an editor user
    const user = await createUser({ role: "editor" });

    // 2. Login as the editor to get a session token
    const userToken = await loginAs(user.username, user.password);

    // 3. Verify the session works
    const sessionCheck = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(sessionCheck.statusCode).toBe(200);

    // 4. Admin changes the user's role to "user"
    const roleChange = await testApp.app.inject({
      method: "PUT",
      url: `/api/auth/users/${user.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { role: "user" },
    });
    expect(roleChange.statusCode).toBe(200);

    // 5. The old session token should now be invalid
    const sessionAfter = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(sessionAfter.statusCode).toBe(401);
  });

  it("does not invalidate sessions when only team is changed", async () => {
    // 1. Create a user
    const user = await createUser({ role: "editor" });

    // 2. Login to get a session
    const userToken = await loginAs(user.username, user.password);

    // 3. Admin changes only the team (not role)
    // We need to find a valid team first
    const teamsRes = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/teams",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const teams = JSON.parse(teamsRes.body).teams;
    if (teams && teams.length > 0) {
      const changeRes = await testApp.app.inject({
        method: "PUT",
        url: `/api/auth/users/${user.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { team: teams[0].name },
      });
      expect(changeRes.statusCode).toBe(200);
    }

    // 4. Session should still be valid (no role change)
    const sessionCheck = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(sessionCheck.statusCode).toBe(200);
  });
});
