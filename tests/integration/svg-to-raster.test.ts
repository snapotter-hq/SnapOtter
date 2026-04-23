/**
 * Integration tests for the svg-to-raster tool.
 *
 * Renders SVG files to raster images (PNG, JPG, WebP, etc.). Custom route
 * that validates SVG input separately from the standard image validation.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const FIXTURES = join(__dirname, "..", "fixtures");
const SVG = readFileSync(join(FIXTURES, "test-100x100.svg"));
const PNG = readFileSync(join(FIXTURES, "test-200x150.png"));

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

describe("svg-to-raster", () => {
  it("converts SVG to PNG with default settings", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
    expect(json.jobId).toBeDefined();
    expect(json.processedSize).toBeGreaterThan(0);
  });

  it("output is a valid raster image", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: json.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(dlRes.statusCode).toBe(200);
    const meta = await sharp(Buffer.from(dlRes.rawPayload)).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBeGreaterThan(0);
    expect(meta.height).toBeGreaterThan(0);
  });

  it("respects custom width override", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ width: 200 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    const dlRes = await app.inject({
      method: "GET",
      url: json.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(Buffer.from(dlRes.rawPayload)).metadata();
    expect(meta.width).toBeLessThanOrEqual(200);
  });

  it("respects custom height override", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ height: 50 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    const dlRes = await app.inject({
      method: "GET",
      url: json.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(Buffer.from(dlRes.rawPayload)).metadata();
    expect(meta.height).toBeLessThanOrEqual(50);
  });

  it.each([
    "png",
    "jpg",
    "webp",
  ] as const)("converts to output format: %s", async (outputFormat) => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ outputFormat }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    const dlRes = await app.inject({
      method: "GET",
      url: json.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(Buffer.from(dlRes.rawPayload)).metadata();
    const expectedFormat = outputFormat === "jpg" ? "jpeg" : outputFormat;
    expect(meta.format).toBe(expectedFormat);
  });

  it("respects DPI setting", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ dpi: 72 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("applies background color", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ backgroundColor: "#FF0000" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("rejects request without a file", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toContain("No SVG file");
  });

  it("rejects non-SVG file", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toContain("not a valid SVG");
  });

  it("rejects invalid settings", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ dpi: 5 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });
});
