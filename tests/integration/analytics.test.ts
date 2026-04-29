import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, loginAsAdmin, type TestApp } from "./test-server.js";

let testApp: TestApp;
let token: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  token = await loginAsAdmin(testApp.app);
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
});

describe("PUT /api/v1/user/analytics", () => {
  it("returns 401 without auth token", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/user/analytics",
      payload: { enabled: true },
    });
    expect(res.statusCode).toBe(401);
  });

  it("accepts consent with enabled: true", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/user/analytics",
      headers: { authorization: `Bearer ${token}` },
      payload: { enabled: true },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toEqual({ ok: true, analyticsEnabled: true });
  });

  it("declines consent with enabled: false", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/user/analytics",
      headers: { authorization: `Bearer ${token}` },
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toEqual({ ok: true, analyticsEnabled: false });
  });

  it("remindLater sets analyticsEnabled to null", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/user/analytics",
      headers: { authorization: `Bearer ${token}` },
      payload: { remindLater: true },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toEqual({ ok: true, analyticsEnabled: null });
  });

  it("rejects non-boolean enabled value", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/user/analytics",
      headers: { authorization: `Bearer ${token}` },
      payload: { enabled: "yes" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects non-boolean remindLater value", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/user/analytics",
      headers: { authorization: `Bearer ${token}` },
      payload: { remindLater: 1 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("accepts empty body without error", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/user/analytics",
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("Session includes analytics fields", () => {
  it("after accept, session shows analyticsEnabled=true", async () => {
    await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/user/analytics",
      headers: { authorization: `Bearer ${token}` },
      payload: { enabled: true },
    });

    const sessionRes = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${token}` },
    });
    const session = JSON.parse(sessionRes.body);
    expect(session.user.analyticsEnabled).toBe(true);
    expect(typeof session.user.analyticsConsentShownAt).toBe("number");
    expect(session.user.analyticsConsentRemindAt).toBeNull();
  });

  it("after decline, session shows analyticsEnabled=false", async () => {
    await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/user/analytics",
      headers: { authorization: `Bearer ${token}` },
      payload: { enabled: false },
    });

    const sessionRes = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${token}` },
    });
    const session = JSON.parse(sessionRes.body);
    expect(session.user.analyticsEnabled).toBe(false);
    expect(session.user.analyticsConsentRemindAt).toBeNull();
  });

  it("after remindLater, session shows null + future remindAt", async () => {
    const before = Date.now();
    await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/user/analytics",
      headers: { authorization: `Bearer ${token}` },
      payload: { remindLater: true },
    });

    const sessionRes = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${token}` },
    });
    const session = JSON.parse(sessionRes.body);
    expect(session.user.analyticsEnabled).toBeNull();
    expect(typeof session.user.analyticsConsentShownAt).toBe("number");
    expect(typeof session.user.analyticsConsentRemindAt).toBe("number");

    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(session.user.analyticsConsentRemindAt).toBeGreaterThanOrEqual(before + sevenDays - 1000);
    expect(session.user.analyticsConsentRemindAt).toBeLessThanOrEqual(
      Date.now() + sevenDays + 1000,
    );
  });
});

describe("7-day reminder lifecycle", () => {
  it("fresh -> remindLater -> accept clears remindAt", async () => {
    // Step 1: Set remind later
    await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/user/analytics",
      headers: { authorization: `Bearer ${token}` },
      payload: { remindLater: true },
    });

    let session = await getSession();
    expect(session.user.analyticsEnabled).toBeNull();
    expect(session.user.analyticsConsentRemindAt).toBeTypeOf("number");
    expect(session.user.analyticsConsentRemindAt).toBeGreaterThan(Date.now());

    // Step 2: Accept consent (user comes back and says yes)
    await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/user/analytics",
      headers: { authorization: `Bearer ${token}` },
      payload: { enabled: true },
    });

    session = await getSession();
    expect(session.user.analyticsEnabled).toBe(true);
    expect(session.user.analyticsConsentRemindAt).toBeNull();
  });

  it("fresh -> remindLater -> decline clears remindAt", async () => {
    await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/user/analytics",
      headers: { authorization: `Bearer ${token}` },
      payload: { remindLater: true },
    });

    let session = await getSession();
    expect(session.user.analyticsEnabled).toBeNull();
    expect(session.user.analyticsConsentRemindAt).not.toBeNull();

    await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/user/analytics",
      headers: { authorization: `Bearer ${token}` },
      payload: { enabled: false },
    });

    session = await getSession();
    expect(session.user.analyticsEnabled).toBe(false);
    expect(session.user.analyticsConsentRemindAt).toBeNull();
  });

  it("accept -> toggle off -> toggle on preserves consent history", async () => {
    await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/user/analytics",
      headers: { authorization: `Bearer ${token}` },
      payload: { enabled: true },
    });

    let session = await getSession();
    expect(session.user.analyticsEnabled).toBe(true);
    const firstShownAt = session.user.analyticsConsentShownAt;

    await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/user/analytics",
      headers: { authorization: `Bearer ${token}` },
      payload: { enabled: false },
    });

    session = await getSession();
    expect(session.user.analyticsEnabled).toBe(false);

    await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/user/analytics",
      headers: { authorization: `Bearer ${token}` },
      payload: { enabled: true },
    });

    session = await getSession();
    expect(session.user.analyticsEnabled).toBe(true);
    expect(session.user.analyticsConsentShownAt).toBeGreaterThanOrEqual(firstShownAt);
  });

  it("multiple remindLater calls update the remindAt timestamp", async () => {
    await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/user/analytics",
      headers: { authorization: `Bearer ${token}` },
      payload: { remindLater: true },
    });

    const session1 = await getSession();
    const firstRemindAt = session1.user.analyticsConsentRemindAt;

    // Small delay to ensure timestamps differ
    await new Promise((r) => setTimeout(r, 50));

    await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/user/analytics",
      headers: { authorization: `Bearer ${token}` },
      payload: { remindLater: true },
    });

    const session2 = await getSession();
    expect(session2.user.analyticsConsentRemindAt).toBeGreaterThanOrEqual(firstRemindAt);
  });
});

async function getSession() {
  const res = await testApp.app.inject({
    method: "GET",
    url: "/api/auth/session",
    headers: { authorization: `Bearer ${token}` },
  });
  return JSON.parse(res.body);
}
