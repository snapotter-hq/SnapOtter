/**
 * Integration tests for the color-palette tool.
 *
 * This tool extracts dominant colors from an image and returns JSON
 * (not an image). Tests verify response shape, color count, and format handling.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const FIXTURES = join(__dirname, "..", "fixtures");
const PNG = readFileSync(join(FIXTURES, "test-200x150.png"));
const JPG = readFileSync(join(FIXTURES, "test-100x100.jpg"));
const WEBP = readFileSync(join(FIXTURES, "test-50x50.webp"));

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

function makeFilePayload(buffer: Buffer, filename: string, contentType: string) {
  return createMultipartPayload([{ name: "file", filename, contentType, content: buffer }]);
}

// ── Basic extraction ──────────────────────────────────────────────
describe("Color extraction", () => {
  it("extracts palette from PNG and returns colors array", async () => {
    const { body: payload, contentType } = makeFilePayload(PNG, "test.png", "image/png");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.colors).toBeDefined();
    expect(Array.isArray(result.colors)).toBe(true);
    expect(result.colors.length).toBeGreaterThan(0);
    expect(result.colors.length).toBeLessThanOrEqual(8);
    expect(result.count).toBe(result.colors.length);
    expect(result.filename).toBeDefined();
  });

  it("returns hex color strings in #RRGGBB format", async () => {
    const { body: payload, contentType } = makeFilePayload(PNG, "test.png", "image/png");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    for (const color of result.colors) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

// ── Solid color image ─────────────────────────────────────────────
describe("Solid color image", () => {
  it("returns a single dominant color for a solid red image", async () => {
    const redBuffer = await sharp({
      create: { width: 50, height: 50, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();

    const { body: payload, contentType } = makeFilePayload(redBuffer, "red.png", "image/png");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.colors.length).toBe(1);
    // The quantized red should be close to #f00000 or #ff0000
    expect(result.colors[0]).toMatch(/^#[ef][0f]0000$/);
  });
});

// ── Format support ────────────────────────────────────────────────
describe("Multiple input formats", () => {
  it("extracts palette from JPEG", async () => {
    const { body: payload, contentType } = makeFilePayload(JPG, "test.jpg", "image/jpeg");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.colors.length).toBeGreaterThan(0);
  });

  it("extracts palette from WebP", async () => {
    const { body: payload, contentType } = makeFilePayload(WEBP, "test.webp", "image/webp");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.colors.length).toBeGreaterThan(0);
  });
});

// ── Error handling ────────────────────────────────────────────────
describe("Error handling", () => {
  it("returns 400 when no file is provided", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "other", content: "nothing" },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toBeDefined();
  });

  it("returns 422 for corrupted image data", async () => {
    const badBuffer = Buffer.from("not an image at all");
    const { body: payload, contentType } = makeFilePayload(badBuffer, "bad.png", "image/png");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(422);
  });
});

// ── Branch coverage: lines 62-66 (multipart parse error) ────────
describe("Multipart error handling", () => {
  it("returns 400 for empty file buffer", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "empty.png", contentType: "image/png", content: Buffer.alloc(0) },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toBeDefined();
  });
});

// ── HEIC input handling ─────────────────────────────────────────
describe("HEIC input", () => {
  it("extracts palette from HEIC image", async () => {
    const HEIC = readFileSync(join(FIXTURES, "test-200x150.heic"));
    const { body: payload, contentType } = makeFilePayload(HEIC, "photo.heic", "image/heic");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.colors.length).toBeGreaterThan(0);
    expect(result.filename).toBe("photo.heic");
  });
});

// ── Multi-color image ───────────────────────────────────────────
describe("Multi-color extraction", () => {
  it("extracts multiple colors from a multi-color image", async () => {
    // Create a 2-color image (half red, half blue)
    const halfWidth = 25;
    const halfBuffer = await sharp({
      create: { width: 50, height: 50, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: halfWidth,
              height: 50,
              channels: 3,
              background: { r: 0, g: 0, b: 255 },
            },
          })
            .png()
            .toBuffer(),
          left: halfWidth,
          top: 0,
        },
      ])
      .png()
      .toBuffer();

    const { body: payload, contentType } = makeFilePayload(halfBuffer, "bicolor.png", "image/png");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.colors.length).toBeGreaterThanOrEqual(2);
  });
});

// ── Tiny and stress inputs ──────────────────────────────────────
describe("Edge size inputs", () => {
  it("extracts palette from 1x1 pixel image", async () => {
    const TINY = readFileSync(join(FIXTURES, "test-1x1.png"));
    const { body: payload, contentType } = makeFilePayload(TINY, "tiny.png", "image/png");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.colors.length).toBeGreaterThan(0);
  });

  it("extracts palette from stress-large.jpg", async () => {
    const LARGE = readFileSync(join(FIXTURES, "content", "stress-large.jpg"));
    const { body: payload, contentType } = makeFilePayload(LARGE, "large.jpg", "image/jpeg");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.colors.length).toBeGreaterThan(0);
    expect(result.colors.length).toBeLessThanOrEqual(8);
  });
});

// ── Unauthenticated request ──────────────────────────────────────
describe("Authentication", () => {
  it("rejects unauthenticated request", async () => {
    const { body: payload, contentType } = makeFilePayload(PNG, "test.png", "image/png");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/color-palette",
      payload,
      headers: {
        "content-type": contentType,
      },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ── Gradient image (many unique colors) ──────────────────────────
describe("Gradient image palette", () => {
  it("extracts palette from a gradient image (max 8 colors)", async () => {
    // Create a horizontal gradient image
    const w = 100;
    const h = 50;
    const raw = Buffer.alloc(w * h * 3);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 3;
        raw[idx] = Math.round((x / w) * 255);
        raw[idx + 1] = Math.round((y / h) * 255);
        raw[idx + 2] = 128;
      }
    }
    const gradientBuffer = await sharp(raw, { raw: { width: w, height: h, channels: 3 } })
      .png()
      .toBuffer();

    const { body: payload, contentType } = makeFilePayload(
      gradientBuffer,
      "gradient.png",
      "image/png",
    );
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.colors.length).toBeGreaterThanOrEqual(2);
    expect(result.colors.length).toBeLessThanOrEqual(8);
  });
});

// ── Solid white image ──────────────────────────────────────────
describe("Solid white image", () => {
  it("returns a single dominant color for a solid white image", async () => {
    const whiteBuffer = await sharp({
      create: { width: 50, height: 50, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .png()
      .toBuffer();

    const { body: payload, contentType } = makeFilePayload(whiteBuffer, "white.png", "image/png");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.colors.length).toBe(1);
    // Quantized white should be #f0f0f0 or #ffffff
    expect(result.colors[0]).toMatch(/^#[ef][0f][ef][0f][ef][0f]$/);
  });
});

// ── HEIF input ─────────────────────────────────────────────────
describe("HEIF input", () => {
  it("extracts palette from HEIF image", async () => {
    const HEIF = readFileSync(join(FIXTURES, "content", "motorcycle.heif"));
    const { body: payload, contentType } = makeFilePayload(HEIF, "photo.heif", "image/heif");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.colors.length).toBeGreaterThan(0);
  });
});

// ── Animated GIF input ──────────────────────────────────────────
describe("Animated GIF input", () => {
  it("extracts palette from animated GIF", async () => {
    const GIF = readFileSync(join(FIXTURES, "animated.gif"));
    const { body: payload, contentType } = makeFilePayload(GIF, "anim.gif", "image/gif");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.colors.length).toBeGreaterThan(0);
  });
});

// ── SVG input ───────────────────────────────────────────────────
describe("SVG input", () => {
  it("extracts palette from SVG image", async () => {
    const SVG = readFileSync(join(FIXTURES, "test-100x100.svg"));
    const { body: payload, contentType } = makeFilePayload(SVG, "icon.svg", "image/svg+xml");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.colors.length).toBeGreaterThan(0);
  });
});

// ── Filename preserved in response ──────────────────────────────
describe("Filename tracking", () => {
  it("returns the original filename in the response", async () => {
    const { body: payload, contentType } = makeFilePayload(PNG, "my-image-2024.png", "image/png");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.filename).toBe("my-image-2024.png");
  });
});
