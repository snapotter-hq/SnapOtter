import { eq } from "drizzle-orm";
import * as OTPAuth from "otpauth";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.resetModules();
const { mockEnterpriseFeatures } = await import("../../helpers/enterprise-mock.js");
mockEnterpriseFeatures(["mfa"]);

const { buildTestApp, createUserAndLogin } = await import("../test-server.js");
const { db, schema } = await import("../../../apps/api/src/db/index.js");
const { sharedRedis } = await import("../../../apps/api/src/jobs/connection.js");
const { verifyRecoveryCode, consumeTotpCode } = await import(
  "../../../apps/api/src/plugins/mfa.js"
);

import type { TestApp } from "../test-server.js";

function generateTotpCode(uri: string, timestamp = Date.now()): string {
  const totp = OTPAuth.URI.parse(uri) as OTPAuth.TOTP;
  return totp.generate({ timestamp });
}

async function generatePrevStepTotpCode(uri: string): Promise<string> {
  const remainingMs = OTPAuth.TOTP.remaining({ period: 30 });
  if (remainingMs < 2_000) {
    await new Promise((r) => setTimeout(r, remainingMs + 50));
  }
  return generateTotpCode(uri, Date.now() - 30_000);
}

describe("MFA Race Condition #2328", () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp();
  }, 30_000);

  afterEach(async () => {
    await db.delete(schema.settings).where(eq(schema.settings.key, "mfaPolicy"));
  });

  afterAll(async () => {
    if (testApp) {
      await testApp.cleanup();
    }
  }, 10_000);

  async function createEnrolledUser(): Promise<{
    userId: string;
    username: string;
    password: string;
    uri: string;
    recoveryCodes: string[];
  }> {
    const username = `mfarace_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const password = "Userpass1";
    const { userId, token: userToken } = await createUserAndLogin(
      testApp.app,
      username,
      "user",
      password,
    );

    const enrollRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/enroll",
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(enrollRes.statusCode).toBe(200);
    const { uri, recoveryCodes } = JSON.parse(enrollRes.body);

    const verifyRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/verify",
      headers: { authorization: `Bearer ${userToken}` },
      payload: { code: await generatePrevStepTotpCode(uri) },
    });
    expect(verifyRes.statusCode).toBe(200);

    return { userId, username, password, uri, recoveryCodes };
  }

  it("allows only one session when two /mfa/complete requests race with the same TOTP code", async () => {
    const { userId, username, password, uri } = await createEnrolledUser();

    const sessionsBefore = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, userId));

    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username, password },
    });
    expect(loginRes.statusCode).toBe(200);
    const { mfaToken, requiresMfa } = JSON.parse(loginRes.body);
    expect(requiresMfa).toBe(true);

    const code = generateTotpCode(uri);

    const [res1, res2] = await Promise.all([
      testApp.app.inject({
        method: "POST",
        url: "/api/auth/mfa/complete",
        payload: { mfaToken, code },
      }),
      testApp.app.inject({
        method: "POST",
        url: "/api/auth/mfa/complete",
        payload: { mfaToken, code },
      }),
    ]);

    expect([res1.statusCode, res2.statusCode].sort()).toEqual([200, 401]);
    const loser = res1.statusCode === 401 ? res1 : res2;
    expect(JSON.parse(loser.body).code).toBe("MFA_EXPIRED");

    const sessionsAfter = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, userId));
    expect(sessionsAfter).toHaveLength(sessionsBefore.length + 1);
  });

  it("spends only one recovery code and creates one session when two /mfa/complete requests race on one mfaToken with different recovery codes", async () => {
    const { userId, username, password, recoveryCodes } = await createEnrolledUser();

    const sessionsBefore = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, userId));

    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username, password },
    });
    const { mfaToken } = JSON.parse(loginRes.body);

    const [res1, res2] = await Promise.all([
      testApp.app.inject({
        method: "POST",
        url: "/api/auth/mfa/complete",
        payload: { mfaToken, code: recoveryCodes[0] },
      }),
      testApp.app.inject({
        method: "POST",
        url: "/api/auth/mfa/complete",
        payload: { mfaToken, code: recoveryCodes[1] },
      }),
    ]);

    expect([res1.statusCode, res2.statusCode].sort()).toEqual([200, 401]);
    const loser = res1.statusCode === 401 ? res1 : res2;
    expect(JSON.parse(loser.body).code).toBe("MFA_EXPIRED");

    const sessionsAfter = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, userId));
    expect(sessionsAfter).toHaveLength(sessionsBefore.length + 1);

    const [dbUser] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    const remaining = (dbUser.recoveryCodesHash ?? "").split(",").filter(Boolean);
    expect(remaining).toHaveLength(recoveryCodes.length - 1);

    const code0StillValid = verifyRecoveryCode(
      recoveryCodes[0],
      dbUser.recoveryCodesHash ?? "",
    ).valid;
    const code1StillValid = verifyRecoveryCode(
      recoveryCodes[1],
      dbUser.recoveryCodesHash ?? "",
    ).valid;
    expect(Number(code0StillValid) + Number(code1StillValid)).toBe(1);
  });

  it("checks at most 5 wrong guesses when concurrent /mfa/complete requests race on one mfaToken", async () => {
    const { username, password, uri } = await createEnrolledUser();

    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username, password },
    });
    const { mfaToken } = JSON.parse(loginRes.body);

    // Spend 4 of the 5 allowed wrong attempts first.
    for (let i = 0; i < 4; i++) {
      const bad = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/mfa/complete",
        payload: { mfaToken, code: "000000" },
      });
      expect(bad.statusCode).toBe(401);
      expect(JSON.parse(bad.body).code).toBe("INVALID_CODE");
    }

    // Now race 5 wrong guesses against the single remaining attempt.
    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, idx) =>
        testApp.app.inject({
          method: "POST",
          url: "/api/auth/mfa/complete",
          payload: { mfaToken, code: String(idx).padStart(6, "0") },
        }),
      ),
    );

    for (const res of responses) {
      expect(res.statusCode).toBe(401);
    }

    const codes = responses.map((res: { body: string }) => JSON.parse(res.body).code as string);
    const exhaustedCount = codes.filter((c: string) => c === "MFA_ATTEMPTS_EXHAUSTED").length;
    const expiredCount = codes.filter((c: string) => c === "MFA_EXPIRED").length;

    // Only 1 of the 5 racing guesses may be checked (bringing the total to 5
    // and exhausting the challenge); the other 4 must be rejected without being checked.
    expect(exhaustedCount).toBe(1);
    expect(expiredCount).toBe(4);
    expect(await sharedRedis().get(`mfa:attempts:${mfaToken}`)).toBeNull();

    // The challenge must now be burned even for the valid TOTP code.
    const afterRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/complete",
      payload: { mfaToken, code: generateTotpCode(uri) },
    });
    expect(afterRes.statusCode).toBe(401);
    expect(JSON.parse(afterRes.body).code).toBe("MFA_EXPIRED");
  });

  it("restores the challenge with its remaining TTL after wrong guesses and cleans up attemptsKey on success", async () => {
    const { username, password, uri } = await createEnrolledUser();

    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username, password },
    });
    const { mfaToken } = JSON.parse(loginRes.body);

    // Shrink the challenge TTL to 60s so we can verify failed attempts preserve
    // the remaining TTL rather than resetting it back to 300s.
    await sharedRedis().pexpire(`mfa:${mfaToken}`, 60_000);

    for (let i = 0; i < 3; i++) {
      const bad = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/mfa/complete",
        payload: { mfaToken, code: "000000" },
      });
      expect(bad.statusCode).toBe(401);
      expect(JSON.parse(bad.body).code).toBe("INVALID_CODE");
    }

    const pttlAfterFails = await sharedRedis().pttl(`mfa:${mfaToken}`);
    expect(pttlAfterFails).toBeGreaterThan(0);
    expect(pttlAfterFails).toBeLessThanOrEqual(60_000);
    expect(await sharedRedis().get(`mfa:attempts:${mfaToken}`)).toBe("3");

    const okRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/complete",
      payload: { mfaToken, code: generateTotpCode(uri) },
    });
    expect(okRes.statusCode).toBe(200);
    expect(await sharedRedis().get(`mfa:${mfaToken}`)).toBeNull();
    expect(await sharedRedis().get(`mfa:attempts:${mfaToken}`)).toBeNull();
  });

  it("restores the challenge without counting an attempt if a DB read throws mid-request", async () => {
    const { username, password, uri } = await createEnrolledUser();

    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username, password },
    });
    const { mfaToken } = JSON.parse(loginRes.body);

    const selectSpy = vi.spyOn(db, "select").mockImplementationOnce(() => {
      throw new Error("simulated transient DB error");
    });

    try {
      const errRes = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/mfa/complete",
        payload: { mfaToken, code: generateTotpCode(uri) },
      });
      expect(errRes.statusCode).toBe(500);
    } finally {
      selectSpy.mockRestore();
    }

    // The challenge must still be present in Redis so the user can retry.
    expect(await sharedRedis().get(`mfa:${mfaToken}`)).toBeTruthy();
    expect(await sharedRedis().get(`mfa:attempts:${mfaToken}`)).toBeNull();

    const retryRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/complete",
      payload: { mfaToken, code: generateTotpCode(uri) },
    });
    expect(retryRes.statusCode).toBe(200);
  });

  it("restores the challenge, preserves attemptsKey, and restores the prior TOTP step if db.transaction throws on /mfa/complete (#2575)", async () => {
    const remainingMs = OTPAuth.TOTP.remaining({ period: 30 });
    if (remainingMs < 5_000) {
      await new Promise((r) => setTimeout(r, remainingMs + 50));
    }
    const { userId, username, password, uri } = await createEnrolledUser();

    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username, password },
    });
    expect(loginRes.statusCode).toBe(200);
    const { mfaToken } = JSON.parse(loginRes.body);

    // Record 2 wrong attempts before the transient DB failure.
    for (let i = 0; i < 2; i++) {
      const bad = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/mfa/complete",
        payload: { mfaToken, code: "000000" },
      });
      expect(bad.statusCode).toBe(401);
      expect(JSON.parse(bad.body).code).toBe("INVALID_CODE");
    }
    expect(await sharedRedis().get(`mfa:attempts:${mfaToken}`)).toBe("2");

    const now = Date.now();
    const prevStepCode = generateTotpCode(uri, now - 30_000);
    const currentCode = generateTotpCode(uri, now);

    const txSpy = vi.spyOn(db, "transaction").mockImplementationOnce(() => {
      throw new Error("simulated transient session insert error");
    });

    try {
      const errRes = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/mfa/complete",
        payload: { mfaToken, code: currentCode },
      });
      expect(errRes.statusCode).toBe(500);
    } finally {
      txSpy.mockRestore();
    }

    // Both the challenge token and the failed-attempt count must survive the transient failure.
    expect(await sharedRedis().get(`mfa:${mfaToken}`)).toBeTruthy();
    expect(await sharedRedis().get(`mfa:attempts:${mfaToken}`)).toBe("2");

    // The prior step (consumed during /mfa/verify) must still be recorded as spent,
    // not wiped by a blanket DEL when rolling back the failed current step.
    const replayPrevRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/complete",
      payload: { mfaToken, code: prevStepCode },
    });
    expect(replayPrevRes.statusCode).toBe(401);
    expect(JSON.parse(replayPrevRes.body).code).toBe("INVALID_CODE");
    expect(await sharedRedis().get(`mfa:attempts:${mfaToken}`)).toBe("3");

    // Retrying with the same mfaToken and current-step TOTP code must succeed.
    const retryRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/complete",
      payload: { mfaToken, code: currentCode },
    });
    expect(retryRes.statusCode).toBe(200);
    expect(await sharedRedis().get(`mfa:${mfaToken}`)).toBeNull();
    expect(await sharedRedis().get(`mfa:attempts:${mfaToken}`)).toBeNull();

    // If a concurrent request advances the TOTP step to T+1 before a failing
    // transaction's rollback runs, restoreTotpStep must not clobber T+1 back to T.
    const loginRes2 = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username, password },
    });
    const { mfaToken: mfaToken2 } = JSON.parse(loginRes2.body);
    const parsedTotp = OTPAuth.URI.parse(uri) as OTPAuth.TOTP;
    const nextStepTs = now + 30_000;
    const futureStepTs = now + 60_000;
    const nextStepCode = generateTotpCode(uri, nextStepTs);
    const futureStepCode = generateTotpCode(uri, futureStepTs);

    const txAdvanceSpy = vi.spyOn(db, "transaction").mockImplementationOnce((async () => {
      // Simulate another request consuming step T+2 while step T+1's DB write is in flight.
      expect(
        await consumeTotpCode(userId, parsedTotp.secret.base32, futureStepCode, futureStepTs),
      ).toBe(true);
      throw new Error("simulated DB failure after concurrent step advance");
    }) as typeof db.transaction);

    try {
      const errRes2 = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/mfa/complete",
        payload: { mfaToken: mfaToken2, code: nextStepCode },
      });
      expect(errRes2.statusCode).toBe(500);
    } finally {
      txAdvanceSpy.mockRestore();
    }

    // Both T+1 and T+2 must remain blocked because T+2 superseded T+1 before rollback.
    expect(await consumeTotpCode(userId, parsedTotp.secret.base32, nextStepCode, nextStepTs)).toBe(
      false,
    );
    expect(
      await consumeTotpCode(userId, parsedTotp.secret.base32, futureStepCode, futureStepTs),
    ).toBe(false);
  });

  it("preserves the recovery code if db.transaction rolls back or aborts on password/role change on /mfa/complete (#2602)", async () => {
    const { userId, username, password, recoveryCodes } = await createEnrolledUser();
    const realTransaction = db.transaction.bind(db) as (
      cb: (tx: object) => Promise<unknown>,
      config?: unknown,
    ) => Promise<unknown>;

    const [initialUser] = await db
      .select({ passwordHash: schema.users.passwordHash, role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.id, userId));

    // 1. In-transaction aborts (password_changed, password_removed, user_disabled) burn the
    // challenge and clear attemptsKey without spending the recovery code.
    for (const abortCase of [
      {
        set: { passwordHash: "rotated-password-hash-mid-mfa" },
        expectedStatus: 401,
        expectedCode: "MFA_EXPIRED",
      },
      {
        set: { passwordHash: null },
        expectedStatus: 401,
        expectedCode: "MFA_EXPIRED",
      },
      {
        set: { role: "disabled:user" },
        expectedStatus: 403,
        expectedCode: "USER_DISABLED",
      },
    ] as const) {
      const loginRes = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username, password },
      });
      expect(loginRes.statusCode).toBe(200);
      const { mfaToken: abortToken } = JSON.parse(loginRes.body);

      const badRes = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/mfa/complete",
        payload: { mfaToken: abortToken, code: "000000" },
      });
      expect(badRes.statusCode).toBe(401);
      expect(await sharedRedis().get(`mfa:attempts:${abortToken}`)).toBe("1");

      const txAbortSpy = vi.spyOn(db, "transaction").mockImplementationOnce((async (
        cb: (tx: object) => Promise<unknown>,
        config?: unknown,
      ) => {
        await db
          .update(schema.users)
          .set({ ...abortCase.set, updatedAt: new Date() })
          .where(eq(schema.users.id, userId));
        return realTransaction(cb, config);
      }) as unknown as typeof db.transaction);

      try {
        const abortRes = await testApp.app.inject({
          method: "POST",
          url: "/api/auth/mfa/complete",
          payload: { mfaToken: abortToken, code: recoveryCodes[0] },
        });
        expect(abortRes.statusCode).toBe(abortCase.expectedStatus);
        expect(JSON.parse(abortRes.body).code).toBe(abortCase.expectedCode);
      } finally {
        txAbortSpy.mockRestore();
        await db
          .update(schema.users)
          .set({
            passwordHash: initialUser.passwordHash,
            role: initialUser.role,
            updatedAt: new Date(),
          })
          .where(eq(schema.users.id, userId));
      }

      expect(await sharedRedis().get(`mfa:${abortToken}`)).toBeNull();
      expect(await sharedRedis().get(`mfa:attempts:${abortToken}`)).toBeNull();
      const [afterAbortUser] = await db
        .select({ recoveryCodesHash: schema.users.recoveryCodesHash })
        .from(schema.users)
        .where(eq(schema.users.id, userId));
      expect(
        verifyRecoveryCode(recoveryCodes[0], afterAbortUser.recoveryCodesHash ?? "").valid,
      ).toBe(true);
    }

    // 2. Fault tx.insert inside db.transaction after recovery code update runs:
    // Postgres rolls back the recoveryCodesHash update and Redis restores the challenge
    // while preserving attemptsKey, so retrying the same mfaToken + recovery code succeeds.
    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username, password },
    });
    expect(loginRes.statusCode).toBe(200);
    const { mfaToken } = JSON.parse(loginRes.body);

    const badRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/complete",
      payload: { mfaToken, code: "000000" },
    });
    expect(badRes.statusCode).toBe(401);
    expect(await sharedRedis().get(`mfa:attempts:${mfaToken}`)).toBe("1");

    const txFailSpy = vi.spyOn(db, "transaction").mockImplementationOnce(((
      cb: (tx: object) => Promise<unknown>,
      config?: unknown,
    ) =>
      realTransaction((tx) => {
        const failingTx = new Proxy(tx, {
          get(target, prop, receiver) {
            if (prop === "insert") {
              return () => {
                throw new Error("simulated session insert failure after recovery code update");
              };
            }
            return Reflect.get(target, prop, receiver);
          },
        });
        return cb(failingTx);
      }, config)) as unknown as typeof db.transaction);

    try {
      const errRes = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/mfa/complete",
        payload: { mfaToken, code: recoveryCodes[0] },
      });
      expect(errRes.statusCode).toBe(500);
    } finally {
      txFailSpy.mockRestore();
    }

    expect(await sharedRedis().get(`mfa:${mfaToken}`)).toBeTruthy();
    expect(await sharedRedis().get(`mfa:attempts:${mfaToken}`)).toBe("1");
    const [afterRollbackUser] = await db
      .select({ recoveryCodesHash: schema.users.recoveryCodesHash })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    expect(
      verifyRecoveryCode(recoveryCodes[0], afterRollbackUser.recoveryCodesHash ?? "").valid,
    ).toBe(true);

    // 3. Direct retry with the same mfaToken and the same recovery code succeeds and spends it.
    const retryRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/complete",
      payload: { mfaToken, code: recoveryCodes[0] },
    });
    expect(retryRes.statusCode).toBe(200);
    expect(await sharedRedis().get(`mfa:${mfaToken}`)).toBeNull();
    expect(await sharedRedis().get(`mfa:attempts:${mfaToken}`)).toBeNull();
    const [afterSuccessUser] = await db
      .select({ recoveryCodesHash: schema.users.recoveryCodesHash })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    expect(
      verifyRecoveryCode(recoveryCodes[0], afterSuccessUser.recoveryCodesHash ?? "").valid,
    ).toBe(false);
    expect(
      verifyRecoveryCode(recoveryCodes[1], afterSuccessUser.recoveryCodesHash ?? "").valid,
    ).toBe(true);
  });

  it("allows only one session and caps concurrent wrong guesses on /mfa/enroll-complete", async () => {
    const username = `mfaenrollrace_${Date.now()}`;
    const password = "Userpass1";
    const { userId } = await createUserAndLogin(testApp.app, username, "user", password);

    const sessionsBefore = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, userId));

    await db
      .insert(schema.settings)
      .values({ key: "mfaPolicy", value: "required" })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: "required" } });

    // 1. Concurrent wrong guesses on the final attempt of enroll-complete check only 1 code.
    const loginRes1 = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username, password },
    });
    const { enrollmentToken: token1 } = JSON.parse(loginRes1.body);

    for (let i = 0; i < 4; i++) {
      const bad = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/mfa/enroll-complete",
        payload: { enrollmentToken: token1, code: "000000" },
      });
      expect(bad.statusCode).toBe(401);
      expect(JSON.parse(bad.body).code).toBe("INVALID_CODE");
    }

    const badResponses = await Promise.all(
      Array.from({ length: 5 }, () =>
        testApp.app.inject({
          method: "POST",
          url: "/api/auth/mfa/enroll-complete",
          payload: { enrollmentToken: token1, code: "000000" },
        }),
      ),
    );
    const badCodes = badResponses.map(
      (res: { body: string }) => JSON.parse(res.body).code as string,
    );
    expect(badCodes.filter((c: string) => c === "MFA_ATTEMPTS_EXHAUSTED").length).toBe(1);
    expect(badCodes.filter((c: string) => c === "MFA_EXPIRED").length).toBe(4);

    // 2. Concurrent valid TOTP codes on enroll-complete mint only one session.
    const loginRes2 = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username, password },
    });
    const { enrollmentToken: token2, uri } = JSON.parse(loginRes2.body);
    const validCode = generateTotpCode(uri);

    const [ok1, ok2] = await Promise.all([
      testApp.app.inject({
        method: "POST",
        url: "/api/auth/mfa/enroll-complete",
        payload: { enrollmentToken: token2, code: validCode },
      }),
      testApp.app.inject({
        method: "POST",
        url: "/api/auth/mfa/enroll-complete",
        payload: { enrollmentToken: token2, code: validCode },
      }),
    ]);

    expect([ok1.statusCode, ok2.statusCode].sort()).toEqual([200, 401]);
    const loser = ok1.statusCode === 401 ? ok1 : ok2;
    expect(JSON.parse(loser.body).code).toBe("MFA_EXPIRED");

    const sessionsAfter = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, userId));
    expect(sessionsAfter).toHaveLength(sessionsBefore.length + 1);
  });
});
