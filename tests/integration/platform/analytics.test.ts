import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

let testApp: TestApp;

beforeAll(async () => {
  testApp = await buildTestApp();
});

afterAll(async () => {
  await testApp.cleanup();
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
    expect(c1.instanceId).toBe(c2.instanceId);
  });

  it("config values come from build-time bake (dev defaults to disabled)", async () => {
    const res = await testApp.app.inject({ method: "GET", url: "/api/v1/config/analytics" });
    const config = JSON.parse(res.body);
    // In dev/test the committed baked.ts has enabled: false
    expect(config.enabled).toBe(false);
    expect(config.posthogApiKey).toBe("");
    expect(config.posthogHost).toBe("");
    expect(config.sentryDsn).toBe("");
    expect(config.sampleRate).toBe(0);
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
