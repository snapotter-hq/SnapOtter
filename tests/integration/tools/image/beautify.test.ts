/**
 * Integration tests for the beautify tool (/api/v1/tools/image/beautify).
 *
 * Beautify adds polished backgrounds, shadows, device frames, watermarks,
 * and social media sizing to screenshots. Tests exercise all background types,
 * frame variants, shadow presets, social presets, watermarks, padding/radius
 * extremes, format forcing, and error handling through the HTTP layer.
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

function post(url: string, payload: { body: Buffer; contentType: string }) {
  return app.inject({
    method: "POST",
    url,
    headers: {
      authorization: `Bearer ${adminToken}`,
      "content-type": payload.contentType,
    },
    body: payload.body,
  });
}

describe("Beautify", () => {
  // ── Background types ────────────────────────────────────────────────

  it("default settings produce valid PNG", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(200);

    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.jobId).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("solid background", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          backgroundType: "solid",
          backgroundColor: "#ff0000",
        }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(200);

    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("linear gradient background", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          backgroundType: "linear-gradient",
          gradientStops: [
            { color: "#ff0000", position: 0 },
            { color: "#0000ff", position: 100 },
          ],
          gradientAngle: 45,
        }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(200);

    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("radial gradient background", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          backgroundType: "radial-gradient",
          gradientStops: [
            { color: "#ffffff", position: 0 },
            { color: "#000000", position: 100 },
          ],
        }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(200);

    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("transparent background", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ backgroundType: "transparent" }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(200);

    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  // ── Image background ────────────────────────────────────────────────

  it("image background with second file", async () => {
    const bgImage = await sharp({
      create: {
        width: 400,
        height: 300,
        channels: 4,
        background: { r: 0, g: 0, b: 255, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "backgroundImage", filename: "bg.png", contentType: "image/png", content: bgImage },
      {
        name: "settings",
        content: JSON.stringify({ backgroundType: "image" }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(200);

    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });

  // ── Multi-stop gradient ─────────────────────────────────────────────

  it("three-stop gradient", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          backgroundType: "linear-gradient",
          gradientStops: [
            { color: "#ff0000", position: 0 },
            { color: "#00ff00", position: 50 },
            { color: "#0000ff", position: 100 },
          ],
          gradientAngle: 90,
        }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(200);

    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  // ── Frames ──────────────────────────────────────────────────────────

  const FRAME_TYPES = [
    "macos-light",
    "macos-dark",
    "windows-light",
    "windows-dark",
    "browser-light",
    "browser-dark",
    "iphone",
    "macbook",
    "ipad",
  ] as const;

  for (const frame of FRAME_TYPES) {
    it(`frame: ${frame}`, async () => {
      const payload = createMultipartPayload([
        { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
        {
          name: "settings",
          content: JSON.stringify({ frame, shadowPreset: "none" }),
        },
      ]);

      const res = await post("/api/v1/tools/image/beautify", payload);
      expect(res.statusCode).toBe(200);

      const result = JSON.parse(res.body);
      expect(result.downloadUrl).toBeDefined();

      const dlRes = await app.inject({
        method: "GET",
        url: result.downloadUrl,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(dlRes.statusCode).toBe(200);

      const meta = await sharp(dlRes.rawPayload).metadata();
      expect(meta.width).toBeGreaterThan(0);
      expect(meta.height).toBeGreaterThan(0);
    });
  }

  // ── Shadows ─────────────────────────────────────────────────────────

  const SHADOW_PRESETS = ["none", "subtle", "medium", "dramatic"] as const;

  for (const shadowPreset of SHADOW_PRESETS) {
    it(`shadow preset: ${shadowPreset}`, async () => {
      const payload = createMultipartPayload([
        { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
        {
          name: "settings",
          content: JSON.stringify({ shadowPreset }),
        },
      ]);

      const res = await post("/api/v1/tools/image/beautify", payload);
      expect(res.statusCode).toBe(200);

      const result = JSON.parse(res.body);
      expect(result.downloadUrl).toBeDefined();
    });
  }

  it("custom shadow", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          shadowPreset: "custom",
          shadowBlur: 50,
          shadowOffsetX: 10,
          shadowOffsetY: 15,
          shadowColor: "#ff0000",
          shadowOpacity: 60,
        }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(200);

    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  // ── Social presets with dimension verification ──────────────────────

  const SOCIAL_PRESETS: Record<string, { w: number; h: number }> = {
    twitter: { w: 1600, h: 900 },
    linkedin: { w: 1200, h: 627 },
    "instagram-square": { w: 1080, h: 1080 },
    "instagram-story": { w: 1080, h: 1920 },
    facebook: { w: 1200, h: 630 },
    producthunt: { w: 1270, h: 760 },
  };

  for (const [preset, dims] of Object.entries(SOCIAL_PRESETS)) {
    it(`social preset: ${preset} (${dims.w}x${dims.h})`, async () => {
      const payload = createMultipartPayload([
        { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
        {
          name: "settings",
          content: JSON.stringify({ socialPreset: preset, shadowPreset: "none" }),
        },
      ]);

      const res = await post("/api/v1/tools/image/beautify", payload);
      expect(res.statusCode).toBe(200);

      const result = JSON.parse(res.body);
      expect(result.downloadUrl).toBeDefined();

      const dlRes = await app.inject({
        method: "GET",
        url: result.downloadUrl,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(dlRes.statusCode).toBe(200);

      const meta = await sharp(dlRes.rawPayload).metadata();
      expect(meta.width).toBe(dims.w);
      expect(meta.height).toBe(dims.h);
    });
  }

  // ── Watermark ───────────────────────────────────────────────────────

  it("watermark text bottom-right", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          watermarkText: "SnapOtter",
          watermarkPosition: "bottom-right",
          watermarkOpacity: 80,
        }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(200);

    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  // ── Padding extremes ────────────────────────────────────────────────

  it("padding 0 with no shadow", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ padding: 0, shadowPreset: "none" }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(200);

    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("padding 256", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ padding: 256 }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(200);

    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  // ── Border radius ───────────────────────────────────────────────────

  it("border radius 64", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ borderRadius: 64 }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(200);

    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  // ── Error cases ─────────────────────────────────────────────────────

  it("missing file returns 400", async () => {
    const payload = createMultipartPayload([{ name: "settings", content: JSON.stringify({}) }]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(400);

    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/no image/i);
  });

  it("invalid parameters return 400", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ padding: -1 }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(400);

    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/invalid settings/i);
  });

  // ── Format forcing ──────────────────────────────────────────────────

  it("JPEG input + shadow produces PNG", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "photo.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ shadowPreset: "medium" }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(200);

    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toContain(".png");
  });

  it("JPEG input + opaque settings honors JPEG output", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "photo.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({
          backgroundType: "solid",
          shadowPreset: "none",
          borderRadius: 0,
          frame: "none",
          outputFormat: "jpeg",
        }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(200);

    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toContain(".jpeg");
  });

  // ── Device frame + radius ───────────────────────────────────────────

  it("iPhone frame with borderRadius > 0 (radius silently ignored)", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          frame: "iphone",
          borderRadius: 32,
          shadowPreset: "none",
        }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(200);

    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  // ── Dark device frame variants ──────────────────────────────────────

  const DARK_FRAMES = ["iphone-dark", "macbook-dark", "ipad-dark"] as const;

  for (const frame of DARK_FRAMES) {
    it(`frame: ${frame}`, async () => {
      const payload = createMultipartPayload([
        { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
        {
          name: "settings",
          content: JSON.stringify({ frame, shadowPreset: "none" }),
        },
      ]);

      const res = await post("/api/v1/tools/image/beautify", payload);
      expect(res.statusCode).toBe(200);

      const result = JSON.parse(res.body);
      const dlRes = await app.inject({
        method: "GET",
        url: result.downloadUrl,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(dlRes.statusCode).toBe(200);

      const meta = await sharp(dlRes.rawPayload).metadata();
      expect(meta.width).toBeGreaterThan(200);
      expect(meta.height).toBeGreaterThan(150);
    });
  }

  // ── Frame with title ────────────────────────────────────────────────

  it("macOS frame with custom title", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          frame: "macos-light",
          frameTitle: "My Application",
          shadowPreset: "none",
        }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(200);

    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("browser frame with URL title", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          frame: "browser-light",
          frameTitle: "snapotter.com",
          shadowPreset: "none",
        }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(200);

    const result = JSON.parse(res.body);
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.height).toBeGreaterThan(150 + 72);
  });

  // ── All watermark positions ─────────────────────────────────────────

  const WATERMARK_POSITIONS = [
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
    "center",
  ] as const;

  for (const pos of WATERMARK_POSITIONS) {
    it(`watermark position: ${pos}`, async () => {
      const payload = createMultipartPayload([
        { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
        {
          name: "settings",
          content: JSON.stringify({
            watermarkText: "SnapOtter",
            watermarkPosition: pos,
            watermarkOpacity: 70,
          }),
        },
      ]);

      const res = await post("/api/v1/tools/image/beautify", payload);
      expect(res.statusCode).toBe(200);

      const result = JSON.parse(res.body);
      expect(result.downloadUrl).toBeDefined();
    });
  }

  // ── WebP output format ──────────────────────────────────────────────

  it("WebP output format", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          backgroundType: "solid",
          backgroundColor: "#ffffff",
          shadowPreset: "none",
          borderRadius: 0,
          frame: "none",
          outputFormat: "webp",
        }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(200);

    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toContain(".webp");

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("webp");
  });

  it("WebP output forced to PNG when alpha needed", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          backgroundType: "transparent",
          outputFormat: "webp",
        }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(200);

    const result = JSON.parse(res.body);
    // WebP supports alpha, so it should NOT be forced to PNG
    expect(result.downloadUrl).toContain(".webp");
  });

  it("JPEG output forced to PNG when border radius applied", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "photo.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({
          borderRadius: 20,
          backgroundType: "solid",
          shadowPreset: "none",
          outputFormat: "jpeg",
        }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(200);

    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toContain(".png");
  });

  // ── Feature combinations ────────────────────────────────────────────

  it("all features combined: frame + shadow + gradient + watermark + social", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          backgroundType: "linear-gradient",
          gradientStops: [
            { color: "#ff6b6b", position: 0 },
            { color: "#4ecdc4", position: 100 },
          ],
          gradientAngle: 45,
          frame: "macos-dark",
          frameTitle: "Terminal",
          shadowPreset: "dramatic",
          padding: 80,
          borderRadius: 16,
          watermarkText: "snapotter.com",
          watermarkPosition: "bottom-right",
          watermarkOpacity: 40,
          socialPreset: "twitter",
        }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(200);

    const result = JSON.parse(res.body);
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.width).toBe(1600);
    expect(meta.height).toBe(900);
  });

  it("device frame + shadow + solid background", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          frame: "iphone",
          shadowPreset: "medium",
          backgroundType: "solid",
          backgroundColor: "#1a1a2e",
          padding: 100,
        }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(200);

    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  // ── Edge cases ──────────────────────────────────────────────────────

  it("image backgroundType without bgImage falls back to transparent", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          backgroundType: "image",
          shadowPreset: "none",
          padding: 20,
        }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(200);

    const result = JSON.parse(res.body);
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.hasAlpha).toBe(true);
  });

  it("shadow with zero padding (shadow extends beyond image)", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          padding: 0,
          shadowPreset: "dramatic",
          backgroundType: "transparent",
        }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(200);

    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("gradient angle boundary 0", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          backgroundType: "linear-gradient",
          gradientAngle: 0,
          gradientStops: [
            { color: "#000000", position: 0 },
            { color: "#ffffff", position: 100 },
          ],
        }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(200);
  });

  it("gradient angle boundary 360", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          backgroundType: "linear-gradient",
          gradientAngle: 360,
          gradientStops: [
            { color: "#000000", position: 0 },
            { color: "#ffffff", position: 100 },
          ],
        }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(200);
  });

  it("large border radius on small image (clamped to half)", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({
          borderRadius: 64,
          shadowPreset: "none",
          padding: 20,
        }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(200);

    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  // ── XSS prevention in text inputs ───────────────────────────────────

  it("watermark with HTML/SVG special characters", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          watermarkText: '<script>alert("xss")</script>&"test\'',
          watermarkPosition: "center",
        }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(200);

    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("frame title with special characters", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          frame: "macos-light",
          frameTitle: '<img onerror="alert(1)"/> & "quotes"',
          shadowPreset: "none",
        }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(200);

    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  // ── Validation edge cases ───────────────────────────────────────────

  it("padding out of range (>256) returns 400", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ padding: 300 }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(400);
  });

  it("border radius out of range (>64) returns 400", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ borderRadius: 100 }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(400);
  });

  it("shadow blur out of range (>100) returns 400", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ shadowPreset: "custom", shadowBlur: 200 }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(400);
  });

  it("invalid background type returns 400", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ backgroundType: "neon-glow" }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(400);
  });

  it("invalid frame type returns 400", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ frame: "android" }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(400);
  });

  it("gradient with fewer than 2 stops returns 400", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          backgroundType: "linear-gradient",
          gradientStops: [{ color: "#ff0000", position: 0 }],
        }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(400);
  });

  it("gradient stop with invalid hex color returns 400", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          backgroundType: "linear-gradient",
          gradientStops: [
            { color: "red", position: 0 },
            { color: "#0000ff", position: 100 },
          ],
        }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(400);
  });

  it("malformed JSON settings returns 400", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: "{not valid json" },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(400);
  });

  // ── Output content verification ─────────────────────────────────────

  it("solid background pixel color is correct", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          backgroundType: "solid",
          backgroundColor: "#ff0000",
          padding: 50,
          shadowPreset: "none",
          borderRadius: 0,
        }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(200);

    const result = JSON.parse(res.body);
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    const { data, info } = await sharp(dlRes.rawPayload)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const topLeftR = data[0];
    const topLeftG = data[1];
    const topLeftB = data[2];
    expect(topLeftR).toBe(255);
    expect(topLeftG).toBe(0);
    expect(topLeftB).toBe(0);
    expect(info.width).toBe(200 + 100);
    expect(info.height).toBe(150 + 100);
  });

  it("transparent background has alpha=0 at corners", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          backgroundType: "transparent",
          padding: 30,
          shadowPreset: "none",
          borderRadius: 0,
        }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(200);

    const result = JSON.parse(res.body);
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    const { data } = await sharp(dlRes.rawPayload).raw().toBuffer({ resolveWithObject: true });
    const topLeftAlpha = data[3];
    expect(topLeftAlpha).toBe(0);
  });

  it("padding=0, no shadow, no radius preserves original dimensions", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          padding: 0,
          shadowPreset: "none",
          borderRadius: 0,
          backgroundType: "solid",
        }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
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

  // ── HEIC input ─────────────────────────────────────────────────────
  it("HEIC input with solid background", { timeout: 120_000 }, async () => {
    const HEIC = readFixture(fixtures.image.base.heic200);
    const payload = createMultipartPayload([
      { name: "file", filename: "photo.heic", contentType: "image/heic", content: HEIC },
      {
        name: "settings",
        content: JSON.stringify({
          backgroundType: "solid",
          backgroundColor: "#336699",
          padding: 20,
          shadowPreset: "none",
        }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect([200, 422]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const result = JSON.parse(res.body);
      expect(result.downloadUrl).toBeDefined();
      expect(result.processedSize).toBeGreaterThan(0);
    }
  });

  // ── Large file handling ────────────────────────────────────────────
  it("beautifies stress-large.jpg with shadow", async () => {
    const LARGE = readFixture(fixtures.image.stressLarge);
    const payload = createMultipartPayload([
      { name: "file", filename: "large.jpg", contentType: "image/jpeg", content: LARGE },
      {
        name: "settings",
        content: JSON.stringify({
          shadowPreset: "subtle",
          padding: 30,
        }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  // ── Tiny file handling ─────────────────────────────────────────────
  it("beautifies 1x1 pixel image", async () => {
    const TINY = readFixture(fixtures.image.edge.px1);
    const payload = createMultipartPayload([
      { name: "file", filename: "tiny.png", contentType: "image/png", content: TINY },
      {
        name: "settings",
        content: JSON.stringify({
          padding: 20,
          backgroundType: "solid",
          backgroundColor: "#ff0000",
          shadowPreset: "none",
        }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  // ── Empty file handling ────────────────────────────────────────────
  it("returns 400 for empty file upload", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "empty.png", contentType: "image/png", content: Buffer.alloc(0) },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(400);
  });

  // ── Authentication ─────────────────────────────────────────────────
  it("returns 401 for unauthenticated request", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/beautify",
      headers: { "content-type": payload.contentType },
      body: payload.body,
    });

    expect(res.statusCode).toBe(401);
  });

  // ── Response structure ─────────────────────────────────────────────
  it("returns all expected fields in 200 response", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
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

  // ── WebP input ─────────────────────────────────────────────────────
  it("beautifies WebP input with frame", async () => {
    const WEBP = readFixture(fixtures.image.base.webp50);
    const payload = createMultipartPayload([
      { name: "file", filename: "photo.webp", contentType: "image/webp", content: WEBP },
      {
        name: "settings",
        content: JSON.stringify({
          frame: "browser-dark",
          shadowPreset: "none",
          padding: 20,
        }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  // ── Invalid social preset ──────────────────────────────────────────
  it("rejects invalid social preset", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ socialPreset: "tiktok" }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(400);
  });

  // ── Invalid shadow preset ─────────────────────────────────────────
  it("rejects invalid shadow preset", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ shadowPreset: "extreme" }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(400);
  });

  // ── Watermark opacity boundaries ───────────────────────────────────
  it("accepts watermark opacity 0", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          watermarkText: "SnapOtter",
          watermarkPosition: "center",
          watermarkOpacity: 0,
        }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(200);
  });

  it("accepts watermark opacity 100", async () => {
    const payload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          watermarkText: "SnapOtter",
          watermarkPosition: "center",
          watermarkOpacity: 100,
        }),
      },
    ]);

    const res = await post("/api/v1/tools/image/beautify", payload);
    expect(res.statusCode).toBe(200);
  });
});
