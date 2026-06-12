/**
 * Integration tests for the histogram tool (/api/v1/tools/histogram).
 *
 * Covers PNG output, mean fields, and channel accuracy with a pure-red fixture.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
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

describe("Histogram", () => {
  it("generates a PNG histogram with mean fields", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/histogram",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.mean).toBeDefined();
    expect(result.mean.r).toBeGreaterThanOrEqual(0);
    expect(result.mean.g).toBeGreaterThanOrEqual(0);
    expect(result.mean.b).toBeGreaterThanOrEqual(0);
    expect(result.max).toBeDefined();

    // Download and verify PNG magic bytes
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    // PNG magic: 89 50 4E 47
    expect(dlRes.rawPayload[0]).toBe(0x89);
    expect(dlRes.rawPayload[1]).toBe(0x50);
    expect(dlRes.rawPayload[2]).toBe(0x4e);
    expect(dlRes.rawPayload[3]).toBe(0x47);
  });

  it("pure-red fixture has mean.r > mean.g", async () => {
    // Generate a pure red 10x10 PNG in-memory
    const redPng = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "red.png", contentType: "image/png", content: redPng },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/histogram",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.mean.r).toBeGreaterThan(result.mean.g);
  });
});
