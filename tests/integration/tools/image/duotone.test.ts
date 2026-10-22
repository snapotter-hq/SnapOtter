/**
 * Integration tests for the duotone tool (/api/v1/tools/image/duotone).
 *
 * Covers duotone color mapping, black-to-shadow and white-to-highlight
 * pixel assertions with tolerance, intensity blending, and schema validation.
 */

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

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
});

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
      url: "/api/v1/tools/image/duotone",
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
      url: "/api/v1/tools/image/duotone",
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

  it("blends with original at intensity 40", async () => {
    // Solid white image -- at intensity 40, output should be a blend of
    // the original white (255,255,255) and the duotone highlight color.
    const testImage = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .png()
      .toBuffer();

    const shadow = "#1e3a8a";
    const highlight = "#fbbf24";

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "white.png", contentType: "image/png", content: testImage },
      {
        name: "settings",
        content: JSON.stringify({ shadow, highlight, intensity: 40 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/duotone",
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

    const rawMeta = await sharp(dlRes.rawPayload)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { data } = rawMeta;

    // White original (255) blended with highlight (#fbbf24 = 251,191,36) at k=0.4:
    // R: round(255*0.6 + 251*0.4) = round(153 + 100.4) = 253
    // G: round(255*0.6 + 191*0.4) = round(153 + 76.4) = 229
    // B: round(255*0.6 + 36*0.4)  = round(153 + 14.4) = 167
    const tolerance = 8;
    expect(Math.abs(data[0] - 253)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(data[1] - 229)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(data[2] - 167)).toBeLessThanOrEqual(tolerance);
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
      url: "/api/v1/tools/image/duotone",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  it("preserves the alpha channel on a transparent PNG across full and zero intensity (#1188)", async () => {
    const size = 20;
    const raw = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const distSq = (x - 10) ** 2 + (y - 10) ** 2;
        const inDisc = distSq <= 6 ** 2;
        const onFringe = !inDisc && distSq <= 8 ** 2;
        raw[i] = inDisc || onFringe ? 200 : 0;
        raw[i + 1] = inDisc || onFringe ? 50 : 0;
        raw[i + 2] = inDisc || onFringe ? 50 : 0;
        raw[i + 3] = inDisc ? 255 : onFringe ? 128 : 0;
      }
    }
    const discPng = await sharp(raw, { raw: { width: size, height: size, channels: 4 } })
      .png()
      .toBuffer();

    for (const intensity of [100, 0]) {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "disc.png", contentType: "image/png", content: discPng },
        { name: "settings", content: JSON.stringify({ intensity }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/duotone",
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
      expect(meta.hasAlpha).toBe(true);

      const { data, info } = await sharp(dlRes.rawPayload)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      // Corner (0, 0) stays transparent; fringe (10, 3) keeps 8-bit partial alpha; centre (10, 10) stays opaque.
      expect(data[3]).toBe(0);
      const fringe = (3 * info.width + 10) * info.channels;
      expect(data[fringe + 3]).toBe(128);
      const centre = (10 * info.width + 10) * info.channels;
      expect(data[centre + 3]).toBe(255);
      if (intensity === 0) {
        expect([data[centre], data[centre + 1], data[centre + 2]]).toEqual([200, 50, 50]);
      } else {
        expect(Math.abs(data[centre] - 122)).toBeLessThanOrEqual(5);
        expect(Math.abs(data[centre + 1] - 113)).toBeLessThanOrEqual(5);
        expect(Math.abs(data[centre + 2] - 95)).toBeLessThanOrEqual(5);
      }
    }
  });
});
