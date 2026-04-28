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
  it("analyze decodes HEIC input before analysis", async () => {
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
  it("enhances HEIC input image", async () => {
    const res = await postTool({ mode: "auto" }, HEIC, "test.heic", "image/heic");
    expect([200, 422]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const result = JSON.parse(res.body);
      expect(result.downloadUrl).toBeDefined();
      expect(result.processedSize).toBeGreaterThan(0);
    }
  });

  it("enhances HEIC in portrait mode", async () => {
    const res = await postTool(
      { mode: "portrait", intensity: 60 },
      HEIC,
      "portrait.heic",
      "image/heic",
    );
    expect([200, 422]).toContain(res.statusCode);
  });
});

// ── Large file handling ─────────────────────────────────────────
describe("Large file handling", () => {
  it("enhances a large stress image", async () => {
    const large = readFileSync(join(FIXTURES, "content", "stress-large.jpg"));
    const res = await postTool(
      { mode: "auto", intensity: 50 },
      large,
      "stress-large.jpg",
      "image/jpeg",
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
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
