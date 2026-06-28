import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import {
  __resetGateForTests,
  refreshAnalyticsGate,
} from "../../../apps/api/src/lib/analytics-gate.js";
import { buildTestApp, loginAsAdmin, loginAsUser, type TestApp } from "../test-server.js";

let testApp: TestApp;

beforeAll(async () => {
  testApp = await buildTestApp();
});

afterAll(async () => {
  await testApp.cleanup();
});

// The analytics gate is a module-level singleton and `bakedEnabled()` reads
// `process.env` live, so every test that mutates either must leave a clean slate
// for the next one. Reset after each test: clear the persisted opt-out row, drop
// the non-production bake override, and reset the in-memory gate cache.
afterEach(async () => {
  await db.delete(schema.settings).where(eq(schema.settings.key, "analyticsEnabled"));
  delete process.env.ANALYTICS_BAKED_OVERRIDE;
  __resetGateForTests();
});

describe("GET /api/v1/config/analytics", () => {
  it("returns 200 without auth (public endpoint)", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/config/analytics",
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns correct AnalyticsConfig shape", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/config/analytics",
    });
    const config = JSON.parse(res.body);

    expect(config).toHaveProperty("enabled");
    expect(config).toHaveProperty("posthogApiKey");
    expect(config).toHaveProperty("posthogHost");
    expect(config).toHaveProperty("sentryDsn");
    expect(config).toHaveProperty("sampleRate");
    expect(config).toHaveProperty("instanceId");

    expect(typeof config.enabled).toBe("boolean");
    expect(typeof config.posthogApiKey).toBe("string");
    expect(typeof config.posthogHost).toBe("string");
    expect(typeof config.sentryDsn).toBe("string");
    expect(typeof config.sampleRate).toBe("number");
    expect(typeof config.instanceId).toBe("string");
  });

  it("instanceId is consistent across requests", async () => {
    const res1 = await testApp.app.inject({ method: "GET", url: "/api/v1/config/analytics" });
    const res2 = await testApp.app.inject({ method: "GET", url: "/api/v1/config/analytics" });
    const c1 = JSON.parse(res1.body);
    const c2 = JSON.parse(res2.body);
    // When analytics is disabled both return "" -- still consistent.
    expect(c1.instanceId).toBe(c2.instanceId);
  });

  it("default (bake off): effective state is disabled and secrets are blanked", async () => {
    // The committed bake is OFF and no override is set, so the effective gate is
    // disabled regardless of any opt-out setting.
    const res = await testApp.app.inject({ method: "GET", url: "/api/v1/config/analytics" });
    const config = JSON.parse(res.body);
    expect(config.enabled).toBe(false);
    expect(config.posthogApiKey).toBe("");
    expect(config.posthogHost).toBe("");
    expect(config.sentryDsn).toBe("");
    expect(config.sampleRate).toBe(0);
    expect(config.instanceId).toBe("");
  });

  it("bake on + admin opt-out: enabled flips true -> false end to end", async () => {
    // Force the bake on for this test only (non-production override).
    process.env.ANALYTICS_BAKED_OVERRIDE = "on";
    try {
      // Prime the gate so the GET below doesn't kick off a background refresh
      // that could race the opt-out write. fetchedAt is now fresh.
      await refreshAnalyticsGate();

      // No opt-out setting yet -> effective state is enabled.
      const before = JSON.parse(
        (await testApp.app.inject({ method: "GET", url: "/api/v1/config/analytics" })).body,
      );
      expect(before.enabled).toBe(true);

      // Admin disables analytics instance-wide. The settings route awaits
      // refreshAnalyticsGate() so the gate reflects the opt-out immediately.
      const token = await loginAsAdmin(testApp.app);
      const put = await testApp.app.inject({
        method: "PUT",
        url: "/api/v1/settings",
        headers: { authorization: `Bearer ${token}` },
        payload: { analyticsEnabled: "false" },
      });
      expect(put.statusCode).toBe(200);

      // Effective state is now disabled, and secrets are blanked.
      const after = JSON.parse(
        (await testApp.app.inject({ method: "GET", url: "/api/v1/config/analytics" })).body,
      );
      expect(after.enabled).toBe(false);
      expect(after.posthogApiKey).toBe("");
      expect(after.instanceId).toBe("");
    } finally {
      // afterEach also restores state, but keep the override scoped tightly.
      delete process.env.ANALYTICS_BAKED_OVERRIDE;
    }
  });
});

describe("PUT /api/v1/settings { analyticsEnabled }", () => {
  it("admin can disable analytics (200)", async () => {
    const token = await loginAsAdmin(testApp.app);
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${token}` },
      payload: { analyticsEnabled: "false" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("non-admin cannot change the setting (403)", async () => {
    const token = await loginAsUser(testApp.app);
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${token}` },
      payload: { analyticsEnabled: "false" },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("PUT /api/v1/user/analytics (removed)", () => {
  it("returns 404 (endpoint no longer exists)", async () => {
    // Authenticate first: the global auth preHandler answers unauthenticated
    // requests with 401 before routing, so only an authenticated request can
    // reach Fastify's not-found handler and prove the route is gone.
    const token = await loginAsAdmin(testApp.app);
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/user/analytics",
      headers: { authorization: `Bearer ${token}` },
      payload: { enabled: true },
    });
    expect(res.statusCode).toBe(404);
  });
});
