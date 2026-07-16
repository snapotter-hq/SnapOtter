import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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

describe("PUT /api/v1/settings mfaPolicy (no mfa license)", () => {
  it("rejects admins_only when mfa is not licensed", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { mfaPolicy: "admins_only" },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.code).toBe("FEATURE_NOT_LICENSED");
  });

  it("rejects required when mfa is not licensed", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { mfaPolicy: "required" },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.code).toBe("FEATURE_NOT_LICENSED");
  });

  it("does not persist the rejected value", async () => {
    await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { mfaPolicy: "required" },
    });

    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/settings/mfaPolicy",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("still allows setting mfaPolicy back to optional", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { mfaPolicy: "optional" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("does not block unrelated settings in the same request", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { mfaPolicy: "required", sessionIdleTimeoutMinutes: "30" },
    });
    expect(res.statusCode).toBe(403);

    const check = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/settings/sessionIdleTimeoutMinutes",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(check.statusCode).toBe(404);
  });
});
