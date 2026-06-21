/**
 * Integration tests for the blur-background tool (/api/v1/tools/image/blur-background).
 *
 * This tool reuses the rembg bundle (background-removal). The 501 gate fires
 * before any settings validation when the bundle is absent. Locally and in CI,
 * the bundle is never installed, so the 501 surface is always exercised.
 *
 * The blurBackground helper has dedicated unit coverage in
 * tests/unit/api/background-composite.test.ts. The rembg model never runs
 * locally; bundle-gated happy paths are in a skipped describe.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const PNG = readFixture(fixtures.image.base.png200);

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

describe("blur-background", () => {
  // -- 501 gate (always fires locally: background-removal bundle never installed) --

  it("returns 501 FEATURE_NOT_INSTALLED when bundle is absent", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ intensity: 50, feather: 5, format: "png" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/blur-background",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(501);
    const json = JSON.parse(res.body);
    expect(json.code).toBe("FEATURE_NOT_INSTALLED");
    expect(json.feature).toBe("background-removal");
    expect(json.featureName).toBe("Background Removal");
    expect(json.estimatedSize).toBeDefined();
  });

  // -- Auth gate --

  it("rejects unauthenticated requests (401)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/blur-background",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });

  // -- Validation: 501 fires before settings parse, so intensity=0 also 501s --

  it("returns 501 even with invalid intensity (gate fires first)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ intensity: 0, feather: 25, format: "bmp" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/blur-background",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    // 501 because the bundle gate fires before settings validation
    expect(res.statusCode).toBe(501);
    const json = JSON.parse(res.body);
    expect(json.code).toBe("FEATURE_NOT_INSTALLED");
  });

  // -- 501 with webp format (still gated) --

  it("returns 501 with webp format and feather settings", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ intensity: 80, feather: 10, format: "webp" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/blur-background",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(501);
    const json = JSON.parse(res.body);
    expect(json.code).toBe("FEATURE_NOT_INSTALLED");
  });

  // -- 501 with defaults (empty settings object, Zod fills defaults) --

  it("returns 501 with empty settings (defaults applied by Zod)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/blur-background",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(501);
    const json = JSON.parse(res.body);
    expect(json.code).toBe("FEATURE_NOT_INSTALLED");
  });

  // -- Bundle-gated happy path (skipped: background-removal bundle is 4-5 GB) --

  // The background-removal bundle is not installed in any verification environment.
  // These tests exist for future in-container runs after bundle install.
  // The 501 contract + blurBackground unit tests carry the verification.
  describe.skip("with background-removal bundle installed", () => {
    it("blurs background with full settings (202 + async)", async () => {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
        {
          name: "settings",
          content: JSON.stringify({ intensity: 75, feather: 3, format: "webp" }),
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/blur-background",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        body,
      });

      expect(res.statusCode).toBe(202);
      const json = JSON.parse(res.body);
      expect(json.jobId).toBeDefined();
      expect(json.async).toBe(true);
    }, 300_000);
  });
});
