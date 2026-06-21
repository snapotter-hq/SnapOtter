/**
 * Integration tests for Phase 1 settings keys:
 * disabledTools, enableExperimentalTools, tempFileMaxAgeHours, startupCleanup
 *
 * These verify the settings store correctly persists and retrieves these keys
 * via the PUT/GET /api/v1/settings endpoints.
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

// ═══════════════════════════════════════════════════════════════════════════
// disabledTools
// ═══════════════════════════════════════════════════════════════════════════
describe("disabledTools setting", () => {
  it("can be saved as a JSON array and retrieved", async () => {
    const disabledTools = ["resize", "crop", "rotate"];

    // Save
    const putRes = await app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { disabledTools },
    });
    expect(putRes.statusCode).toBe(200);
    expect(JSON.parse(putRes.body).ok).toBe(true);

    // Retrieve via GET all
    const getRes = await app.inject({
      method: "GET",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(getRes.statusCode).toBe(200);
    const body = JSON.parse(getRes.body);
    const parsed = JSON.parse(body.settings.disabledTools);
    expect(parsed).toEqual(disabledTools);

    // Retrieve via GET specific key
    const keyRes = await app.inject({
      method: "GET",
      url: "/api/v1/settings/disabledTools",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(keyRes.statusCode).toBe(200);
    const keyBody = JSON.parse(keyRes.body);
    expect(JSON.parse(keyBody.value)).toEqual(disabledTools);
  });

  it("can be updated to an empty array", async () => {
    const putRes = await app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { disabledTools: [] },
    });
    expect(putRes.statusCode).toBe(200);

    const keyRes = await app.inject({
      method: "GET",
      url: "/api/v1/settings/disabledTools",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(keyRes.statusCode).toBe(200);
    expect(JSON.parse(JSON.parse(keyRes.body).value)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// enableExperimentalTools
// ═══════════════════════════════════════════════════════════════════════════
describe("enableExperimentalTools setting", () => {
  it("can be saved and retrieved as 'true'", async () => {
    const putRes = await app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { enableExperimentalTools: "true" },
    });
    expect(putRes.statusCode).toBe(200);

    const keyRes = await app.inject({
      method: "GET",
      url: "/api/v1/settings/enableExperimentalTools",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(keyRes.statusCode).toBe(200);
    expect(JSON.parse(keyRes.body).value).toBe("true");
  });

  it("can be saved and retrieved as 'false'", async () => {
    const putRes = await app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { enableExperimentalTools: "false" },
    });
    expect(putRes.statusCode).toBe(200);

    const keyRes = await app.inject({
      method: "GET",
      url: "/api/v1/settings/enableExperimentalTools",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(keyRes.statusCode).toBe(200);
    expect(JSON.parse(keyRes.body).value).toBe("false");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// tempFileMaxAgeHours
// ═══════════════════════════════════════════════════════════════════════════
describe("tempFileMaxAgeHours setting", () => {
  it("can be saved and retrieved as a numeric string", async () => {
    const putRes = await app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { tempFileMaxAgeHours: "48" },
    });
    expect(putRes.statusCode).toBe(200);

    const keyRes = await app.inject({
      method: "GET",
      url: "/api/v1/settings/tempFileMaxAgeHours",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(keyRes.statusCode).toBe(200);
    expect(JSON.parse(keyRes.body).value).toBe("48");
  });

  it("can be updated to a different value", async () => {
    // Set initial value
    await app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { tempFileMaxAgeHours: "12" },
    });

    // Update
    const putRes = await app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { tempFileMaxAgeHours: "72" },
    });
    expect(putRes.statusCode).toBe(200);

    const keyRes = await app.inject({
      method: "GET",
      url: "/api/v1/settings/tempFileMaxAgeHours",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(JSON.parse(keyRes.body).value).toBe("72");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// startupCleanup
// ═══════════════════════════════════════════════════════════════════════════
describe("startupCleanup setting", () => {
  it("can be saved and retrieved as 'true'", async () => {
    const putRes = await app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { startupCleanup: "true" },
    });
    expect(putRes.statusCode).toBe(200);

    const keyRes = await app.inject({
      method: "GET",
      url: "/api/v1/settings/startupCleanup",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(keyRes.statusCode).toBe(200);
    expect(JSON.parse(keyRes.body).value).toBe("true");
  });

  it("can be saved and retrieved as 'false'", async () => {
    const putRes = await app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { startupCleanup: "false" },
    });
    expect(putRes.statusCode).toBe(200);

    const keyRes = await app.inject({
      method: "GET",
      url: "/api/v1/settings/startupCleanup",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(keyRes.statusCode).toBe(200);
    expect(JSON.parse(keyRes.body).value).toBe("false");
  });
});
