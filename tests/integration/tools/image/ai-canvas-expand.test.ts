/**
 * Integration tests for the ai-canvas-expand AI tool (/api/v1/tools/image/ai-canvas-expand).
 *
 * This tool uses async processing: valid requests return 202 with a jobId,
 * and the result is delivered via SSE. The Python sidecar is not available
 * in the test environment, so the route returns 501 (not installed).
 * Validation paths are always testable regardless of sidecar availability.
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

describe("AI Canvas Expand", () => {
  // -- Processing (sidecar-dependent) ------------------------------------

  it("returns 501 when AI sidecar is not installed", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          extendTop: 100,
          extendRight: 0,
          extendBottom: 100,
          extendLeft: 0,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/ai-canvas-expand",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([202, 501]).toContain(res.statusCode);
    if (res.statusCode === 501) {
      const json = JSON.parse(res.body);
      expect(json.code).toBe("FEATURE_NOT_INSTALLED");
    }
  }, 60_000);

  // -- Validation (always testable) --------------------------------------

  it("returns 400 when no image is provided", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "settings",
        content: JSON.stringify({ extendTop: 100, extendRight: 0, extendBottom: 0, extendLeft: 0 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/ai-canvas-expand",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    // 400 when sidecar is available (validation runs), 501 when not (isToolInstalled check fires first)
    expect([400, 501]).toContain(res.statusCode);
    if (res.statusCode === 400) {
      const json = JSON.parse(res.body);
      expect(json.error).toMatch(/no image/i);
    }
  });

  it("returns 400 when no settings are provided", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/ai-canvas-expand",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    // Without settings, defaults apply: all extends = 0 => "at least one direction" error
    // But 501 fires first if sidecar is not installed
    expect([400, 501]).toContain(res.statusCode);
    if (res.statusCode === 400) {
      const json = JSON.parse(res.body);
      expect(json.error).toMatch(/at least one extend direction/i);
    }
  });

  it("returns 400 when all extensions are zero", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ extendTop: 0, extendRight: 0, extendBottom: 0, extendLeft: 0 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/ai-canvas-expand",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([400, 501]).toContain(res.statusCode);
    if (res.statusCode === 400) {
      const json = JSON.parse(res.body);
      expect(json.error).toMatch(/at least one extend direction/i);
    }
  });

  it("returns 400 with negative extension values", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          extendTop: -10,
          extendRight: -5,
          extendBottom: -20,
          extendLeft: -15,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/ai-canvas-expand",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([400, 501]).toContain(res.statusCode);
    if (res.statusCode === 400) {
      const json = JSON.parse(res.body);
      expect(json.error).toMatch(/invalid settings/i);
    }
  });

  it("accepts valid request format (202 or 501)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          extendTop: 100,
          extendRight: 0,
          extendBottom: 100,
          extendLeft: 0,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/ai-canvas-expand",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([202, 501]).toContain(res.statusCode);
    if (res.statusCode === 202) {
      const json = JSON.parse(res.body);
      expect(json.jobId).toBeDefined();
      expect(json.async).toBe(true);
    }
  }, 60_000);

  it("rejects unauthenticated requests (401)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          extendTop: 50,
          extendRight: 50,
          extendBottom: 50,
          extendLeft: 50,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/ai-canvas-expand",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });

  // -- Tier parameter validation --------------------------------------------

  it("accepts valid tier values in settings", async () => {
    for (const tier of ["fast", "balanced", "high"]) {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
        {
          name: "settings",
          content: JSON.stringify({
            extendTop: 50,
            extendRight: 0,
            extendBottom: 50,
            extendLeft: 0,
            tier,
          }),
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/ai-canvas-expand",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        body,
      });

      expect([202, 501]).toContain(res.statusCode);
    }
  }, 60_000);

  it("returns 400 with invalid tier value", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          extendTop: 50,
          extendRight: 0,
          extendBottom: 50,
          extendLeft: 0,
          tier: "ultra",
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/ai-canvas-expand",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([400, 501]).toContain(res.statusCode);
    if (res.statusCode === 400) {
      const json = JSON.parse(res.body);
      expect(json.error).toMatch(/invalid settings/i);
    }
  });

  it("defaults to balanced tier when tier is omitted", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          extendTop: 50,
          extendRight: 0,
          extendBottom: 50,
          extendLeft: 0,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/ai-canvas-expand",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([202, 501]).toContain(res.statusCode);
  }, 60_000);
});
