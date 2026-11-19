/**
 * Integration tests for the aspect-ratio-calculator tool
 * (/api/v1/tools/image/aspect-ratio-calculator).
 *
 * Custom JSON route with no file input: it answers with the solved dimension
 * and simplified ratio. These pin it behind the real auth and tool-access
 * stack; the arithmetic is covered in tests/unit/api/aspect-ratio-calculator.test.ts.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, loginAsAdmin, type TestApp } from "../../test-server.js";

const URL = "/api/v1/tools/image/aspect-ratio-calculator";

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
});

afterAll(async () => {
  await testApp.cleanup();
});

describe("Aspect Ratio Calculator", () => {
  it("solves the height for a new width", async () => {
    const res = await app.inject({
      method: "POST",
      url: URL,
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: { width: 1920, height: 1080, newWidth: 1280 },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      width: 1920,
      height: 1080,
      ratio: "16:9",
      ratioDecimal: 1.7778,
      newWidth: 1280,
      newHeight: 720,
    });
  });

  it("rejects both new dimensions at once", async () => {
    const res = await app.inject({
      method: "POST",
      url: URL,
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: { width: 1920, height: 1080, newWidth: 1280, newHeight: 720 },
    });

    expect(res.statusCode).toBe(400);
  });

  it("requires authentication", async () => {
    const res = await app.inject({
      method: "POST",
      url: URL,
      headers: { "content-type": "application/json" },
      payload: { width: 1920, height: 1080 },
    });

    expect(res.statusCode).toBe(401);
  });
});
