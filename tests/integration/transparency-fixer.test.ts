/**
 * Integration tests for the transparency-fixer tool (/api/v1/tools/transparency-fixer).
 *
 * This tool requires the Python sidecar (rembg with BiRefNet HR-matting model).
 * Tests accept 200, 202 (sidecar running), and 501 (not installed) for
 * processing paths while fully testing validation paths that don't depend on
 * the sidecar.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const FIXTURES = join(__dirname, "..", "fixtures");
const FAKE_TRANSPARENCY = readFileSync(join(FIXTURES, "test-fake-transparency.png"));
const PNG = readFileSync(join(FIXTURES, "test-200x150.png"));
const JPG = readFileSync(join(FIXTURES, "test-100x100.jpg"));
const WEBP = readFileSync(join(FIXTURES, "test-50x50.webp"));
const SVG = readFileSync(join(FIXTURES, "test-100x100.svg"));
const HEIC = readFileSync(join(FIXTURES, "test-200x150.heic"));
const TINY = readFileSync(join(FIXTURES, "test-1x1.png"));

const TOOL_URL = "/api/v1/tools/transparency-fixer";

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

/** Helper: build multipart payload and POST to the transparency-fixer endpoint. */
async function postTransparencyFixer(
  fileBuffer: Buffer,
  filename: string,
  settings?: Record<string, unknown>,
) {
  const fields: Array<{
    name: string;
    filename?: string;
    contentType?: string;
    content: Buffer | string;
  }> = [{ name: "file", filename, contentType: "application/octet-stream", content: fileBuffer }];

  if (settings !== undefined) {
    fields.push({ name: "settings", content: JSON.stringify(settings) });
  }

  const { body, contentType } = createMultipartPayload(fields);

  return app.inject({
    method: "POST",
    url: TOOL_URL,
    headers: {
      authorization: `Bearer ${adminToken}`,
      "content-type": contentType,
    },
    body,
  });
}

