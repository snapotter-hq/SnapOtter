import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../apps/api/src/db/index.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "./test-server.js";

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

describe("API key permission scoping", () => {
  it("creates a key with scoped permissions", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "scoped-key", permissions: ["tools:use", "files:own"] },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.permissions).toEqual(["tools:use", "files:own"]);
    expect(body.key).toBeTruthy();
  });

  it("rejects permissions the user does not have", async () => {
    await testApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username: "scopetest", password: "ScopeTest1", role: "user" },
    });
    db.update(schema.users)
      .set({ mustChangePassword: false })
      .where(eq(schema.users.username, "scopetest"))
      .run();

    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "scopetest", password: "ScopeTest1" },
    });
    const userToken = JSON.parse(loginRes.body).token;

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: "bad-scope", permissions: ["users:manage"] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("scoped API key is restricted to its permissions", async () => {
    const createRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "readonly-key", permissions: ["tools:use", "settings:read"] },
    });
    const apiKey = JSON.parse(createRes.body).key;

    const settingsRes = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${apiKey}` },
    });
    expect(settingsRes.statusCode).toBe(200);

    const writeRes = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${apiKey}` },
      payload: { appName: "hacked" },
    });
    expect(writeRes.statusCode).toBe(403);
  });

  it("null permissions inherits all from user role", async () => {
    const createRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "full-key" },
    });
    const body = JSON.parse(createRes.body);
    expect(body.permissions).toBeNull();

    const writeRes = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${body.key}` },
      payload: { testSetting: "value" },
    });
    expect(writeRes.statusCode).toBe(200);
  });

  it("GET /api/v1/api-keys returns permissions field", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const body = JSON.parse(res.body);
    expect(body.apiKeys.length).toBeGreaterThan(0);
    const scopedKey = body.apiKeys.find((k: any) => k.name === "scoped-key");
    expect(scopedKey).toBeDefined();
    expect(scopedKey.permissions).toEqual(["tools:use", "files:own"]);
  });
});

describe("API key expiration", () => {
  it("creates key with expiration", async () => {
    const future = new Date(Date.now() + 86400000).toISOString(); // 24h from now
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "expiring-key", expiresAt: future },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.expiresAt).toBeTruthy();
  });

  it("rejects past expiration date", async () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "past-key", expiresAt: past },
    });
    expect(res.statusCode).toBe(400);
  });

  it("expired key returns 401", async () => {
    // Create a key, then manually set its expiration to the past
    const createRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "will-expire", expiresAt: new Date(Date.now() + 86400000).toISOString() },
    });
    const apiKey = JSON.parse(createRes.body).key;
    const keyId = JSON.parse(createRes.body).id;

    // Manually expire the key in DB
    db.update(schema.apiKeys)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.apiKeys.id, keyId))
      .run();

    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${apiKey}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET returns expiresAt field", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const body = JSON.parse(res.body);
    const expiringKey = body.apiKeys.find((k: any) => k.name === "expiring-key");
    expect(expiringKey).toBeDefined();
    expect(expiringKey.expiresAt).toBeTruthy();
  });
});
