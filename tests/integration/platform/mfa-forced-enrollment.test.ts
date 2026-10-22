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
import { asc, eq } from "drizzle-orm";
import * as OTPAuth from "otpauth";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.resetModules();
const { mockEnterpriseFeatures } = await import("../../helpers/enterprise-mock.js");
mockEnterpriseFeatures(["mfa"]);

const { buildTestApp, createUserAndLogin } = await import("../test-server.js");
const { db, schema } = await import("../../../apps/api/src/db/index.js");
const { sharedRedis } = await import("../../../apps/api/src/jobs/connection.js");

import type { TestApp } from "../test-server.js";

let testApp: TestApp;

function generateTotpCode(uri: string, timestamp = Date.now()): string {
  const totp = OTPAuth.URI.parse(uri) as OTPAuth.TOTP;
  return totp.generate({ timestamp });
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
});

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

    // The session cookie is set too, like a password login: the form can lose
    // its localStorage copy of the token and the browser is still signed in (#2053).
    expect(String(completeRes.headers["set-cookie"])).toContain(`snapotter-session=${body.token}`);
    const cookieOnly = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      cookies: { "snapotter-session": body.token },
    });
    expect(cookieOnly.statusCode).toBe(200);

    // Logging in again is now the ordinary enrolled-user challenge, not another
    // forced enrollment.
    const nextLogin = await login(username, password);
    expect(nextLogin.statusCode).toBe(200);
    const nextBody = JSON.parse(nextLogin.body);
    expect(nextBody.requiresMfa).toBe(true);
    expect(nextBody.mfaToken).toBeDefined();
    expect(nextBody.requiresMfaEnrollment).toBeUndefined();
  });

  it("enroll-complete rejects an invalid code with 401 INVALID_CODE and burns the token with MFA_ATTEMPTS_EXHAUSTED on the 5th wrong attempt (#2019)", async () => {
    const { username, password } = await createUnenrolledUser();
    await setMfaPolicy("required");

    const loginRes = await login(username, password);
    const { enrollmentToken } = JSON.parse(loginRes.body);

    // First four wrong codes return 401 INVALID_CODE; the 5th burns the token
    // and answers 401 MFA_ATTEMPTS_EXHAUSTED.
    for (let i = 0; i < 4; i++) {
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

    const fifth = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/enroll-complete",
      payload: { enrollmentToken, code: "000000" },
    });
    const fifthBody = JSON.parse(fifth.body);
    expect(fifth.statusCode).toBe(401);
    expect(fifthBody.code).toBe("MFA_ATTEMPTS_EXHAUSTED");
    expect(fifthBody.token).toBeUndefined();

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

  it("enroll-complete returns 403 USER_DISABLED and burns the enrollment token when the user is disabled mid-enrollment (#2049)", async () => {
    const { username, password, userId } = await createUnenrolledUser();
    await setMfaPolicy("required");

    const loginRes = await login(username, password);
    expect(loginRes.statusCode).toBe(200);
    const { enrollmentToken, uri } = JSON.parse(loginRes.body);

    // Record one wrong attempt first so we can verify attemptsKey is cleaned up.
    const badRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/enroll-complete",
      payload: { enrollmentToken, code: "000000" },
    });
    expect(badRes.statusCode).toBe(401);
    expect(await sharedRedis().get(`mfa:enroll:attempts:${enrollmentToken}`)).toBe("1");

    await db
      .update(schema.users)
      .set({ role: "disabled", totpSecret: null, passwordHash: null })
      .where(eq(schema.users.id, userId));

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/enroll-complete",
      payload: { enrollmentToken, code: generateTotpCode(uri) },
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body)).toEqual({
      error: "User is disabled",
      code: "USER_DISABLED",
    });
    expect(await sharedRedis().get(`mfa:enroll:${enrollmentToken}`)).toBeNull();
    expect(await sharedRedis().get(`mfa:enroll:attempts:${enrollmentToken}`)).toBeNull();

    const auditRows = await db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "MFA_VERIFY_FAILED"));
    const disabledAudit = auditRows.find((row) => {
      const details = row.details as { userId?: string; reason?: string } | null;
      return details?.userId === userId && details?.reason === "disabled_user";
    });
    expect(disabledAudit).toBeDefined();

    const [dbUser] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    expect(dbUser.totpEnabled).toBe(false);

    // A second attempt finds the enrollment token already burned.
    const secondRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/enroll-complete",
      payload: { enrollmentToken, code: generateTotpCode(uri) },
    });
    expect(secondRes.statusCode).toBe(401);
    expect(JSON.parse(secondRes.body).code).toBe("MFA_EXPIRED");
  });

  it("enroll-complete returns 401 MFA_NOT_CONFIGURED and burns the enrollment token when the pending secret was cleared mid-enrollment (#2018)", async () => {
    const { username, password, userId } = await createUnenrolledUser();
    await setMfaPolicy("required");

    const loginRes = await login(username, password);
    expect(loginRes.statusCode).toBe(200);
    const { enrollmentToken, uri } = JSON.parse(loginRes.body);

    const badRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/enroll-complete",
      payload: { enrollmentToken, code: "000000" },
    });
    expect(badRes.statusCode).toBe(401);
    expect(await sharedRedis().get(`mfa:enroll:attempts:${enrollmentToken}`)).toBe("1");

    await db.update(schema.users).set({ totpSecret: null }).where(eq(schema.users.id, userId));

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/enroll-complete",
      payload: { enrollmentToken, code: generateTotpCode(uri) },
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).code).toBe("MFA_NOT_CONFIGURED");
    expect(await sharedRedis().get(`mfa:enroll:${enrollmentToken}`)).toBeNull();
    expect(await sharedRedis().get(`mfa:enroll:attempts:${enrollmentToken}`)).toBeNull();
  });

  it("enroll-complete accepts a TOTP typed with a space or dash, and refuses an empty code without costing an attempt (#2478)", async () => {
    const { username, password, userId } = await createUnenrolledUser();
    await setMfaPolicy("required");

    const loginRes = await login(username, password);
    const { enrollmentToken, uri } = JSON.parse(loginRes.body);

    for (const empty of [" ", "-", " - ", "--", "  ", "- -"]) {
      const res = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/mfa/enroll-complete",
        payload: { enrollmentToken, code: empty },
      });
      expect(res.statusCode, JSON.stringify(empty)).toBe(400);
      expect(JSON.parse(res.body).code).toBe("VALIDATION_ERROR");
    }

    const auditRows = await db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "MFA_VERIFY_FAILED"));
    const failedForUser = auditRows.find((row) => {
      const details = row.details as { userId?: string } | null;
      return details?.userId === userId;
    });
    expect(failedForUser).toBeUndefined();

    const code = generateTotpCode(uri);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/enroll-complete",
      payload: { enrollmentToken, code: ` ${code.slice(0, 3)}-${code.slice(3)} ` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).token).toBeDefined();
  });

  it("refuses replaying the TOTP step used on enroll-complete on a subsequent login challenge or disable (#2574)", async () => {
    const { username, password } = await createUnenrolledUser();
    await setMfaPolicy("required");

    const loginRes = await login(username, password);
    const { enrollmentToken, uri } = JSON.parse(loginRes.body);

    const remainingMs = OTPAuth.TOTP.remaining({ period: 30 });
    if (remainingMs < 5_000) {
      await new Promise((r) => setTimeout(r, remainingMs + 50));
    }
    const now = Date.now();
    const enrollCode = generateTotpCode(uri, now);
    const prevCode = generateTotpCode(uri, now - 30_000);
    const nextCode = generateTotpCode(uri, now + 30_000);

    const completeRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/enroll-complete",
      payload: { enrollmentToken, code: enrollCode },
    });
    expect(completeRes.statusCode).toBe(200);
    const { token: sessionToken } = JSON.parse(completeRes.body);

    // Open a login challenge for the now-enrolled user.
    const nextLoginRes = await login(username, password);
    expect(nextLoginRes.statusCode).toBe(200);
    const { mfaToken } = JSON.parse(nextLoginRes.body);

    // Replaying the enrollment code (or an earlier step in its window) on /mfa/complete is refused.
    const replayComplete = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/complete",
      payload: { mfaToken, code: enrollCode },
    });
    expect(replayComplete.statusCode).toBe(401);
    expect(JSON.parse(replayComplete.body).code).toBe("INVALID_CODE");

    const earlierComplete = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/complete",
      payload: { mfaToken, code: prevCode },
    });
    expect(earlierComplete.statusCode).toBe(401);
    expect(JSON.parse(earlierComplete.body).code).toBe("INVALID_CODE");

    // Replaying the enrollment code on /mfa/disable is also refused.
    const replayDisable = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/disable",
      headers: { authorization: `Bearer ${sessionToken}` },
      payload: { code: enrollCode },
    });
    expect(replayDisable.statusCode).toBe(401);
    expect(JSON.parse(replayDisable.body).code).toBe("INVALID_CODE");

    // Advancing to the next 30s step succeeds on /mfa/complete.
    const nextRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/complete",
      payload: { mfaToken, code: nextCode },
    });
    expect(nextRes.statusCode).toBe(200);
  });
});

