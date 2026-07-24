/**
 * SSO-enforcement login branch (auth.ts POST /api/auth/login).
 *
 * When `ssoEnforcement=true` AND the enterprise `sso_enforcement` feature is
 * licensed, local password login is blocked (403 SSO_ENFORCED) for everyone
 * except the configured break-glass username. The plain integration harness
 * runs unlicensed, so this branch is only reachable by mocking the enterprise
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
import { buildTestApp, type TestApp } from "../test-server.js";

let testApp: TestApp;

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
}, 30_000);

afterEach(async () => {
  await clearSetting("ssoEnforcement");
  await clearSetting("ssoBreakGlassUsername");
});

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

describe("SSO enforcement at login (licensed)", () => {
  it("blocks local password login with 403 SSO_ENFORCED for a non-break-glass user", async () => {
    await setSetting("ssoEnforcement", "true");
    await setSetting("ssoBreakGlassUsername", "breakglass-admin");

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      // Real admin credentials; enforcement fires before the password check.
      payload: { username: "admin", password: "Adminpass1" },
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe("SSO_ENFORCED");
  });

  it("lets the configured break-glass username through to normal password auth", async () => {
    await setSetting("ssoEnforcement", "true");
    // Name the seeded admin as the break-glass account so it bypasses SSO.
    await setSetting("ssoBreakGlassUsername", "admin");

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "Adminpass1" },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).token).toBeTruthy();
  });

  it("does not enforce when the break-glass user submits a wrong password (still reaches 401)", async () => {
    await setSetting("ssoEnforcement", "true");
    await setSetting("ssoBreakGlassUsername", "admin");

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "WrongPass1" },
    });

    // Break-glass bypasses SSO enforcement, then fails the normal check with 401
    // (not 403), proving the branch fell through rather than short-circuiting.
    expect(res.statusCode).toBe(401);
  });
});
