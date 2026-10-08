import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// reportError is mocked so the tests can tell a reported fault from a silent
// 500 (#2020); every other error-report export stays real, so classifyError
// still says which Sentry class the report would land in.
const reportErrorSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("../../../apps/api/src/lib/error-report.js", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, reportError: reportErrorSpy };
});

vi.resetModules();
const { mockEnterpriseFeatures } = await import("../../helpers/enterprise-mock.js");
mockEnterpriseFeatures(["mfa"]);

const { buildTestApp, loginAsAdmin } = await import("../test-server.js");
const { env } = await import("../../../apps/api/src/config.js");
const { db, schema } = await import("../../../apps/api/src/db/index.js");
const { sharedRedis } = await import("../../../apps/api/src/jobs/connection.js");
const { encrypt } = await import("../../../apps/api/src/lib/encryption.js");
const { classifyError } = await import("../../../apps/api/src/lib/error-report.js");

import type { TestApp } from "../test-server.js";

const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);
const SECRET = "JBSWY3DPEHPK3PXP";

let testApp: TestApp;
let adminToken: string;
let adminId: string;
const originalKey = env.DATA_ENCRYPTION_KEY;
const originalPreviousKey = env.DATA_ENCRYPTION_KEY_PREVIOUS;

async function setAdminMfa(totpEnabled: boolean): Promise<void> {
  await db
    .update(schema.users)
    .set({ totpSecret: await encrypt(SECRET, KEY_A), totpEnabled, updatedAt: new Date() })
    .where(eq(schema.users.id, adminId));
}

async function clearAdminMfa(): Promise<void> {
  await db
    .update(schema.users)
    .set({ totpSecret: null, totpEnabled: false, recoveryCodesHash: null, updatedAt: new Date() })
    .where(eq(schema.users.id, adminId));
}

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
  const [admin] = await db.select().from(schema.users).where(eq(schema.users.username, "admin"));
  adminId = admin.id;
}, 30_000);

// buildTestApp runs with `logger: false`, in which Fastify hands every request
// the app's own logger object, so spying on app.log sees request.log calls.
let logError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  reportErrorSpy.mockClear();
  logError = vi.spyOn(testApp.app.log, "error");
  // The secret was written under KEY_A, so a server booted with KEY_B can't
  // read it: the wrong-key restart this regression is about.
  env.DATA_ENCRYPTION_KEY = KEY_B;
  env.DATA_ENCRYPTION_KEY_PREVIOUS = "";
});

afterEach(async () => {
  logError.mockRestore();
  env.DATA_ENCRYPTION_KEY = originalKey;
  env.DATA_ENCRYPTION_KEY_PREVIOUS = originalPreviousKey;
  await clearAdminMfa();
});

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

function expectReportedAsOperational(route: string): void {
  expect(reportErrorSpy).toHaveBeenCalledTimes(1);
  const [err, ctx] = reportErrorSpy.mock.calls[0];
  expect(classifyError(err, "http")).toBe("operational");
  // The code is the Sentry fingerprint that groups all four routes into one issue.
  expect(err).toMatchObject({ code: "MFA_DECRYPTION_FAILED" });
  // The log line is the operator's own signal: reportError is a no-op with analytics off.
  expect(logError).toHaveBeenCalledTimes(1);
  expect(logError).toHaveBeenCalledWith(
    { userId: adminId },
    expect.stringContaining("DATA_ENCRYPTION_KEY"),
  );
  expect(ctx).toMatchObject({
    source: "http",
    route,
    method: "POST",
    statusCode: 500,
    subsystem: "mfa-secret",
  });
}

describe("MFA routes when the stored TOTP secret can't be decrypted (#2020)", () => {
  it("POST /api/auth/mfa/verify reports it", async () => {
    await setAdminMfa(false);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/verify",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { code: "123456" },
    });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).code).toBe("DECRYPTION_FAILED");
    expectReportedAsOperational("/api/auth/mfa/verify");
  });

  it("POST /api/auth/mfa/disable reports it", async () => {
    await setAdminMfa(true);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/disable",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { code: "123456" },
    });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).code).toBe("DECRYPTION_FAILED");
    expectReportedAsOperational("/api/auth/mfa/disable");
  });

  it("POST /api/auth/mfa/complete reports it", async () => {
    await setAdminMfa(true);
    const mfaToken = randomUUID();
    await sharedRedis().set(`mfa:${mfaToken}`, adminId, "EX", 60);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/complete",
      payload: { mfaToken, code: "123456" },
    });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).code).toBe("DECRYPTION_FAILED");
    expectReportedAsOperational("/api/auth/mfa/complete");
  });

  it("POST /api/auth/mfa/enroll-complete reports it", async () => {
    await setAdminMfa(false);
    const enrollmentToken = randomUUID();
    await sharedRedis().set(`mfa:enroll:${enrollmentToken}`, adminId, "EX", 60);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/enroll-complete",
      payload: { enrollmentToken, code: "123456" },
    });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).code).toBe("DECRYPTION_FAILED");
    expectReportedAsOperational("/api/auth/mfa/enroll-complete");
  });

  it("reports it, not a TypeError, when the key was removed after enrollment", async () => {
    env.DATA_ENCRYPTION_KEY = "";
    await setAdminMfa(false);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/verify",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { code: "123456" },
    });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).code).toBe("DECRYPTION_FAILED");
    expectReportedAsOperational("/api/auth/mfa/verify");
  });

  it("still reads a plaintext secret when no key is configured", async () => {
    env.DATA_ENCRYPTION_KEY = "";
    await db
      .update(schema.users)
      .set({ totpSecret: SECRET, totpEnabled: false, updatedAt: new Date() })
      .where(eq(schema.users.id, adminId));
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/verify",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { code: "000000" },
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).code).toBe("INVALID_CODE");
    expect(reportErrorSpy).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });

  it("does not report a wrong code when the secret decrypts fine", async () => {
    env.DATA_ENCRYPTION_KEY = KEY_A;
    await setAdminMfa(false);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/verify",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { code: "000000" },
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).code).toBe("INVALID_CODE");
    expect(reportErrorSpy).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });

  it("falls back to the previous key, so a mid-rotation secret is not a failure", async () => {
    env.DATA_ENCRYPTION_KEY = KEY_B;
    env.DATA_ENCRYPTION_KEY_PREVIOUS = KEY_A;
    await setAdminMfa(false);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/verify",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { code: "000000" },
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).code).toBe("INVALID_CODE");
    expect(reportErrorSpy).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });
});
