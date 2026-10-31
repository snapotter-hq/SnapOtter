/**
 * End-to-end proof for issue #515: an MFA policy a user cannot satisfy locks
 * them out at the login enrollment wall (403 MFA_ENROLLMENT_REQUIRED, no
 * session), and the offline `reset-mfa-policy` recovery command unlocks them
 * (200) through the real login route. Guards against regressing either the
 * lockout behavior or the recovery.
 */

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import {
  createAdminUser,
  resetMfaPolicy,
  resetUserPassword,
  unlockUser,
} from "../../../apps/api/src/scripts/admin-recovery.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

let testApp: TestApp;
let adminToken: string;

const uid = () => `mfa_e2e_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}

async function createUser(): Promise<{ username: string; password: string }> {
  const username = uid();
  const password = "ValidPass1";
  const res = await testApp.app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { username, password },
  });
  if (res.statusCode !== 201) {
    throw new Error(`createUser failed: ${res.statusCode} ${res.body}`);
  }
  await db
    .update(schema.users)
    .set({ mustChangePassword: false })
    .where(eq(schema.users.username, username));
  return { username, password };
}

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
});

afterAll(async () => {
  await db.delete(schema.settings).where(eq(schema.settings.key, "mfaPolicy"));
  await db.delete(schema.settings).where(eq(schema.settings.key, "loginThrottleMaxFailures"));
  await testApp.cleanup();
});

describe("MFA lockout recovery (issue #515)", () => {
  it("reset-mfa-policy unlocks a user walled by a required policy", async () => {
    const { username, password } = await createUser();

    // Arm the trap: the policy requires MFA, the user has no enrollment.
    await setSetting("mfaPolicy", "required");

    const blocked = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username, password },
    });
    expect(blocked.statusCode).toBe(403);
    expect(JSON.parse(blocked.body).code).toBe("MFA_ENROLLMENT_REQUIRED");

    // Recover via the offline CLI function.
    await resetMfaPolicy();

    const allowed = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username, password },
    });
    expect(allowed.statusCode).toBe(200);
    expect(JSON.parse(allowed.body).token).toBeTruthy();
  });
});

describe("Account recovery CLI commands (issue #812)", () => {
  it("unlock-user clears a 429 LOGIN_THROTTLED lockout so the user can log in immediately", async () => {
    const { username, password } = await createUser();
    await setSetting("loginThrottleMaxFailures", "2");
    try {
      for (let i = 0; i < 2; i++) {
        const bad = await testApp.app.inject({
          method: "POST",
          url: "/api/auth/login",
          payload: { username, password: "WrongPassword1" },
        });
        expect(bad.statusCode).toBe(401);
      }

      const throttled = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username, password },
      });
      expect(throttled.statusCode).toBe(429);
      expect(JSON.parse(throttled.body).code).toBe("LOGIN_THROTTLED");

      expect(await unlockUser(username)).toBe("unlocked");

      const allowed = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username, password },
      });
      expect(allowed.statusCode).toBe(200);
      expect(JSON.parse(allowed.body).token).toBeTruthy();
    } finally {
      await db.delete(schema.settings).where(eq(schema.settings.key, "loginThrottleMaxFailures"));
    }
  });

  it("reset-password replaces a forgotten password and clears any login throttle so login succeeds", async () => {
    const { username } = await createUser();

    const reset = await resetUserPassword(username);
    expect(reset.status).toBe("reset");
    if (reset.status !== "reset") throw new Error("expected reset");

    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username, password: reset.generatedPassword },
    });
    expect(loginRes.statusCode).toBe(200);
    const body = JSON.parse(loginRes.body);
    expect(body.token).toBeTruthy();
    expect(body.user.mustChangePassword).toBe(true);
  });

  it("create-admin bootstraps a new admin account that can log in immediately", async () => {
    const username = uid();
    const created = await createAdminUser(username);
    expect(created.status).toBe("created");
    if (created.status !== "created") throw new Error("expected created");

    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username, password: created.generatedPassword },
    });
    expect(loginRes.statusCode).toBe(200);
    const body = JSON.parse(loginRes.body);
    expect(body.token).toBeTruthy();
    expect(body.user.role).toBe("admin");
    expect(body.user.mustChangePassword).toBe(true);
  });
});
