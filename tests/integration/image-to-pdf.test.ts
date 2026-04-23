/**
 * Integration tests for the image-to-pdf tool.
 *
 * Converts one or more images into a PDF document. Custom route that
 * accepts multiple file uploads and settings for page size, orientation,
 * and margin.
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

describe("image-to-pdf", () => {
  it("converts a single image to PDF", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
    expect(json.jobId).toBeDefined();
    expect(json.pages).toBe(1);
    expect(json.processedSize).toBeGreaterThan(0);
  });

  it("output is valid PDF (magic bytes)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-pdf",
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
    const pdfBuffer = Buffer.from(dlRes.rawPayload);
    // PDF files start with %PDF-
    expect(pdfBuffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("converts multiple images to multi-page PDF", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "page1.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "page2.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.pages).toBe(2);
  });

  it.each(["A4", "Letter", "A3", "A5"] as const)("supports page size: %s", async (pageSize) => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ pageSize }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("supports landscape orientation", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ orientation: "landscape" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("supports custom margin", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ margin: 50 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("rejects request without any files", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toContain("No image files");
  });

  it("rejects invalid settings JSON", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: "not-json" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects margin out of range", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ margin: 999 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });
});
