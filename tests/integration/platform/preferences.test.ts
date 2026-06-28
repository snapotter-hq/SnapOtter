/**
 * Integration tests for per-user preferences (GET/PUT /api/v1/preferences).
 *
 * Preferences are writable by any authenticated user (unlike the admin-only
 * /v1/settings), so the default home view can be saved per-user.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

describe("per-user preferences", () => {
  it("requires authentication", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/preferences" });
    expect(res.statusCode).toBe(401);
  });

  it("returns an empty map before anything is saved", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/preferences",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ preferences: {} });
  });

  it("saves and reads back a preference", async () => {
    const put = await app.inject({
      method: "PUT",
      url: "/api/v1/preferences",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
      payload: { defaultToolView: "fullscreen" },
    });
    expect(put.statusCode).toBe(200);

    const get = await app.inject({
      method: "GET",
      url: "/api/v1/preferences",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(JSON.parse(get.body).preferences.defaultToolView).toBe("fullscreen");
  });

  it("upserts an existing preference rather than duplicating it", async () => {
    await app.inject({
      method: "PUT",
      url: "/api/v1/preferences",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
      payload: { defaultToolView: "sidebar" },
    });
    const get = await app.inject({
      method: "GET",
      url: "/api/v1/preferences",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(JSON.parse(get.body).preferences.defaultToolView).toBe("sidebar");
  });
});
