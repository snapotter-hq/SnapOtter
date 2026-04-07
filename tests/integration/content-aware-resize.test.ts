/**
 * Integration tests for the content-aware resize (seam carving) API endpoint.
 *
 * This tool uses the Python sidecar, so in CI/test environments where Python
 * is not available the route will return 501 (lite mode) or 422 (Python error).
 * Tests gracefully handle both scenarios while still verifying route existence
 * and input validation.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const FIXTURES = join(__dirname, "..", "fixtures");
const PNG_200x150 = readFileSync(join(FIXTURES, "test-200x150.png"));

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

describe("Content-Aware Resize", () => {
  it("route exists and responds to POST", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG_200x150 },
      {
        name: "settings",
        content: JSON.stringify({ width: 150, height: 120, protectFaces: false }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/content-aware-resize",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    // 200 = Python available, 422 = Python error, 501 = lite mode stub
    // Any of these proves the route is registered and reachable
    expect([200, 422, 501]).toContain(res.statusCode);
  }, 60_000);

  it("rejects requests without a file", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({ width: 150 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/content-aware-resize",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  it("processes with only width specified", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG_200x150 },
      { name: "settings", content: JSON.stringify({ width: 150, protectFaces: false }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/content-aware-resize",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    // Accept 200 (Python available) or 422/501 (Python not available)
    expect([200, 422, 501]).toContain(res.statusCode);

    if (res.statusCode === 200) {
      const resBody = JSON.parse(res.body);
      expect(resBody.downloadUrl).toBeDefined();
      expect(resBody.width).toBe(150);
    }
  }, 60_000);

  it("processes with only height specified", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG_200x150 },
      { name: "settings", content: JSON.stringify({ height: 120, protectFaces: false }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/content-aware-resize",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([200, 422, 501]).toContain(res.statusCode);

    if (res.statusCode === 200) {
      const resBody = JSON.parse(res.body);
      expect(resBody.downloadUrl).toBeDefined();
      expect(resBody.height).toBe(120);
    }
  }, 60_000);

  it("rejects enlargement beyond source dimensions", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG_200x150 },
      { name: "settings", content: JSON.stringify({ width: 400, protectFaces: false }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/content-aware-resize",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    // 422 = Python caught the enlargement error, 501 = lite mode
    // Should never be 200 since 400 > 200px source width
    expect(res.statusCode).not.toBe(200);
    expect([422, 501]).toContain(res.statusCode);

    if (res.statusCode === 422) {
      const resBody = JSON.parse(res.body);
      expect(resBody.error || resBody.details).toBeDefined();
    }
  }, 60_000);
});
