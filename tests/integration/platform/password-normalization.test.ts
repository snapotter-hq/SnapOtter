/**
 * Passwords are compared as Unicode text, not as the bytes one keyboard happened to
 * produce (#2056). A password is normalized (NFKC) when it is set; on sign-in the
 * normalized form is tried first, then the text as typed, which is how a hash made
 * before this change (from the raw text) still verifies and gets upgraded.
 */

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const scrypts = vi.hoisted(() => ({ calls: 0 }));
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return {
    ...actual,
    scrypt: ((...args: unknown[]) => {
      scrypts.calls++;
      return (actual.scrypt as (...a: unknown[]) => unknown)(...args);
    }) as typeof actual.scrypt,
  };
});

import { db, schema } from "../../../apps/api/src/db/index.js";
import { hashPassword } from "../../../apps/api/src/plugins/auth.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

let testApp: TestApp;
let adminToken: string;

const uid = () => `norm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

// The Cyrillic short i and io, as one code point each (NFC) and as a base letter plus a combining mark (NFD).
const COMPOSED = "Пароль-\u0439\u0451лка1";
const DECOMPOSED = "Пароль-\u0438\u0306\u0435\u0308лка1";

async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}

async function clearSetting(key: string): Promise<void> {
  await db.delete(schema.settings).where(eq(schema.settings.key, key));
}

beforeAll(async () => {
  testApp = await buildTestApp();
  // Keep the per-username failed-login throttle (#820) out of the way of the wrong-password cases.
  await setSetting("loginThrottleMaxFailures", "100000");
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await clearSetting("loginThrottleMaxFailures");
  await testApp.cleanup();
}, 10_000);

/** Register a user through the API (so the password is hashed the way production does). */
async function registerUser(password: string): Promise<string> {
  const username = uid();
  const res = await testApp.app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { username, password },
  });
  if (res.statusCode !== 201) throw new Error(`register failed: ${res.statusCode} ${res.body}`);
  await db
    .update(schema.users)
    .set({ mustChangePassword: false })
    .where(eq(schema.users.username, username));
  return username;
}

/** A user whose hash was made the old way, from the raw text, as every pre-#2056 account is. */
async function legacyUser(rawPassword: string): Promise<string> {
  const username = uid();
  await db.insert(schema.users).values({
    id: randomBytes(8).toString("hex"),
    username,
    passwordHash: await hashPassword(rawPassword),
    role: "user",
    mustChangePassword: false,
    authProvider: "local",
  });
  return username;
}

async function login(username: string, password: string) {
  const res = await testApp.app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username, password },
  });
  return { status: res.statusCode, token: (JSON.parse(res.body).token as string) ?? "" };
}

async function storedHash(username: string): Promise<string> {
  const [row] = await db
    .select({ hash: schema.users.passwordHash })
    .from(schema.users)
    .where(eq(schema.users.username, username));
  return row.hash ?? "";
}

describe("a password set on one keyboard works from another", () => {
  it("accepts the decomposed spelling of a password set composed", async () => {
    const username = await registerUser(COMPOSED);

    expect((await login(username, COMPOSED)).status).toBe(200);
    expect((await login(username, DECOMPOSED)).status).toBe(200);
  });

  it("accepts the composed spelling of a password set decomposed", async () => {
    const username = await registerUser(DECOMPOSED);

    expect((await login(username, COMPOSED)).status).toBe(200);
    expect((await login(username, DECOMPOSED)).status).toBe(200);
  });

  it("treats fullwidth and ASCII spellings as one password (NFKC)", async () => {
    const username = await registerUser("\uff30\uff41\uff53\uff53\uff57\uff4f\uff52\uff44\uff11");

    expect((await login(username, "Password1")).status).toBe(200);
    expect(
      (await login(username, "\uff30\uff41\uff53\uff53\uff57\uff4f\uff52\uff44\uff11")).status,
    ).toBe(200);
  });

  it("still rejects a different password", async () => {
    const username = await registerUser(COMPOSED);

    expect((await login(username, `${COMPOSED}x`)).status).toBe(401);
    expect((await login(username, "Пароль-\u0439\u0451лка2")).status).toBe(401);
  });

  it("judges the character classes on the normalized text", async () => {
    // A superscript two is not a digit, but it is the digit 2 once normalized.
    const username = await registerUser("Abcdefg\u00b2");

    expect((await login(username, "Abcdefg\u00b2")).status).toBe(200);
    expect((await login(username, "Abcdefg2")).status).toBe(200);
  });

  describe("the minimum length", () => {
    async function register(password: string) {
      return testApp.app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { username: uid(), password },
      });
    }

    it("is not met by a character that expands when normalized", async () => {
      // U+FDFA is one character and eighteen once normalized.
      const res = await register("\ufdfaAa1");

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body)).toMatchObject({ rule: "minLength", minLength: 8 });
    });

    it("counts a letter typed as a base plus a combining mark as one character", async () => {
      const composedLength = [...COMPOSED].length;
      expect([...DECOMPOSED].length).toBeGreaterThan(composedLength);
      await setSetting("passwordMinLength", String(composedLength + 1));
      try {
        expect((await register(COMPOSED)).statusCode).toBe(400);
        // Two combining marks must not push it over the line.
        expect((await register(DECOMPOSED)).statusCode).toBe(400);
      } finally {
        await clearSetting("passwordMinLength");
      }
      await setSetting("passwordMinLength", String(composedLength));
      try {
        expect((await register(DECOMPOSED)).statusCode).toBe(201);
      } finally {
        await clearSetting("passwordMinLength");
      }
    });
  });
});

describe("change-password", () => {
  it("accepts the current password in either spelling and stores the new one normalized", async () => {
    const username = await registerUser(COMPOSED);
    const { token } = await login(username, DECOMPOSED);

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/change-password",
      headers: { authorization: `Bearer ${token}` },
      payload: { currentPassword: DECOMPOSED, newPassword: "Nouveau-\u0438\u0306\u0435\u0308-9" },
    });
    expect(res.statusCode).toBe(200);

    expect((await login(username, "Nouveau-\u0439\u0451-9")).status).toBe(200);
    expect((await login(username, "Nouveau-\u0438\u0306\u0435\u0308-9")).status).toBe(200);
    expect((await login(username, COMPOSED)).status).toBe(401);
  });
});

describe("reset-password", () => {
  it("stores what an admin sets in normalized form", async () => {
    const username = await registerUser("Initial-pass-1");
    const [row] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.username, username));

    const res = await testApp.app.inject({
      method: "POST",
      url: `/api/auth/users/${row.id}/reset-password`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { newPassword: DECOMPOSED },
    });
    expect(res.statusCode).toBe(200);
    await db
      .update(schema.users)
      .set({ mustChangePassword: false })
      .where(eq(schema.users.username, username));

    expect((await login(username, COMPOSED)).status).toBe(200);
    expect((await login(username, DECOMPOSED)).status).toBe(200);
  });
});

describe("a hash made before normalization", () => {
  it("still signs in with the text it was made from, and is upgraded to the normalized form", async () => {
    const username = await legacyUser(DECOMPOSED);
    const before = await storedHash(username);

    expect((await login(username, DECOMPOSED)).status).toBe(200);

    expect(await storedHash(username)).not.toBe(before);
    // After the upgrade the other spelling works too, and so does the original one.
    expect((await login(username, COMPOSED)).status).toBe(200);
    expect((await login(username, DECOMPOSED)).status).toBe(200);
  });

  it("leaves the hash alone when the password was wrong", async () => {
    const username = await legacyUser(DECOMPOSED);
    const before = await storedHash(username);

    expect((await login(username, `${DECOMPOSED}x`)).status).toBe(401);

    expect(await storedHash(username)).toBe(before);
  });

  it("does not rewrite the hash of an ASCII password", async () => {
    const username = await legacyUser("Plain-ascii-1");
    const before = await storedHash(username);

    expect((await login(username, "Plain-ascii-1")).status).toBe(200);

    expect(await storedHash(username)).toBe(before);
  });

  it("is still checked as the current password by change-password", async () => {
    const username = await legacyUser(DECOMPOSED);
    // A session that predates the upgrade: sign in, then put the old hash back, so
    // change-password has to find the password through the raw-text fallback.
    const { token } = await login(username, DECOMPOSED);
    await db
      .update(schema.users)
      .set({ passwordHash: await hashPassword(DECOMPOSED) })
      .where(eq(schema.users.username, username));
    const before = scrypts.calls;

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/change-password",
      headers: { authorization: `Bearer ${token}` },
      payload: { currentPassword: DECOMPOSED, newPassword: "Brand-new-pass-1" },
    });

    expect(res.statusCode).toBe(200);
    // Two checks of the current password (normalized, then as typed) plus one hash of the new one.
    expect(scrypts.calls - before).toBe(3);
  });
});

describe("a wrong password costs the same for a real and an unknown user", () => {
  // A miss on an unknown user pays scrypt against a dummy hash so response time does not
  // reveal whether the username exists. Trying a second spelling must not break that.
  // The dummy hash an unknown user is checked against is built on first use; do that
  // before counting, or the first unknown-user login would show an extra computation.
  beforeAll(async () => {
    await login(uid(), "Warm-up-1");
  });

  async function scryptRuns(username: string, password: string): Promise<number> {
    const before = scrypts.calls;
    expect((await login(username, password)).status).toBe(401);
    return scrypts.calls - before;
  }

  it.each([
    ["an ASCII password", "Wrong-ascii-1"],
    ["a password that differs from its normalization", `${DECOMPOSED}-wrong`],
  ])("runs the same number of scrypt computations for %s", async (_label, wrong) => {
    const real = await registerUser("Right-ascii-1");
    const unknown = uid();

    expect(await scryptRuns(unknown, wrong)).toBe(await scryptRuns(real, wrong));
  });

  it("runs two for a password that needs a second try, and one when it does not", async () => {
    const real = await registerUser("Right-ascii-2");

    expect(await scryptRuns(real, "Wrong-ascii-2")).toBe(1);
    expect(await scryptRuns(real, `${DECOMPOSED}-wrong`)).toBe(2);
  });
});
