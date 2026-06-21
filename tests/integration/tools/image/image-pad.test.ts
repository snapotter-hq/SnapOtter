/**
 * Integration tests for the image-pad tool (/api/v1/tools/image/image-pad).
 *
 * Covers aspect-ratio padding, color/transparent/blur backgrounds,
 * custom ratios, dimension math, and schema validation.
 */

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canvasFor } from "../../../../apps/api/src/routes/tools/image-pad.js";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const PNG = readFixture(fixtures.image.base.png200);

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

describe("Image Pad", () => {
  // Unit tests for canvasFor helper
  it("canvasFor: 200x150 with 1:1 produces a 200x200 canvas", () => {
    const { cw, ch } = canvasFor(200, 150, "1:1");
    expect(cw).toBe(200);
    expect(ch).toBe(200);
  });

  it("canvasFor: 200x150 with 16:9 produces correct canvas", () => {
    const { cw, ch } = canvasFor(200, 150, "16:9");
    // 200/150 = 1.33, 16/9 = 1.78; image is narrower, expand width
    expect(cw).toBe(Math.round(150 * (16 / 9)));
    expect(ch).toBe(150);
  });

  it("pads a non-square image to 1:1", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ target: "1:1", color: "#ffffff" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-pad",
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
    // 200x150 padded to 1:1 => 200x200
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(200);
  });

  it("applies the specified padding color at corners", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ target: "1:1", color: "#ff0000" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-pad",
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

    // Check corner pixel color (top-left should be padding color)
    const rawMeta = await sharp(dlRes.rawPayload).raw().toBuffer({ resolveWithObject: true });
    const { data } = rawMeta;
    // Pixel (0, 0) should be #ff0000
    expect(data[0]).toBe(255); // R
    expect(data[1]).toBe(0); // G
    expect(data[2]).toBe(0); // B
  });

  it("rejects invalid color format", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ target: "1:1", color: "red" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-pad",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  it("uses default settings when none provided", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-pad",
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
    // Default 1:1 on 200x150 -> 200x200
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(200);
  });

  it("transparent background outputs PNG with alpha 0 at corner", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ target: "1:1", background: "transparent" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-pad",
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
    expect(meta.format).toBe("png");
    expect(meta.channels).toBe(4);

    // Corner pixel (0,0) is in the top padding area -- must be fully transparent
    const { data } = await sharp(dlRes.rawPayload).raw().toBuffer({ resolveWithObject: true });
    expect(data[3]).toBe(0); // alpha of pixel (0,0)
  });

  it("blur background produces a valid padded image", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ target: "1:1", background: "blur" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-pad",
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
    // 200x150 padded to 1:1 => 200x200
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(200);
  });

  it("custom ratio 21:9 produces correct dimensions", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ target: "custom", ratioW: 21, ratioH: 9 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-pad",
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
    // 200x150 with 21:9: srcRatio (1.33) < targetRatio (2.33), expand width
    // cw = round(150 * 21/9) = 350, ch = 150
    expect(meta.width).toBe(350);
    expect(meta.height).toBe(150);
  });
});
