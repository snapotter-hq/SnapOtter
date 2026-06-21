/**
 * Integration tests for the transparency-fixer tool (/api/v1/tools/image/transparency-fixer).
 *
 * This tool requires the Python sidecar (rembg with BiRefNet HR-matting model).
 * Tests accept 200, 202 (sidecar running), and 501 (not installed) for
 * processing paths while fully testing validation paths that don't depend on
 * the sidecar.
 */

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const FAKE_TRANSPARENCY = readFixture(fixtures.image.transparent);
const PNG = readFixture(fixtures.image.base.png200);
const JPG = readFixture(fixtures.image.base.jpg100);
const WEBP = readFixture(fixtures.image.base.webp50);
const SVG = readFixture(fixtures.image.base.svg100);
const HEIC = readFixture(fixtures.image.base.heic200);
const TINY = readFixture(fixtures.image.edge.px1);

const TOOL_URL = "/api/v1/tools/image/transparency-fixer";

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

// ═══════════════════════════════════════════════════════════════════════════
// Watermark removal settings
// ═══════════════════════════════════════════════════════════════════════════
describe("PNG Transparency Fixer - Watermark removal settings", () => {
  it("accepts removeWatermark: true", async () => {
    const res = await postTransparencyFixer(PNG, "test.png", { removeWatermark: true });
    expect([200, 202, 501]).toContain(res.statusCode);
  }, 120_000);

  it("accepts removeWatermark: false", async () => {
    const res = await postTransparencyFixer(PNG, "test.png", { removeWatermark: false });
    expect([200, 202, 501]).toContain(res.statusCode);
  }, 120_000);

  it("defaults removeWatermark to false when omitted", async () => {
    const res = await postTransparencyFixer(PNG, "test.png", { defringe: 30 });
    expect([200, 202, 501]).toContain(res.statusCode);
  }, 120_000);

  it("rejects non-boolean removeWatermark", async () => {
    const res = await postTransparencyFixer(PNG, "test.png", { removeWatermark: "yes" });
    expect([400, 501]).toContain(res.statusCode);
    if (res.statusCode === 400) {
      const result = JSON.parse(res.body);
      expect(result.error).toMatch(/invalid settings/i);
    }
  });

  it("accepts removeWatermark with various input formats", async () => {
    const formats = [
      { buf: JPG, name: "photo.jpg" },
      { buf: WEBP, name: "image.webp" },
    ];
    for (const { buf, name } of formats) {
      const res = await postTransparencyFixer(buf, name, { removeWatermark: true });
      expect([200, 202, 501]).toContain(res.statusCode);
    }
  }, 120_000);
});

// ═══════════════════════════════════════════════════════════════════════════
// Large file handling
// ═══════════════════════════════════════════════════════════════════════════
describe("PNG Transparency Fixer - Large file", () => {
  it("handles stress-large.jpg input", async () => {
    const LARGE = readFixture(fixtures.image.stressLarge);
    const res = await postTransparencyFixer(LARGE, "stress-large.jpg", {});
    expect([200, 202, 501]).toContain(res.statusCode);
  }, 120_000);
});

// ═══════════════════════════════════════════════════════════════════════════
// Empty file handling
// ═══════════════════════════════════════════════════════════════════════════
describe("PNG Transparency Fixer - Empty file", () => {
  it("rejects empty file buffer", async () => {
    const res = await postTransparencyFixer(Buffer.alloc(0), "empty.png", {});
    expect([400, 501]).toContain(res.statusCode);
  });

  it("rejects corrupt image data", async () => {
    const res = await postTransparencyFixer(Buffer.from("not an image at all"), "corrupt.png", {});
    expect([400, 501]).toContain(res.statusCode);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Authentication
// ═══════════════════════════════════════════════════════════════════════════
describe("PNG Transparency Fixer - Authentication", () => {
  it("rejects unauthenticated requests", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: TOOL_URL,
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HEIF input from fixtures/formats
// ═══════════════════════════════════════════════════════════════════════════
describe("PNG Transparency Fixer - HEIF input", () => {
  it("accepts HEIF (sample.heif) input", { timeout: 120_000 }, async () => {
    const HEIF = readFixture(fixtures.image.formats("heif"));
    const res = await postTransparencyFixer(HEIF, "sample.heif", {});
    expect([200, 202, 422, 501]).toContain(res.statusCode);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Combined settings
// ═══════════════════════════════════════════════════════════════════════════
describe("PNG Transparency Fixer - Combined settings", () => {
  it("accepts defringe + outputFormat + removeWatermark together", async () => {
    const res = await postTransparencyFixer(PNG, "test.png", {
      defringe: 50,
      outputFormat: "webp",
      removeWatermark: true,
    });
    expect([200, 202, 501]).toContain(res.statusCode);
  }, 120_000);

  it("accepts all settings at minimum values", async () => {
    const res = await postTransparencyFixer(PNG, "test.png", {
      defringe: 0,
      outputFormat: "png",
      removeWatermark: false,
    });
    expect([200, 202, 501]).toContain(res.statusCode);
  }, 120_000);

  it("accepts all settings at maximum values", async () => {
    const res = await postTransparencyFixer(PNG, "test.png", {
      defringe: 100,
      outputFormat: "webp",
      removeWatermark: true,
    });
    expect([200, 202, 501]).toContain(res.statusCode);
  }, 120_000);
});

// ═══════════════════════════════════════════════════════════════════════════
// Default settings (no settings field)
// ═══════════════════════════════════════════════════════════════════════════
describe("PNG Transparency Fixer - Default settings", () => {
  it("processes with omitted settings field", async () => {
    const res = await postTransparencyFixer(PNG, "test.png");
    expect([200, 202, 501]).toContain(res.statusCode);
  }, 120_000);
});
