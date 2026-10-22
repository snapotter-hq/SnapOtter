import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import * as OTPAuth from "otpauth";
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
const { decrypt, encrypt } = await import("../../../apps/api/src/lib/encryption.js");
const { classifyError } = await import("../../../apps/api/src/lib/error-report.js");
const { hashRecoveryCodes, verifyRecoveryCode } = await import(
  "../../../apps/api/src/plugins/mfa.js"
);

import type { TestApp } from "../test-server.js";

const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);
const SECRET = "JBSWY3DPEHPK3PXP";

let testApp: TestApp;
let adminToken: string;
let adminId: string;
const originalKey = env.DATA_ENCRYPTION_KEY;
const originalPreviousKey = env.DATA_ENCRYPTION_KEY_PREVIOUS;

async function setAdminMfa(totpEnabled: boolean, recoveryCodes?: string[]): Promise<void> {
  await db
    .update(schema.users)
    .set({
      totpSecret: await encrypt(SECRET, KEY_A),
      totpEnabled,
      recoveryCodesHash: recoveryCodes ? hashRecoveryCodes(recoveryCodes) : null,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, adminId));
}

async function clearAdminMfa(): Promise<void> {
  await db
    .update(schema.users)
    .set({ totpSecret: null, totpEnabled: false, recoveryCodesHash: null, updatedAt: new Date() })
    .where(eq(schema.users.id, adminId));
  const stepKeys = await sharedRedis().keys(`mfa:totp-step:${adminId}:*`);
  if (stepKeys.length > 0) {
    await sharedRedis().del(...stepKeys);
  }
}

