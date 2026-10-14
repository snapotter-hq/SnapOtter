import { eq } from "drizzle-orm";
import * as OTPAuth from "otpauth";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.resetModules();
const { mockEnterpriseFeatures } = await import("../../helpers/enterprise-mock.js");
mockEnterpriseFeatures(["mfa"]);

const { buildTestApp, createUserAndLogin, loginAsAdmin } = await import("../test-server.js");
const { db, schema } = await import("../../../apps/api/src/db/index.js");

import type { TestApp } from "../test-server.js";

let testApp: TestApp;
let adminToken: string;

function generateTotpCode(uri: string): string {
  const totp = OTPAuth.URI.parse(uri) as OTPAuth.TOTP;
  return totp.generate();
}

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
});

afterAll(async () => {
  await testApp.cleanup();
});

describe("MFA window revoked by password change", () => {
  it("rejects an MFA completion if the password was changed after the challenge was issued", async () => {
    // 1. Create a user and enroll them in MFA
    const username = `mfapwd_${Date.now()}`;
    const { token: userToken, userId } = await createUserAndLogin(
      testApp.app,
      username,
      "user",
      "Password1!",
    );
    const enrollRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/enroll",
      headers: { authorization: `Bearer ${userToken}` },
    });
    const enrollData = JSON.parse(enrollRes.body);
    const totpCode = generateTotpCode(enrollData.uri);
    const enrollConfirmRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/verify",
      headers: { authorization: `Bearer ${userToken}` },
      payload: { code: totpCode },
    });
    expect(enrollConfirmRes.statusCode).toBe(200);

    // 2. Start a login to get an MFA challenge
    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username, password: "Password1!" },
    });
    expect(loginRes.statusCode).toBe(200);
    const loginData = JSON.parse(loginRes.body);
    expect(loginData.requiresMfa).toBe(true);
    const mfaToken = loginData.mfaToken;

    // 3. Admin resets the user's password
    const resetRes = await testApp.app.inject({
      method: "POST",
      url: `/api/auth/users/${userId}/reset-password`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { newPassword: "NewPassword2!" },
    });
    expect(resetRes.statusCode).toBe(200);

    // 4. Try to complete the MFA challenge with a new valid TOTP code
    const completeCode = generateTotpCode(enrollData.uri);
    const completeRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/complete",
      payload: { mfaToken, code: completeCode },
    });

    // Should be rejected because the password changed
    expect(completeRes.statusCode).toBe(401);
    const completeBody = JSON.parse(completeRes.body);
    expect(completeBody.code).toBe("MFA_EXPIRED");
  });

  it("rejects a forced MFA enrollment completion if the password was changed after enrollment started", async () => {
    // 1. Create a user
    const username = `mfaforce_${Date.now()}`;
    const { userId } = await createUserAndLogin(testApp.app, username, "user", "Password1!");

    // 2. Set MFA policy to required
    await db
      .insert(schema.settings)
      .values({ key: "mfaPolicy", value: "required" })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: "required" } });

    try {
      // 3. Login again. Because MFA is required, this should trigger forced enrollment
      const loginRes = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username, password: "Password1!" },
      });

      const loginData = JSON.parse(loginRes.body);
      if (!loginData.requiresMfaEnrollment) {
        throw new Error("Expected requiresMfaEnrollment to be true, got body: " + loginRes.body);
      }
      const enrollmentToken = loginData.enrollmentToken;

      // 4. Admin resets the user's password
      const resetRes = await testApp.app.inject({
        method: "POST",
        url: `/api/auth/users/${userId}/reset-password`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { newPassword: "NewPassword2!" },
      });
      expect(resetRes.statusCode).toBe(200);

      // 5. Try to complete the forced enrollment with a valid TOTP code
      const totpCode = generateTotpCode(loginData.uri);
      const completeRes = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/mfa/enroll-complete",
        payload: { enrollmentToken, code: totpCode },
      });

      // Should be rejected because the password changed
      expect(completeRes.statusCode).toBe(401);
      const completeBody = JSON.parse(completeRes.body);
      expect(completeBody.code).toBe("MFA_EXPIRED");

      const [userAfter] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
      expect(userAfter.totpEnabled).toBe(false);

      const auditRows = await db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.action, "MFA_VERIFY_FAILED"));
      const matchingAudit = auditRows.find((row) => {
        const details = row.details as {
          userId?: string;
          username?: string;
          reason?: string;
        } | null;
        return (
          details?.userId === userId &&
          details?.username === username &&
          details?.reason === "password_changed"
        );
      });
      expect(matchingAudit).toBeDefined();
    } finally {
      await db
        .update(schema.settings)
        .set({ value: "optional" })
        .where(eq(schema.settings.key, "mfaPolicy"));
    }
  });

  it("rejects an MFA completion gracefully if the user is deleted mid-challenge (#2420)", async () => {
    // 1. Create a user and enroll them in MFA
    const username = `mfadel_${Date.now()}`;
    const { token: userToken, userId } = await createUserAndLogin(
      testApp.app,
      username,
      "user",
      "Password1!",
    );
    const enrollRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/enroll",
      headers: { authorization: `Bearer ${userToken}` },
    });
    const enrollData = JSON.parse(enrollRes.body);
    const totpCode = generateTotpCode(enrollData.uri);
    const enrollConfirmRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/verify",
      headers: { authorization: `Bearer ${userToken}` },
      payload: { code: totpCode },
    });
    expect(enrollConfirmRes.statusCode).toBe(200);

    // 2. Start a login to get an MFA challenge
    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username, password: "Password1!" },
    });
    expect(loginRes.statusCode).toBe(200);
    const loginData = JSON.parse(loginRes.body);
    expect(loginData.requiresMfa).toBe(true);
    const mfaToken = loginData.mfaToken;

    // 3. Admin deletes the user
    const delRes = await testApp.app.inject({
      method: "DELETE",
      url: `/api/auth/users/${userId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(delRes.statusCode).toBe(200);

    // 4. Try to complete the MFA challenge
    const completeCode = generateTotpCode(enrollData.uri);
    const completeRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/complete",
      payload: { mfaToken, code: completeCode },
    });

    // Should be rejected gracefully with 401, not 500 TypeError
    expect(completeRes.statusCode).toBe(401);
    const completeBody = JSON.parse(completeRes.body);
    expect(completeBody.code).toBe("MFA_EXPIRED");
  });

  it("rejects a forced MFA enrollment completion gracefully if the user is deleted mid-challenge (#2420)", async () => {
    // 1. Create a user
    const username = `mfaforcedel_${Date.now()}`;
    const { userId } = await createUserAndLogin(testApp.app, username, "user", "Password1!");

    // 2. Set MFA policy to required
    await db
      .insert(schema.settings)
      .values({ key: "mfaPolicy", value: "required" })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: "required" } });

    try {
      // 3. Login again. Because MFA is required, this should trigger forced enrollment
      const loginRes = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username, password: "Password1!" },
      });

      const loginData = JSON.parse(loginRes.body);
      if (!loginData.requiresMfaEnrollment) {
        throw new Error("Expected requiresMfaEnrollment to be true, got body: " + loginRes.body);
      }
      const enrollmentToken = loginData.enrollmentToken;

      // 4. Admin deletes the user
      const delRes = await testApp.app.inject({
        method: "DELETE",
        url: `/api/auth/users/${userId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(delRes.statusCode).toBe(200);

      // 5. Try to complete the forced enrollment
      const totpCode = generateTotpCode(loginData.uri);
      const completeRes = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/mfa/enroll-complete",
        payload: { enrollmentToken, code: totpCode },
      });

      // Should be rejected gracefully with 401, not 500 TypeError
      expect(completeRes.statusCode).toBe(401);
      const completeBody = JSON.parse(completeRes.body);
      expect(completeBody.code).toBe("MFA_EXPIRED");
    } finally {
      await db
        .update(schema.settings)
        .set({ value: "optional" })
        .where(eq(schema.settings.key, "mfaPolicy"));
    }
  });

  it("keeps totpEnabled false and records MFA_VERIFY_FAILED if the password changes or is removed after the initial read on /mfa/enroll-complete (#2477)", async () => {
    const users = {
      password_changed: await createUserAndLogin(
        testApp.app,
        `mfaenrolldbr_chg_${Date.now()}`,
        "user",
        "Password1!",
      ),
      password_removed: await createUserAndLogin(
        testApp.app,
        `mfaenrolldbr_rm_${Date.now()}`,
        "user",
        "Password1!",
      ),
      insert_failure: await createUserAndLogin(
        testApp.app,
        `mfaenrolldbr_err_${Date.now()}`,
        "user",
        "Password1!",
      ),
    };

    await db
      .insert(schema.settings)
      .values({ key: "mfaPolicy", value: "required" })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: "required" } });

    try {
      for (const mode of ["password_changed", "password_removed"] as const) {
        const { userId } = users[mode];
        const [{ username }] = await db
          .select()
          .from(schema.users)
          .where(eq(schema.users.id, userId));
        const sessionsBefore = await db
          .select()
          .from(schema.sessions)
          .where(eq(schema.sessions.userId, userId));

        const loginRes = await testApp.app.inject({
          method: "POST",
          url: "/api/auth/login",
          payload: { username, password: "Password1!" },
        });
        const loginData = JSON.parse(loginRes.body);
        expect(loginData.requiresMfaEnrollment).toBe(true);

        const origTransaction = db.transaction.bind(db);
        const txSpy = vi
          .spyOn(db, "transaction")
          // biome-ignore lint/suspicious/noExplicitAny: wrap drizzle transaction to simulate concurrent password write after initial select
          .mockImplementationOnce((async (cb: any, config?: any) => {
            await db
              .update(schema.users)
              .set({
                passwordHash: mode === "password_changed" ? "rotated-hash-after-select" : null,
                updatedAt: new Date(),
              })
              .where(eq(schema.users.id, userId));
            return origTransaction(cb, config);
          }) as typeof db.transaction);

        try {
          const completeRes = await testApp.app.inject({
            method: "POST",
            url: "/api/auth/mfa/enroll-complete",
            payload: {
              enrollmentToken: loginData.enrollmentToken,
              code: generateTotpCode(loginData.uri),
            },
          });

          expect(completeRes.statusCode).toBe(401);
          expect(JSON.parse(completeRes.body).code).toBe("MFA_EXPIRED");
        } finally {
          txSpy.mockRestore();
        }

        // Enrollment did not complete, so totpEnabled must stay false and no session is minted.
        const [userAfter] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
        expect(userAfter.totpEnabled).toBe(false);

        const sessionsAfter = await db
          .select()
          .from(schema.sessions)
          .where(eq(schema.sessions.userId, userId));
        expect(sessionsAfter).toHaveLength(sessionsBefore.length);

        // And the rejection must emit MFA_VERIFY_FAILED with the specific reason and no MFA_ENROLLED.
        const auditRows = await db
          .select()
          .from(schema.auditLog)
          .where(eq(schema.auditLog.action, "MFA_VERIFY_FAILED"));
        const matchingAudit = auditRows.find((row) => {
          const details = row.details as {
            userId?: string;
            username?: string;
            reason?: string;
          } | null;
          return (
            details?.userId === userId && details?.username === username && details?.reason === mode
          );
        });
        expect(matchingAudit).toBeDefined();

        const enrolledRows = await db
          .select()
          .from(schema.auditLog)
          .where(eq(schema.auditLog.action, "MFA_ENROLLED"));
        const enrolledForUser = enrolledRows.find((row) => {
          const details = row.details as { userId?: string } | null;
          return details?.userId === userId;
        });
        expect(enrolledForUser).toBeUndefined();
      }

      // Also verify that if tx.insert(schema.sessions) throws after tx.update(schema.users),
      // the transaction rolls totpEnabled back to false.
      const { userId: errUserId } = users.insert_failure;
      const [{ username: errUsername }] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, errUserId));
      const errLoginRes = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: errUsername, password: "Password1!" },
      });
      const errLoginData = JSON.parse(errLoginRes.body);
      expect(errLoginData.requiresMfaEnrollment).toBe(true);

      const origTransaction = db.transaction.bind(db);
      const txErrSpy = vi
        .spyOn(db, "transaction")
        // biome-ignore lint/suspicious/noExplicitAny: wrap tx.insert to simulate session insert failure after tx.update
        .mockImplementationOnce((async (cb: any, config?: any) => {
          // biome-ignore lint/suspicious/noExplicitAny: pass wrapped tx into callback
          return origTransaction(async (tx: any) => {
            const proxyTx = new Proxy(tx, {
              get(target, prop, receiver) {
                if (prop === "insert") {
                  return () => ({
                    values: async () => {
                      throw new Error("simulated session insert failure");
                    },
                  });
                }
                return Reflect.get(target, prop, receiver);
              },
            });
            return cb(proxyTx);
          }, config);
        }) as typeof db.transaction);

      try {
        const errCompleteRes = await testApp.app.inject({
          method: "POST",
          url: "/api/auth/mfa/enroll-complete",
          payload: {
            enrollmentToken: errLoginData.enrollmentToken,
            code: generateTotpCode(errLoginData.uri),
          },
        });
        expect(errCompleteRes.statusCode).toBe(500);
      } finally {
        txErrSpy.mockRestore();
      }

      const [errUserAfter] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, errUserId));
      expect(errUserAfter.totpEnabled).toBe(false);
    } finally {
      await db
        .update(schema.settings)
        .set({ value: "optional" })
        .where(eq(schema.settings.key, "mfaPolicy"));
    }
  });
});
