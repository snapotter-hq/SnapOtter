/**
 * Integration tests for the image-to-base64 tool.
 *
 * Converts image(s) to base64 strings. Custom route that returns JSON
 * with results/errors arrays rather than a file download.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
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

describe("image-to-base64", () => {
  it("converts a PNG to base64", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results).toHaveLength(1);
    expect(json.errors).toHaveLength(0);

    const result = json.results[0];
    expect(result.filename).toBe("test.png");
    expect(result.base64).toBeDefined();
    expect(result.base64.length).toBeGreaterThan(0);
    expect(result.dataUri).toMatch(/^data:image\/.+;base64,/);
    expect(result.mimeType).toContain("image/");
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    expect(result.originalSize).toBe(PNG.length);
    expect(result.encodedSize).toBeGreaterThan(0);
    expect(typeof result.overheadPercent).toBe("number");
  });

  it("base64 output is valid", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    const b64 = json.results[0].base64;
    // Verify it decodes without error
    const decoded = Buffer.from(b64, "base64");
    expect(decoded.length).toBeGreaterThan(0);
    // Re-encoding should match
    expect(decoded.toString("base64")).toBe(b64);
  });

  it("converts multiple images", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "img1.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "img2.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results).toHaveLength(2);
    expect(json.results[0].filename).toBe("img1.png");
    expect(json.results[1].filename).toBe("img2.jpg");
  });

  it("converts to a specific output format", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ outputFormat: "jpeg" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results[0].mimeType).toBe("image/jpeg");
    expect(json.results[0].dataUri).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("applies maxWidth resize", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ maxWidth: 50 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results[0].width).toBeLessThanOrEqual(50);
  });

  it("applies maxHeight resize", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ maxHeight: 50 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results[0].height).toBeLessThanOrEqual(50);
  });

  it("rejects request without any files", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toContain("No image files");
  });

  it("rejects invalid quality setting", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ quality: 0 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toContain("Invalid settings");
  });
});
