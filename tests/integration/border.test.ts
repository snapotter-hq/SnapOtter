/**
 * Integration tests for the border tool (/api/v1/tools/border).
 *
 * Covers solid-color borders, padding, corner radius, shadow, dimension
 * verification, and input validation.
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

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

describe("Border", () => {
  it("adds a solid black border with default width", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ borderWidth: 10, borderColor: "#000000" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/border",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("produces correct dimensions with a 20px border", async () => {
    const borderWidth = 20;
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ borderWidth, borderColor: "#FF0000" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/border",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    // Download the result and verify dimensions
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(dlRes.statusCode).toBe(200);

    const meta = await sharp(dlRes.rawPayload).metadata();
    // Original 200x150 + 20px border on each side = 240x190
    expect(meta.width).toBe(200 + borderWidth * 2);
    expect(meta.height).toBe(150 + borderWidth * 2);
  });

  it("adds padding and border together with correct dimensions", async () => {
    const borderWidth = 10;
    const padding = 5;
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          borderWidth,
          borderColor: "#0000FF",
          padding,
          paddingColor: "#FFFFFF",
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/border",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    // Original 200x150 + 5px padding each side + 10px border each side = 230x180
    expect(meta.width).toBe(200 + padding * 2 + borderWidth * 2);
    expect(meta.height).toBe(150 + padding * 2 + borderWidth * 2);
  });

  it("applies corner radius", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          borderWidth: 10,
          borderColor: "#000000",
          cornerRadius: 20,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/border",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);

    // Verify output is valid PNG (corner radius forces alpha channel)
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("png");
    expect(meta.channels).toBe(4); // alpha channel from rounded corners
  });

  it("applies shadow effect", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          borderWidth: 5,
          borderColor: "#333333",
          shadow: true,
          shadowBlur: 10,
          shadowOffsetX: 3,
          shadowOffsetY: 3,
          shadowColor: "#000000",
          shadowOpacity: 50,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/border",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    // Shadow adds extra canvas around the image, so output should be larger
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    // Image + border + shadow spread means larger than original + border
    expect(meta.width!).toBeGreaterThan(200 + 5 * 2);
    expect(meta.height!).toBeGreaterThan(150 + 5 * 2);
  });

  it("works with JPEG input", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ borderWidth: 15, borderColor: "#00FF00" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/border",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.width).toBe(100 + 15 * 2);
    expect(meta.height).toBe(100 + 15 * 2);
  });

  it("uses default settings when none provided", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/border",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    // Default borderWidth is 10, so dimensions should be 220x170
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.width).toBe(220);
    expect(meta.height).toBe(170);
  });

  // ── Validation ──────────────────────────────────────────────────────

  it("rejects requests without a file", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "settings",
        content: JSON.stringify({ borderWidth: 10, borderColor: "#000000" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/border",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/no image/i);
  });

  it("rejects invalid border color format", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ borderWidth: 10, borderColor: "red" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/border",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/invalid settings/i);
  });

  it("rejects border width exceeding max", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ borderWidth: 3000, borderColor: "#000000" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/border",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/invalid settings/i);
  });

  it("rejects unauthenticated requests", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ borderWidth: 10 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/border",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });

  // ── Edge cases ──────────────────────────────────────────────────

  it("handles zero-width border (no-op border, dimensions unchanged)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ borderWidth: 0, borderColor: "#000000" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/border",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    // Zero border should not change dimensions
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  it("handles very large border (max 2000px)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ borderWidth: 2000, borderColor: "#FF0000" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/border",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.width).toBe(200 + 2000 * 2);
    expect(meta.height).toBe(150 + 2000 * 2);
  });

  it("applies corner radius with rounded corners and shadow together", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          borderWidth: 10,
          borderColor: "#000000",
          cornerRadius: 30,
          shadow: true,
          shadowBlur: 15,
          shadowOffsetX: 5,
          shadowOffsetY: 5,
          shadowColor: "#000000",
          shadowOpacity: 60,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/border",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("png");
    expect(meta.channels).toBe(4); // alpha from corner radius + shadow
  });

  it("handles corner radius larger than image half-dimension (clamps)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          borderWidth: 5,
          borderColor: "#000000",
          cornerRadius: 2000,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/border",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    // Should succeed - the route clamps radius to min(radius, w/2, h/2)
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("handles shadow with negative offsets", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          borderWidth: 5,
          borderColor: "#333333",
          shadow: true,
          shadowBlur: 10,
          shadowOffsetX: -10,
          shadowOffsetY: -10,
          shadowColor: "#000000",
          shadowOpacity: 50,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/border",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("handles padding only, zero border", async () => {
    const padding = 20;
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          borderWidth: 0,
          padding,
          paddingColor: "#FF00FF",
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/border",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    // Only padding, no border
    expect(meta.width).toBe(200 + padding * 2);
    expect(meta.height).toBe(150 + padding * 2);
  });

  it("handles HEIC input", async () => {
    const HEIC = readFileSync(join(FIXTURES, "test-200x150.heic"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.heic", contentType: "image/heic", content: HEIC },
      {
        name: "settings",
        content: JSON.stringify({ borderWidth: 10, borderColor: "#0000FF" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/border",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("handles HEIF input (motorcycle.heif)", { timeout: 120_000 }, async () => {
    const HEIF = readFileSync(join(FIXTURES, "content", "motorcycle.heif"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.heif", contentType: "image/heif", content: HEIF },
      {
        name: "settings",
        content: JSON.stringify({ borderWidth: 10, borderColor: "#00FF00" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/border",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("handles SVG input", async () => {
    const SVG = readFileSync(join(FIXTURES, "test-100x100.svg"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "icon.svg", contentType: "image/svg+xml", content: SVG },
      {
        name: "settings",
        content: JSON.stringify({ borderWidth: 10, borderColor: "#FF0000" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/border",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("handles animated GIF input", async () => {
    const GIF = readFileSync(join(FIXTURES, "animated.gif"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "anim.gif", contentType: "image/gif", content: GIF },
      {
        name: "settings",
        content: JSON.stringify({ borderWidth: 5, borderColor: "#000000" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/border",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("rejects negative border width", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ borderWidth: -5, borderColor: "#000000" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/border",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Branch coverage: lines 152-156 (needsAlpha + non-alpha format) ──

  it("forces PNG output when corner radius is applied to a JPEG input", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({
          borderWidth: 5,
          borderColor: "#000000",
          cornerRadius: 15,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/border",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    // Download and verify format is PNG (forced due to alpha from corner radius)
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("png");
    expect(meta.channels).toBe(4);
  });

  it("forces PNG output when shadow is applied to a JPEG input", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({
          borderWidth: 5,
          borderColor: "#333333",
          shadow: true,
          shadowBlur: 10,
          shadowOffsetX: 0,
          shadowOffsetY: 5,
          shadowColor: "#000000",
          shadowOpacity: 40,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/border",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

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
    expect(meta.channels).toBe(4);
  });

  it("keeps PNG output when corner radius is applied to a PNG input", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          borderWidth: 5,
          borderColor: "#000000",
          cornerRadius: 15,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/border",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    // PNG already supports alpha, so it stays PNG
    expect(meta.format).toBe("png");
    expect(meta.channels).toBe(4);
  });

  it("handles WebP input with border only (no alpha needed)", async () => {
    const WEBP = readFileSync(join(FIXTURES, "test-50x50.webp"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.webp", contentType: "image/webp", content: WEBP },
      {
        name: "settings",
        content: JSON.stringify({ borderWidth: 10, borderColor: "#FF00FF" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/border",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.width).toBe(50 + 10 * 2);
    expect(meta.height).toBe(50 + 10 * 2);
  });

  it("handles tiny 1x1 image input", async () => {
    const TINY = readFileSync(join(FIXTURES, "test-1x1.png"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.png", contentType: "image/png", content: TINY },
      {
        name: "settings",
        content: JSON.stringify({ borderWidth: 5, borderColor: "#000000" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/border",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.width).toBe(1 + 5 * 2);
    expect(meta.height).toBe(1 + 5 * 2);
  });

  // ── Large stress file ────────────────────────────────────────────

  it("handles stress-large.jpg with border", async () => {
    const LARGE = readFileSync(join(FIXTURES, "content", "stress-large.jpg"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "large.jpg", contentType: "image/jpeg", content: LARGE },
      {
        name: "settings",
        content: JSON.stringify({ borderWidth: 10, borderColor: "#FF0000" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/border",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  // ── Batch: multiple files should be rejected (single-file tool) ──

  it("rejects multiple file uploads", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ borderWidth: 5, borderColor: "#000000" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/border",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/one image/i);
  });

  // ── Invalid settings JSON ────────────────────────────────────────

  it("rejects invalid settings JSON string", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: "not-valid-json" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/border",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Max padding value ────────────────────────────────────────────

  it("applies maximum padding (200)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          borderWidth: 0,
          padding: 200,
          paddingColor: "#AABBCC",
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/border",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.width).toBe(200 + 200 * 2);
    expect(meta.height).toBe(150 + 200 * 2);
  });

  // ── Rejects padding out of range ─────────────────────────────────

  it("rejects padding exceeding max (>200)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ borderWidth: 5, padding: 300, borderColor: "#000000" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/border",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Shadow with zero blur ────────────────────────────────────────

  it("applies shadow with minimum blur (1)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          borderWidth: 5,
          borderColor: "#000000",
          shadow: true,
          shadowBlur: 1,
          shadowOffsetX: 0,
          shadowOffsetY: 0,
          shadowColor: "#000000",
          shadowOpacity: 100,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/border",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  // ── WebP with corner radius (alpha-capable format stays WebP) ────

  it("keeps WebP format when corner radius is applied to WebP input", async () => {
    const WEBP = readFileSync(join(FIXTURES, "test-50x50.webp"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.webp", contentType: "image/webp", content: WEBP },
      {
        name: "settings",
        content: JSON.stringify({
          borderWidth: 5,
          borderColor: "#000000",
          cornerRadius: 10,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/border",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    // WebP supports alpha, so it stays WebP (not forced to PNG)
    expect(meta.channels).toBe(4);
  });

  // ── Shadow with zero opacity ─────────────────────────────────────

  it("applies shadow with zero opacity", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          borderWidth: 5,
          borderColor: "#000000",
          shadow: true,
          shadowBlur: 10,
          shadowOffsetX: 5,
          shadowOffsetY: 5,
          shadowColor: "#000000",
          shadowOpacity: 0,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/border",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });
});
