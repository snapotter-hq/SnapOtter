/**
 * Integration tests for the histogram tool (/api/v1/tools/image/histogram).
 *
 * Covers PNG output, bins + stats payload, backward-compat mean/max fields,
 * and channel accuracy with a pure-red fixture.
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

describe("Histogram", () => {
  it("generates a PNG histogram with bins and stats", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/histogram",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();

    // Bins: four channels, each 256 entries
    expect(result.bins).toBeDefined();
    expect(result.bins.r).toHaveLength(256);
    expect(result.bins.g).toHaveLength(256);
    expect(result.bins.b).toHaveLength(256);
    expect(result.bins.lum).toHaveLength(256);

    // Stats: per-channel mean, median, stdev
    expect(result.stats).toBeDefined();
    for (const ch of ["r", "g", "b", "lum"]) {
      expect(result.stats[ch].mean).toBeGreaterThanOrEqual(0);
      expect(result.stats[ch].median).toBeGreaterThanOrEqual(0);
      expect(typeof result.stats[ch].stdev).toBe("number");
    }

    // Backward-compat: mean and max still present
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

  it("pure-red fixture has correct bins and stats", async () => {
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
      url: "/api/v1/tools/image/histogram",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    // Red channel: all 100 pixels at bin 255
    expect(result.bins.r[255]).toBe(100);
    // Green and blue: all 100 pixels at bin 0
    expect(result.bins.g[0]).toBe(100);
    expect(result.bins.b[0]).toBe(100);

    // Luminance for pure red: round(0.299 * 255) = 76
    expect(result.bins.lum[76]).toBe(100);

    // Stats for pure-red image
    expect(result.stats.r.mean).toBe(255);
    expect(result.stats.r.median).toBe(255);
    expect(result.stats.r.stdev).toBe(0);
    expect(result.stats.g.mean).toBe(0);
    expect(result.stats.lum.mean).toBe(76);

    // Backward compat
    expect(result.mean.r).toBeGreaterThan(result.mean.g);
  });
});
