/**
 * Integration tests for the image-enhancement tool.
 *
 * This is a Sharp-based tool (not AI sidecar) that analyzes and auto-enhances
 * images. Tests all modes (auto, portrait, landscape, low-light, food, document),
 * intensity parameter, selective corrections, and the analyze endpoint.
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
const HEIC = readFileSync(join(FIXTURES, "test-200x150.heic"));
const SVG = readFileSync(join(FIXTURES, "test-100x100.svg"));
const GIF = readFileSync(join(FIXTURES, "animated.gif"));

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
    url: "/api/v1/tools/image-enhancement",
    payload,
    headers: {
      "content-type": contentType,
      authorization: `Bearer ${adminToken}`,
    },
  });
}

// ── Auto mode (default) ───────────────────────────────────────────
describe("Auto mode", () => {
  it("enhances with default settings", async () => {
    const res = await postTool({});
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("enhances with explicit auto mode", async () => {
    const res = await postTool({ mode: "auto" });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });
});

// ── All enhancement modes ─────────────────────────────────────────
describe("Enhancement modes", () => {
  it("enhances in portrait mode", async () => {
    const res = await postTool({ mode: "portrait" });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("enhances in landscape mode", async () => {
    const res = await postTool({ mode: "landscape" });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("enhances in low-light mode", async () => {
    const res = await postTool({ mode: "low-light" });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("enhances in food mode", async () => {
    const res = await postTool({ mode: "food" });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("enhances in document mode", async () => {
    const res = await postTool({ mode: "document" });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });
});

// ── Intensity parameter ───────────────────────────────────────────
describe("Intensity parameter", () => {
  it("enhances at minimum intensity (0)", async () => {
    const res = await postTool({ intensity: 0 });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("enhances at maximum intensity (100)", async () => {
    const res = await postTool({ intensity: 100 });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("enhances at mid intensity (50, default)", async () => {
    const res = await postTool({ intensity: 50 });
    expect(res.statusCode).toBe(200);
  });
});

// ── Selective corrections ─────────────────────────────────────────
describe("Selective corrections", () => {
  it("disables all corrections except exposure", async () => {
    const res = await postTool({
      corrections: {
        exposure: true,
        contrast: false,
        whiteBalance: false,
        saturation: false,
        sharpness: false,
        denoise: false,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("enables only sharpness and denoise", async () => {
    const res = await postTool({
      corrections: {
        exposure: false,
        contrast: false,
        whiteBalance: false,
        saturation: false,
        sharpness: true,
        denoise: true,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("disables all corrections", async () => {
    const res = await postTool({
      corrections: {
        exposure: false,
        contrast: false,
        whiteBalance: false,
        saturation: false,
        sharpness: false,
        denoise: false,
      },
    });
    expect(res.statusCode).toBe(200);
  });
});

// ── Output verification ──────────────────────────────────────────
describe("Output verification", () => {
  it("output differs from input", async () => {
    const res = await postTool({ mode: "auto", intensity: 80 });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(dlRes.statusCode).toBe(200);
    expect(Buffer.compare(dlRes.rawPayload, PNG)).not.toBe(0);
  });

  it("preserves image dimensions", async () => {
    const res = await postTool({ mode: "auto" });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });
});

// ── Analyze endpoint ──────────────────────────────────────────────
describe("Analyze endpoint", () => {
  it("returns analysis data for an image", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-enhancement/analyze",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    // Analysis should return corrections object
    expect(result.corrections).toBeDefined();
  });

  it("analyze returns 400 when no file is provided", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "other", content: "nothing" },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-enhancement/analyze",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── Multiple input formats ────────────────────────────────────────
describe("Multiple input formats", () => {
  it("enhances JPEG input", async () => {
    const res = await postTool({ mode: "auto" }, JPG, "test.jpg", "image/jpeg");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("enhances WebP input", async () => {
    const res = await postTool({ mode: "auto" }, WEBP, "test.webp", "image/webp");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });
});

// ── Mode + intensity combinations ────────────────────────────────
describe("Mode and intensity combinations", () => {
  it("applies portrait mode at high intensity", async () => {
    const res = await postTool({ mode: "portrait", intensity: 90 });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(Buffer.compare(dlRes.rawPayload, PNG)).not.toBe(0);
  });

  it("applies low-light mode at low intensity", async () => {
    const res = await postTool({ mode: "low-light", intensity: 10 });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("applies food mode at zero intensity (no-op)", async () => {
    const res = await postTool({ mode: "food", intensity: 0 });
    expect(res.statusCode).toBe(200);
  });
});

// ── Analyze endpoint edge cases ─────────────────────────────────
describe("Analyze endpoint details", () => {
  it("analysis returns correction values within expected ranges", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "test.jpg", contentType: "image/jpeg", content: JPG },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-enhancement/analyze",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.corrections).toBeDefined();
    expect(typeof result.corrections).toBe("object");
  });

  it("analysis works on WebP input", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "test.webp", contentType: "image/webp", content: WEBP },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-enhancement/analyze",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.corrections).toBeDefined();
  });
});

// ── All corrections enabled simultaneously ──────────────────────
describe("Full corrections suite", () => {
  it("enhances with all corrections enabled at max intensity", async () => {
    const res = await postTool({
      mode: "auto",
      intensity: 100,
      corrections: {
        exposure: true,
        contrast: true,
        whiteBalance: true,
        saturation: true,
        sharpness: true,
        denoise: true,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });
});

// ── Format preservation ─────────────────────────────────────────
describe("Format preservation", () => {
  it("preserves JPEG format for JPEG input", async () => {
    const res = await postTool({ mode: "auto" }, JPG, "test.jpg", "image/jpeg");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("jpeg");
  });
});

// ── Error handling ────────────────────────────────────────────────
describe("Error handling", () => {
  it("returns 400 when no file is provided", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({ mode: "auto" }) },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-enhancement",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid mode", async () => {
    const res = await postTool({ mode: "hdr" });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for intensity out of range (negative)", async () => {
    const res = await postTool({ intensity: -10 });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for intensity out of range (>100)", async () => {
    const res = await postTool({ intensity: 150 });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid settings JSON", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: "broken-json" },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-enhancement",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── Analyze endpoint HEIC handling ─────────────────────────────
describe("Analyze endpoint HEIC handling", () => {
  it("analyze decodes HEIC input before analysis", { timeout: 120_000 }, async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "test.heic", contentType: "image/heic", content: HEIC },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-enhancement/analyze",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    // HEIC decode may fail if system decoder is missing
    expect([200, 422]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const result = JSON.parse(res.body);
      expect(result.corrections).toBeDefined();
    }
  });
});

// ── Analyze endpoint invalid image ─────────────────────────────
describe("Analyze endpoint invalid image", () => {
  it("analyze returns 400 for invalid image data", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "bad.png",
        contentType: "image/png",
        content: Buffer.from("not an image at all"),
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-enhancement/analyze",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/invalid image/i);
  });

  it("analyze returns 400 for empty file", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "empty.png",
        contentType: "image/png",
        content: Buffer.alloc(0),
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-enhancement/analyze",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── HEIC input enhancement ──────────────────────────────────────
describe("HEIC input enhancement", () => {
  it("enhances HEIC input image", { timeout: 120_000 }, async () => {
    const res = await postTool({ mode: "auto" }, HEIC, "test.heic", "image/heic");
    expect([200, 422]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const result = JSON.parse(res.body);
      expect(result.downloadUrl).toBeDefined();
      expect(result.processedSize).toBeGreaterThan(0);
    }
  });

  it("enhances HEIC in portrait mode", { timeout: 120_000 }, async () => {
    const res = await postTool(
      { mode: "portrait", intensity: 60 },
      HEIC,
      "portrait.heic",
      "image/heic",
    );
    expect([200, 422]).toContain(res.statusCode);
  });
});

// ── Alpha channel preservation ─────────────────────────────────
describe("Alpha channel preservation", () => {
  it("preserves alpha channel without crosshatch corruption", async () => {
    const rgbaBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 80, g: 120, b: 60, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const res = await postTool(
      { mode: "auto", intensity: 80 },
      rgbaBuffer,
      "rgba.png",
      "image/png",
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const { data, info } = await sharp(dlRes.rawPayload)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let i = 3; i < data.length; i += 4) {
      expect(data[i]).toBe(255);
    }
  });

  it("preserves partial transparency in PNG", async () => {
    const semiTransparent = await sharp({
      create: {
        width: 50,
        height: 50,
        channels: 4,
        background: { r: 100, g: 100, b: 100, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();

    const res = await postTool(
      { mode: "auto", intensity: 50 },
      semiTransparent,
      "semi.png",
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
    expect(meta.channels).toBe(4);

    const { data, info } = await sharp(dlRes.rawPayload)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const alphaValues = new Set<number>();
    for (let i = 3; i < data.length; i += info.channels) {
      alphaValues.add(data[i]);
    }
    expect(alphaValues.size).toBe(1);
  });
});

// ── Large file handling ─────────────────────────────────────────
describe("Large file handling", () => {
  it("enhances a large stress image", { timeout: 120_000 }, async () => {
    const large = readFileSync(join(FIXTURES, "content", "stress-large.jpg"));
    const res = await postTool(
      { mode: "auto", intensity: 50 },
      large,
      "stress-large.jpg",
      "image/jpeg",
    );
    // A large image can exceed the synchronous window and fall back to 202
    // (async) on slower CI runners; accept either and assert the payload only
    // when it completed synchronously.
    expect([200, 202]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const result = JSON.parse(res.body);
      expect(result.processedSize).toBeGreaterThan(0);
    }
  });
});

// ── Tiny file handling ──────────────────────────────────────────
describe("Tiny file handling", () => {
  it("enhances a 1x1 pixel image", async () => {
    const tiny = readFileSync(join(FIXTURES, "test-1x1.png"));
    const res = await postTool({ mode: "auto" }, tiny, "tiny.png", "image/png");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });
});

// ── Empty file handling ─────────────────────────────────────────
describe("Empty file handling", () => {
  it("returns 400 for empty file upload", async () => {
    const res = await postTool({ mode: "auto" }, Buffer.alloc(0), "empty.png", "image/png");
    expect(res.statusCode).toBe(400);
  });
});

// ── Document mode with different inputs ─────────────────────────
describe("Document mode variations", () => {
  it("enhances JPEG in document mode at high intensity", async () => {
    const res = await postTool({ mode: "document", intensity: 90 }, JPG, "doc.jpg", "image/jpeg");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("enhances WebP in landscape mode", async () => {
    const res = await postTool(
      { mode: "landscape", intensity: 70 },
      WEBP,
      "landscape.webp",
      "image/webp",
    );
    expect(res.statusCode).toBe(200);
  });
});

// ── Authentication ──────────────────────────────────────────────
describe("Authentication", () => {
  it("returns 401 for unauthenticated request", async () => {
    const { body: payload, contentType } = makePayload({ mode: "auto" });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-enhancement",
      payload,
      headers: { "content-type": contentType },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ── HEIF input ─────────────────────────────────────────────────
describe("HEIF input", () => {
  it("enhances HEIF (sample.heif) input", { timeout: 300_000 }, async () => {
    const HEIF = readFileSync(join(FIXTURES, "formats", "sample.heif"));
    const res = await postTool({ mode: "auto" }, HEIF, "sample.heif", "image/heif");
    expect([200, 422]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const result = JSON.parse(res.body);
      expect(result.downloadUrl).toBeDefined();
      expect(result.processedSize).toBeGreaterThan(0);
    }
  });
});

// ── SVG input ──────────────────────────────────────────────────
describe("SVG input", () => {
  it("enhances SVG input after rasterization", async () => {
    const res = await postTool({ mode: "auto" }, SVG, "test.svg", "image/svg+xml");
    expect([200, 400, 422]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const result = JSON.parse(res.body);
      expect(result.downloadUrl).toBeDefined();
    }
  });
});

// ── Animated GIF input ─────────────────────────────────────────
describe("Animated GIF input", () => {
  it("enhances animated GIF input", async () => {
    const res = await postTool({ mode: "auto" }, GIF, "animated.gif", "image/gif");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });
});

// ── Selective correction combinations ───────────────────────────
describe("Selective correction edge cases", () => {
  it("enables only contrast and white balance", async () => {
    const res = await postTool({
      corrections: {
        exposure: false,
        contrast: true,
        whiteBalance: true,
        saturation: false,
        sharpness: false,
        denoise: false,
      },
    });
    expect(res.statusCode).toBe(200);
  });

  it("enables only saturation at max intensity", async () => {
    const res = await postTool({
      intensity: 100,
      corrections: {
        exposure: false,
        contrast: false,
        whiteBalance: false,
        saturation: true,
        sharpness: false,
        denoise: false,
      },
    });
    expect(res.statusCode).toBe(200);
  });
});

// ── Partial corrections object ──────────────────────────────────
describe("Partial corrections object", () => {
  it("accepts corrections with only some fields specified", async () => {
    const res = await postTool({
      corrections: {
        exposure: true,
        contrast: false,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("accepts empty corrections object (all defaults)", async () => {
    const res = await postTool({
      corrections: {},
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });
});

// ── Output format verification for different inputs ─────────────
describe("Output format for different input formats", () => {
  it("preserves WebP format for WebP input", async () => {
    const res = await postTool({ mode: "auto" }, WEBP, "test.webp", "image/webp");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("webp");
  });

  it("preserves PNG format for PNG input", async () => {
    const res = await postTool({ mode: "auto" }, PNG, "test.png", "image/png");
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

// ── Output dimension verification ───────────────────────────────
describe("Output dimension verification", () => {
  it("preserves JPEG input dimensions", async () => {
    const res = await postTool({ mode: "auto" }, JPG, "test.jpg", "image/jpeg");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(100);
  });

  it("preserves WebP input dimensions", async () => {
    const res = await postTool({ mode: "landscape" }, WEBP, "test.webp", "image/webp");
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

// ── Response structure ──────────────────────────────────────────
describe("Response structure", () => {
  it("returns all expected fields in 200 response", async () => {
    const res = await postTool({ mode: "auto" });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    expect(result).toHaveProperty("jobId");
    expect(result).toHaveProperty("downloadUrl");
    expect(result).toHaveProperty("originalSize");
    expect(result).toHaveProperty("processedSize");
    expect(typeof result.jobId).toBe("string");
    expect(typeof result.downloadUrl).toBe("string");
    expect(typeof result.originalSize).toBe("number");
    expect(typeof result.processedSize).toBe("number");
    expect(result.processedSize).toBeGreaterThan(0);
  });
});

// ── Analyze endpoint with different formats ─────────────────────
describe("Analyze endpoint format coverage", () => {
  it("analyze works with PNG input", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-enhancement/analyze",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.corrections).toBeDefined();
    expect(typeof result.corrections).toBe("object");
  });

  it("analyze returns consistent structure across formats", async () => {
    const formats = [
      { buf: JPG, name: "test.jpg", ct: "image/jpeg" },
      { buf: PNG, name: "test.png", ct: "image/png" },
    ];

    for (const fmt of formats) {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: fmt.name, contentType: fmt.ct, content: fmt.buf },
      ]);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image-enhancement/analyze",
        payload,
        headers: {
          "content-type": contentType,
          authorization: `Bearer ${adminToken}`,
        },
      });
      expect(res.statusCode).toBe(200);
      const result = JSON.parse(res.body);
      expect(result.corrections).toBeDefined();
    }
  });
});

// ── Mode with selective corrections ─────────────────────────────
describe("Mode with selective corrections", () => {
  it("document mode with only sharpness enabled", async () => {
    const res = await postTool({
      mode: "document",
      intensity: 80,
      corrections: {
        exposure: false,
        contrast: false,
        whiteBalance: false,
        saturation: false,
        sharpness: true,
        denoise: false,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("landscape mode with denoise and exposure only", async () => {
    const res = await postTool({
      mode: "landscape",
      intensity: 60,
      corrections: {
        exposure: true,
        contrast: false,
        whiteBalance: false,
        saturation: false,
        sharpness: false,
        denoise: true,
      },
    });
    expect(res.statusCode).toBe(200);
  });
});

// ── Invalid image data ──────────────────────────────────────────
describe("Invalid image data", () => {
  it("returns 400 for corrupt image data on main endpoint", async () => {
    const res = await postTool(
      { mode: "auto" },
      Buffer.from("not an image file at all"),
      "garbage.png",
      "image/png",
    );
    expect(res.statusCode).toBe(400);
  });
});

// ── Large file with specific modes ──────────────────────────────
describe("Large file with modes", () => {
  it("enhances large image in low-light mode", { timeout: 120_000 }, async () => {
    const large = readFileSync(join(FIXTURES, "content", "stress-large.jpg"));
    const res = await postTool(
      { mode: "low-light", intensity: 70 },
      large,
      "stress-large.jpg",
      "image/jpeg",
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("enhances large image in document mode", { timeout: 120_000 }, async () => {
    const large = readFileSync(join(FIXTURES, "content", "stress-large.jpg"));
    const res = await postTool(
      { mode: "document", intensity: 90 },
      large,
      "stress-large.jpg",
      "image/jpeg",
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });
});

// ── Deep Enhance ───────────────────────────────────────────────
describe("Deep Enhance", () => {
  it("accepts deepEnhance setting and returns 200", async () => {
    const res = await postTool({ deepEnhance: true });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("works without deepEnhance (default false)", async () => {
    const res = await postTool({});
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });
});

// ── Darkening regression test ──────────────────────────────────
describe("Darkening regression", () => {
  it("does not darken image at default intensity", async () => {
    // Create a known mid-brightness image
    const midGray = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 128, g: 128, b: 128 },
      },
    })
      .jpeg()
      .toBuffer();

    const originalStats = await sharp(midGray).stats();
    const originalMean =
      originalStats.channels[0].mean * 0.299 +
      originalStats.channels[1].mean * 0.587 +
      originalStats.channels[2].mean * 0.114;

    const res = await postTool(
      { mode: "auto", intensity: 50 },
      midGray,
      "midgray.jpg",
      "image/jpeg",
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const enhancedStats = await sharp(dlRes.rawPayload).stats();
    const enhancedMean =
      enhancedStats.channels[0].mean * 0.299 +
      enhancedStats.channels[1].mean * 0.587 +
      enhancedStats.channels[2].mean * 0.114;

    // The enhanced image should not lose more than 30% brightness
    // (regression: older versions would darken images dramatically)
    expect(enhancedMean).toBeGreaterThan(originalMean * 0.7);
  });

  it("does not darken a bright image", async () => {
    const bright = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 220, g: 220, b: 220 },
      },
    })
      .jpeg()
      .toBuffer();

    const originalStats = await sharp(bright).stats();
    const originalMean = originalStats.channels[0].mean;

    const res = await postTool({ mode: "auto", intensity: 50 }, bright, "bright.jpg", "image/jpeg");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const enhancedStats = await sharp(dlRes.rawPayload).stats();
    const enhancedMean = enhancedStats.channels[0].mean;

    // Bright images should not be darkened more than 25%
    expect(enhancedMean).toBeGreaterThan(originalMean * 0.75);
  });
});

// ── Portrait image enhancement ─────────────────────────────────
describe("Portrait image enhancement", () => {
  it("enhances a real portrait image in portrait mode", async () => {
    const portrait = readFileSync(join(FIXTURES, "test-portrait.jpg"));
    const res = await postTool(
      { mode: "portrait", intensity: 60 },
      portrait,
      "portrait.jpg",
      "image/jpeg",
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBeGreaterThan(0);
    expect(meta.height).toBeGreaterThan(0);
  });

  it("enhances portrait-color content image in landscape mode", async () => {
    const portraitColor = readFileSync(join(FIXTURES, "content", "portrait-color.jpg"));
    const res = await postTool(
      { mode: "landscape", intensity: 70 },
      portraitColor,
      "portrait-color.jpg",
      "image/jpeg",
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });
});

// ── Batch processing (5+ images) ───────────────────────────────
describe("Batch processing", () => {
  it("batch processes 5+ images and returns a ZIP", async () => {
    const TINY = readFileSync(join(FIXTURES, "test-1x1.png"));
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      { name: "file", filename: "c.webp", contentType: "image/webp", content: WEBP },
      { name: "file", filename: "d.png", contentType: "image/png", content: TINY },
      { name: "file", filename: "e.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ mode: "auto", intensity: 50 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-enhancement/batch",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");

    const AdmZip = (await import("adm-zip")).default;
    const zip = new AdmZip(res.rawPayload);
    const entries = zip.getEntries();
    expect(entries.length).toBe(5);

    // Each entry should be a valid image with size > 0
    for (const entry of entries) {
      expect(entry.getData().length).toBeGreaterThan(0);
    }
  });

  it("batch returns 400 with no files", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({ mode: "auto" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-enhancement/batch",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(400);
  });
});

// ── Analyze endpoint response structure ────────────────────────
describe("Analyze endpoint response structure", () => {
  it("analysis returns scores and corrections objects", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "test.jpg", contentType: "image/jpeg", content: JPG },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-enhancement/analyze",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result).toHaveProperty("scores");
    expect(result).toHaveProperty("corrections");
    expect(result).toHaveProperty("issues");
    expect(result).toHaveProperty("suggestedMode");

    // Scores should have expected fields
    expect(typeof result.scores.exposure).toBe("number");
    expect(typeof result.scores.contrast).toBe("number");
    expect(typeof result.scores.whiteBalance).toBe("number");
    expect(typeof result.scores.saturation).toBe("number");
    expect(typeof result.scores.sharpness).toBe("number");
    expect(typeof result.scores.noise).toBe("number");

    // Corrections should have expected fields
    expect(typeof result.corrections.brightness).toBe("number");
    expect(typeof result.corrections.contrast).toBe("number");
    expect(typeof result.corrections.temperature).toBe("number");
    expect(typeof result.corrections.saturation).toBe("number");
    expect(typeof result.corrections.sharpness).toBe("number");
    expect(typeof result.corrections.denoise).toBe("number");

    // Issues should be an array of strings
    expect(Array.isArray(result.issues)).toBe(true);

    // SuggestedMode should be a valid mode string
    expect(["auto", "portrait", "landscape", "low-light", "food", "document"]).toContain(
      result.suggestedMode,
    );
  });
});

// ── Low-light image detection ──────────────────────────────────
describe("Low-light image analysis", () => {
  it("analysis suggests low-light mode for dark image", async () => {
    const dark = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 20, g: 20, b: 20 },
      },
    })
      .jpeg()
      .toBuffer();

    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "dark.jpg", contentType: "image/jpeg", content: dark },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-enhancement/analyze",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.suggestedMode).toBe("low-light");
    expect(result.issues).toContain("underexposed");
  });
});
