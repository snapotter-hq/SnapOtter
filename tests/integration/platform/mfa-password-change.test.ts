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
    } finally {
      await db
        .update(schema.settings)
        .set({ value: "optional" })
        .where(eq(schema.settings.key, "mfaPolicy"));
    }
  });
});
