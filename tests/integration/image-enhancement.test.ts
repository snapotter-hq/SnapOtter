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
});