describe("POST /api/auth/login MFA policy read failure (#815)", () => {
  // Faults only the mfaPolicy settings-table select while leaving other
  // settings reads and full-row selects untouched (#815, #2517).
  function breakSettingsReads() {
    const originalSelect = db.select.bind(db);
    return vi.spyOn(db, "select").mockImplementation((...args: unknown[]) => {
      const selection = args[0] as Record<string, unknown> | undefined;
      // biome-ignore lint/suspicious/noExplicitAny: passthrough to the real overloaded implementation
      const builder = (originalSelect as any)(...args);
      if (selection && "value" in selection) {
        const origFrom = builder.from.bind(builder);
        builder.from = (...fromArgs: unknown[]) => {
          const query = origFrom(...fromArgs);
          const origWhere = query.where.bind(query);
          query.where = (...whereArgs: unknown[]) => {
            const filtered = origWhere(...whereArgs);
            if (filtered.toSQL().params.includes("mfaPolicy")) {
              throw new Error("simulated settings store failure");
            }
            return filtered;
          };
          return query;
        };
      }
      return builder;
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

describe("POST /api/auth/mfa/enroll-complete maxSessionsPerUser enforcement (#2540)", () => {
  afterEach(async () => {
    await db.delete(schema.settings).where(eq(schema.settings.key, "maxSessionsPerUser"));
  });

  function breakMaxSessionsRead() {
    const originalSelect = db.select.bind(db);
    return vi.spyOn(db, "select").mockImplementation((...args: unknown[]) => {
      const selection = args[0] as Record<string, unknown> | undefined;
      // biome-ignore lint/suspicious/noExplicitAny: passthrough to the real overloaded implementation
      const builder = (originalSelect as any)(...args);
      if (selection && "value" in selection) {
        const origFrom = builder.from.bind(builder);
        builder.from = (...fromArgs: unknown[]) => {
          const query = origFrom(...fromArgs);
          const origWhere = query.where.bind(query);
          query.where = (...whereArgs: unknown[]) => {
            const filtered = origWhere(...whereArgs);
            if (filtered.toSQL().params.includes("maxSessionsPerUser")) {
              throw new Error("simulated settings store failure for maxSessionsPerUser");
            }
            return filtered;
          };
          return query;
        };
      }
      return builder;
    });
  }

  it("evicts the oldest session when forced enrollment completes past maxSessionsPerUser, and restores the challenge on settings or eviction failure", async () => {
    const { username, password, userId } = await createUnenrolledUser();
    // createUnenrolledUser already created 1 session via createUserAndLogin; seed an older one so count = 2.
    const t0 = randomUUID();
    await db.insert(schema.sessions).values({
      id: t0,
      userId,
      createdAt: new Date(Date.now() - 60_000),
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    const sessionsBefore = await db
      .select({ id: schema.sessions.id })
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, userId))
      .orderBy(asc(schema.sessions.createdAt));
    expect(sessionsBefore).toHaveLength(2);
    expect(sessionsBefore[0].id).toBe(t0);

    await setMfaPolicy("required");
    await db
      .insert(schema.settings)
      .values({ key: "maxSessionsPerUser", value: "2" })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: "2" } });

    const loginRes = await login(username, password);
    expect(loginRes.statusCode).toBe(200);
    const { enrollmentToken, uri } = JSON.parse(loginRes.body) as {
      enrollmentToken: string;
      uri: string;
    };

    const remainingMs = OTPAuth.TOTP.remaining({ period: 30 });
    if (remainingMs < 5_000) {
      await new Promise((r) => setTimeout(r, remainingMs + 50));
    }
    const code = generateTotpCode(uri);

    // 1. If reading maxSessionsPerUser fails, enroll-complete fails closed with 500
    // and keeps the enrollment challenge and TOTP step available for retry.
    const selectSpy = breakMaxSessionsRead();
    try {
      const failReadRes = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/mfa/enroll-complete",
        payload: { enrollmentToken, code },
      });
      expect(failReadRes.statusCode).toBe(500);
    } finally {
      selectSpy.mockRestore();
    }
    expect(await sharedRedis().get(`mfa:enroll:${enrollmentToken}`)).toBeTruthy();

    // 2. If FIFO eviction fails inside the transaction, both totpEnabled and the
    // new session roll back, and the enrollment challenge + TOTP step are restored.
    const realTransaction = db.transaction.bind(db) as (
      cb: (tx: object) => Promise<unknown>,
      config?: unknown,
    ) => Promise<unknown>;
    const txSpy = vi.spyOn(db, "transaction").mockImplementationOnce(((
      cb: (tx: object) => Promise<unknown>,
      config?: unknown,
    ) =>
      realTransaction((tx) => {
        const failingTx = new Proxy(tx, {
          get(target, prop, receiver) {
            if (prop === "delete") {
              return () => {
                throw new Error("simulated FIFO eviction delete failure");
              };
            }
            return Reflect.get(target, prop, receiver);
          },
        });
        return cb(failingTx);
      }, config)) as unknown as typeof db.transaction);
    try {
      const failEvictRes = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/mfa/enroll-complete",
        payload: { enrollmentToken, code },
      });
      expect(failEvictRes.statusCode).toBe(500);
    } finally {
      txSpy.mockRestore();
    }
    const [midUser] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    expect(midUser.totpEnabled).toBe(false);
    expect(await sharedRedis().get(`mfa:enroll:${enrollmentToken}`)).toBeTruthy();

    // 3. Normal retry succeeds, activates MFA, and evicts the oldest session (t0).
    const completeRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/enroll-complete",
      payload: { enrollmentToken, code },
    });
    expect(completeRes.statusCode).toBe(200);
    const { token: newToken } = JSON.parse(completeRes.body) as { token: string };

    const remaining = await db
      .select({ id: schema.sessions.id })
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, userId))
      .orderBy(asc(schema.sessions.createdAt));
    expect(remaining.map((r) => r.id)).toEqual([sessionsBefore[1].id, newToken]);
  });
});
