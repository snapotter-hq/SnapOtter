import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The main mfa-endpoints suite runs with the mfa feature licensed, so it can
// never exercise the enroll route's license gate. This file mirrors
// mfa-policy-license-gate.test.ts: an UNlicensed instance must reject the
// enroll (and every other MFA management) call with 403 FEATURE_NOT_LICENSED.
vi.resetModules();
const { mockNoEnterprise } = await import("../../helpers/enterprise-mock.js");
mockNoEnterprise();

const { buildTestApp, loginAsAdmin } = await import("../test-server.js");

import type { TestApp } from "../test-server.js";

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

describe("POST /api/auth/mfa/enroll (no mfa license)", () => {
  it("returns 401 without authentication (the auth guard runs first)", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/enroll",
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 FEATURE_NOT_LICENSED for an authenticated admin", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/enroll",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe("FEATURE_NOT_LICENSED");
  });

  it("does not create any pending enrollment when the gate rejects", async () => {
    await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/enroll",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    // The session view still reports MFA as not enrolled.
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).user.totpEnabled).toBe(false);
  });
});
