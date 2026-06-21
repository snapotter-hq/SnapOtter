import { eq } from "drizzle-orm";
import * as OTPAuth from "otpauth";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.resetModules();
const { mockEnterpriseFeatures } = await import("../../helpers/enterprise-mock.js");
mockEnterpriseFeatures(["mfa"]);

const { buildTestApp, loginAsAdmin } = await import("../test-server.js");
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
});
