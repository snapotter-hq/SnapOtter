import { eq } from "drizzle-orm";
import * as OTPAuth from "otpauth";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.resetModules();
const { mockEnterpriseFeatures } = await import("../../helpers/enterprise-mock.js");
mockEnterpriseFeatures(["mfa"]);

const { buildTestApp, loginAsAdmin, loginAsUser } = await import("../test-server.js");
const { db, schema } = await import("../../../apps/api/src/db/index.js");

import type { TestApp } from "../test-server.js";

let testApp: TestApp;
let adminToken: string;

function generateTotpCode(uri: string): string {
  const totp = OTPAuth.URI.parse(uri) as OTPAuth.TOTP;
  return totp.generate();
}

async function clearMfaState(username: string): Promise<void> {
  await db
    .update(schema.users)
    .set({
      totpSecret: null,
      totpEnabled: false,
      recoveryCodesHash: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.username, username));
}

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await clearMfaState("admin");
  await testApp.cleanup();
}, 10_000);

describe("POST /api/auth/mfa/enroll", () => {
  afterEach(async () => {
    await clearMfaState("admin");
  });

  it("returns 401 without authentication", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/enroll",
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns TOTP URI and recovery codes on success", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/enroll",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.uri).toBeDefined();
    expect(body.recoveryCodes).toBeDefined();
    expect(Array.isArray(body.recoveryCodes)).toBe(true);
  });

  it("recovery codes array has 8 entries", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/enroll",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const body = JSON.parse(res.body);
    expect(body.recoveryCodes).toHaveLength(8);
  });

  it("URI contains otpauth://totp/", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/enroll",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const body = JSON.parse(res.body);
    expect(body.uri).toContain("otpauth://totp/");
  });

  it("returns 409 when MFA is already enabled", async () => {
    const enrollRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/enroll",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const { uri } = JSON.parse(enrollRes.body);
    const code = generateTotpCode(uri);

    await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/verify",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { code },
    });

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/enroll",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.code).toBe("MFA_ALREADY_ENABLED");
  });

  it("restarting enrollment after canceling (no verify in between) issues a fresh, working secret instead of 409ing", async () => {
    // First attempt: user clicks Enable, sees the QR, then cancels/abandons
    // without verifying. This leaves a pending, unverified secret.
    await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/enroll",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    // Second attempt: user clicks Enable again later. Must not be a dead
    // end requiring an admin reset -- it should just issue a new secret.
    const secondEnrollRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/enroll",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(secondEnrollRes.statusCode).toBe(200);
    const { uri: secondUri } = JSON.parse(secondEnrollRes.body);

    // The new secret is genuinely live: verifying with it actually works.
    const code = generateTotpCode(secondUri);
    const verifyRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/verify",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { code },
    });
    expect(verifyRes.statusCode).toBe(200);
  });
});

describe("POST /api/auth/mfa/verify", () => {
  afterEach(async () => {
    await clearMfaState("admin");
  });

  it("returns 401 without authentication", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/verify",
      payload: { code: "123456" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 400 with missing code", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/verify",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 401 with invalid code", async () => {
    await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/enroll",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/verify",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { code: "000000" },
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.code).toBe("INVALID_CODE");
  });

  it("successfully activates MFA with correct TOTP code", async () => {
    const enrollRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/enroll",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const { uri } = JSON.parse(enrollRes.body);
    const code = generateTotpCode(uri);

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/verify",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { code },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);

    const [dbUser] = await db.select().from(schema.users).where(eq(schema.users.username, "admin"));
    expect(dbUser.totpEnabled).toBe(true);
  });
});

describe("POST /api/auth/mfa/disable", () => {
  afterEach(async () => {
    await clearMfaState("admin");
  });

  it("returns 401 without authentication", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/disable",
      payload: { code: "123456" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 400 with missing code", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/disable",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /api/auth/users/:id/mfa/reset", () => {
  it("returns 401 without authentication", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/users/nonexistent-id/mfa/reset",
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 for non-admin users", async () => {
    const regRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username: "mfa_regular_user", password: "TestPass1", role: "user" },
    });
    const userId = JSON.parse(regRes.body).id;

    await db
      .update(schema.users)
      .set({ mustChangePassword: false })
      .where(eq(schema.users.username, "mfa_regular_user"));

    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "mfa_regular_user", password: "TestPass1" },
    });
    const userToken = JSON.parse(loginRes.body).token;

    const res = await testApp.app.inject({
      method: "POST",
      url: `/api/auth/users/${userId}/mfa/reset`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("GET /api/auth/session totpEnabled", () => {
  afterEach(async () => {
    await clearMfaState("admin");
  });

  it("is false when the user has not enrolled", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.totpEnabled).toBe(false);
  });

  it("is true once the user has completed enrollment", async () => {
    const enrollRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/enroll",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const { uri } = JSON.parse(enrollRes.body);
    const code = generateTotpCode(uri);
    await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/verify",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { code },
    });

    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const body = JSON.parse(res.body);
    expect(body.user.totpEnabled).toBe(true);
  });
});

