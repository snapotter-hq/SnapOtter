/**
 * Integration tests for the content-aware resize (seam carving via caire) API endpoint.
 *
 * This tool uses the caire Go binary. In environments where caire is not
 * installed the route will return 422. Tests gracefully handle both scenarios
 * while still verifying route existence and input validation.
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

    // 200 = caire available, 422 = caire not found
    expect([200, 422]).toContain(res.statusCode);
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

  it("rejects requests without width, height, or square", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG_200x150 },
      { name: "settings", content: JSON.stringify({ protectFaces: false }) },
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
    const resBody = JSON.parse(res.body);
    expect(resBody.error).toContain("width, height, or square");
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

    // Accept 200 (caire available) or 422 (caire not available)
    expect([200, 422]).toContain(res.statusCode);

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

    expect([200, 422]).toContain(res.statusCode);

    if (res.statusCode === 200) {
      const resBody = JSON.parse(res.body);
      expect(resBody.downloadUrl).toBeDefined();
      expect(resBody.height).toBe(120);
    }
  }, 60_000);

  it("supports enlargement via seam insertion", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG_200x150 },
      { name: "settings", content: JSON.stringify({ width: 300, protectFaces: false }) },
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

    // 200 = caire enlarged successfully, 422 = caire not available
    expect([200, 422]).toContain(res.statusCode);

    if (res.statusCode === 200) {
      const resBody = JSON.parse(res.body);
      expect(resBody.downloadUrl).toBeDefined();
      expect(resBody.width).toBe(300);
    }
  }, 60_000);

  it("accepts blurRadius and sobelThreshold options", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG_200x150 },
      {
        name: "settings",
        content: JSON.stringify({
          width: 150,
          protectFaces: false,
          blurRadius: 6,
          sobelThreshold: 4,
        }),
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

    expect([200, 422]).toContain(res.statusCode);

    if (res.statusCode === 200) {
      const resBody = JSON.parse(res.body);
      expect(resBody.downloadUrl).toBeDefined();
      expect(resBody.width).toBe(150);
    }
  }, 60_000);

  it("supports square mode", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG_200x150 },
      { name: "settings", content: JSON.stringify({ square: true, protectFaces: false }) },
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

    expect([200, 422]).toContain(res.statusCode);

    if (res.statusCode === 200) {
      const resBody = JSON.parse(res.body);
      expect(resBody.downloadUrl).toBeDefined();
      // Square mode produces equal width and height
      expect(resBody.width).toBe(resBody.height);
    }
  }, 60_000);

  it("rejects invalid blurRadius", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG_200x150 },
      {
        name: "settings",
        content: JSON.stringify({ width: 150, blurRadius: 50 }),
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

    expect(res.statusCode).toBe(400);
  });

  it("rejects invalid sobelThreshold", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG_200x150 },
      {
        name: "settings",
        content: JSON.stringify({ width: 150, sobelThreshold: 0 }),
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

    expect(res.statusCode).toBe(400);
  });
});
