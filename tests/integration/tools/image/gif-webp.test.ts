/**
 * Integration tests for the gif-webp tool (/api/v1/tools/image/gif-webp).
 *
 * Covers GIF-to-WebP, WebP-to-GIF conversions with animation preservation,
 * and extension validation.
 */

import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const ANIMATED_GIF = readFixture(fixtures.image.animated.gif);
const ANIMATED_WEBP = readFixture(fixtures.image.animated.webp);
const STILL_PNG = readFixture(fixtures.image.base.png200);
const SIMPSONS_GIF = readFixture(fixtures.image.animated.real);

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

describe("GIF/WebP Converter", () => {
  it("converts animated GIF to WebP with multiple pages", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "anim.gif", contentType: "image/gif", content: ANIMATED_GIF },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-webp",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();

    // Download and verify animated WebP (pages > 1)
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload, { animated: true }).metadata();
    expect(meta.pages).toBeGreaterThan(1);
  });

  it("converts animated WebP to GIF with multiple pages", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "anim.webp", contentType: "image/webp", content: ANIMATED_WEBP },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-webp",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();

    // Download and verify animated GIF (pages > 1)
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload, { animated: true }).metadata();
    expect(meta.pages).toBeGreaterThan(1);
  });

  it("applies resizePercent and produces a smaller WebP", async () => {
    // Get original width for comparison
    const origMeta = await sharp(SIMPSONS_GIF, { animated: true }).metadata();
    const origWidth = origMeta.width ?? 1;

    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "simpsons.gif",
        contentType: "image/gif",
        content: SIMPSONS_GIF,
      },
      { name: "settings", content: JSON.stringify({ resizePercent: 50 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-webp",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload, { animated: true }).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBeLessThan(origWidth);
  });

  it("applies quality setting for GIF-to-WebP conversion", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "anim.gif", contentType: "image/gif", content: ANIMATED_GIF },
      { name: "settings", content: JSON.stringify({ quality: 50, lossless: false }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-webp",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("rejects PNG input with extension guard", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: STILL_PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-webp",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
    const result = JSON.parse(res.body);
    const msg = [result.error, result.details].join(" ");
    expect(msg).toMatch(/only gif and webp/i);
  });
});
