/**
 * Auth route edge-case tests — login failures, session expiry,
 * password-change side effects, register validation.
 */

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../apps/api/src/db/index.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "./test-server.js";

let testApp: TestApp;
let adminToken: string;

const uid = () => `auth_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

// Helper: register a user, clear mustChangePassword, return { username, password }
async function createUser(
  opts: { role?: string; team?: string } = {},
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
  db.update(schema.users)
    .set({ mustChangePassword: false })
    .where(eq(schema.users.username, username))
    .run();
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

// ═══════════════════════════════════════════════════════════════════════════
// LOGIN FAILURES
// ═══════════════════════════════════════════════════════════════════════════
describe("Login failures", () => {
  it("empty body returns 400", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("missing username returns 400", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { password: "Anything1" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("missing password returns 400", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("unknown username returns 401", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: `nonexistent_${Date.now()}`, password: "Whatever1" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("wrong password returns 401", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "WrongPass1" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("failed logins generate LOGIN_FAILED audit events", async () => {
    const marker = uid();
    // Trigger a failed login with a unique username
    await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: marker, password: "Whatever1" },
    });

    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/audit-log?action=LOGIN_FAILED&limit=50",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const match = body.entries.find(
      (e: any) => e.action === "LOGIN_FAILED" && e.details?.username === marker,
    );
    expect(match).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SESSION EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════
describe("Session edge cases", () => {
  it("no token on session endpoint returns 401", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
    });
    expect(res.statusCode).toBe(401);
  });

  it("expired session token returns 401", async () => {
    // Login to get a valid session
    const token = await loginAs("admin", "Adminpass1");

    // Manually expire the session in the DB
    db.update(schema.sessions)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.sessions.id, token))
      .run();

    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PASSWORD CHANGE SIDE EFFECTS
// ═══════════════════════════════════════════════════════════════════════════
describe("Password change side effects", () => {
  it("changing password invalidates other sessions", async () => {
    const { username, password } = await createUser();

    // Create two sessions
    const token1 = await loginAs(username, password);
    const token2 = await loginAs(username, password);

    // Verify both sessions work
    const check1 = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${token1}` },
    });
    expect(check1.statusCode).toBe(200);

    const check2 = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${token2}` },
    });
    expect(check2.statusCode).toBe(200);

    // Change password via session 1
    const changeRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/change-password",
      headers: { authorization: `Bearer ${token1}` },
      payload: { currentPassword: password, newPassword: "NewValid1" },
    });
    expect(changeRes.statusCode).toBe(200);

    // Session 1 should still work (it's the current session)
    const after1 = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${token1}` },
    });
    expect(after1.statusCode).toBe(200);

    // Session 2 should now be invalid
    const after2 = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${token2}` },
    });
    expect(after2.statusCode).toBe(401);
  });

  it("changing password revokes API keys", async () => {
    const { username, password } = await createUser();
    const token = await loginAs(username, password);

    // Create an API key
    const createKeyRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "test-key" },
    });
    expect(createKeyRes.statusCode).toBe(201);
    const apiKey = JSON.parse(createKeyRes.body).key;

    // Verify the key works (hit a public-ish endpoint that still reads auth)
    const keyCheck = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${apiKey}` },
    });
    expect(keyCheck.statusCode).toBe(200);

    // Change password
    const changeRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/change-password",
      headers: { authorization: `Bearer ${token}` },
      payload: { currentPassword: password, newPassword: "NewValid2" },
    });
    expect(changeRes.statusCode).toBe(200);

    // API key should now be revoked
    const keyAfter = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${apiKey}` },
    });
    expect(keyAfter.statusCode).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PASSWORD RESET SIDE EFFECTS (admin resets another user)
// ═══════════════════════════════════════════════════════════════════════════
describe("Password reset side effects", () => {
  it("admin reset invalidates target user sessions", async () => {
    const { username, password, id } = await createUser();
    const userToken = await loginAs(username, password);

    // Verify user session works
    const before = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(before.statusCode).toBe(200);

    // Admin resets the user's password
    const resetRes = await testApp.app.inject({
      method: "POST",
      url: `/api/auth/users/${id}/reset-password`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { newPassword: "ResetPass1" },
    });
    expect(resetRes.statusCode).toBe(200);

    // User session should now be invalid
    const after = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(after.statusCode).toBe(401);
  });

  it("admin reset revokes target user API keys", async () => {
    const { username, password, id } = await createUser();
    const userToken = await loginAs(username, password);

    // Create an API key for the target user
    const createKeyRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: "target-key" },
    });
    expect(createKeyRes.statusCode).toBe(201);
    const apiKey = JSON.parse(createKeyRes.body).key;

    // Verify the key works
    const keyBefore = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${apiKey}` },
    });
    expect(keyBefore.statusCode).toBe(200);

    // Admin resets the user's password
    const resetRes = await testApp.app.inject({
      method: "POST",
      url: `/api/auth/users/${id}/reset-password`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { newPassword: "ResetPass2" },
    });
    expect(resetRes.statusCode).toBe(200);

    // API key should now be revoked
    const keyAfter = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${apiKey}` },
    });
    expect(keyAfter.statusCode).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// REGISTER VALIDATION
// ═══════════════════════════════════════════════════════════════════════════
describe("Register validation", () => {
  it("invalid username chars returns 400", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username: "bad user!@#", password: "ValidPass1" },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe("VALIDATION_ERROR");
  });

  it("username too short (2 chars) returns 400", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username: "ab", password: "ValidPass1" },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe("VALIDATION_ERROR");
  });

  it("weak password returns 400", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username: uid(), password: "weak" },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe("VALIDATION_ERROR");
  });

  it("non-existent team name returns 400", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        username: uid(),
        password: "ValidPass1",
        team: `ghost_team_${Date.now()}`,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe("VALIDATION_ERROR");
  });

  it("unknown role defaults to user", async () => {
    const username = uid();
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username, password: "ValidPass1", role: "bogus" },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.role).toBe("user");
  });

  it("delete non-existent user returns 404", async () => {
    const res = await testApp.app.inject({
      method: "DELETE",
      url: "/api/auth/users/00000000-0000-0000-0000-000000000000",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
