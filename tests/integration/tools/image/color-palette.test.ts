/**
 * Integration tests for the color-palette tool.
 *
 * This tool extracts dominant colors from an image and returns JSON
 * (not an image). Tests verify response shape, color count, and format handling.
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

const PNG = readFixture(fixtures.image.base.png200);
const JPG = readFixture(fixtures.image.base.jpg100);
const WEBP = readFixture(fixtures.image.base.webp50);

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
      url: "/api/v1/tools/image/color-palette",
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
      url: "/api/v1/tools/image/color-palette",
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
      url: "/api/v1/tools/image/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.colors.length).toBe(1);
    // Median-cut averages all identical pixels, so solid red is #ff0000
    expect(result.colors[0]).toBe("#ff0000");
  });
});

// ── Format support ────────────────────────────────────────────────
describe("Multiple input formats", () => {
  it("extracts palette from JPEG", async () => {
    const { body: payload, contentType } = makeFilePayload(JPG, "test.jpg", "image/jpeg");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/color-palette",
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
      url: "/api/v1/tools/image/color-palette",
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
      url: "/api/v1/tools/image/color-palette",
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

  it("returns 400 for corrupted image data", async () => {
    const badBuffer = Buffer.from("not an image at all");
    const { body: payload, contentType } = makeFilePayload(badBuffer, "bad.png", "image/png");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    // validateImageBuffer catches corrupt data before processing
    expect(res.statusCode).toBe(400);
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
      url: "/api/v1/tools/image/color-palette",
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
  it("extracts palette from HEIC image", { timeout: 120_000 }, async () => {
    const HEIC = readFixture(fixtures.image.base.heic200);
    const { body: payload, contentType } = makeFilePayload(HEIC, "photo.heic", "image/heic");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/color-palette",
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
      url: "/api/v1/tools/image/color-palette",
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
    const TINY = readFixture(fixtures.image.edge.px1);
    const { body: payload, contentType } = makeFilePayload(TINY, "tiny.png", "image/png");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/color-palette",
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
    const LARGE = readFixture(fixtures.image.stressLarge);
    const { body: payload, contentType } = makeFilePayload(LARGE, "large.jpg", "image/jpeg");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/color-palette",
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
      url: "/api/v1/tools/image/color-palette",
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
      url: "/api/v1/tools/image/color-palette",
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
      url: "/api/v1/tools/image/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.colors.length).toBe(1);
    // Median-cut averages all identical pixels, so solid white is #ffffff
    expect(result.colors[0]).toBe("#ffffff");
  });
});

// ── HEIF input ─────────────────────────────────────────────────
describe("HEIF input", () => {
  it("extracts palette from HEIF image", { timeout: 120_000 }, async () => {
    const HEIF = readFixture(fixtures.image.motorcycle);
    const { body: payload, contentType } = makeFilePayload(HEIF, "photo.heif", "image/heif");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/color-palette",
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
    const GIF = readFixture(fixtures.image.animated.gif);
    const { body: payload, contentType } = makeFilePayload(GIF, "anim.gif", "image/gif");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/color-palette",
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
    const SVG = readFixture(fixtures.image.base.svg100);
    const { body: payload, contentType } = makeFilePayload(SVG, "icon.svg", "image/svg+xml");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/color-palette",
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

// ── TIFF input ─────────────────────────────────────────────────
describe("TIFF input", () => {
  it("extracts palette from TIFF image", async () => {
    const TIFF = readFixture(fixtures.image.formats("tiff"));
    const { body: payload, contentType } = makeFilePayload(TIFF, "test.tiff", "image/tiff");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.colors.length).toBeGreaterThan(0);
    expect(result.filename).toBe("test.tiff");
  });
});

// ── Real photo with many colors ────────────────────────────────
describe("Real photo palette", () => {
  it("extracts palette from portrait-color.jpg", async () => {
    const PHOTO = readFixture(fixtures.image.portrait.jpg);
    const { body: payload, contentType } = makeFilePayload(PHOTO, "photo.jpg", "image/jpeg");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/color-palette",
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
    // Verify all colors are valid hex
    for (const color of result.colors) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

// ── Solid black image ──────────────────────────────────────────
describe("Solid black image", () => {
  it("returns a single dominant color for a solid black image", async () => {
    const blackBuffer = await sharp({
      create: { width: 50, height: 50, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();

    const { body: payload, contentType } = makeFilePayload(blackBuffer, "black.png", "image/png");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.colors.length).toBe(1);
    expect(result.colors[0]).toBe("#000000");
  });
});

// ── Color count is between 1 and 8 ────────────────────────────
describe("Color count bounds", () => {
  it("count field matches colors array length", async () => {
    const { body: payload, contentType } = makeFilePayload(PNG, "test.png", "image/png");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.count).toBe(result.colors.length);
    expect(result.count).toBeGreaterThanOrEqual(1);
    expect(result.count).toBeLessThanOrEqual(8);
  });
});

// ── AVIF input ─────────────────────────────────────────────────
describe("AVIF input", () => {
  it("extracts palette from AVIF image", async () => {
    const AVIF = readFixture(fixtures.image.formats("avif"));
    const { body: payload, contentType } = makeFilePayload(AVIF, "test.avif", "image/avif");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/color-palette",
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
      url: "/api/v1/tools/image/color-palette",
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

// ── Extracted colors are unique ────────────────────────────────
describe("Color uniqueness", () => {
  it("returns only unique colors (no duplicates)", async () => {
    const PHOTO = readFixture(fixtures.image.portrait.jpg);
    const { body: payload, contentType } = makeFilePayload(PHOTO, "photo.jpg", "image/jpeg");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    const uniqueColors = new Set(result.colors);
    expect(uniqueColors.size).toBe(result.colors.length);
  });
});

// ── SVG logo from content fixtures ────────────────────────────
describe("SVG logo input", () => {
  it("extracts palette from svg-logo.svg", async () => {
    const SVG_LOGO = readFixture(fixtures.image.svgLogo);
    const { body: payload, contentType } = makeFilePayload(SVG_LOGO, "logo.svg", "image/svg+xml");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.colors.length).toBeGreaterThan(0);
    expect(result.filename).toBe("logo.svg");
  });
});

// ── Three-color image ─────────────────────────────────────────
describe("Three-color image", () => {
  it("extracts 3 colors from a 3-stripe image", async () => {
    const w = 60;
    const h = 30;
    const raw = Buffer.alloc(w * h * 3);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 3;
        if (x < 20) {
          raw[idx] = 255;
          raw[idx + 1] = 0;
          raw[idx + 2] = 0;
        } else if (x < 40) {
          raw[idx] = 0;
          raw[idx + 1] = 255;
          raw[idx + 2] = 0;
        } else {
          raw[idx] = 0;
          raw[idx + 1] = 0;
          raw[idx + 2] = 255;
        }
      }
    }
    const tricolorBuffer = await sharp(raw, { raw: { width: w, height: h, channels: 3 } })
      .png()
      .toBuffer();

    const { body: payload, contentType } = makeFilePayload(tricolorBuffer, "tri.png", "image/png");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.colors.length).toBeGreaterThanOrEqual(3);
  });
});

// ── No settings field ─────────────────────────────────────────
describe("No settings field", () => {
  it("works when no settings field is provided at all", async () => {
    const { body: payload, contentType } = makeFilePayload(PNG, "test.png", "image/png");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.colors.length).toBeGreaterThan(0);
    expect(result.filename).toBe("test.png");
  });
});

// ── BMP input ─────────────────────────────────────────────────
describe("BMP input", () => {
  it("extracts palette from BMP image", async () => {
    const BMP = readFixture(fixtures.image.formats("bmp"));
    const { body: payload, contentType } = makeFilePayload(BMP, "test.bmp", "image/bmp");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    // BMP might be handled by CLI decode or Sharp directly
    expect([200, 400, 422]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const result = JSON.parse(res.body);
      expect(result.colors.length).toBeGreaterThan(0);
    }
  });
});

// ── Portrait image palette ───────────────────────────────────
describe("Portrait image palette", () => {
  it("extracts palette from portrait-bw.jpeg (mostly black/white)", async () => {
    const BW = readFixture(fixtures.image.portrait.bw);
    const { body: payload, contentType } = makeFilePayload(BW, "bw.jpg", "image/jpeg");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/color-palette",
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

// ── Cross-format chat WebP ──────────────────────────────────
describe("Cross-format WebP input", () => {
  it("extracts palette from cross-format-chat.webp", async () => {
    const CHAT = readFixture(fixtures.image.crossFormatChat);
    const { body: payload, contentType } = makeFilePayload(CHAT, "chat.webp", "image/webp");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.colors.length).toBeGreaterThan(0);
    expect(result.filename).toBe("chat.webp");
  });
});

// ── Settings: custom count ──────────────────────────────────────
describe("Settings: custom count", () => {
  it("respects count setting and returns at most that many colors", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ count: 4 }) },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(Array.isArray(result.colors)).toBe(true);
    expect(result.colors.length).toBeGreaterThan(0);
    expect(result.colors.length).toBeLessThanOrEqual(4);
    expect(result.count).toBe(result.colors.length);
  });
});

// ── Settings: RGB format ─────────────────────────────────────────
describe("Settings: RGB format", () => {
  it("returns rgb() strings when format is rgb", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ format: "rgb" }) },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.colors.length).toBeGreaterThan(0);
    expect(result.colors[0]).toMatch(/^rgb\(/);
    // hex array should always contain hex values regardless of format
    expect(result.hex).toBeDefined();
    expect(result.hex[0]).toMatch(/^#[0-9a-f]{6}$/);
  });
});

// ── Settings: HSL format ─────────────────────────────────────────
describe("Settings: HSL format", () => {
  it("returns hsl() strings when format is hsl", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ format: "hsl" }) },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.colors.length).toBeGreaterThan(0);
    expect(result.colors[0]).toMatch(/^hsl\(/);
    expect(result.hex).toBeDefined();
    expect(result.hex.length).toBe(result.colors.length);
  });
});

// ── Response always includes hex array ──────────────────────────
describe("Response shape: hex array", () => {
  it("always returns hex array alongside colors", async () => {
    const { body: payload, contentType } = makeFilePayload(PNG, "test.png", "image/png");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.hex).toBeDefined();
    expect(Array.isArray(result.hex)).toBe(true);
    expect(result.hex.length).toBe(result.colors.length);
    for (const h of result.hex) {
      expect(h).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
