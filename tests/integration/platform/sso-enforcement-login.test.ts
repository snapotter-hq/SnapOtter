/**
 * SSO-enforcement login branch (auth.ts POST /api/auth/login).
 *
 * When `ssoEnforcement=true` AND the enterprise `sso_enforcement` feature is
 * licensed, local password login is refused for everyone except the
 * configured break-glass username. The refusal is indistinguishable from a
 * wrong password: same 401 body, counted by the same throttle, and no session
 * even when the password was right. The plain integration harness runs
 * unlicensed, so this branch is only reachable by mocking the enterprise
 * gate. Mirrors the enterprise-gated pattern in platform/saml-auth.test.ts:
 * hoist + vi.mock the gate so isFeatureEnabled("sso_enforcement") is true,
 * then import buildTestApp.
 */
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// License only sso_enforcement so the login route's enforcement branch fires.
vi.mock("@snapotter/enterprise", () => ({
  isFeatureEnabled: (f: string) => f === "sso_enforcement",
  getActiveLicense: () => ({
    org: "test-org",
    plan: "enterprise",
    features: ["sso_enforcement"],
    seats: 100,
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    issuedAt: new Date().toISOString(),
  }),
  initEnterprise: vi.fn(),
  loadS3Storage: vi.fn(),
  ENTERPRISE_FEATURES: ["sso_enforcement"],
  PLAN_FEATURES: { team: [], enterprise: ["sso_enforcement"] },
}));

import { db, schema } from "../../../apps/api/src/db/index.js";
import { buildTestApp, createUserAndLogin, loginAsAdmin, type TestApp } from "../test-server.js";

let testApp: TestApp;
let adminToken: string;

async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}

async function clearSetting(key: string): Promise<void> {
  await db.delete(schema.settings).where(eq(schema.settings.key, key));
}

// Local-password accounts that are not the break-glass one. Created (and
// logged in once) before any test turns enforcement on.
const LOCAL_USER = "sso-local-user";
const LOCAL_PASSWORD = "Localpass1";
const THROTTLE_USER = "sso-throttle-user";
const THROTTLE_PASSWORD = "Throttlepass1";

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
  await createUserAndLogin(testApp.app, LOCAL_USER, "user", LOCAL_PASSWORD);
  await createUserAndLogin(testApp.app, THROTTLE_USER, "user", THROTTLE_PASSWORD);
}, 30_000);

afterEach(async () => {
  await clearSetting("ssoEnforcement");
  await clearSetting("ssoBreakGlassUsername");
  await clearSetting("loginThrottleMaxFailures");
});

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

function login(username: string, password: string) {
  return testApp.app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username, password },
  });
}

async function sessionCount(username: string): Promise<number> {
  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.username, username));
  const rows = await db
    .select({ id: schema.sessions.id })
    .from(schema.sessions)
    .where(eq(schema.sessions.userId, user.id));
  return rows.length;
}

async function enforceWithBreakGlass(username: string): Promise<void> {
  await setSetting("ssoEnforcement", "true");
  await setSetting("ssoBreakGlassUsername", username);
}

describe("SSO enforcement at login (licensed)", () => {
  it("lets the configured break-glass username through to normal password auth", async () => {
    // Name the seeded admin as the break-glass account so it bypasses SSO.
    await enforceWithBreakGlass("admin");

    const res = await login("admin", "Adminpass1");

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).token).toBeTruthy();
  });

  it("refuses a non-break-glass user even with the right password, and starts no session", async () => {
    await enforceWithBreakGlass("breakglass-admin");
    const before = await sessionCount(LOCAL_USER);

    const res = await login(LOCAL_USER, LOCAL_PASSWORD);

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).token).toBeUndefined();
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(await sessionCount(LOCAL_USER)).toBe(before);
  });

  it("answers the break-glass, an existing and an unknown username the same way", async () => {
    await enforceWithBreakGlass("admin");

    // Enforcement is really on: the right password is refused for LOCAL_USER.
    expect((await login(LOCAL_USER, LOCAL_PASSWORD)).statusCode).toBe(401);

    const breakGlass = await login("admin", "WrongPass1");
    const existing = await login(LOCAL_USER, "WrongPass1");
    const refusedRight = await login(LOCAL_USER, LOCAL_PASSWORD);
    const unknown = await login("no-such-user-sso", "WrongPass1");

    expect(breakGlass.statusCode).toBe(401);
    for (const other of [existing, refusedRight, unknown]) {
      expect(other.statusCode).toBe(breakGlass.statusCode);
      expect(other.body).toBe(breakGlass.body);
    }
  });

  it("counts a refused login toward the throttle, right password or not", async () => {
    await enforceWithBreakGlass("admin");
    await setSetting("loginThrottleMaxFailures", "2");

    expect((await login(THROTTLE_USER, THROTTLE_PASSWORD)).statusCode).toBe(401);
    expect((await login(THROTTLE_USER, THROTTLE_PASSWORD)).statusCode).toBe(401);

    // The window is armed, so a third try is throttled instead of tested.
    expect((await login(THROTTLE_USER, THROTTLE_PASSWORD)).statusCode).toBe(429);
  });

  it("audits the refusal with its reason and the account id", async () => {
    await enforceWithBreakGlass("admin");
    await login(LOCAL_USER, LOCAL_PASSWORD);

    const audit = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/audit-log?action=LOGIN_FAILED&limit=100",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const entries = JSON.parse(audit.body).entries as Array<{
      details?: { username?: string; reason?: string; userId?: string };
    }>;
    const refused = entries.find(
      (e) => e.details?.username === LOCAL_USER && e.details?.reason === "sso_enforced",
    );

    expect(refused?.details?.userId).toBeTruthy();
  });

  it("does not start a TOTP challenge for a refused account", async () => {
    await enforceWithBreakGlass("admin");
    await db
      .update(schema.users)
      .set({ totpEnabled: true })
      .where(eq(schema.users.username, LOCAL_USER));
    try {
      const res = await login(LOCAL_USER, LOCAL_PASSWORD);

      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).mfaToken).toBeUndefined();
    } finally {
      await db
        .update(schema.users)
        .set({ totpEnabled: false })
        .where(eq(schema.users.username, LOCAL_USER));
    }
  });

  it("fails closed with a 500 and no session when the settings read fails", async () => {
    await enforceWithBreakGlass("admin");
    const before = await sessionCount(LOCAL_USER);

    // Same trick as the MFA policy test (#815): every { value } select throws.
    const originalSelect = db.select.bind(db);
    const spy = vi.spyOn(db, "select").mockImplementation((...args: unknown[]) => {
      const selection = args[0] as Record<string, unknown> | undefined;
      if (selection && "value" in selection) throw new Error("simulated settings store failure");
      // biome-ignore lint/suspicious/noExplicitAny: passthrough to the real overloaded implementation
      return (originalSelect as any)(...args);
    });
    try {
      const res = await login(LOCAL_USER, LOCAL_PASSWORD);

      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).token).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
    expect(await sessionCount(LOCAL_USER)).toBe(before);
  });
});
