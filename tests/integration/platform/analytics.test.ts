import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import {
  __resetGateForTests,
  refreshAnalyticsGate,
} from "../../../apps/api/src/lib/analytics-gate.js";
import { buildTestApp, loginAsAdmin, loginAsUser, type TestApp } from "../test-server.js";

// The test app never starts a PostHog client, so the route's sink answer is
// stubbed to prove the config carries `hasFeedbackSink()` and not a copy of the
// baked key (#2252).
const feedbackSink = vi.hoisted(() => ({ present: false }));

vi.mock("../../../apps/api/src/lib/analytics.js", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, hasFeedbackSink: () => feedbackSink.present };
});

let testApp: TestApp;

// A fresh test database has no analyticsEnabled answer, which the gate reads
// as undecided and sends nothing (#4910). Tests that need analytics on store
// the admin's yes; afterEach deletes it again.
async function enableAnalytics(): Promise<void> {
  process.env.ANALYTICS_BAKED_OVERRIDE = "on";
  await db
    .insert(schema.settings)
    .values({ key: "analyticsEnabled", value: "true" })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: "true" } });
  await refreshAnalyticsGate();
}

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
  feedbackSink.present = false;
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
    expect(config).toHaveProperty("feedbackSink");
    expect(config).toHaveProperty("sentryDsn");
    expect(config).toHaveProperty("sentryDsnWeb");
    expect(config).toHaveProperty("posthogSampleRate");
    expect(config).toHaveProperty("instanceId");

    expect(typeof config.enabled).toBe("boolean");
    expect(typeof config.posthogApiKey).toBe("string");
    expect(typeof config.posthogHost).toBe("string");
    expect(typeof config.feedbackSink).toBe("boolean");
    expect(typeof config.sentryDsn).toBe("string");
    expect(typeof config.sentryDsnWeb).toBe("string");
    expect(typeof config.posthogSampleRate).toBe("number");
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
    // disabled regardless of any opt-out setting. A live sink must not leak
    // through the disabled branch.
    feedbackSink.present = true;
    const res = await testApp.app.inject({ method: "GET", url: "/api/v1/config/analytics" });
    const config = JSON.parse(res.body);
    expect(config.enabled).toBe(false);
    expect(config.posthogApiKey).toBe("");
    expect(config.posthogHost).toBe("");
    expect(config.feedbackSink).toBe(false);
    expect(config.sentryDsn).toBe("");
    expect(config.sentryDsnWeb).toBe("");
    expect(config.posthogSampleRate).toBe(0);
    expect(config.instanceId).toBe("");
  });

  it("reports the server's feedback sink, not a copy of the baked key (#2252)", async () => {
    await enableAnalytics();

    feedbackSink.present = true;
    const withSink = JSON.parse(
      (await testApp.app.inject({ method: "GET", url: "/api/v1/config/analytics" })).body,
    );
    expect(withSink.enabled).toBe(true);
    expect(withSink.feedbackSink).toBe(true);
    // A fixed install-type enum, never a hostname or path (#4742).
    expect(["embedded", "external", "native"]).toContain(withSink.deployMode);

    feedbackSink.present = false;
    const withoutSink = JSON.parse(
      (await testApp.app.inject({ method: "GET", url: "/api/v1/config/analytics" })).body,
    );
    expect(withoutSink.enabled).toBe(true);
    expect(withoutSink.feedbackSink).toBe(false);
  });

  it("bake on + admin opt-out: enabled flips true -> false end to end", async () => {
    try {
      // Force the bake on and store the admin's yes. This also primes the gate
      // so the GET below doesn't kick off a background refresh that could race
      // the opt-out write. fetchedAt is now fresh.
      await enableAnalytics();

      // Analytics is on before the opt-out.
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

      // Effective state is now disabled, and secrets are blanked. Keep the
      // sink present so the disabled branch is what reports false.
      feedbackSink.present = true;
      const after = JSON.parse(
        (await testApp.app.inject({ method: "GET", url: "/api/v1/config/analytics" })).body,
      );
      expect(after.enabled).toBe(false);
      expect(after.posthogApiKey).toBe("");
      expect(after.feedbackSink).toBe(false);
      expect(after.instanceId).toBe("");
    } finally {
      // afterEach also restores state, but keep the override scoped tightly.
      delete process.env.ANALYTICS_BAKED_OVERRIDE;
    }
  });
});

