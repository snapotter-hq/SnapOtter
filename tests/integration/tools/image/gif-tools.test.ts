/**
 * Integration tests for the SOTA GIF Tools.
 *
 * Tests all 6 processing modes (resize, optimize, speed, reverse, extract, rotate)
 * plus the metadata endpoint. Uses a real Fastify server with in-memory SQLite.
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

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;
let animatedGif: Buffer;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
  animatedGif = readFixture(fixtures.image.animated.gif);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

function makePayload(settings: Record<string, unknown>, buffer?: Buffer, filename?: string) {
  const { body, contentType } = createMultipartPayload([
    {
      name: "file",
      filename: filename ?? "test.gif",
      contentType: "image/gif",
      content: buffer ?? animatedGif,
    },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return { body, contentType };
}

// ── Metadata endpoint ─────────────────────────────────────────────
describe("POST /api/v1/tools/image/gif-tools/info", () => {
  it("returns metadata for an animated GIF", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.gif",
        contentType: "image/gif",
        content: animatedGif,
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools/info",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.pages).toBe(3);
    expect(data.width).toBe(100);
    expect(data.height).toBe(100);
    expect(data.delay).toHaveLength(3);
    expect(data.duration).toBeGreaterThan(0);
    expect(data.fileSize).toBeGreaterThan(0);
  });

  it("returns pages=1 for a static image", async () => {
    const png = readFixture(fixtures.image.base.png200);
    const { body: payload, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.png",
        contentType: "image/png",
        content: png,
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools/info",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.pages).toBe(1);
  });
});

// ── Resize mode ───────────────────────────────────────────────────
describe("Resize mode", () => {
  it("resizes animated GIF by pixel dimensions", async () => {
    const { body: payload, contentType } = makePayload({
      mode: "resize",
      width: 50,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeLessThan(result.originalSize);
  });

  it("resizes animated GIF by percentage", async () => {
    const { body: payload, contentType } = makePayload({
      mode: "resize",
      percentage: 50,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeLessThan(result.originalSize);
  });
});

// ── Optimize mode ─────────────────────────────────────────────────
describe("Optimize mode", () => {
  it("processes with custom color/effort settings", async () => {
    const { body: payload, contentType } = makePayload({
      mode: "optimize",
      colors: 16,
      effort: 10,
      dither: 0.5,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });
});

// ── Speed mode ────────────────────────────────────────────────────
describe("Speed mode", () => {
  it("doubles the playback speed", async () => {
    const { body: payload, contentType } = makePayload({
      mode: "speed",
      speedFactor: 2,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    // Download and verify the delay was halved
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    const origMeta = await sharp(animatedGif).metadata();
    const origDelay = origMeta.delay?.[0] ?? 100;
    const newDelay = meta.delay?.[0] ?? 0;
    expect(newDelay).toBe(Math.max(20, Math.round(origDelay / 2)));
  });
});

// ── Reverse mode ──────────────────────────────────────────────────
describe("Reverse mode", () => {
  it("reverses frame order of an animated GIF", async () => {
    const { body: payload, contentType } = makePayload({
      mode: "reverse",
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();

    // Download and verify it still has 3 frames
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.pages).toBe(3);
  });
});

// ── Extract mode ──────────────────────────────────────────────────
describe("Extract mode", () => {
  it("extracts a single frame as PNG", async () => {
    const { body: payload, contentType } = makePayload({
      mode: "extract",
      extractMode: "single",
      frameNumber: 0,
      extractFormat: "png",
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toContain("_frame0.png");
  });

  it("extracts all frames as a ZIP", async () => {
    const { body: payload, contentType } = makePayload({
      mode: "extract",
      extractMode: "all",
      extractFormat: "png",
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toContain("_frames.zip");
  });

  it("extracts a range of frames as a ZIP", async () => {
    const { body: payload, contentType } = makePayload({
      mode: "extract",
      extractMode: "range",
      frameStart: 0,
      frameEnd: 1,
      extractFormat: "webp",
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toContain("_frames.zip");
  });
});

// ── Rotate mode ───────────────────────────────────────────────────
describe("Rotate mode", () => {
  it("rotates 90 degrees", async () => {
    const { body: payload, contentType } = makePayload({
      mode: "rotate",
      angle: 90,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("rotates 180 degrees", async () => {
    const { body: payload, contentType } = makePayload({
      mode: "rotate",
      angle: 180,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
  });

  it("rotates 270 degrees", async () => {
    const { body: payload, contentType } = makePayload({
      mode: "rotate",
      angle: 270,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
  });

  it("flips horizontally", async () => {
    const { body: payload, contentType } = makePayload({
      mode: "rotate",
      flipH: true,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
  });

  it("flips vertically", async () => {
    const { body: payload, contentType } = makePayload({
      mode: "rotate",
      flipV: true,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
  });

  it("rotates and flips simultaneously", async () => {
    const { body: payload, contentType } = makePayload({
      mode: "rotate",
      angle: 90,
      flipH: true,
      flipV: true,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
  });

  it("rotates a static image (single frame)", async () => {
    const png = readFixture(fixtures.image.base.png200);
    const gifBuf = await sharp(png).gif().toBuffer();
    const { body: payload, contentType } = makePayload(
      { mode: "rotate", angle: 90 },
      gifBuf,
      "static.gif",
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
  });
});

// ── Reverse mode with speed adjustment ──────────────────────────
describe("Reverse mode with speed adjustment", () => {
  it("reverses and doubles speed simultaneously", async () => {
    const { body: payload, contentType } = makePayload({
      mode: "reverse",
      speedFactor: 2.0,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("reverses a single-frame GIF gracefully", async () => {
    const png = readFixture(fixtures.image.base.png200);
    const singleFrameGif = await sharp(png).gif().toBuffer();
    const { body: payload, contentType } = makePayload(
      { mode: "reverse" },
      singleFrameGif,
      "single.gif",
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
  });
});

// ── Extract mode additional tests ────────────────────────────────
describe("Extract mode additional tests", () => {
  it("extracts a single frame as WebP", async () => {
    const { body: payload, contentType } = makePayload({
      mode: "extract",
      extractMode: "single",
      frameNumber: 1,
      extractFormat: "webp",
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toContain("_frame1.webp");
  });

  it("extracts a specific range of frames as PNG", async () => {
    const { body: payload, contentType } = makePayload({
      mode: "extract",
      extractMode: "range",
      frameStart: 1,
      frameEnd: 2,
      extractFormat: "png",
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toContain("_frames.zip");
  });
});

// ── Speed mode edge cases ────────────────────────────────────────
describe("Speed mode edge cases", () => {
  it("slows down the playback speed", async () => {
    const { body: payload, contentType } = makePayload({
      mode: "speed",
      speedFactor: 0.5,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    const origMeta = await sharp(animatedGif).metadata();
    const origDelay = origMeta.delay?.[0] ?? 100;
    const newDelay = meta.delay?.[0] ?? 0;
    // Slowing down doubles the delay
    expect(newDelay).toBe(Math.max(20, Math.round(origDelay / 0.5)));
  });
});

// ── Resize mode edge cases ──────────────────────────────────────
describe("Resize mode edge cases", () => {
  it("resizes with only height specified", async () => {
    const { body: payload, contentType } = makePayload({
      mode: "resize",
      height: 50,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
  });

  it("resizes with both width and height", async () => {
    const { body: payload, contentType } = makePayload({
      mode: "resize",
      width: 40,
      height: 30,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
  });

  it("resize without dimensions or percentage passes through", async () => {
    const { body: payload, contentType } = makePayload({
      mode: "resize",
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
  });
});

// ── Metadata endpoint edge cases ────────────────────────────────
describe("Metadata endpoint edge cases", () => {
  it("returns 400 when no file is provided", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "other", content: "nothing" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools/info",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(400);
  });
});

// ── Custom loop count ────────────────────────────────────────────
describe("Loop count", () => {
  it("sets a custom loop count", async () => {
    const { body: payload, contentType } = makePayload({
      mode: "optimize",
      loop: 3,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
  });
});

// ── Validation ─────────────────────────────────────────────────
describe("Validation", () => {
  it("returns 400 when no file is provided to process", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({ mode: "resize", width: 50 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid settings JSON", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "test.gif", contentType: "image/gif", content: animatedGif },
      { name: "settings", content: "not-json" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid mode", async () => {
    const { body: payload, contentType } = makePayload({
      mode: "invalid-mode",
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for empty file upload", async () => {
    const { body: payload, contentType } = makePayload(
      { mode: "resize", width: 50 },
      Buffer.alloc(0),
      "empty.gif",
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 401 for unauthenticated request", async () => {
    const { body: payload, contentType } = makePayload({ mode: "resize", width: 50 });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: { "content-type": contentType },
    });

    expect(res.statusCode).toBe(401);
  });
});

// ── Response structure ─────────────────────────────────────────
describe("Response structure", () => {
  it("returns all expected fields in 200 response", async () => {
    const { body: payload, contentType } = makePayload({
      mode: "resize",
      width: 50,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result).toHaveProperty("jobId");
    expect(result).toHaveProperty("downloadUrl");
    expect(result).toHaveProperty("originalSize");
    expect(result).toHaveProperty("processedSize");
    expect(typeof result.jobId).toBe("string");
    expect(typeof result.downloadUrl).toBe("string");
    expect(typeof result.originalSize).toBe("number");
    expect(typeof result.processedSize).toBe("number");
  });
});

// ── Optimize mode parameter variations ──────────────────────────
describe("Optimize mode parameter variations", () => {
  it("optimizes with minimum colors (2)", async () => {
    const { body: payload, contentType } = makePayload({
      mode: "optimize",
      colors: 2,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
  });

  it("optimizes with maximum colors (256)", async () => {
    const { body: payload, contentType } = makePayload({
      mode: "optimize",
      colors: 256,
      effort: 1,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
  });

  it("optimizes with dither 0 (no dithering)", async () => {
    const { body: payload, contentType } = makePayload({
      mode: "optimize",
      dither: 0,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
  });
});

// ── Speed mode boundary values ──────────────────────────────────
describe("Speed mode boundary values", () => {
  it("accepts minimum speed factor (0.1)", async () => {
    const { body: payload, contentType } = makePayload({
      mode: "speed",
      speedFactor: 0.1,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
  });

  it("accepts maximum speed factor (10)", async () => {
    const { body: payload, contentType } = makePayload({
      mode: "speed",
      speedFactor: 10,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
  });
});

// ── Extract mode JPEG format (only png/webp allowed) ────────────
describe("Extract format edge cases", () => {
  it("extracts single frame as JPEG returns 400 (only png/webp)", async () => {
    const { body: payload, contentType } = makePayload({
      mode: "extract",
      extractMode: "single",
      frameNumber: 0,
      extractFormat: "jpeg",
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("extract all frames as WebP produces a ZIP", async () => {
    const { body: payload, contentType } = makePayload({
      mode: "extract",
      extractMode: "all",
      extractFormat: "webp",
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toContain("_frames.zip");
  });
});

// ── Content animated GIF ────────────────────────────────────────
describe("Content animated GIF (animated-simpsons.gif)", () => {
  it("resizes a larger animated GIF", async () => {
    const contentGif = readFixture(fixtures.image.animated.real);
    const { body: payload, contentType } = makePayload(
      { mode: "resize", width: 50 },
      contentGif,
      "simpsons.gif",
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("metadata endpoint returns correct info for content GIF", async () => {
    const contentGif = readFixture(fixtures.image.animated.real);
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "simpsons.gif", contentType: "image/gif", content: contentGif },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools/info",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.pages).toBeGreaterThan(1);
    expect(data.width).toBeGreaterThan(0);
    expect(data.height).toBeGreaterThan(0);
    expect(data.fileSize).toBeGreaterThan(0);
    // duration may be 0 if delay metadata is absent/zero in the GIF
    expect(typeof data.duration).toBe("number");
  });
});

// ── Rotate angle validation ─────────────────────────────────────
describe("Rotate angle validation", () => {
  it("rejects invalid rotation angle (45)", async () => {
    const { body: payload, contentType } = makePayload({
      mode: "rotate",
      angle: 45,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("accepts no angle with flip only", async () => {
    const { body: payload, contentType } = makePayload({
      mode: "rotate",
      flipH: true,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
  });
});

// ── Resize output dimension verification ────────────────────────
describe("Resize output dimension verification", () => {
  it("resize by width produces correct output width", async () => {
    const { body: payload, contentType } = makePayload({
      mode: "resize",
      width: 40,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/gif-tools",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.width).toBe(40);
  });
});