/** Helper: POST with raw settings string (for invalid JSON tests). */
async function postWithRawSettings(fileBuffer: Buffer, filename: string, rawSettings: string) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, contentType: "application/octet-stream", content: fileBuffer },
    { name: "settings", content: rawSettings },
  ]);

  return app.inject({
    method: "POST",
    url: TOOL_URL,
    headers: {
      authorization: `Bearer ${adminToken}`,
      "content-type": contentType,
    },
    body,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Happy path
// ═══════════════════════════════════════════════════════════════════════════
describe("PNG Transparency Fixer - Happy path", () => {
  it("processes fake-transparency PNG with default settings", async () => {
    const res = await postTransparencyFixer(FAKE_TRANSPARENCY, "test-fake-transparency.png", {});
    expect([200, 202, 501]).toContain(res.statusCode);

    if (res.statusCode === 202) {
      const result = JSON.parse(res.body);
      expect(result.jobId).toBeDefined();
      expect(result.async).toBe(true);
    }

    if (res.statusCode === 501) {
      const result = JSON.parse(res.body);
      expect(result.code).toBe("FEATURE_NOT_INSTALLED");
    }
  }, 120_000);

  it("processes standard PNG with default settings", async () => {
    const res = await postTransparencyFixer(PNG, "test-200x150.png", {});
    expect([200, 202, 501]).toContain(res.statusCode);
  }, 120_000);
});

// ═══════════════════════════════════════════════════════════════════════════
// Advanced settings
// ═══════════════════════════════════════════════════════════════════════════
describe("PNG Transparency Fixer - Advanced settings", () => {
  it("accepts defringe at 0", async () => {
    const res = await postTransparencyFixer(PNG, "test.png", { defringe: 0 });
    expect([200, 202, 501]).toContain(res.statusCode);
  }, 120_000);

  it("accepts defringe at 50", async () => {
    const res = await postTransparencyFixer(PNG, "test.png", { defringe: 50 });
    expect([200, 202, 501]).toContain(res.statusCode);
  }, 120_000);

  it("accepts defringe at 100", async () => {
    const res = await postTransparencyFixer(PNG, "test.png", { defringe: 100 });
    expect([200, 202, 501]).toContain(res.statusCode);
  }, 120_000);

  it("accepts output format webp", async () => {
    const res = await postTransparencyFixer(PNG, "test.png", { outputFormat: "webp" });
    expect([200, 202, 501]).toContain(res.statusCode);
  }, 120_000);
});

// ═══════════════════════════════════════════════════════════════════════════
// Input format coverage
// ═══════════════════════════════════════════════════════════════════════════
describe("PNG Transparency Fixer - Input format coverage", () => {
  it("accepts JPEG input", async () => {
    const res = await postTransparencyFixer(JPG, "photo.jpg", {});
    expect([200, 202, 501]).toContain(res.statusCode);
  }, 120_000);

  it("accepts PNG input", async () => {
    const res = await postTransparencyFixer(PNG, "image.png", {});
    expect([200, 202, 501]).toContain(res.statusCode);
  }, 120_000);

  it("accepts WebP input", async () => {
    const res = await postTransparencyFixer(WEBP, "image.webp", {});
    expect([200, 202, 501]).toContain(res.statusCode);
  }, 120_000);

  it("accepts SVG input", async () => {
    const res = await postTransparencyFixer(SVG, "image.svg", {});
    expect([200, 202, 501]).toContain(res.statusCode);
  }, 120_000);

  it("accepts HEIC input", async () => {
    const res = await postTransparencyFixer(HEIC, "photo.heic", {});
    expect([200, 202, 501]).toContain(res.statusCode);
  }, 120_000);
});

// ═══════════════════════════════════════════════════════════════════════════
// Error handling
// ═══════════════════════════════════════════════════════════════════════════
describe("PNG Transparency Fixer - Error handling", () => {
  it("rejects requests without a file", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: TOOL_URL,
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
    const res = await postWithRawSettings(PNG, "test.png", "not valid json{{{");

    expect([400, 501]).toContain(res.statusCode);
    if (res.statusCode === 400) {
      const result = JSON.parse(res.body);
      expect(result.error).toMatch(/json/i);
    }
  });

  it("rejects defringe out of range (negative)", async () => {
    const res = await postTransparencyFixer(PNG, "test.png", { defringe: -5 });

    expect([400, 501]).toContain(res.statusCode);
    if (res.statusCode === 400) {
      const result = JSON.parse(res.body);
      expect(result.error).toMatch(/invalid settings/i);
    }
  });

  it("rejects defringe out of range (>100)", async () => {
    const res = await postTransparencyFixer(PNG, "test.png", { defringe: 200 });

    expect([400, 501]).toContain(res.statusCode);
    if (res.statusCode === 400) {
      const result = JSON.parse(res.body);
      expect(result.error).toMatch(/invalid settings/i);
    }
  });

  it("rejects invalid output format", async () => {
    const res = await postTransparencyFixer(PNG, "test.png", { outputFormat: "bmp" });

    expect([400, 501]).toContain(res.statusCode);
    if (res.statusCode === 400) {
      const result = JSON.parse(res.body);
      expect(result.error).toMatch(/invalid settings/i);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Edge cases
// ═══════════════════════════════════════════════════════════════════════════
describe("PNG Transparency Fixer - Edge cases", () => {
  it("handles 1x1 pixel image", async () => {
    const res = await postTransparencyFixer(TINY, "tiny.png", {});
    expect([200, 202, 422, 501]).toContain(res.statusCode);
  }, 120_000);

  it("handles already-transparent PNG", async () => {
    // Create a 50x50 RGBA image with 50% alpha
    const semiTransparent = await sharp({
      create: {
        width: 50,
        height: 50,
        channels: 4,
        background: { r: 128, g: 128, b: 128, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();

    const res = await postTransparencyFixer(semiTransparent, "semi-transparent.png", {});
    expect([200, 202, 501]).toContain(res.statusCode);
  }, 120_000);
});
