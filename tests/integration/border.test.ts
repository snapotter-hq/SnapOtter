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
});
