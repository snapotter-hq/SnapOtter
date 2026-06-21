import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

describe("SIEM config without enterprise license", () => {
  it("GET returns 403 without enterprise license", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/siem/config",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("enterprise");
  });

  it("GET returns 401 without authentication", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/siem/config",
    });
    expect(res.statusCode).toBe(401);
  });

  it("PUT returns 403 without enterprise license", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/siem/config",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        webhookUrl: "https://siem.example.com/input",
        enabled: true,
        flushIntervalSeconds: 30,
      },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("enterprise");
  });

  it("PUT returns 401 without authentication", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/siem/config",
      payload: {
        webhookUrl: "https://siem.example.com/input",
        enabled: true,
        flushIntervalSeconds: 30,
      },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("SIEM config with enterprise license", () => {
  let enterpriseApp: TestApp;
  let entAdminToken: string;
  let userToken: string;

  beforeAll(async () => {
    vi.resetModules();
    const { mockEnterpriseFeatures } = await import("../../helpers/enterprise-mock.js");
    mockEnterpriseFeatures(["siem_forwarding"]);
    const { buildTestApp, loginAsAdmin } = await import("../test-server.js");

    enterpriseApp = await buildTestApp();
    entAdminToken = await loginAsAdmin(enterpriseApp.app);

    await enterpriseApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: {
        username: "siemregularuser",
        password: "TestPass1",
        role: "user",
      },
    });
    await db
      .update(schema.users)
      .set({ mustChangePassword: false })
      .where(eq(schema.users.username, "siemregularuser"));

    const loginRes = await enterpriseApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "siemregularuser", password: "TestPass1" },
    });
    userToken = JSON.parse(loginRes.body).token;
  }, 30_000);

  afterAll(async () => {
    await enterpriseApp.cleanup();
    vi.resetModules();
  }, 10_000);

  it("GET returns 200 with default config when none is saved", async () => {
    const res = await enterpriseApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/siem/config",
      headers: { authorization: `Bearer ${entAdminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.webhookUrl).toBe("");
    expect(body.enabled).toBe(false);
    expect(body.flushIntervalSeconds).toBe(30);
  });

  it("GET returns 403 for non-admin users", async () => {
    const res = await enterpriseApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/siem/config",
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("PUT saves config with valid data", async () => {
    const res = await enterpriseApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/siem/config",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: {
        webhookUrl: "https://siem.example.com/input",
        authHeader: "Splunk secret-token",
        flushIntervalSeconds: 60,
        enabled: true,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
  });

  it("PUT rejects invalid webhookUrl", async () => {
    const res = await enterpriseApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/siem/config",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: {
        webhookUrl: "not-a-url",
        flushIntervalSeconds: 30,
        enabled: true,
      },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("Invalid");
  });

  it("PUT rejects flushIntervalSeconds below 10", async () => {
    const res = await enterpriseApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/siem/config",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: {
        webhookUrl: "https://siem.example.com/input",
        flushIntervalSeconds: 5,
        enabled: true,
      },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("Invalid");
  });

  it("PUT rejects flushIntervalSeconds above 3600", async () => {
    const res = await enterpriseApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/siem/config",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: {
        webhookUrl: "https://siem.example.com/input",
        flushIntervalSeconds: 7200,
        enabled: true,
      },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("Invalid");
  });

  it("PUT returns 403 for non-admin users", async () => {
    const res = await enterpriseApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/siem/config",
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        webhookUrl: "https://siem.example.com/input",
        flushIntervalSeconds: 30,
        enabled: true,
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("GET returns saved values after PUT", async () => {
    await enterpriseApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/siem/config",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: {
        webhookUrl: "https://siem.corp.example.com/events",
        authHeader: "Bearer my-secret-key",
        flushIntervalSeconds: 120,
        enabled: true,
      },
    });

    const res = await enterpriseApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/siem/config",
      headers: { authorization: `Bearer ${entAdminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.webhookUrl).toBe("https://siem.corp.example.com/events");
    expect(body.flushIntervalSeconds).toBe(120);
    expect(body.enabled).toBe(true);
  });

  it("GET masks authHeader as *** instead of returning the actual value", async () => {
    await enterpriseApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/siem/config",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: {
        webhookUrl: "https://siem.example.com/input",
        authHeader: "Splunk super-secret-value",
        flushIntervalSeconds: 30,
        enabled: true,
      },
    });

    const res = await enterpriseApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/siem/config",
      headers: { authorization: `Bearer ${entAdminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.authHeader).toBe("***");
    expect(body.authHeader).not.toContain("super-secret-value");
  });
});
