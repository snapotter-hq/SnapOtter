/**
 * Integration tests for the color-adjustments tool.
 *
 * Covers brightness, contrast, exposure, saturation, hue, temperature, tint,
 * sharpness, channel adjustments, and effects (grayscale, sepia, invert).
 * Also tests legacy alias routes (brightness-contrast, saturation, etc.).
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
  toolId: string,
  settings: Record<string, unknown>,
  buffer?: Buffer,
  filename?: string,
  ct?: string,
) {
  const { body: payload, contentType } = makePayload(settings, buffer, filename, ct);
  return app.inject({
    method: "POST",
    url: `/api/v1/tools/${toolId}`,
    payload,
    headers: {
      "content-type": contentType,
      authorization: `Bearer ${adminToken}`,
    },
  });
}

// ── Brightness ────────────────────────────────────────────────────
describe("Brightness", () => {
  it("increases brightness", async () => {
    const res = await postTool("adjust-colors", { brightness: 50 });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("decreases brightness", async () => {
    const res = await postTool("adjust-colors", { brightness: -50 });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });
});

// ── Contrast ──────────────────────────────────────────────────────
describe("Contrast", () => {
  it("increases contrast", async () => {
    const res = await postTool("adjust-colors", { contrast: 75 });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("decreases contrast", async () => {
    const res = await postTool("adjust-colors", { contrast: -40 });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });
});

// ── Multiple adjustments at once ──────────────────────────────────
describe("Multiple adjustments", () => {
  it("applies brightness + contrast + saturation together", async () => {
    const res = await postTool("adjust-colors", {
      brightness: 20,
      contrast: -10,
      saturation: 30,
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("applies exposure + temperature + tint", async () => {
    const res = await postTool("adjust-colors", {
      exposure: 25,
      temperature: 40,
      tint: -20,
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("applies hue shift + sharpness + channel adjustments", async () => {
    const res = await postTool("adjust-colors", {
      hue: 90,
      sharpness: 50,
      red: 120,
      green: 80,
      blue: 150,
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });
});

// ── Extreme values ────────────────────────────────────────────────
describe("Extreme values", () => {
  it("handles max brightness (+100)", async () => {
    const res = await postTool("adjust-colors", { brightness: 100 });
    expect(res.statusCode).toBe(200);
  });

  it("handles min brightness (-100)", async () => {
    const res = await postTool("adjust-colors", { brightness: -100 });
    expect(res.statusCode).toBe(200);
  });

  it("handles max contrast (+100)", async () => {
    const res = await postTool("adjust-colors", { contrast: 100 });
    expect(res.statusCode).toBe(200);
  });

  it("handles all zeroes (no-op)", async () => {
    const res = await postTool("adjust-colors", {});
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("handles extreme hue rotation (+180)", async () => {
    const res = await postTool("adjust-colors", { hue: 180 });
    expect(res.statusCode).toBe(200);
  });

  it("handles extreme hue rotation (-180)", async () => {
    const res = await postTool("adjust-colors", { hue: -180 });
    expect(res.statusCode).toBe(200);
  });

  it("handles max channel values (red=200, green=200, blue=200)", async () => {
    const res = await postTool("adjust-colors", { red: 200, green: 200, blue: 200 });
    expect(res.statusCode).toBe(200);
  });

  it("handles min channel values (red=0, green=0, blue=0)", async () => {
    const res = await postTool("adjust-colors", { red: 0, green: 0, blue: 0 });
    expect(res.statusCode).toBe(200);
  });
});

// ── Effects ───────────────────────────────────────────────────────
describe("Effects", () => {
  it("applies grayscale effect", async () => {
    const res = await postTool("adjust-colors", { effect: "grayscale" });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("applies sepia effect", async () => {
    const res = await postTool("adjust-colors", { effect: "sepia" });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("applies invert effect", async () => {
    const res = await postTool("adjust-colors", { effect: "invert" });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });
});

// ── Format support ────────────────────────────────────────────────
describe("Multiple input formats", () => {
  it("processes JPEG input", async () => {
    const res = await postTool("adjust-colors", { brightness: 30 }, JPG, "test.jpg", "image/jpeg");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("processes WebP input", async () => {
    const res = await postTool(
      "adjust-colors",
      { saturation: 50 },
      WEBP,
      "test.webp",
      "image/webp",
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });
});

// ── Legacy alias routes ───────────────────────────────────────────
describe("Legacy alias routes", () => {
  it("brightness-contrast alias works", async () => {
    const res = await postTool("brightness-contrast", { brightness: 25, contrast: -10 });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("saturation alias works", async () => {
    const res = await postTool("saturation", { saturation: 50 });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("color-channels alias works", async () => {
    const res = await postTool("color-channels", { red: 150, green: 50, blue: 100 });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("color-effects alias works", async () => {
    const res = await postTool("color-effects", { effect: "sepia" });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });
});

// ── Error handling ────────────────────────────────────────────────
describe("Error handling", () => {
  it("returns 400 when no file is provided", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({ brightness: 50 }) },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/adjust-colors",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid settings (brightness out of range)", async () => {
    const res = await postTool("adjust-colors", { brightness: 500 });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid effect value", async () => {
    const res = await postTool("adjust-colors", { effect: "neon" });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid channel value (negative)", async () => {
    const res = await postTool("adjust-colors", { red: -10 });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for hue out of range", async () => {
    const res = await postTool("adjust-colors", { hue: 360 });
    expect(res.statusCode).toBe(400);
  });
});

// ── Download verification ─────────────────────────────────────────
describe("Download verification", () => {
  it("can download the adjusted image and it has valid dimensions", async () => {
    const res = await postTool("adjust-colors", { brightness: 30, effect: "sepia" });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(dlRes.statusCode).toBe(200);

    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });
});
