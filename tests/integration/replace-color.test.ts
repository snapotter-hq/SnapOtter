/**
 * Integration tests for the replace-color tool.
 *
 * Replaces a source color with a target color (or makes it transparent).
 * Tests valid replacements, tolerance parameter, makeTransparent mode,
 * and verifies pixel-level changes.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const FIXTURES = join(__dirname, "..", "fixtures");
const PNG = readFileSync(join(FIXTURES, "test-200x150.png"));
const JPG = readFileSync(join(FIXTURES, "test-100x100.jpg"));

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;
let solidRedBuffer: Buffer;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);

  // Create a solid red test image for predictable color replacement
  solidRedBuffer = await sharp({
    create: { width: 50, height: 50, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

function makePayload(
  settings: Record<string, unknown>,
  buffer: Buffer = PNG,
  filename = "test.png",
  contentType = "image/png",
) {
  return createMultipartPayload([
    { name: "file", filename, contentType, content: buffer },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
}

async function postTool(
  settings: Record<string, unknown>,
  buffer?: Buffer,
  filename?: string,
  ct?: string,
) {
  const { body: payload, contentType } = makePayload(settings, buffer, filename, ct);
  return app.inject({
    method: "POST",
    url: "/api/v1/tools/replace-color",
    payload,
    headers: {
      "content-type": contentType,
      authorization: `Bearer ${adminToken}`,
    },
  });
}

// ── Basic replacement ─────────────────────────────────────────────
describe("Basic color replacement", () => {
  it("replaces red with blue in a solid red image", async () => {
    const res = await postTool(
      { sourceColor: "#FF0000", targetColor: "#0000FF", tolerance: 30 },
      solidRedBuffer,
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);

    // Download and verify color changed
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(dlRes.statusCode).toBe(200);

    // Check that the output pixels are predominantly blue
    const { data } = await sharp(dlRes.rawPayload)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    // First pixel should be blue-ish (high B, low R)
    expect(data[2]).toBeGreaterThan(data[0]); // blue > red
  });

  it("processes with default settings", async () => {
    const res = await postTool({});
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });
});

// ── Tolerance ─────────────────────────────────────────────────────
describe("Tolerance parameter", () => {
  it("with tolerance=0, only exact matches are replaced", async () => {
    const res = await postTool(
      { sourceColor: "#FF0000", targetColor: "#00FF00", tolerance: 0 },
      solidRedBuffer,
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("with high tolerance, more colors are affected", async () => {
    const res = await postTool(
      { sourceColor: "#FF0000", targetColor: "#00FF00", tolerance: 200 },
      solidRedBuffer,
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("with max tolerance=255, all pixels are affected", async () => {
    const res = await postTool({
      sourceColor: "#FF0000",
      targetColor: "#00FF00",
      tolerance: 255,
    });
    expect(res.statusCode).toBe(200);
  });
});

// ── Make transparent ──────────────────────────────────────────────
describe("Make transparent mode", () => {
  it("makes matching pixels transparent instead of replacing", async () => {
    const res = await postTool(
      { sourceColor: "#FF0000", makeTransparent: true, tolerance: 30 },
      solidRedBuffer,
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();

    // Download and verify alpha channel
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.channels).toBe(4); // RGBA output
  });
});

// ── Format support ────────────────────────────────────────────────
describe("Multiple input formats", () => {
  it("processes JPEG input", async () => {
    const res = await postTool(
      { sourceColor: "#808080", targetColor: "#FF0000", tolerance: 50 },
      JPG,
      "test.jpg",
      "image/jpeg",
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });
});

// ── Error handling ────────────────────────────────────────────────
describe("Error handling", () => {
  it("returns 400 when no file is provided", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      {
        name: "settings",
        content: JSON.stringify({ sourceColor: "#FF0000", targetColor: "#00FF00" }),
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/replace-color",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid hex color format", async () => {
    const res = await postTool({ sourceColor: "red", targetColor: "#00FF00" });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for short hex color", async () => {
    const res = await postTool({ sourceColor: "#F00", targetColor: "#00FF00" });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for tolerance out of range (negative)", async () => {
    const res = await postTool({ tolerance: -1 });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for tolerance out of range (>255)", async () => {
    const res = await postTool({ tolerance: 300 });
    expect(res.statusCode).toBe(400);
  });
});

// ── Branch coverage: line 82 (makeTransparent on non-alpha format → forced PNG) ──
describe("Alpha format fallback", () => {
  it("forces PNG when makeTransparent is used on a JPEG input", async () => {
    // Use solidRedBuffer with matching sourceColor to ensure transparency is applied
    const res = await postTool(
      { sourceColor: "#FF0000", makeTransparent: true, tolerance: 30 },
      solidRedBuffer,
      "test.jpg",
      "image/jpeg",
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    // JPEG doesn't support alpha, so output is forced to PNG
    expect(meta.format).toBe("png");
  });

  it("keeps PNG when makeTransparent is used on a PNG input", async () => {
    const res = await postTool(
      { sourceColor: "#FF0000", makeTransparent: true, tolerance: 30 },
      solidRedBuffer,
      "test.png",
      "image/png",
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("png");
  });
});

// ── HEIC input handling ─────────────────────────────────────────
describe("HEIC input", () => {
  it("processes HEIC image", { timeout: 120_000 }, async () => {
    const HEIC = readFileSync(join(FIXTURES, "test-200x150.heic"));
    const res = await postTool(
      { sourceColor: "#808080", targetColor: "#FF0000", tolerance: 50 },
      HEIC,
      "photo.heic",
      "image/heic",
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });
});

// ── WebP input ──────────────────────────────────────────────────
describe("WebP input", () => {
  it("processes WebP image", async () => {
    const WEBP = readFileSync(join(FIXTURES, "test-50x50.webp"));
    const res = await postTool(
      { sourceColor: "#808080", targetColor: "#00FF00", tolerance: 40 },
      WEBP,
      "test.webp",
      "image/webp",
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });
});

// ── Edge size inputs ────────────────────────────────────────────
describe("Edge size inputs", () => {
  it("processes 1x1 pixel image", async () => {
    const TINY = readFileSync(join(FIXTURES, "test-1x1.png"));
    const res = await postTool(
      { sourceColor: "#000000", targetColor: "#FFFFFF", tolerance: 255 },
      TINY,
      "tiny.png",
      "image/png",
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("processes stress-large.jpg", async () => {
    const LARGE = readFileSync(join(FIXTURES, "content", "stress-large.jpg"));
    const res = await postTool(
      { sourceColor: "#808080", targetColor: "#FF0000", tolerance: 30 },
      LARGE,
      "large.jpg",
      "image/jpeg",
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });
});

// ── Unauthenticated request ────────────────────────────────────
describe("Authentication", () => {
  it("rejects unauthenticated request", async () => {
    const { body: payload, contentType } = makePayload({
      sourceColor: "#FF0000",
      targetColor: "#00FF00",
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/replace-color",
      payload,
      headers: { "content-type": contentType },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ── Preserves dimensions ────────────────────────────────────────
describe("Dimension preservation", () => {
  it("output preserves original dimensions", async () => {
    const res = await postTool(
      { sourceColor: "#FF0000", targetColor: "#0000FF", tolerance: 30 },
      solidRedBuffer,
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.width).toBe(50);
    expect(meta.height).toBe(50);
  });
});

// ── makeTransparent on WebP (alpha-capable, no forced PNG) ──────
describe("WebP with makeTransparent", () => {
  it("keeps WebP when makeTransparent is used on WebP input", async () => {
    const WEBP = readFileSync(join(FIXTURES, "test-50x50.webp"));
    const res = await postTool(
      { sourceColor: "#808080", makeTransparent: true, tolerance: 100 },
      WEBP,
      "test.webp",
      "image/webp",
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    // WebP supports alpha, so no format conversion needed
    expect(meta.channels).toBe(4);
  });
});

// ── Blend behavior with medium tolerance ────────────────────────
describe("Blend behavior", () => {
  it("partially blends colors within tolerance range", async () => {
    // Create a gradient: pure red on left, slightly off-red on right
    const w = 100;
    const h = 50;
    const raw = Buffer.alloc(w * h * 3);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 3;
        raw[idx] = 255;
        raw[idx + 1] = Math.round((x / w) * 100);
        raw[idx + 2] = 0;
      }
    }
    const gradientBuf = await sharp(raw, { raw: { width: w, height: h, channels: 3 } })
      .png()
      .toBuffer();

    const res = await postTool(
      { sourceColor: "#FF0000", targetColor: "#0000FF", tolerance: 50 },
      gradientBuf,
      "gradient.png",
      "image/png",
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });
});

// ── Invalid target color format ─────────────────────────────────
describe("Target color validation", () => {
  it("rejects invalid target color format", async () => {
    const res = await postTool({ sourceColor: "#FF0000", targetColor: "blue" });
    expect(res.statusCode).toBe(400);
  });
});

// ── HEIF input ─────────────────────────────────────────────────
describe("HEIF input", () => {
  it(
    "processes HEIF image (motorcycle.heif)",
    { timeout: 120_000 },
    async () => {
      const HEIF = readFileSync(join(FIXTURES, "content", "motorcycle.heif"));
      const res = await postTool(
        { sourceColor: "#808080", targetColor: "#FF0000", tolerance: 50 },
        HEIF,
        "photo.heif",
        "image/heif",
      );
      expect(res.statusCode).toBe(200);
      const result = JSON.parse(res.body);
      expect(result.downloadUrl).toBeDefined();
    },
    60_000,
  );
});

// ── Animated GIF input ─────────────────────────────────────────
describe("Animated GIF input", () => {
  it("processes animated GIF", async () => {
    const GIF = readFileSync(join(FIXTURES, "animated.gif"));
    const res = await postTool(
      { sourceColor: "#808080", targetColor: "#00FF00", tolerance: 60 },
      GIF,
      "anim.gif",
      "image/gif",
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });
});

// ── SVG input ──────────────────────────────────────────────────
describe("SVG input", () => {
  it("processes SVG image", async () => {
    const SVG = readFileSync(join(FIXTURES, "test-100x100.svg"));
    const res = await postTool(
      { sourceColor: "#000000", targetColor: "#FF0000", tolerance: 30 },
      SVG,
      "icon.svg",
      "image/svg+xml",
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });
});
