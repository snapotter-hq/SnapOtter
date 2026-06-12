/**
 * Integration tests for the duotone tool (/api/v1/tools/duotone).
 *
 * Covers duotone color mapping, black-to-shadow and white-to-highlight
 * pixel assertions with tolerance, and schema validation.
 */

import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

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

describe("Duotone", () => {
  it("maps black pixels to shadow color and white pixels to highlight color", async () => {
    // Create a 2x1 image: left pixel black, right pixel white
    const testImage = await sharp({
      create: { width: 2, height: 1, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();

    // Composite a white pixel on the right
    const whitePixel = await sharp({
      create: { width: 1, height: 1, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .png()
      .toBuffer();

    const bwImage = await sharp(testImage)
      .composite([{ input: whitePixel, left: 1, top: 0 }])
      .png()
      .toBuffer();

    const shadow = "#1e3a8a";
    const highlight = "#fbbf24";

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "bw.png", contentType: "image/png", content: bwImage },
      {
        name: "settings",
        content: JSON.stringify({ shadow, highlight }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/duotone",
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

    const rawMeta = await sharp(dlRes.rawPayload)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { data, info } = rawMeta;

    const tolerance = 5;

    // Black pixel (0,0) should map to shadow (#1e3a8a = R:30, G:58, B:138)
    expect(Math.abs(data[0] - 30)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(data[1] - 58)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(data[2] - 138)).toBeLessThanOrEqual(tolerance);

    // White pixel (1,0) should map to highlight (#fbbf24 = R:251, G:191, B:36)
    const rightOffset = 1 * info.channels;
    expect(Math.abs(data[rightOffset] - 251)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(data[rightOffset + 1] - 191)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(data[rightOffset + 2] - 36)).toBeLessThanOrEqual(tolerance);
  });

  it("applies default duotone settings", async () => {
    const testImage = await sharp({
      create: { width: 50, height: 50, channels: 3, background: { r: 128, g: 128, b: 128 } },
    })
      .png()
      .toBuffer();

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "gray.png", contentType: "image/png", content: testImage },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/duotone",
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

  it("rejects invalid hex color for shadow", async () => {
    const testImage = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: testImage },
      {
        name: "settings",
        content: JSON.stringify({ shadow: "badcolor", highlight: "#fbbf24" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/duotone",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
  });
});
