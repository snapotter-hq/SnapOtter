/**
 * Integration tests for the circle-crop tool (/api/v1/tools/image/circle-crop).
 *
 * Covers circular masking, PNG output, corner alpha transparency,
 * and center pixel opacity.
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

describe("Circle Crop", () => {
  it("produces a circular crop as PNG", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/circle-crop",
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
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("png");
    // Output should be square: min(200, 150) = 150
    expect(meta.width).toBe(150);
    expect(meta.height).toBe(150);
  });

  it("corner pixel has alpha 0 (transparent)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/circle-crop",
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

    // Read raw RGBA pixels and check corner (1,1) alpha
    const rawMeta = await sharp(dlRes.rawPayload).raw().toBuffer({ resolveWithObject: true });
    const { data, info } = rawMeta;
    // Pixel at (1, 1): offset = (1 * info.width + 1) * info.channels
    const offset = (1 * info.width + 1) * info.channels;
    const alpha = data[offset + 3]; // 4th channel = alpha
    expect(alpha).toBe(0);
  });

  it("center pixel has alpha 255 (opaque)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/circle-crop",
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

    const rawMeta = await sharp(dlRes.rawPayload).raw().toBuffer({ resolveWithObject: true });
    const { data, info } = rawMeta;
    // Center pixel
    const cx = Math.floor(info.width / 2);
    const cy = Math.floor(info.height / 2);
    const offset = (cy * info.width + cx) * info.channels;
    const alpha = data[offset + 3];
    expect(alpha).toBe(255);
  });

  it("always outputs PNG regardless of input format", async () => {
    const JPG = readFixture(fixtures.image.base.jpg100);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/circle-crop",
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
  });

  it("applies output size, border, and a solid background", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          zoom: 2,
          offsetX: 0.5,
          offsetY: 0.5,
          borderWidth: 10,
          borderColor: "#ff0000",
          background: "#0000ff",
          outputSize: 128,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/circle-crop",
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
    // outputSize forces a square 128x128 result
    expect(meta.width).toBe(128);
    expect(meta.height).toBe(128);

    // A solid background makes the corners opaque (the default is transparent).
    const { data, info } = await sharp(dlRes.rawPayload)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const corner = (1 * info.width + 1) * info.channels;
    expect(data[corner + 3]).toBe(255);
  });
});
