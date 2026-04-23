/**
 * Integration tests for the watermark-text tool.
 *
 * Adds an SVG text watermark onto an image. Tests verify position options,
 * opacity, font size, tiled mode, and input validation.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const FIXTURES = join(__dirname, "..", "fixtures");
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

describe("watermark-text", () => {
  it("adds a text watermark with default settings", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ text: "Sample" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
    expect(json.jobId).toBeDefined();
    expect(json.processedSize).toBeGreaterThan(0);
  });

  it("output differs from input", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ text: "Watermark" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    // Download the result and verify it differs from the original
    const dlRes = await app.inject({
      method: "GET",
      url: json.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(dlRes.statusCode).toBe(200);
    expect(Buffer.from(dlRes.rawPayload).equals(PNG)).toBe(false);
  });

  it.each([
    "center",
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
    "tiled",
  ] as const)("supports position: %s", async (position) => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ text: "Pos", position }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });

  it("respects custom opacity and font size", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ text: "Custom", opacity: 80, fontSize: 24 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("respects custom color and rotation", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ text: "Red", color: "#FF0000", rotation: 45 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("rejects request without a file", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({ text: "NoFile" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects request without text", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toContain("Invalid settings");
  });

  it("rejects invalid color format", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ text: "Bad", color: "red" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects opacity out of range", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ text: "Bad", opacity: 200 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });
});
