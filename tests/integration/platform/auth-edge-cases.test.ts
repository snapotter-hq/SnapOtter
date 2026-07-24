/**
 * Auth route edge-case tests — login failures, session expiry,
 * password-change side effects, register validation.
 */

import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

let testApp: TestApp;
let adminToken: string;

const uid = () => `auth_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

// Upsert a global setting row (mirrors upsertSetting in settings-helpers).
async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}

// Remove a global setting row so it cannot bleed into sibling tests in the fork.
async function clearSetting(key: string): Promise<void> {
  await db.delete(schema.settings).where(eq(schema.settings.key, key));
}

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

  it("unknown username and wrong password take comparable time (no enumeration timing oracle)", async () => {
    // Both cases must return the identical 401 body, but a naive implementation
    // short-circuits on "user not found" before ever running the password
    // hash (scrypt), while "wrong password for a real user" always pays the
    // scrypt cost. That gap lets an attacker enumerate valid usernames purely
    // from response timing even though the status code and body are identical.
    // See getDummyHash() in apps/api/src/plugins/auth.ts; it equalizes cost
    // by running verifyPassword against a dummy hash on the unknown-user path.
    const SAMPLES = 10;
    const median = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    };

    const unknownUserTimes: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const start = performance.now();
      await testApp.app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: `nonexistent_${uid()}_${i}`, password: "Whatever1" },
      });
      unknownUserTimes.push(performance.now() - start);
    }

    const wrongPasswordTimes: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const start = performance.now();
      await testApp.app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: "admin", password: `WrongPass1_${i}` },
      });
      wrongPasswordTimes.push(performance.now() - start);
    }

    const unknownMedian = median(unknownUserTimes);
    const wrongPasswordMedian = median(wrongPasswordTimes);
    const ratio =
      Math.max(unknownMedian, wrongPasswordMedian) /
      Math.max(1, Math.min(unknownMedian, wrongPasswordMedian));

    // A real (unfixed) timing oracle shows up as 5-10x+ here (unknown-user
    // returns near-instantly; wrong-password waits on scrypt). Bound at 3x to
    // absorb normal event-loop/GC jitter while still catching a regression.
    expect(ratio).toBeLessThan(3);
  }, 30_000);

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
    await db
      .update(schema.sessions)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.sessions.id, token));

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

// ═══════════════════════════════════════════════════════════════════════════
// FORCED PASSWORD CHANGE GATE
// ═══════════════════════════════════════════════════════════════════════════
describe("Forced password change gate", () => {
  // The register route leaves mustChangePassword=true; log straight in
  // without clearing it so the gate is active for the session.
  async function loginWithMustChange(): Promise<{ password: string; token: string }> {
    const username = uid();
    const password = "ValidPass1";
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username, password, role: "admin" },
    });
    if (res.statusCode !== 201) {
      throw new Error(`register failed: ${res.statusCode} ${res.body}`);
    }
    return { password, token: await loginAs(username, password) };
  }

  it("keeps public endpoints reachable while the flag is set", async () => {
    const { token } = await loginWithMustChange();
    // Regression: /api/v1/health returned 403 here, tripping the SPA's
    // "Reconnecting to server" banner on the forced change-password screen.
    const health = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/health",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(health.statusCode).toBe(200);
  });

  it("blocks protected endpoints until the password is changed", async () => {
    const { password, token } = await loginWithMustChange();

    const blocked = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(blocked.statusCode).toBe(403);
    expect(JSON.parse(blocked.body).code).toBe("MUST_CHANGE_PASSWORD");

    const change = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/change-password",
      headers: { authorization: `Bearer ${token}` },
      payload: { currentPassword: password, newPassword: "RotatedPass1" },
    });
    expect(change.statusCode).toBe(200);

    const after = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(after.statusCode).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DISABLED-USER PATHS (login, session endpoint, auth middleware)
// A user whose role is prefixed "disabled:" is treated as deactivated.
// ═══════════════════════════════════════════════════════════════════════════
describe("Disabled user paths", () => {
  it("login is rejected with 403 USER_DISABLED before any password check", async () => {
    const { username, password, id } = await createUser();
    await db.update(schema.users).set({ role: `disabled:user` }).where(eq(schema.users.id, id));

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username, password },
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe("USER_DISABLED");

    // The failed attempt is audited with the disabled_user reason.
    const audit = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/audit-log?action=LOGIN_FAILED&limit=100",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const entries = JSON.parse(audit.body).entries as Array<{
      action: string;
      details?: { username?: string; reason?: string };
    }>;
    const match = entries.find(
      (e) => e.details?.username === username && e.details?.reason === "disabled_user",
    );
    expect(match).toBeDefined();
  });

  it("session endpoint denies and purges the session once the user is disabled", async () => {
    const { username, password, id } = await createUser();
    const token = await loginAs(username, password);

    // Session works while active.
    const before = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(before.statusCode).toBe(200);

    await db.update(schema.users).set({ role: `disabled:user` }).where(eq(schema.users.id, id));

    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${token}` },
    });
    // The auth middleware rejects and purges a disabled user's session before
    // the route body runs, so a disabled user is denied (the route's own 403
    // branch is defense in depth behind the middleware).
    expect(res.statusCode).toBe(401);

    // The session row is purged as a side effect.
    const [row] = await db.select().from(schema.sessions).where(eq(schema.sessions.id, token));
    expect(row).toBeUndefined();
  });

  it("auth middleware 403s a protected route and purges the session for a disabled user", async () => {
    const { username, password, id } = await createUser();
    const token = await loginAs(username, password);

    await db.update(schema.users).set({ role: `disabled:editor` }).where(eq(schema.users.id, id));

    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe("USER_DISABLED");

    const [row] = await db.select().from(schema.sessions).where(eq(schema.sessions.id, token));
    expect(row).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CONCURRENT SESSION LIMIT (FIFO eviction on login)
// ═══════════════════════════════════════════════════════════════════════════
describe("Concurrent session limit", () => {
  it("evicts the oldest sessions when maxSessionsPerUser is exceeded", async () => {
    const { username, password, id } = await createUser();

    await setSetting("maxSessionsPerUser", "2");
    try {
      const t1 = await loginAs(username, password);
      const t2 = await loginAs(username, password);
      // Third login pushes the count to 3 > 2, so the single oldest is evicted.
      const t3 = await loginAs(username, password);

      const remaining = await db
        .select({ id: schema.sessions.id })
        .from(schema.sessions)
        .where(eq(schema.sessions.userId, id))
        .orderBy(asc(schema.sessions.createdAt));
      const ids = remaining.map((r) => r.id);

      // Exactly the cap survives, the newest token is always retained, and
      // precisely one of the two earlier tokens was evicted (FIFO). Asserting
      // on the count rather than a specific victim keeps this robust even if
      // t1 and t2 share a createdAt tick.
      expect(ids).toHaveLength(2);
      expect(ids).toContain(t3);
      const survivingEarlier = [t1, t2].filter((t) => ids.includes(t));
      expect(survivingEarlier).toHaveLength(1);

      // The evicted earlier token no longer authenticates.
      const evictedToken = [t1, t2].find((t) => !ids.includes(t)) as string;
      const evicted = await testApp.app.inject({
        method: "GET",
        url: "/api/auth/session",
        headers: { authorization: `Bearer ${evictedToken}` },
      });
      expect(evicted.statusCode).toBe(401);
    } finally {
      await clearSetting("maxSessionsPerUser");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// IDLE TIMEOUT ENFORCEMENT (auth middleware)
// ═══════════════════════════════════════════════════════════════════════════
describe("Session idle timeout", () => {
  it("expires a session whose last activity predates the idle window", async () => {
    const { username, password } = await createUser();
    const token = await loginAs(username, password);

    // Backdate lastActivity well beyond a 1-minute idle window. The token has
    // never hit a guarded route, so no Redis idle key exists -- the middleware
    // falls back to the Postgres lastActivity and finds it stale.
    await db
      .update(schema.sessions)
      .set({ lastActivity: new Date(Date.now() - 5 * 60 * 1000) })
      .where(eq(schema.sessions.id, token));

    await setSetting("sessionIdleTimeoutMinutes", "1");
    try {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/api-keys",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).code).toBe("IDLE_TIMEOUT");

      const [row] = await db.select().from(schema.sessions).where(eq(schema.sessions.id, token));
      expect(row).toBeUndefined();
    } finally {
      await clearSetting("sessionIdleTimeoutMinutes");
    }
  });

  it("flushes lastActivity to Postgres on a fresh session within the idle window", async () => {
    const { username, password } = await createUser();
    const token = await loginAs(username, password);

    // A brand-new session row has a null lastActivity.
    const [before] = await db
      .select({ lastActivity: schema.sessions.lastActivity })
      .from(schema.sessions)
      .where(eq(schema.sessions.id, token));
    expect(before.lastActivity).toBeNull();

    await setSetting("sessionIdleTimeoutMinutes", "30");
    try {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/api-keys",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);

      // On the cache miss the middleware writes lastActivity forward.
      const [after] = await db
        .select({ lastActivity: schema.sessions.lastActivity })
        .from(schema.sessions)
        .where(eq(schema.sessions.id, token));
      expect(after.lastActivity).not.toBeNull();
    } finally {
      await clearSetting("sessionIdleTimeoutMinutes");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MALFORMED / MISSING BEARER ON GUARDED ROUTES
// ═══════════════════════════════════════════════════════════════════════════
describe("Bearer token extraction edge cases", () => {
  it("a non-Bearer Authorization header is treated as no token (401 on a guarded route)", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/api-keys",
      headers: { authorization: "Basic dXNlcjpwYXNz" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("a Bearer token that matches no session is rejected on the session endpoint", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: "Bearer not-a-real-session-token" },
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBe("Session expired or invalid");
  });

  it("a non-si_ Bearer token on a guarded route falls through to 401 (not treated as an API key)", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/api-keys",
      headers: { authorization: "Bearer plain-garbage-token" },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEAM RESOLUTION BY ID (register + update paths)
// ═══════════════════════════════════════════════════════════════════════════
describe("Team resolution by id", () => {
  it("register resolves a team passed by id (not name)", async () => {
    const [defaultTeam] = await db
      .select()
      .from(schema.teams)
      .where(eq(schema.teams.name, "Default"));
    expect(defaultTeam).toBeDefined();

    const username = uid();
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${adminToken}` },
      // Passing the team id exercises the name-miss -> id-lookup fallback.
      payload: { username, password: "ValidPass1", team: defaultTeam.id },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).team).toBe("Default");

    const [row] = await db
      .select({ team: schema.users.team })
      .from(schema.users)
      .where(eq(schema.users.username, username));
    expect(row.team).toBe(defaultTeam.id);
  });

  it("update resolves a team passed by id and persists it", async () => {
    const { id } = await createUser();
    const [defaultTeam] = await db
      .select()
      .from(schema.teams)
      .where(eq(schema.teams.name, "Default"));

    const res = await testApp.app.inject({
      method: "PUT",
      url: `/api/auth/users/${id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { team: defaultTeam.id },
    });
    expect(res.statusCode).toBe(200);

    const [row] = await db
      .select({ team: schema.users.team })
      .from(schema.users)
      .where(eq(schema.users.id, id));
    expect(row.team).toBe(defaultTeam.id);
  });

  it("update with an unknown team returns 400 and does not touch the row", async () => {
    const { id } = await createUser();
    const [before] = await db.select().from(schema.users).where(eq(schema.users.id, id));

    const res = await testApp.app.inject({
      method: "PUT",
      url: `/api/auth/users/${id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { team: `ghost_team_${Date.now()}` },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe("VALIDATION_ERROR");

    const [after] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    expect(after.team).toBe(before.team);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN USER-MANAGEMENT GUARDS (update / delete / reset authority + shape)
// ═══════════════════════════════════════════════════════════════════════════
describe("Admin user-management guards", () => {
  it("update with an unknown role is a no-op (200, role unchanged)", async () => {
    const { id } = await createUser({ role: "user" });

    const res = await testApp.app.inject({
      method: "PUT",
      url: `/api/auth/users/${id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { role: "totally-bogus-role" },
    });
    expect(res.statusCode).toBe(200);

    const [row] = await db
      .select({ role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.id, id));
    expect(row.role).toBe("user");
  });

  it("update against an unknown user id returns 404", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/auth/users/00000000-0000-0000-0000-000000000000",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { role: "editor" },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe("NOT_FOUND");
  });

  it("promoting a user to editor invalidates the target's existing sessions", async () => {
    const { username, password, id } = await createUser({ role: "user" });
    const targetToken = await loginAs(username, password);

    // Session valid before the role change.
    const before = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${targetToken}` },
    });
    expect(before.statusCode).toBe(200);

    const upd = await testApp.app.inject({
      method: "PUT",
      url: `/api/auth/users/${id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { role: "editor" },
    });
    expect(upd.statusCode).toBe(200);

    const remaining = await db.select().from(schema.sessions).where(eq(schema.sessions.userId, id));
    expect(remaining).toHaveLength(0);

    const after = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${targetToken}` },
    });
    expect(after.statusCode).toBe(401);
  });

  it("delete authority: a below-admin users:manage actor cannot delete an admin", async () => {
    // Custom role that holds users:manage but sits below admin in the hierarchy.
    const roleName = `delmgr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const roleRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/roles",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: roleName, permissions: ["users:manage"] },
    });
    expect(roleRes.statusCode, roleRes.body).toBe(201);

    const target = await createUser({ role: "admin" });
    const managerName = uid();
    const managerPassword = "DelMgrPass1";
    const reg = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username: managerName, password: managerPassword, role: roleName },
    });
    expect(reg.statusCode, reg.body).toBe(201);
    await db
      .update(schema.users)
      .set({ mustChangePassword: false })
      .where(eq(schema.users.username, managerName));
    const managerToken = await loginAs(managerName, managerPassword);

    const res = await testApp.app.inject({
      method: "DELETE",
      url: `/api/auth/users/${target.id}`,
      headers: { authorization: `Bearer ${managerToken}` },
    });
    // Past the users:manage gate, but the target outranks the actor.
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe("ESCALATION_DENIED");

    // The target admin still exists.
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, target.id));
    expect(row).toBeDefined();
  });

  it("admin can delete a normal user and cascades their sessions", async () => {
    const { username, password, id } = await createUser({ role: "user" });
    await loginAs(username, password);

    const sessionsBefore = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, id));
    expect(sessionsBefore.length).toBeGreaterThan(0);

    const res = await testApp.app.inject({
      method: "DELETE",
      url: `/api/auth/users/${id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);

    const [userRow] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    expect(userRow).toBeUndefined();
    const sessionsAfter = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, id));
    expect(sessionsAfter).toHaveLength(0);
  });

  it("reset-password against an unknown user id returns 404", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/users/00000000-0000-0000-0000-000000000000/reset-password",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { newPassword: "ResetValid1" },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe("NOT_FOUND");
  });

  it("reset-password with a weak new password returns 400", async () => {
    const { id } = await createUser();
    const res = await testApp.app.inject({
      method: "POST",
      url: `/api/auth/users/${id}/reset-password`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { newPassword: "weak" },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe("VALIDATION_ERROR");
  });

  it("reset-password on a passwordless (OIDC/SSO) user returns 400 OIDC_NO_PASSWORD", async () => {
    const { id } = await createUser();
    // Null out the local password hash to emulate an externally-provisioned user.
    await db.update(schema.users).set({ passwordHash: null }).where(eq(schema.users.id, id));

    const res = await testApp.app.inject({
      method: "POST",
      url: `/api/auth/users/${id}/reset-password`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { newPassword: "ResetValid1" },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe("OIDC_NO_PASSWORD");
  });

  it("change-password on a passwordless account returns 400 OIDC_NO_PASSWORD", async () => {
    const { username, password, id } = await createUser();
    const token = await loginAs(username, password);
    // Strip the password hash after the session exists.
    await db.update(schema.users).set({ passwordHash: null }).where(eq(schema.users.id, id));

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/change-password",
      headers: { authorization: `Bearer ${token}` },
      payload: { currentPassword: password, newPassword: "NewValid9" },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe("OIDC_NO_PASSWORD");
  });

  it("change-password with a wrong current password returns 401 INVALID_PASSWORD", async () => {
    const { username, password } = await createUser();
    const token = await loginAs(username, password);

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/change-password",
      headers: { authorization: `Bearer ${token}` },
      payload: { currentPassword: "TotallyWrong1", newPassword: "NewValid9" },
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).code).toBe("INVALID_PASSWORD");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// REGISTER: role authority for a custom users:manage actor
// ═══════════════════════════════════════════════════════════════════════════
describe("Register role authority", () => {
  it("a users:manage actor below admin cannot create an admin (403 ESCALATION_DENIED)", async () => {
    // Build a custom role that can manage users but is not admin-level.
    const roleName = `usrmgr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const roleRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/roles",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: roleName, permissions: ["users:manage"] },
    });
    expect(roleRes.statusCode, roleRes.body).toBe(201);

    const managerName = uid();
    const managerPassword = "ManagerPass1";
    const reg = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username: managerName, password: managerPassword, role: roleName },
    });
    expect(reg.statusCode, reg.body).toBe(201);
    await db
      .update(schema.users)
      .set({ mustChangePassword: false })
      .where(eq(schema.users.username, managerName));
    const managerToken = await loginAs(managerName, managerPassword);

    // The manager tries to create an admin -- above its authority.
    const escalate = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${managerToken}` },
      payload: { username: uid(), password: "ValidPass1", role: "admin" },
    });
    expect(escalate.statusCode).toBe(403);
    expect(JSON.parse(escalate.body).code).toBe("ESCALATION_DENIED");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SSO ENFORCEMENT SETTING WITHOUT THE ENTERPRISE FEATURE
// The setting alone must not block local login when sso_enforcement is unlicensed.
// ═══════════════════════════════════════════════════════════════════════════
describe("SSO enforcement without license", () => {
  it("local login still works when ssoEnforcement is on but the feature is unlicensed", async () => {
    const { username, password } = await createUser();

    await setSetting("ssoEnforcement", "true");
    try {
      const res = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username, password },
      });
      // Enterprise is not licensed in this plain harness, so isFeatureEnabled
      // is false and the enforcement branch is skipped -- login proceeds.
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).token).toBeTruthy();
    } finally {
      await clearSetting("ssoEnforcement");
    }
  });
});
