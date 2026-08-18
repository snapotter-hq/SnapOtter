/**
 * Forced TOTP enrollment at login (snapotter-hq/SnapOtter#811).
 *
 * Before the fix, a user under an MFA-required policy who had never enrolled
 * TOTP got a hard `403 MFA_ENROLLMENT_REQUIRED` from `POST /api/auth/login`
 * with no session, and the enrollment UI needs a session, so they were
 * stranded. On a LICENSED instance we now walk them through enrollment right
 * at login: login hands back an enrollment token + secret + recovery codes,
 * and a not-session-gated `POST /api/auth/mfa/enroll-complete` confirms a real
 * TOTP code and mints the session.
 *
 * This file covers the licensed path end to end with real TOTP codes. The
 * unlicensed path (still a 403) lives in the sibling
 * `mfa-forced-enrollment-unlicensed.test.ts`, which must not load the
 * enterprise mock, since the mock is per-file all-or-nothing.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import * as OTPAuth from "otpauth";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.resetModules();
const { mockEnterpriseFeatures } = await import("../../helpers/enterprise-mock.js");
mockEnterpriseFeatures(["mfa"]);

const { buildTestApp, createUserAndLogin } = await import("../test-server.js");
const { db, schema } = await import("../../../apps/api/src/db/index.js");

import type { TestApp } from "../test-server.js";

let testApp: TestApp;

function generateTotpCode(uri: string): string {
  const totp = OTPAuth.URI.parse(uri) as OTPAuth.TOTP;
  return totp.generate();
}

async function setMfaPolicy(value: "optional" | "admins_only" | "required"): Promise<void> {
  await db
    .insert(schema.settings)
    .values({ key: "mfaPolicy", value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}

// Register a fresh unenrolled user with a known password and clear the
// first-login password-change gate so login reaches the MFA decision.
async function createUnenrolledUser(
  role = "user",
): Promise<{ username: string; password: string; userId: string }> {
  const username = `mfa_forced_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const password = "Userpass1";
  const { userId } = await createUserAndLogin(testApp.app, username, role, password);
  return { username, password, userId };
}

async function login(username: string, password: string) {
  return testApp.app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username, password },
  });
}

beforeAll(async () => {
  testApp = await buildTestApp();
}, 30_000);

afterEach(async () => {
  // Never let a required policy bleed into sibling tests in the fork.
  await db.delete(schema.settings).where(eq(schema.settings.key, "mfaPolicy"));
});

afterAll(async () => {
  await db.delete(schema.settings).where(eq(schema.settings.key, "mfaPolicy"));
  await testApp.cleanup();
}, 10_000);

describe("POST /api/auth/login forced enrollment (licensed)", () => {
  it("returns 200 requiresMfaEnrollment with a token, uri, and recovery codes for an unenrolled user under a required policy", async () => {
    const { username, password, userId } = await createUnenrolledUser();
    await setMfaPolicy("required");

    const res = await login(username, password);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.requiresMfaEnrollment).toBe(true);
    expect(typeof body.enrollmentToken).toBe("string");
    expect(body.enrollmentToken.length).toBeGreaterThan(0);
    expect(body.uri).toContain("otpauth://totp/");
    expect(Array.isArray(body.recoveryCodes)).toBe(true);
    expect(body.recoveryCodes.length).toBeGreaterThan(0);
    // No session was handed out yet; that only happens after enroll-complete.
    expect(body.token).toBeUndefined();

    // A real pending secret now sits on the row, still inactive.
    const [dbUser] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    expect(dbUser.totpSecret).toBeTruthy();
    expect(dbUser.totpEnabled).toBe(false);
  });

  it("enroll-complete with a valid TOTP code activates MFA and mints a session, and the next login is a normal MFA challenge", async () => {
    const { username, password, userId } = await createUnenrolledUser();
    await setMfaPolicy("required");

    const loginRes = await login(username, password);
    const { enrollmentToken, uri } = JSON.parse(loginRes.body);

    const completeRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/enroll-complete",
      payload: { enrollmentToken, code: generateTotpCode(uri) },
    });
    expect(completeRes.statusCode).toBe(200);
    const body = JSON.parse(completeRes.body);
    expect(typeof body.token).toBe("string");
    expect(body.user.username).toBe(username);
    expect(body.expiresAt).toBeDefined();

    // MFA is now genuinely active.
    const [dbUser] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    expect(dbUser.totpEnabled).toBe(true);

    // The session token is real: it authenticates a session lookup.
    const sessionRes = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${body.token}` },
    });
    expect(sessionRes.statusCode).toBe(200);

    // Logging in again is now the ordinary enrolled-user challenge, not another
    // forced enrollment.
    const nextLogin = await login(username, password);
    expect(nextLogin.statusCode).toBe(200);
    const nextBody = JSON.parse(nextLogin.body);
    expect(nextBody.requiresMfa).toBe(true);
    expect(nextBody.mfaToken).toBeDefined();
    expect(nextBody.requiresMfaEnrollment).toBeUndefined();
  });

  it("enroll-complete rejects an invalid code with 401 INVALID_CODE and burns the token after 5 wrong attempts", async () => {
    const { username, password } = await createUnenrolledUser();
    await setMfaPolicy("required");

    const loginRes = await login(username, password);
    const { enrollmentToken } = JSON.parse(loginRes.body);

    // Five wrong codes, each a 401 INVALID_CODE.
    for (let i = 0; i < 5; i++) {
      const bad = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/mfa/enroll-complete",
        payload: { enrollmentToken, code: "000000" },
      });
      const badBody = JSON.parse(bad.body);
      expect(bad.statusCode).toBe(401);
      expect(badBody.code).toBe("INVALID_CODE");
      expect(badBody.token).toBeUndefined();
    }

    // The 6th attempt finds a burned token: it now reads as expired.
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/enroll-complete",
      payload: { enrollmentToken, code: "000000" },
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).code).toBe("MFA_EXPIRED");
  });

  it("enroll-complete with an unknown enrollment token returns 401 MFA_EXPIRED", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/enroll-complete",
      // Valid uuid shape so Zod passes, but no Redis entry backs it.
      payload: { enrollmentToken: randomUUID(), code: "123456" },
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).code).toBe("MFA_EXPIRED");
  });

  it("enroll-complete with a non-uuid token returns 400", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/enroll-complete",
      payload: { enrollmentToken: "not-a-uuid", code: "123456" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /api/auth/login MFA policy read failure (#815)", () => {
  // Makes every settings-style select ({ value: ... } selection) throw while
  // leaving full-row selects (users, sessions) untouched. getSettingString /
  // getSettingNumber callers swallow the error internally and fall back to
  // their defaults, so the only reader this breaks is the strict MFA policy
  // read, which must NOT swallow it (#815).
  function breakSettingsReads() {
    const originalSelect = db.select.bind(db);
    return vi.spyOn(db, "select").mockImplementation((...args: unknown[]) => {
      const selection = args[0] as Record<string, unknown> | undefined;
      if (selection && "value" in selection) {
        throw new Error("simulated settings store failure");
      }
      // biome-ignore lint/suspicious/noExplicitAny: passthrough to the real overloaded implementation
      return (originalSelect as any)(...args);
    });
  }

  it("fails closed with 503 MFA_POLICY_UNAVAILABLE for an unenrolled user when the policy read throws", async () => {
    const { username, password, userId } = await createUnenrolledUser();
    await setMfaPolicy("required");
    const sessionsBefore = (
      await db.select().from(schema.sessions).where(eq(schema.sessions.userId, userId))
    ).length;

    const selectSpy = breakSettingsReads();
    try {
      const res = await login(username, password);

      // Must NOT hand out a session, an enrollment, or a challenge: the
      // stored policy may well be "required", so a failed read denies with a
      // distinct retryable code instead of waving the user through.
      expect(res.statusCode).toBe(503);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("MFA_POLICY_UNAVAILABLE");
      expect(body.token).toBeUndefined();
      expect(body.requiresMfa).toBeUndefined();
      expect(body.requiresMfaEnrollment).toBeUndefined();
    } finally {
      selectSpy.mockRestore();
    }

    const sessionsAfter = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, userId));
    expect(sessionsAfter.length).toBe(sessionsBefore);

    // The deny is auditable: audit writes are inserts, so they survive the
    // broken settings reads.
    const auditRows = await db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "LOGIN_FAILED"));
    const denyRow = auditRows.find((row) => {
      const details = row.details as { username?: string; reason?: string } | null;
      return details?.username === username && details?.reason === "mfa_policy_unavailable";
    });
    expect(denyRow).toBeDefined();
  });

  it("still challenges an enrolled user when the policy read throws (no admin lockout)", async () => {
    const { username, password } = await createUnenrolledUser("admin");
    await setMfaPolicy("required");

    // Enroll for real via the forced-enrollment flow, before breaking reads.
    const firstLogin = await login(username, password);
    const { enrollmentToken, uri } = JSON.parse(firstLogin.body);
    const completeRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/enroll-complete",
      payload: { enrollmentToken, code: generateTotpCode(uri) },
    });
    expect(completeRes.statusCode).toBe(200);

    const selectSpy = breakSettingsReads();
    try {
      const res = await login(username, password);

      // The TOTP challenge is at least as strict as any policy, so a broken
      // policy read must not turn into a lockout for enrolled users.
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.requiresMfa).toBe(true);
      expect(body.mfaToken).toBeDefined();
      expect(body.token).toBeUndefined();
    } finally {
      selectSpy.mockRestore();
    }
  });
});
