/**
 * Integration tests for the remove-background tool (/api/v1/tools/image/remove-background).
 *
 * This tool requires the Python sidecar (rembg). Tests accept both 200
 * (sidecar running) and 501 (not installed) for the processing path while
 * fully testing validation paths that don't depend on the sidecar.
 *
 * Also covers the /effects sub-route for Phase 2 compositing.
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
const JPG = readFixture(fixtures.image.base.jpg100);
const HEIC = readFixture(fixtures.image.base.heic200);
const TINY = readFixture(fixtures.image.edge.px1);

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

describe("Remove Background", () => {
  // ── Phase 1: Processing (AI-dependent) ───────────────────────────

  it("route exists and responds to POST", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([202, 501]).toContain(res.statusCode);
  }, 60_000);

  it("accepts default settings", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([202, 501]).toContain(res.statusCode);

    if (res.statusCode === 202) {
      const result = JSON.parse(res.body);
      expect(result.jobId).toBeDefined();
      expect(result.async).toBe(true);
    }

    if (res.statusCode === 501) {
      const result = JSON.parse(res.body);
      expect(result.code).toBe("FEATURE_NOT_INSTALLED");
    }
  }, 60_000);

  it("accepts transparent backgroundType", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ backgroundType: "transparent" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([202, 501]).toContain(res.statusCode);
  }, 60_000);

  it("accepts color background with blur and shadow settings", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          backgroundType: "color",
          backgroundColor: "#FF0000",
          blurEnabled: true,
          blurIntensity: 50,
          shadowEnabled: true,
          shadowOpacity: 60,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([202, 501]).toContain(res.statusCode);
  }, 60_000);

  it("accepts gradient background settings", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          backgroundType: "gradient",
          gradientColor1: "#FF0000",
          gradientColor2: "#0000FF",
          gradientAngle: 45,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([202, 501]).toContain(res.statusCode);
  }, 60_000);

  it("processes JPEG input", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([202, 501]).toContain(res.statusCode);
  }, 60_000);

  it(
    "handles HEIC input",
    { timeout: 120_000 },
    async () => {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "photo.heic", contentType: "image/heic", content: HEIC },
        { name: "settings", content: JSON.stringify({}) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/remove-background",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        body,
      });

      expect([202, 501]).toContain(res.statusCode);
    },
    60_000,
  );

  it("handles 1x1 pixel input", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.png", contentType: "image/png", content: TINY },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([202, 422, 501]).toContain(res.statusCode);
  }, 60_000);

  // ── Phase 2: Effects sub-route ───────────────────────────────────

  it("effects route rejects missing settings", async () => {
    const { body, contentType } = createMultipartPayload([]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background/effects",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/no settings/i);
  });

  it("effects route rejects invalid settings JSON", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "settings", content: "not json{{" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background/effects",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/json/i);
  });

  it("effects route rejects settings without jobId", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "settings",
        content: JSON.stringify({ filename: "test.png" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background/effects",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/invalid settings/i);
  });

  // ── Validation (always testable) ─────────────────────────────────

  it("rejects requests without a file", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([400, 501]).toContain(res.statusCode);
    if (res.statusCode === 400) {
      const result = JSON.parse(res.body);
      expect(result.error).toMatch(/no image/i);
    }
  });

  it("rejects invalid settings JSON", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: "not valid json{{{" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([400, 501]).toContain(res.statusCode);
    if (res.statusCode === 400) {
      const result = JSON.parse(res.body);
      expect(result.error).toMatch(/json/i);
    }
  });

  it("rejects invalid backgroundType", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ backgroundType: "sparkles" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([400, 501]).toContain(res.statusCode);
    if (res.statusCode === 400) {
      const result = JSON.parse(res.body);
      expect(result.error).toMatch(/invalid settings/i);
    }
  });

  it("rejects blurIntensity out of range", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ blurIntensity: 200 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([400, 501]).toContain(res.statusCode);
    if (res.statusCode === 400) {
      const result = JSON.parse(res.body);
      expect(result.error).toMatch(/invalid settings/i);
    }
  });

  it("accepts edge refinement and decontamination settings", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ edgeRefine: 2, decontaminate: true }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([202, 501]).toContain(res.statusCode);
  }, 60_000);

  it("accepts output format settings", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ outputFormat: "webp" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([202, 501]).toContain(res.statusCode);
  }, 60_000);

  it("rejects edgeRefine out of range", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ edgeRefine: 5 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([400, 501]).toContain(res.statusCode);
    if (res.statusCode === 400) {
      const result = JSON.parse(res.body);
      expect(result.error).toMatch(/invalid settings/i);
    }
  });

  it("rejects invalid output format", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ outputFormat: "gif" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([400, 501]).toContain(res.statusCode);
    if (res.statusCode === 400) {
      const result = JSON.parse(res.body);
      expect(result.error).toMatch(/invalid settings/i);
    }
  });

  it("rejects unauthenticated requests", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });
});