function generateTotpCode(): string {
  return new OTPAuth.TOTP({
    issuer: "SnapOtter",
    label: "admin",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(SECRET),
  }).generate();
}

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
  const [admin] = await db.select().from(schema.users).where(eq(schema.users.username, "admin"));
  adminId = admin.id;
});

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
});

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

  it("POST /api/auth/mfa/complete reports it and preserves the challenge and attempt count (#2790)", async () => {
    await setAdminMfa(true);
    const mfaToken = randomUUID();
    await sharedRedis().set(`mfa:${mfaToken}`, adminId, "EX", 60);
    await sharedRedis().set(`mfa:attempts:${mfaToken}`, "2", "EX", 60);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/complete",
      payload: { mfaToken, code: "123456" },
    });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).code).toBe("DECRYPTION_FAILED");
    expectReportedAsOperational("/api/auth/mfa/complete");

    // The challenge token and prior failed-attempt count must survive so the user
    // can retry once the server key is restored (#2790).
    expect(await sharedRedis().get(`mfa:${mfaToken}`)).toBe(adminId);
    expect(await sharedRedis().pttl(`mfa:${mfaToken}`)).toBeGreaterThan(0);
    expect(await sharedRedis().get(`mfa:attempts:${mfaToken}`)).toBe("2");

    env.DATA_ENCRYPTION_KEY = KEY_A;
    const retryRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/complete",
      payload: { mfaToken, code: generateTotpCode() },
    });
    expect(retryRes.statusCode).toBe(200);
    expect(await sharedRedis().get(`mfa:${mfaToken}`)).toBeNull();
    expect(await sharedRedis().get(`mfa:attempts:${mfaToken}`)).toBeNull();
  });

  it("POST /api/auth/mfa/enroll-complete reports it and preserves the challenge and attempt count (#2790)", async () => {
    await setAdminMfa(false);
    const enrollmentToken = randomUUID();
    await sharedRedis().set(`mfa:enroll:${enrollmentToken}`, adminId, "EX", 60);
    await sharedRedis().set(`mfa:enroll:attempts:${enrollmentToken}`, "2", "EX", 60);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/enroll-complete",
      payload: { enrollmentToken, code: "123456" },
    });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).code).toBe("DECRYPTION_FAILED");
    expectReportedAsOperational("/api/auth/mfa/enroll-complete");

    // The enrollment challenge token and prior failed-attempt count must survive (#2790).
    expect(await sharedRedis().get(`mfa:enroll:${enrollmentToken}`)).toBe(adminId);
    expect(await sharedRedis().pttl(`mfa:enroll:${enrollmentToken}`)).toBeGreaterThan(0);
    expect(await sharedRedis().get(`mfa:enroll:attempts:${enrollmentToken}`)).toBe("2");

    env.DATA_ENCRYPTION_KEY = KEY_A;
    const retryRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/enroll-complete",
      payload: { enrollmentToken, code: generateTotpCode() },
    });
    expect(retryRes.statusCode).toBe(200);
    expect(await sharedRedis().get(`mfa:enroll:${enrollmentToken}`)).toBeNull();
    expect(await sharedRedis().get(`mfa:enroll:attempts:${enrollmentToken}`)).toBeNull();
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

  it("re-encrypts the stored secret under DATA_ENCRYPTION_KEY on /api/auth/mfa/complete so dropping DATA_ENCRYPTION_KEY_PREVIOUS does not lock the user out (#2033)", async () => {
    env.DATA_ENCRYPTION_KEY = KEY_B;
    env.DATA_ENCRYPTION_KEY_PREVIOUS = KEY_A;
    await setAdminMfa(true);

    const firstToken = randomUUID();
    await sharedRedis().set(`mfa:${firstToken}`, adminId, "EX", 60);
    const duringRotation = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/complete",
      payload: { mfaToken: firstToken, code: generateTotpCode() },
    });
    expect(duringRotation.statusCode).toBe(200);

    const [rotatedRow] = await db
      .select({ totpSecret: schema.users.totpSecret })
      .from(schema.users)
      .where(eq(schema.users.id, adminId));
    const rotatedSecret = rotatedRow.totpSecret ?? "";
    expect(rotatedSecret).not.toBe("");
    expect(await decrypt(rotatedSecret, KEY_B)).toBe(SECRET);
    expect(await decrypt(rotatedSecret, KEY_A)).toBeNull();

    // Drop the previous key as documented in guide/configuration.md
    env.DATA_ENCRYPTION_KEY_PREVIOUS = "";
    const stepKeys = await sharedRedis().keys(`mfa:totp-step:${adminId}:*`);
    if (stepKeys.length > 0) await sharedRedis().del(...stepKeys);

    const secondToken = randomUUID();
    await sharedRedis().set(`mfa:${secondToken}`, adminId, "EX", 60);
    const afterDrop = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/complete",
      payload: { mfaToken: secondToken, code: generateTotpCode() },
    });
    expect(afterDrop.statusCode).toBe(200);
    expect(reportErrorSpy).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });

  it("re-encrypts the stored secret across /verify, /enroll-complete, and /disable when opened via DATA_ENCRYPTION_KEY_PREVIOUS (#2033)", async () => {
    // 1. /api/auth/mfa/verify (200 during rotation, then readable after dropping previous key)
    env.DATA_ENCRYPTION_KEY = KEY_B;
    env.DATA_ENCRYPTION_KEY_PREVIOUS = KEY_A;
    await setAdminMfa(false);

    const verifyOk = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/verify",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { code: generateTotpCode() },
    });
    expect(verifyOk.statusCode).toBe(200);

    env.DATA_ENCRYPTION_KEY_PREVIOUS = "";
    const [afterVerify] = await db
      .select({ totpSecret: schema.users.totpSecret })
      .from(schema.users)
      .where(eq(schema.users.id, adminId));
    expect(await decrypt(afterVerify.totpSecret ?? "", KEY_B)).toBe(SECRET);

    // 2. /api/auth/mfa/enroll-complete
    await clearAdminMfa();
    env.DATA_ENCRYPTION_KEY = KEY_B;
    env.DATA_ENCRYPTION_KEY_PREVIOUS = KEY_A;
    await setAdminMfa(false);

    const enrollmentToken = randomUUID();
    await sharedRedis().set(`mfa:enroll:${enrollmentToken}`, adminId, "EX", 60);
    const enrollComplete = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/enroll-complete",
      payload: { enrollmentToken, code: generateTotpCode() },
    });
    expect(enrollComplete.statusCode).toBe(200);

    env.DATA_ENCRYPTION_KEY_PREVIOUS = "";
    const [afterEnrollComplete] = await db
      .select({ totpSecret: schema.users.totpSecret })
      .from(schema.users)
      .where(eq(schema.users.id, adminId));
    expect(await decrypt(afterEnrollComplete.totpSecret ?? "", KEY_B)).toBe(SECRET);

    // 3. /api/auth/mfa/disable with its own KEY_A secret: a wrong code during
    // rotation re-encrypts the secret, so a retry after dropping KEY_A succeeds.
    await clearAdminMfa();
    env.DATA_ENCRYPTION_KEY = KEY_B;
    env.DATA_ENCRYPTION_KEY_PREVIOUS = KEY_A;
    await setAdminMfa(true);

    const disableWrong = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/disable",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { code: "000000" },
    });
    expect(disableWrong.statusCode).toBe(401);

    env.DATA_ENCRYPTION_KEY_PREVIOUS = "";
    const disableRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/disable",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { code: generateTotpCode() },
    });
    expect(disableRes.statusCode).toBe(200);
    expect(reportErrorSpy).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });

  it("does not overwrite a concurrently cleared or replaced totpSecret when decryptSecret loses a race (#2033)", async () => {
    const { decryptSecret } = await import("../../../apps/api/src/plugins/mfa.js");
    env.DATA_ENCRYPTION_KEY = KEY_B;
    env.DATA_ENCRYPTION_KEY_PREVIOUS = KEY_A;
    const staleStored = await encrypt(SECRET, KEY_A);

    // Case 1: concurrent MFA reset/disable cleared totpSecret to null.
    await clearAdminMfa();
    await expect(decryptSecret(adminId, staleStored)).resolves.toBe(SECRET);

    const [clearedRow] = await db
      .select({ totpSecret: schema.users.totpSecret })
      .from(schema.users)
      .where(eq(schema.users.id, adminId));
    expect(clearedRow.totpSecret).toBeNull();

    // Case 2: concurrent re-enrollment replaced totpSecret with a newer non-null ciphertext.
    const newerSecret = await encrypt("JBSWY3DPEHPK3PXQ", KEY_B);
    await db
      .update(schema.users)
      .set({ totpSecret: newerSecret, totpEnabled: false, updatedAt: new Date() })
      .where(eq(schema.users.id, adminId));

    await expect(decryptSecret(adminId, staleStored)).resolves.toBe(SECRET);

    const [replacedRow] = await db
      .select({ totpSecret: schema.users.totpSecret })
      .from(schema.users)
      .where(eq(schema.users.id, adminId));
    expect(replacedRow.totpSecret).toBe(newerSecret);
  });

  it("POST /api/auth/mfa/complete accepts a valid recovery code when the TOTP secret cannot be decrypted, and still returns 500 for a wrong recovery code (#2034)", async () => {
    await db.delete(schema.auditLog).where(eq(schema.auditLog.action, "MFA_RECOVERY_USED"));
    const recoveryCodes = ["a3f9c01b", "d4e8f12a"];
    await setAdminMfa(true, recoveryCodes);
    const mfaToken = randomUUID();
    await sharedRedis().set(`mfa:${mfaToken}`, adminId, "EX", 60);
    await sharedRedis().set(`mfa:attempts:${mfaToken}`, "1", "EX", 60);

    // A wrong recovery code falls through to TOTP verification, which cannot
    // decrypt the secret and returns 500 DECRYPTION_FAILED while preserving the
    // challenge and recovery codes.
    const wrongRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/complete",
      payload: { mfaToken, code: "deadbeef" },
    });
    expect(wrongRes.statusCode).toBe(500);
    expect(JSON.parse(wrongRes.body).code).toBe("DECRYPTION_FAILED");
    expectReportedAsOperational("/api/auth/mfa/complete");
    expect(await sharedRedis().get(`mfa:${mfaToken}`)).toBe(adminId);
    expect(await sharedRedis().get(`mfa:attempts:${mfaToken}`)).toBe("1");

    reportErrorSpy.mockClear();
    logError.mockClear();

    // A valid recovery code succeeds without touching the undecryptable TOTP secret.
    const okRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/complete",
      payload: { mfaToken, code: "A3F9-C01B" },
    });
    expect(okRes.statusCode).toBe(200);
    const body = JSON.parse(okRes.body);
    expect(body.token).toBeDefined();
    expect(body.user.id).toBe(adminId);
    expect(reportErrorSpy).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
    expect(await sharedRedis().get(`mfa:${mfaToken}`)).toBeNull();
    expect(await sharedRedis().get(`mfa:attempts:${mfaToken}`)).toBeNull();

    // The used recovery code is consumed, the remaining recovery code is preserved,
    // and MFA_RECOVERY_USED is recorded in the audit log.
    const [afterUser] = await db
      .select({ recoveryCodesHash: schema.users.recoveryCodesHash })
      .from(schema.users)
      .where(eq(schema.users.id, adminId));
    expect(verifyRecoveryCode("a3f9c01b", afterUser.recoveryCodesHash ?? "").valid).toBe(false);
    expect(verifyRecoveryCode("d4e8f12a", afterUser.recoveryCodesHash ?? "").valid).toBe(true);

    const recoveryAudits = await db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "MFA_RECOVERY_USED"));
    expect(recoveryAudits).toHaveLength(1);
    expect(recoveryAudits[0].details).toMatchObject({ userId: adminId, username: "admin" });

    // Re-submitting the already-spent recovery code on a new challenge no longer
    // matches recoveryCodesHash and falls through to 500 DECRYPTION_FAILED.
    const secondToken = randomUUID();
    await sharedRedis().set(`mfa:${secondToken}`, adminId, "EX", 60);
    const spentRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/complete",
      payload: { mfaToken: secondToken, code: "a3f9c01b" },
    });
    expect(spentRes.statusCode).toBe(500);
    expect(JSON.parse(spentRes.body).code).toBe("DECRYPTION_FAILED");
    expectReportedAsOperational("/api/auth/mfa/complete");
    await sharedRedis().del(`mfa:${secondToken}`);
  });

  it("POST /api/auth/mfa/complete returns 401 INVALID_CODE (not 500 DECRYPTION_FAILED) when a recovery code loses a concurrent-spend race while the TOTP secret cannot be decrypted (#2034)", async () => {
    await db.delete(schema.auditLog).where(eq(schema.auditLog.action, "MFA_VERIFY_FAILED"));
    await setAdminMfa(true, ["a3f9c01b"]);
    const [staleUser] = await db.select().from(schema.users).where(eq(schema.users.id, adminId));

    // Simulate another login spending the recovery code right after this request
    // reads dbUser, before consumeRecoveryCode's conditional update runs.
    await db
      .update(schema.users)
      .set({ recoveryCodesHash: null, updatedAt: new Date() })
      .where(eq(schema.users.id, adminId));

    const originalSelect = db.select.bind(db);
    const selectSpy = vi.spyOn(db, "select").mockImplementationOnce((...args: unknown[]) => {
      if (args.length === 0) {
        return {
          from: () => ({
            where: async () => [staleUser],
          }),
        } as unknown as ReturnType<typeof db.select>;
      }
      // biome-ignore lint/suspicious/noExplicitAny: passthrough to overloaded select
      return (originalSelect as any)(...args);
    });

    const mfaToken = randomUUID();
    await sharedRedis().set(`mfa:${mfaToken}`, adminId, "EX", 60);
    try {
      const res = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/mfa/complete",
        payload: { mfaToken, code: "a3f9c01b" },
      });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).code).toBe("INVALID_CODE");
      expect(reportErrorSpy).not.toHaveBeenCalled();
      expect(logError).not.toHaveBeenCalled();
      expect(await sharedRedis().get(`mfa:${mfaToken}`)).toBe(adminId);
      expect(await sharedRedis().get(`mfa:attempts:${mfaToken}`)).toBe("1");

      const failedAudits = await db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.action, "MFA_VERIFY_FAILED"));
      expect(failedAudits).toHaveLength(1);
      expect(failedAudits[0].details).toMatchObject({
        userId: adminId,
        username: "admin",
        reason: "recovery_code_spent_concurrently",
      });
    } finally {
      selectSpy.mockRestore();
      await sharedRedis().del(`mfa:${mfaToken}`, `mfa:attempts:${mfaToken}`);
    }
  });
});
