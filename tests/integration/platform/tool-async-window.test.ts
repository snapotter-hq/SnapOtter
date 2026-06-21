/**
 * Integration tests for the factory's enqueue + sync-wait path.
 *
 * Verifies that a converted tool route (resize) returns the legacy
 * envelope synchronously, that downloads work, and that the terminal
 * SSE replay key is set in Redis.
 */
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sharedRedis } from "../../../apps/api/src/jobs/connection.js";
import { bullPrefix } from "../../../apps/api/src/jobs/types.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

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

describe("Tool async window (sync-wait path)", () => {
  it("returns 200 with legacy envelope keys", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/resize",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    // (a) Exactly the legacy envelope keys
    const REQUIRED_KEYS = ["jobId", "downloadUrl", "originalSize", "processedSize"];
    const ALLOWED_KEYS = [...REQUIRED_KEYS, "previewUrl", "savedFileId"];
    const actualKeys = Object.keys(result);

    // Every required key must be present
    for (const key of REQUIRED_KEYS) {
      expect(actualKeys).toContain(key);
    }
    // Every key in the response must be in the allowed set
    for (const key of actualKeys) {
      expect(ALLOWED_KEYS).toContain(key);
    }

    expect(typeof result.jobId).toBe("string");
    expect(typeof result.downloadUrl).toBe("string");
    expect(typeof result.originalSize).toBe("number");
    expect(typeof result.processedSize).toBe("number");
    if (result.previewUrl !== undefined) {
      expect(typeof result.previewUrl).toBe("string");
    }
    if (result.savedFileId !== undefined) {
      expect(typeof result.savedFileId).toBe("string");
    }

    // (b) GET the downloadUrl returns 200 with bytes
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(dlRes.statusCode).toBe(200);
    expect(dlRes.rawPayload.length).toBeGreaterThan(0);

    // (c) Terminal SSE replay key exists in Redis with phase:"complete"
    const jobId = result.jobId;
    const terminalKeyName = `${bullPrefix()}:terminal:${jobId}`;

    // The worker emits the terminal frame; give Redis a moment to propagate
    let cached: string | null = null;
    for (let i = 0; i < 20; i++) {
      cached = await sharedRedis().get(terminalKeyName);
      if (cached) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    expect(cached).not.toBeNull();
    const parsed = JSON.parse(cached!);
    expect(parsed.type).toBe("single");
    expect(parsed.phase).toBe("complete");
    expect(parsed.result).toBeDefined();
    expect(parsed.result.downloadUrl).toBeDefined();
  });

  it("includes originalSize and processedSize in the envelope", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/resize",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.originalSize).toBeGreaterThan(0);
    expect(result.processedSize).toBeGreaterThan(0);
    // Resized image should be different size than original
    expect(result.processedSize).not.toBe(result.originalSize);
  });
});

describe("EXIF auto-orientation in factory path", () => {
  it("strips EXIF orientation and rotates pixels for a JPEG with orientation 6", async () => {
    // Build a 40x20 JPEG with EXIF orientation 6 (rotated 90 CW).
    // When physically oriented, the output must be 20x40.
    const rotated = await sharp({
      create: {
        width: 40,
        height: 20,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    // Verify the source has the orientation tag embedded
    const srcMeta = await sharp(rotated).metadata();
    expect(srcMeta.orientation).toBe(6);

    // POST to compress (quality mode preserves pixels, only re-encodes)
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "rotated.jpg", contentType: "image/jpeg", content: rotated },
      { name: "settings", content: JSON.stringify({ mode: "quality", quality: 90 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compress",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();

    // Download the output and inspect metadata
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(dlRes.statusCode).toBe(200);

    const outMeta = await sharp(dlRes.rawPayload).metadata();

    // (a) Orientation tag must be absent or 1 (upright)
    expect(outMeta.orientation ?? 1).toBe(1);

    // (b) Pixels are physically rotated: 40x20 with orientation 6
    //     becomes 20x40 after auto-orient
    expect(outMeta.width).toBe(20);
    expect(outMeta.height).toBe(40);
  });
});