describe("MFA login flow", () => {
  let totpUri: string;

  beforeAll(async () => {
    await clearMfaState("admin");

    const enrollRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/enroll",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    totpUri = JSON.parse(enrollRes.body).uri;
    const code = generateTotpCode(totpUri);

    await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/verify",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { code },
    });
  });

  afterAll(async () => {
    await clearMfaState("admin");
  });

  it("login returns requiresMfa with mfaToken when MFA is enabled", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "Adminpass1" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.requiresMfa).toBe(true);
    expect(body.mfaToken).toBeDefined();
    expect(typeof body.mfaToken).toBe("string");
    expect(body.token).toBeUndefined();
  });

  it("POST /api/auth/mfa/complete with valid mfaToken and TOTP code creates session", async () => {
    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "Adminpass1" },
    });
    const { mfaToken } = JSON.parse(loginRes.body);

    const code = generateTotpCode(totpUri);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/complete",
      payload: { mfaToken, code },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.token).toBeDefined();
    expect(typeof body.token).toBe("string");
    expect(body.user).toBeDefined();
    expect(body.user.username).toBe("admin");
    expect(body.expiresAt).toBeDefined();
  });

  it("burns the challenge after repeated wrong codes so the correct code no longer works", async () => {
    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "Adminpass1" },
    });
    const { mfaToken } = JSON.parse(loginRes.body);

    // Exhaust the wrong-code budget. Each wrong attempt is a 401.
    for (let i = 0; i < 5; i++) {
      const bad = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/mfa/complete",
        payload: { mfaToken, code: "000000" },
      });
      expect(bad.statusCode).toBe(401);
    }

    // The challenge is now burned: even the correct TOTP is rejected as expired,
    // forcing the attacker back through the login (and its rate limit).
    const code = generateTotpCode(totpUri);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/complete",
      payload: { mfaToken, code },
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).code).toBe("MFA_EXPIRED");
  });
});

async function setMfaPolicy(value: "optional" | "admins_only" | "required"): Promise<void> {
  await db
    .insert(schema.settings)
    .values({ key: "mfaPolicy", value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}

// This is the actual fix for #515/#529: exercises the real /api/auth/login
// route end to end, not a mocked response. Everything else in this repo that
// covers this bug (the license gate on saving the setting, the frontend's
// handling of a stubbed 403) would still pass if this exact backend branch
// were reverted or its response code were renamed.
describe("POST /api/auth/login with mfaPolicy enforcement", () => {
  afterEach(async () => {
    await setMfaPolicy("optional");
    await clearMfaState("admin");
  });

  it("blocks an unenrolled admin with 403 MFA_ENROLLMENT_REQUIRED when policy is required", async () => {
    await setMfaPolicy("required");

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "Adminpass1" },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.code).toBe("MFA_ENROLLMENT_REQUIRED");
    expect(body.token).toBeUndefined();
  });

  it("blocks an unenrolled admin under an admins_only policy", async () => {
    await setMfaPolicy("admins_only");

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "Adminpass1" },
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe("MFA_ENROLLMENT_REQUIRED");
  });

  it("does not block a non-admin user under an admins_only policy", async () => {
    // Ensure the shared test user exists while policy is still permissive.
    await loginAsUser(testApp.app);
    await setMfaPolicy("admins_only");

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "plainuser", password: "Userpass1" },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).token).toBeDefined();
  });

  it("does not block anyone when policy is optional", async () => {
    await setMfaPolicy("optional");

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "Adminpass1" },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).token).toBeDefined();
  });
});

// The mirror image of tests/integration/platform/mfa-policy-license-gate.test.ts
// (which proves an UNlicensed instance can't save this policy). This file is
// already licensed (mockEnterpriseFeatures(["mfa"]) above), so it proves the
// gate doesn't also accidentally block a legitimately licensed instance.
describe("PUT /api/v1/settings mfaPolicy (licensed)", () => {
  afterEach(async () => {
    await setMfaPolicy("optional");
  });

  it("allows saving required when mfa is licensed", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { mfaPolicy: "required" },
    });
    expect(res.statusCode).toBe(200);

    const check = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/settings/mfaPolicy",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(JSON.parse(check.body).value).toBe("required");
  });

  it("allows saving admins_only when mfa is licensed", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { mfaPolicy: "admins_only" },
    });
    expect(res.statusCode).toBe(200);
  });
});
