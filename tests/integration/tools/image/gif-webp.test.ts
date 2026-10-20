/**
 * Integration tests for the gif-webp tool (/api/v1/tools/image/gif-webp).
 *
 * Covers GIF-to-WebP, WebP-to-GIF conversions with animation preservation,
 * and extension validation.
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

const ANIMATED_GIF = readFixture(fixtures.image.animated.gif);
const ANIMATED_WEBP = readFixture(fixtures.image.animated.webp);
const STILL_PNG = readFixture(fixtures.image.base.png200);
const SIMPSONS_GIF = readFixture(fixtures.image.animated.real);

async function buildManyFrameGif(frameCount: number): Promise<Buffer> {
  const single = await sharp({
    create: { width: 1, height: 1, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .gif()
    .toBuffer();
  const packed = single[10];
  const hasGct = (packed & 0x80) !== 0;
  const gctSize = hasGct ? 3 * (1 << ((packed & 0x07) + 1)) : 0;
  const headerEnd = 13 + gctSize;
  const header = single.subarray(0, headerEnd);
  const frameData = single.subarray(headerEnd, single.length - 1);
  const loopExt = Buffer.from([
    0x21,
    0xff,
    0x0b,
    ...Buffer.from("NETSCAPE2.0"),
    0x03,
    0x01,
    0x00,
    0x00,
    0x00,
  ]);
  const parts: Buffer[] = [header, loopExt];
  for (let i = 0; i < frameCount; i++) {
    parts.push(frameData);
  }
  parts.push(Buffer.from([0x3b]));
  return Buffer.concat(parts);
}

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

  it("rejects PNG input even when uploaded with a .gif filename (#3047)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "fake.gif", contentType: "image/gif", content: STILL_PNG },
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

  it("rejects an animated GIF exceeding MAX_GIF_FRAMES with 400 in gif-webp (#2528)", async () => {
    const excessiveGif = await buildManyFrameGif(501);
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "too-many-frames.gif",
        contentType: "image/gif",
        content: excessiveGif,
      },
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

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/must not exceed 500 frames/i);
  });

  it("rejects an animated GIF exceeding MAX_GIF_FRAMES with 400 in convert (#2528)", async () => {
    const excessiveGif = await buildManyFrameGif(501);
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "too-many-frames.gif",
        contentType: "image/gif",
        content: excessiveGif,
      },
      { name: "settings", content: JSON.stringify({ format: "webp" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/convert",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/must not exceed 500 frames/i);
  });
});