describe("first-run consent (#4910)", () => {
  afterEach(async () => {
    await db.delete(schema.settings).where(eq(schema.settings.key, "analyticsConsentOrigin"));
  });

  async function readConfig() {
    return JSON.parse(
      (await testApp.app.inject({ method: "GET", url: "/api/v1/config/analytics" })).body,
    );
  }

  it("a fresh install sends nothing and asks until the admin answers yes", async () => {
    process.env.ANALYTICS_BAKED_OVERRIDE = "on";
    await db
      .insert(schema.settings)
      .values({ key: "analyticsConsentOrigin", value: "fresh" })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: "fresh" } });
    await refreshAnalyticsGate();
    feedbackSink.present = true;

    const pending = await readConfig();
    expect(pending.enabled).toBe(false);
    expect(pending.consentPending).toBe(true);
    expect(pending.posthogApiKey).toBe("");
    expect(pending.sentryDsnWeb).toBe("");
    expect(pending.instanceId).toBe("");

    const token = await loginAsAdmin(testApp.app);
    const put = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${token}` },
      payload: { analyticsEnabled: "true" },
    });
    expect(put.statusCode).toBe(200);

    const answered = await readConfig();
    expect(answered.enabled).toBe(true);
    expect(answered.consentPending).toBe(false);
  });

  it("answering no clears the prompt and keeps analytics off", async () => {
    process.env.ANALYTICS_BAKED_OVERRIDE = "on";
    await db
      .insert(schema.settings)
      .values({ key: "analyticsConsentOrigin", value: "fresh" })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: "fresh" } });
    await refreshAnalyticsGate();

    const token = await loginAsAdmin(testApp.app);
    await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${token}` },
      payload: { analyticsEnabled: "false" },
    });
    const answered = await readConfig();
    expect(answered.enabled).toBe(false);
    expect(answered.consentPending).toBe(false);
  });

  it("an upgraded instance with no stored answer stays on and is never asked", async () => {
    process.env.ANALYTICS_BAKED_OVERRIDE = "on";
    await db
      .insert(schema.settings)
      .values({ key: "analyticsConsentOrigin", value: "upgrade" })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: "upgrade" } });
    await refreshAnalyticsGate();

    const config = await readConfig();
    expect(config.enabled).toBe(true);
    expect(config.consentPending).toBe(false);
  });

  it("does not ask when the bake is off, since nothing could be sent", async () => {
    await refreshAnalyticsGate();
    const config = await readConfig();
    expect(config.enabled).toBe(false);
    expect(config.consentPending).toBe(false);
  });

  it("classifies a database that already has users and settings as an upgrade, once", async () => {
    // buildTestApp seeded an admin and settings, like any earlier release's first boot.
    const { classifyAnalyticsConsentOrigin } = await import(
      "../../../apps/api/src/lib/settings-helpers.js"
    );
    await db.delete(schema.settings).where(eq(schema.settings.key, "analyticsConsentOrigin"));
    await expect(classifyAnalyticsConsentOrigin()).resolves.toBe("upgrade");
    const [row] = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, "analyticsConsentOrigin"));
    expect(row?.value).toBe("upgrade");
    await expect(classifyAnalyticsConsentOrigin()).resolves.toBe("known");
  });

  it("the origin marker can't be written through the settings API", async () => {
    const token = await loginAsAdmin(testApp.app);
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${token}` },
      payload: { analyticsConsentOrigin: "upgrade" },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
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
    // Authenticate first: the global auth hook answers unauthenticated
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
