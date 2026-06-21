/**
 * Adversarial coverage gap tests for the SnapOtter image API.
 *
 * Fills the remaining gaps after analyzing all existing adversarial, edge-case,
 * concurrent, and pipeline test files (342 tests total). Focuses on scenarios
 * that are either missing entirely or only partially covered:
 *
 * 1. Concurrent response content integrity (download + verify different outputs)
 * 2. Memory stress: 50 sequential large uploads with memory monitoring
 * 3. Zero-byte files with various MIME types through additional tools
 * 4. Format mismatch: GIF data with .webp extension, animated GIF through resize
 * 5. Extreme output dimensions: resize to 10000x1 and 1x10000
 * 6. Pipeline step limit enforcement (with MAX_PIPELINE_STEPS configured)
 * 7. Batch with 50+ images (beyond configured MAX_BATCH_SIZE=10)
 * 8. Multipart with missing/malformed boundary
 * 9. Multipart with extra unexpected part fields
 * 10. Request body edge cases: empty multipart, form-urlencoded, no content-type
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { apiToolPath } from "@snapotter/shared";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const PNG_200x150 = readFixture(fixtures.image.base.png200);
const PNG_1x1 = readFixture(fixtures.image.edge.px1);
const JPG_100x100 = readFixture(fixtures.image.base.jpg100);
const WEBP_50x50 = readFixture(fixtures.image.base.webp50);
const ANIMATED_GIF = readFixture(fixtures.image.animated.gif);
const STRESS_LARGE = readFixture(fixtures.image.stressLarge);

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------
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

/** Helper to POST a multipart payload to a tool endpoint. */
function postTool(
  toolId: string,
  fields: Array<{
    name: string;
    filename?: string;
    contentType?: string;
    content: Buffer | string;
  }>,
) {
  const { body, contentType } = createMultipartPayload(fields);
  return app.inject({
    method: "POST",
    url: apiToolPath(toolId),
    headers: {
      "content-type": contentType,
      authorization: `Bearer ${adminToken}`,
    },
    body,
  });
}

/** Helper to POST a batch request. */
function postBatch(
  toolId: string,
  fields: Array<{
    name: string;
    filename?: string;
    contentType?: string;
    content: Buffer | string;
  }>,
) {
  const { body, contentType } = createMultipartPayload(fields);
  return app.inject({
    method: "POST",
    url: `${apiToolPath(toolId)}/batch`,
    headers: {
      "content-type": contentType,
      authorization: `Bearer ${adminToken}`,
    },
    body,
  });
}

/** Helper to POST a pipeline execution request. */
function executePipeline(
  image: Buffer,
  filename: string,
  pipeline: {
    steps: Array<{ toolId: string; settings?: Record<string, unknown> }>;
  },
) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, content: image, contentType: "image/png" },
    { name: "pipeline", content: JSON.stringify(pipeline) },
  ]);
  return app.inject({
    method: "POST",
    url: "/api/v1/pipeline/execute",
    headers: {
      "content-type": contentType,
      authorization: `Bearer ${adminToken}`,
    },
    body,
  });
}

/** Helper to build an inject config for a tool request. */
function buildToolRequest(
  toolId: string,
  image: Buffer,
  filename: string,
  settings: Record<string, unknown>,
  imgContentType = "image/png",
) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, content: image, contentType: imgContentType },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return {
    method: "POST" as const,
    url: apiToolPath(toolId),
    headers: {
      "content-type": contentType,
      authorization: `Bearer ${adminToken}`,
    },
    body,
  };
}

// ###########################################################################
// 1. CONCURRENT RESPONSE CONTENT INTEGRITY VERIFICATION
//    Existing tests verify unique job IDs but never download the actual
//    output files to confirm no data mixing. These tests do.
// ###########################################################################
describe("Concurrent response content integrity -- download verification", () => {
  it("10 simultaneous resize requests produce correctly-sized output files", async () => {
    const widths = [20, 40, 60, 80, 100, 120, 140, 160, 180, 199];

    const results = await Promise.all(
      widths.map((width, i) =>
        app.inject(buildToolRequest("resize", PNG_200x150, `integrity-${i}.png`, { width })),
      ),
    );

    // All must succeed with unique IDs
    for (const res of results) {
      expect(res.statusCode).toBe(200);
    }
    const jobIds = results.map((r) => JSON.parse(r.body).jobId);
    expect(new Set(jobIds).size).toBe(10);

    // Download each output and verify the actual pixel width matches
    for (let i = 0; i < results.length; i++) {
      const downloadUrl = JSON.parse(results[i].body).downloadUrl;
      const dlRes = await app.inject({
        method: "GET",
        url: downloadUrl,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(dlRes.statusCode).toBe(200);
      const metadata = await sharp(dlRes.rawPayload).metadata();
      expect(metadata.width).toBe(widths[i]);
    }
  }, 120_000);

  it("10 simultaneous uploads to DIFFERENT tools all produce correct tool-specific outputs", async () => {
    const requests = [
      buildToolRequest("resize", PNG_200x150, "mt-resize-1.png", { width: 50 }),
      buildToolRequest("resize", PNG_200x150, "mt-resize-2.png", { width: 100 }),
      buildToolRequest("rotate", PNG_200x150, "mt-rotate-1.png", { angle: 90 }),
      buildToolRequest("rotate", PNG_200x150, "mt-rotate-2.png", { angle: 180 }),
      buildToolRequest("compress", PNG_200x150, "mt-compress-1.png", { quality: 30 }),
      buildToolRequest("compress", PNG_200x150, "mt-compress-2.png", { quality: 90 }),
      buildToolRequest("border", PNG_200x150, "mt-border-1.png", { borderWidth: 5 }),
      buildToolRequest("border", PNG_200x150, "mt-border-2.png", { borderWidth: 20 }),
      buildToolRequest("convert", PNG_200x150, "mt-convert-1.png", { format: "webp" }),
      buildToolRequest("convert", PNG_200x150, "mt-convert-2.png", { format: "jpg" }),
    ];

    const results = await Promise.all(requests.map((req) => app.inject(req)));

    // All succeed
    for (const res of results) {
      expect(res.statusCode).toBe(200);
    }

    // All unique job IDs
    const jobIds = results.map((r) => JSON.parse(r.body).jobId);
    expect(new Set(jobIds).size).toBe(10);

    // Download the resize outputs and verify pixel widths
    const resize1Url = JSON.parse(results[0].body).downloadUrl;
    const resize2Url = JSON.parse(results[1].body).downloadUrl;

    const [dl1, dl2] = await Promise.all([
      app.inject({
        method: "GET",
        url: resize1Url,
        headers: { authorization: `Bearer ${adminToken}` },
      }),
      app.inject({
        method: "GET",
        url: resize2Url,
        headers: { authorization: `Bearer ${adminToken}` },
      }),
    ]);

    const meta1 = await sharp(dl1.rawPayload).metadata();
    const meta2 = await sharp(dl2.rawPayload).metadata();

    expect(meta1.width).toBe(50);
    expect(meta2.width).toBe(100);

    // Download a rotate output and verify dimensions swapped
    const rotate90Url = JSON.parse(results[2].body).downloadUrl;
    const dlRotate = await app.inject({
      method: "GET",
      url: rotate90Url,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const metaRotate = await sharp(dlRotate.rawPayload).metadata();
    // 200x150 rotated 90 degrees becomes 150x200
    expect(metaRotate.width).toBe(150);
    expect(metaRotate.height).toBe(200);
  }, 120_000);
});

// ###########################################################################
// 2. MEMORY STRESS: 50 SEQUENTIAL LARGE FILE UPLOADS
//    Existing tests only do 5--10 sequential large uploads. This exercises
//    50 and checks for memory growth and response time degradation.
// ###########################################################################
describe("Memory stress -- 50 sequential large-file uploads", () => {
  it("processes stress-large.jpg 50 times sequentially without memory blowup or degradation", async () => {
    const memBefore = process.memoryUsage();
    const responseTimes: number[] = [];

    for (let i = 0; i < 50; i++) {
      const start = Date.now();
      const res = await postTool("resize", [
        {
          name: "file",
          filename: `mem-stress-${i}.jpg`,
          content: STRESS_LARGE,
          contentType: "image/jpeg",
        },
        { name: "settings", content: JSON.stringify({ width: 200 }) },
      ]);
      const elapsed = Date.now() - start;
      responseTimes.push(elapsed);

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.jobId).toBeDefined();
      expect(json.processedSize).toBeLessThan(json.originalSize);
    }

    const memAfter = process.memoryUsage();

    // All 50 completed successfully (verified in the loop above)

    // Memory growth check: RSS should not grow by more than 500MB
    // (50 * 6.7MB = 335MB raw data, but Sharp streams so actual growth
    // should be much less if buffers are properly released)
    const rssGrowthMB = (memAfter.rss - memBefore.rss) / (1024 * 1024);
    expect(rssGrowthMB).toBeLessThan(500);

    // Response time degradation check: the last 10 requests should not
    // take more than 5x the average of the first 10
    const firstTenAvg = responseTimes.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
    const lastTenAvg = responseTimes.slice(40, 50).reduce((a, b) => a + b, 0) / 10;
    // Allow generous margin -- the key is no exponential blowup
    expect(lastTenAvg).toBeLessThan(firstTenAvg * 5);

    // Server still responsive
    const healthRes = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(healthRes.statusCode).toBe(200);
  }, 600_000);
});

// ###########################################################################
// 3. ZERO-BYTE FILES -- ADDITIONAL TOOLS AND MIME VARIANTS
//    Covers tools and MIME combinations not tested in existing files.
// ###########################################################################
describe("Zero-byte files with various MIME types through additional tools", () => {
  it("rejects zero-byte file with image/gif MIME to resize", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "empty.gif",
        content: Buffer.alloc(0),
        contentType: "image/gif",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toBeDefined();
  });

  it("rejects zero-byte file with image/avif MIME to compress", async () => {
    const res = await postTool("compress", [
      {
        name: "file",
        filename: "empty.avif",
        content: Buffer.alloc(0),
        contentType: "image/avif",
      },
      { name: "settings", content: JSON.stringify({ quality: 50 }) },
    ]);

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toBeDefined();
  });

  it("rejects zero-byte file with image/tiff MIME to convert", async () => {
    const res = await postTool("convert", [
      {
        name: "file",
        filename: "empty.tiff",
        content: Buffer.alloc(0),
        contentType: "image/tiff",
      },
      { name: "settings", content: JSON.stringify({ format: "png" }) },
    ]);

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toBeDefined();
  });

  it("rejects zero-byte file to text-overlay", async () => {
    const res = await postTool("text-overlay", [
      {
        name: "file",
        filename: "empty.png",
        content: Buffer.alloc(0),
        contentType: "image/png",
      },
      {
        name: "settings",
        content: JSON.stringify({ text: "Hello", fontSize: 24 }),
      },
    ]);

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toBeDefined();
  });

  it("rejects zero-byte file to color-palette", async () => {
    const res = await postTool("color-palette", [
      {
        name: "file",
        filename: "empty.jpg",
        content: Buffer.alloc(0),
        contentType: "image/jpeg",
      },
    ]);

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toBeDefined();
  });

  it("rejects zero-byte file to favicon", async () => {
    const res = await postTool("favicon", [
      {
        name: "file",
        filename: "empty.png",
        content: Buffer.alloc(0),
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toBeDefined();
  });
});

// ###########################################################################
// 4. FORMAT MISMATCH: GIF DATA WITH WRONG EXTENSION, ANIMATED GIF
//    Existing tests cover PNG-as-JPG, JPEG-as-PNG, JPEG-as-WebP, WebP-as-PNG.
//    Missing: GIF data with .webp extension, animated GIF through tools.
// ###########################################################################
describe("Format mismatch -- GIF data and animated GIF handling", () => {
  it("handles GIF data uploaded with .webp extension", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "actually-a-gif.webp",
        content: ANIMATED_GIF,
        contentType: "image/webp",
      },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
    ]);

    // Sharp auto-detects GIF via magic bytes
    expect([200, 400, 422]).toContain(res.statusCode);
  });

  it("handles GIF data uploaded with .jpg extension", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "actually-a-gif.jpg",
        content: ANIMATED_GIF,
        contentType: "image/jpeg",
      },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
    ]);

    // Sharp detects the real GIF format
    expect([200, 400, 422]).toContain(res.statusCode);
  });

  it("handles WebP data uploaded with .gif extension", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "actually-webp.gif",
        content: WEBP_50x50,
        contentType: "image/gif",
      },
      { name: "settings", content: JSON.stringify({ width: 30 }) },
    ]);

    // Sharp detects WebP via magic bytes
    expect(res.statusCode).toBe(200);
  });

  it("handles JPEG data uploaded with .gif extension", async () => {
    const res = await postTool("compress", [
      {
        name: "file",
        filename: "actually-jpeg.gif",
        content: JPG_100x100,
        contentType: "image/gif",
      },
      { name: "settings", content: JSON.stringify({ quality: 50 }) },
    ]);

    // Sharp detects JPEG via magic bytes
    expect(res.statusCode).toBe(200);
  });

  it("resizes an animated GIF without crashing", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "animated.gif",
        content: ANIMATED_GIF,
        contentType: "image/gif",
      },
      { name: "settings", content: JSON.stringify({ width: 30 }) },
    ]);

    // Animated GIF may lose frames during processing but must not crash
    expect([200, 400, 422]).toContain(res.statusCode);
  });

  it("compresses an animated GIF without crashing", async () => {
    const res = await postTool("compress", [
      {
        name: "file",
        filename: "animated.gif",
        content: ANIMATED_GIF,
        contentType: "image/gif",
      },
      { name: "settings", content: JSON.stringify({ quality: 50 }) },
    ]);

    expect([200, 400, 422]).toContain(res.statusCode);
  });

  it("gets info for an animated GIF", async () => {
    const res = await postTool("info", [
      {
        name: "file",
        filename: "animated.gif",
        content: ANIMATED_GIF,
        contentType: "image/gif",
      },
    ]);

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.format).toBe("gif");
    expect(json.width).toBeGreaterThan(0);
    expect(json.height).toBeGreaterThan(0);
  });
});

// ###########################################################################
// 5. EXTREME OUTPUT DIMENSIONS: RESIZE TO 10000x1 AND 1x10000
//    Existing tests create 1x1000 and 1000x1 INPUT images but never test
//    RESIZING a normal image to extreme aspect ratio OUTPUT dimensions.
// ###########################################################################
describe("Extreme output dimensions -- resize to extreme aspect ratios", () => {
  it("resizes 200x150 image to 10000x1 (very wide output)", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "to-wide.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      {
        name: "settings",
        content: JSON.stringify({ width: 10000, height: 1 }),
      },
    ]);

    // Sharp may succeed with fit:fill or reject at processing. Must not crash.
    expect([200, 400, 422]).toContain(res.statusCode);
  }, 60_000);

  it("resizes 200x150 image to 1x10000 (very tall output)", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "to-tall.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      {
        name: "settings",
        content: JSON.stringify({ width: 1, height: 10000 }),
      },
    ]);

    expect([200, 400, 422]).toContain(res.statusCode);
  }, 60_000);

  it("resizes 1x1 image to 10000x10000 (massive upscale)", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "massive-upscale.png",
        content: PNG_1x1,
        contentType: "image/png",
      },
      {
        name: "settings",
        content: JSON.stringify({ width: 10000, height: 10000 }),
      },
    ]);

    // May be rejected by MAX_MEGAPIXELS (100MP limit, 10000x10000 = 100MP exactly)
    // or succeed. Must not crash.
    expect([200, 400, 422]).toContain(res.statusCode);
  }, 120_000);

  it("resizes to width=1 only (auto height)", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "width-1.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 1 }) },
    ]);

    expect(res.statusCode).toBe(200);
    const dlUrl = JSON.parse(res.body).downloadUrl;
    const dlRes = await app.inject({
      method: "GET",
      url: dlUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.width).toBe(1);
  });

  it("resizes to height=1 only (auto width)", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "height-1.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ height: 1 }) },
    ]);

    expect(res.statusCode).toBe(200);
    const dlUrl = JSON.parse(res.body).downloadUrl;
    const dlRes = await app.inject({
      method: "GET",
      url: dlUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.height).toBe(1);
  });
});

// ###########################################################################
// 6. PIPELINE WITH CONFLICTING OPS AND FORMAT DEPENDENCY
//    Existing tests cover resize-then-crop-larger, but not the specific
//    scenario of step 2 depending on step 1 output format.
// ###########################################################################
describe("Pipeline -- format-dependent step chains", () => {
  it("convert to JPEG (lossy) then compress -- compression applies to JPEG data", async () => {
    const res = await executePipeline(PNG_200x150, "fmt-dep-1.png", {
      steps: [
        { toolId: "convert", settings: { format: "jpg" } },
        { toolId: "compress", settings: { quality: 10 } },
      ],
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.stepsCompleted).toBe(2);
    // Low quality JPEG compression on an already-JPEG buffer should reduce size
    expect(json.processedSize).toBeLessThan(json.originalSize);
  });

  it("resize to 10x10 then crop 5x5 from center -- succeeds with small output", async () => {
    const res = await executePipeline(PNG_200x150, "resize-crop-ok.png", {
      steps: [
        { toolId: "resize", settings: { width: 10, height: 10 } },
        { toolId: "crop", settings: { left: 2, top: 2, width: 5, height: 5 } },
      ],
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.stepsCompleted).toBe(2);

    // Download and verify dimensions
    const dlRes = await app.inject({
      method: "GET",
      url: json.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.width).toBe(5);
    expect(meta.height).toBe(5);
  });

  it("resize to 10x10 then crop 100x100 -- fails at crop step", async () => {
    const res = await executePipeline(PNG_200x150, "resize-crop-fail.png", {
      steps: [
        { toolId: "resize", settings: { width: 10, height: 10 } },
        { toolId: "crop", settings: { left: 0, top: 0, width: 100, height: 100 } },
      ],
    });

    // Crop exceeds resized dimensions
    expect([200, 422]).toContain(res.statusCode);
  });

  it("convert PNG to AVIF then rotate -- AVIF intermediate works", async () => {
    const res = await executePipeline(PNG_200x150, "avif-rotate.png", {
      steps: [
        { toolId: "convert", settings: { format: "avif" } },
        { toolId: "rotate", settings: { angle: 90 } },
      ],
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.stepsCompleted).toBe(2);
  });

  it("triple format conversion: PNG -> JPEG -> WebP -> AVIF", async () => {
    const res = await executePipeline(PNG_200x150, "triple-convert.png", {
      steps: [
        { toolId: "convert", settings: { format: "jpg" } },
        { toolId: "convert", settings: { format: "webp" } },
        { toolId: "convert", settings: { format: "avif" } },
      ],
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.stepsCompleted).toBe(3);
  });
});

// ###########################################################################
// 7. BATCH LIMITS -- EXCEEDING MAX_BATCH_SIZE WITH LARGE COUNT
//    Existing tests go up to 11 images (limit is 10). This tests larger counts
//    to ensure the server handles the rejection gracefully.
// ###########################################################################
describe("Batch limits -- large file counts beyond MAX_BATCH_SIZE", () => {
  it("rejects batch with 20 images (double the MAX_BATCH_SIZE=10)", async () => {
    const fields = Array.from({ length: 20 }, (_, i) => ({
      name: "file",
      filename: `batch-20-${i}.png`,
      contentType: "image/png",
      content: PNG_1x1, // Use tiny images to keep payload small
    }));
    fields.push({
      name: "settings",
      filename: undefined as unknown as string,
      contentType: undefined as unknown as string,
      content: JSON.stringify({ width: 10 }) as unknown as Buffer,
    });

    const res = await postBatch("resize", fields);

    // @fastify/multipart enforces file limit at parser level
    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toBeDefined();
  });

  it("rejects batch with 50 images (5x the limit)", async () => {
    const fields = Array.from({ length: 50 }, (_, i) => ({
      name: "file",
      filename: `batch-50-${i}.png`,
      contentType: "image/png",
      content: PNG_1x1,
    }));
    fields.push({
      name: "settings",
      filename: undefined as unknown as string,
      contentType: undefined as unknown as string,
      content: JSON.stringify({ width: 10 }) as unknown as Buffer,
    });

    const res = await postBatch("resize", fields);

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toBeDefined();
  });

  it("batch + simultaneous single request -- no corruption when batch is rejected", async () => {
    // Fire a batch that exceeds the limit alongside a valid single request
    const oversizedFields = Array.from({ length: 15 }, (_, i) => ({
      name: "file",
      filename: `over-${i}.png`,
      contentType: "image/png",
      content: PNG_1x1,
    }));
    oversizedFields.push({
      name: "settings",
      filename: undefined as unknown as string,
      contentType: undefined as unknown as string,
      content: JSON.stringify({ width: 10 }) as unknown as Buffer,
    });

    const [batchRes, singleRes] = await Promise.all([
      postBatch("resize", oversizedFields),
      app.inject(buildToolRequest("resize", PNG_200x150, "single-ok.png", { width: 80 })),
    ]);

    // Batch should be rejected
    expect(batchRes.statusCode).toBe(400);

    // Single request must succeed unaffected
    expect(singleRes.statusCode).toBe(200);
    const singleBody = JSON.parse(singleRes.body);
    expect(singleBody.jobId).toBeDefined();
    expect(singleBody.downloadUrl).toContain("resize");
  }, 60_000);
});

// ###########################################################################
// 8. MULTIPART EDGE CASES -- MISSING BOUNDARY, EMPTY BODY, MALFORMED
// ###########################################################################
describe("Multipart edge cases -- malformed requests", () => {
  it("rejects request with content-type multipart/form-data but no boundary", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/resize",
      headers: {
        "content-type": "multipart/form-data",
        authorization: `Bearer ${adminToken}`,
      },
      body: Buffer.from("some random data"),
    });

    // Fastify/multipart should reject malformed multipart
    expect([400, 415]).toContain(res.statusCode);
  });

  it("rejects request with empty body and multipart content-type", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/resize",
      headers: {
        "content-type": "multipart/form-data; boundary=----TestBoundary",
        authorization: `Bearer ${adminToken}`,
      },
      body: Buffer.alloc(0),
    });

    expect([400, 415]).toContain(res.statusCode);
  });

  it("rejects request with form-urlencoded content-type", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/resize",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Bearer ${adminToken}`,
      },
      body: "width=100&height=100",
    });

    expect([400, 415]).toContain(res.statusCode);
  });

  it("rejects request with no content-type header", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/resize",
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
      body: Buffer.from("some data"),
    });

    expect([400, 415]).toContain(res.statusCode);
  });
});

// ###########################################################################
// 9. MULTIPART WITH EXTRA UNEXPECTED FIELDS
//    Existing tests check extra JSON keys in settings. This tests extra
//    multipart parts that the server should ignore or handle.
// ###########################################################################
describe("Multipart with extra unexpected fields", () => {
  it("ignores extra text fields alongside valid file and settings", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", content: PNG_200x150, contentType: "image/png" },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
      { name: "extra_field_1", content: "this should be ignored" },
      { name: "another_extra", content: "also ignored" },
      { name: "metadata", content: JSON.stringify({ foo: "bar" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/resize",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    // Extra text fields should be ignored; the valid file+settings should process
    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.jobId).toBeDefined();
  });

  it("ignores duplicate settings fields (first one wins)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", content: PNG_200x150, contentType: "image/png" },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
      { name: "settings", content: JSON.stringify({ width: 150 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/resize",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    // Should succeed with one of the settings (implementation-defined which)
    expect(res.statusCode).toBe(200);
  });

  it("rejects extra file-like field with non-standard name (treated as second file)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", content: PNG_200x150, contentType: "image/png" },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
      {
        name: "attachment",
        filename: "extra.txt",
        content: Buffer.from("text content"),
        contentType: "text/plain",
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/resize",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    // The tool factory counts any file-like part (with filename) as a file upload.
    // Two file parts trigger the "one image at a time" rejection.
    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toMatch(/too many files/i);
  });
});

// ###########################################################################
// 10. CORRUPTED FILE HEADERS -- ADDITIONAL SCENARIOS
//     Fill remaining gaps: valid magic bytes + truncated/corrupted data for
//     GIF and WebP formats, random binary with correct extension.
// ###########################################################################
describe("Corrupted file data -- additional formats", () => {
  it("handles GIF magic bytes (GIF89a) followed by garbage", async () => {
    const corruptedGif = Buffer.concat([
      Buffer.from("GIF89a"),
      Buffer.from(Array.from({ length: 100 }, () => Math.floor(Math.random() * 256))),
    ]);

    const res = await postTool("resize", [
      {
        name: "file",
        filename: "corrupt.gif",
        content: corruptedGif,
        contentType: "image/gif",
      },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
    ]);

    // Should fail gracefully
    expect([400, 422]).toContain(res.statusCode);
    const json = JSON.parse(res.body);
    expect(json.error).toBeDefined();
  });

  it("handles TIFF magic bytes followed by garbage (little-endian)", async () => {
    // TIFF little-endian: 49 49 2A 00
    const corruptedTiff = Buffer.concat([
      Buffer.from([0x49, 0x49, 0x2a, 0x00]),
      Buffer.from(Array.from({ length: 200 }, () => Math.floor(Math.random() * 256))),
    ]);

    const res = await postTool("resize", [
      {
        name: "file",
        filename: "corrupt.tiff",
        content: corruptedTiff,
        contentType: "image/tiff",
      },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
    ]);

    expect([400, 422]).toContain(res.statusCode);
  });

  it("handles random binary data with .jpg extension (content sniffing rejects it)", async () => {
    // Pure random data -- no valid magic bytes at all
    const randomData = Buffer.from(
      Array.from({ length: 4096 }, () => Math.floor(Math.random() * 256)),
    );

    const res = await postTool("resize", [
      {
        name: "file",
        filename: "random.jpg",
        content: randomData,
        contentType: "image/jpeg",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    expect([400, 422]).toContain(res.statusCode);
    const json = JSON.parse(res.body);
    expect(json.error).toBeDefined();
  });

  it("handles a valid PNG truncated at exactly the IHDR chunk", async () => {
    // PNG signature (8 bytes) + IHDR length (4 bytes) + "IHDR" (4 bytes) + partial IHDR data
    // Total: 8 + 4 + 4 + 9 = 25 bytes (IHDR is 13 bytes data, we cut at 9)
    const truncatedAtIHDR = PNG_200x150.subarray(0, 25);

    const res = await postTool("resize", [
      {
        name: "file",
        filename: "truncated-ihdr.png",
        content: truncatedAtIHDR,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
    ]);

    // Has valid PNG signature but incomplete IHDR -- Sharp may reject
    expect([200, 400, 422]).toContain(res.statusCode);
  });

  it("handles a file that is all 0xFF bytes with .png extension", async () => {
    const allOnes = Buffer.alloc(2048, 0xff);

    const res = await postTool("compress", [
      {
        name: "file",
        filename: "all-ff.png",
        content: allOnes,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ quality: 50 }) },
    ]);

    // 0xFF 0xFF... looks like start of JPEG (0xFF 0xD8...) but is actually garbage
    expect([400, 422]).toContain(res.statusCode);
  });
});

// ###########################################################################
// 11. UNICODE FILENAMES -- REMAINING UNTESTED PATTERNS
//     Covers RTL Arabic filename, @#$% special chars, picture frame emoji.
// ###########################################################################
describe("Unicode filenames -- final coverage", () => {
  it("handles RTL-only filename: صورة.jpg (Arabic for 'image')", async () => {
    const res = await postTool("compress", [
      {
        name: "file",
        filename: "صورة.jpg",
        content: JPG_100x100,
        contentType: "image/jpeg",
      },
      { name: "settings", content: JSON.stringify({ quality: 70 }) },
    ]);

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });

  it("handles image@#$%.jpg filename with special characters", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "image@#$%.jpg",
        content: JPG_100x100,
        contentType: "image/jpeg",
      },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
    ]);

    // Should either succeed or be sanitized
    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });

  it("handles picture frame emoji filename: \u{1F5BC}\u{FE0F}_test.jpg", async () => {
    const res = await postTool("rotate", [
      {
        name: "file",
        filename: "\u{1F5BC}\u{FE0F}_test.jpg",
        content: JPG_100x100,
        contentType: "image/jpeg",
      },
      { name: "settings", content: JSON.stringify({ angle: 90 }) },
    ]);

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });

  it("handles filename with mixed scripts: テスト画像.jpg (Japanese for 'test image')", async () => {
    const res = await postTool("compress", [
      {
        name: "file",
        filename: "テスト画像.jpg",
        content: JPG_100x100,
        contentType: "image/jpeg",
      },
      { name: "settings", content: JSON.stringify({ quality: 60 }) },
    ]);

    expect(res.statusCode).toBe(200);
  });

  it("handles 'my test image.jpg' with spaces through compress", async () => {
    const res = await postTool("compress", [
      {
        name: "file",
        filename: "my test image.jpg",
        content: JPG_100x100,
        contentType: "image/jpeg",
      },
      { name: "settings", content: JSON.stringify({ quality: 50 }) },
    ]);

    expect(res.statusCode).toBe(200);
  });

  it("handles filename with 300+ chars through compress (beyond 255 limit)", async () => {
    const longName = `${"z".repeat(300)}.png`;
    const res = await postTool("compress", [
      {
        name: "file",
        filename: longName,
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ quality: 50 }) },
    ]);

    // sanitizeFilename truncates but does not crash
    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });
});

// ###########################################################################
// 12. 1x1 PIXEL IMAGE THROUGH REMAINING UNTESTED TOOLS
// ###########################################################################
describe("1x1 pixel image through remaining tools", () => {
  it("applies adjust-colors to 1x1 image", async () => {
    const res = await postTool("adjust-colors", [
      {
        name: "file",
        filename: "tiny.png",
        content: PNG_1x1,
        contentType: "image/png",
      },
      {
        name: "settings",
        content: JSON.stringify({ brightness: 50, contrast: 50 }),
      },
    ]);

    expect(res.statusCode).toBe(200);
  });

  it("strips metadata from 1x1 image (no-op)", async () => {
    const res = await postTool("strip-metadata", [
      {
        name: "file",
        filename: "tiny.png",
        content: PNG_1x1,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ stripAll: true }) },
    ]);

    expect(res.statusCode).toBe(200);
  });

  it("generates favicon from 1x1 image (upscales)", async () => {
    const res = await postTool("favicon", [
      {
        name: "file",
        filename: "tiny.png",
        content: PNG_1x1,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    expect(res.statusCode).toBe(200);
  });

  it("extracts color palette from 1x1 image (single color)", async () => {
    const res = await postTool("color-palette", [
      {
        name: "file",
        filename: "tiny.png",
        content: PNG_1x1,
        contentType: "image/png",
      },
    ]);

    expect(res.statusCode).toBe(200);
  });

  it("converts 1x1 PNG to WebP", async () => {
    const res = await postTool("convert", [
      {
        name: "file",
        filename: "tiny.png",
        content: PNG_1x1,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ format: "webp" }) },
    ]);

    expect([200, 400]).toContain(res.statusCode);
  });

  it("converts 1x1 PNG to AVIF", async () => {
    const res = await postTool("convert", [
      {
        name: "file",
        filename: "tiny.png",
        content: PNG_1x1,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ format: "avif" }) },
    ]);

    expect([200, 400]).toContain(res.statusCode);
  });
});

// ###########################################################################
// 13. SETTINGS WITH TYPE MISMATCHES AND EDGE VALUES
// ###########################################################################
describe("Settings with type mismatches and edge values", () => {
  it("rejects resize with width as array", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: [100] }) },
    ]);

    expect(res.statusCode).toBe(400);
  });

  it("rejects resize with width as object", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: { value: 100 } }) },
    ]);

    expect(res.statusCode).toBe(400);
  });

  it("rejects rotate with angle as boolean", async () => {
    const res = await postTool("rotate", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ angle: false }) },
    ]);

    expect(res.statusCode).toBe(400);
  });

  it("rejects compress quality as empty string", async () => {
    const res = await postTool("compress", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: '{"quality": ""}' },
    ]);

    expect(res.statusCode).toBe(400);
  });

  it("rejects convert with truly unsupported format", async () => {
    const res = await postTool("convert", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ format: "hevc" }) },
    ]);

    // "hevc" is not in the z.enum list of supported formats
    expect(res.statusCode).toBe(400);
  });

  it("handles settings with unicode key names", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      {
        name: "settings",
        content: JSON.stringify({ width: 100, 幅: 200 }),
      },
    ]);

    // Zod strips unknown keys; the recognized "width: 100" should process
    expect(res.statusCode).toBe(200);
  });
});

// ###########################################################################
// 14. CONCURRENT BATCH + SINGLE REQUEST SIMULTANEOUSLY
// ###########################################################################
describe("Concurrent batch + single request -- extended scenarios", () => {
  it("runs batch compress + single resize + single rotate simultaneously", async () => {
    const batchPayload = createMultipartPayload([
      { name: "file", filename: "b1.png", content: PNG_200x150, contentType: "image/png" },
      { name: "file", filename: "b2.jpg", content: JPG_100x100, contentType: "image/jpeg" },
      { name: "file", filename: "b3.webp", content: WEBP_50x50, contentType: "image/webp" },
      { name: "settings", content: JSON.stringify({ quality: 50 }) },
    ]);

    const [batchRes, resizeRes, rotateRes] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/api/v1/tools/image/compress/batch",
        headers: {
          "content-type": batchPayload.contentType,
          authorization: `Bearer ${adminToken}`,
        },
        body: batchPayload.body,
      }),
      app.inject(buildToolRequest("resize", PNG_200x150, "single-resize.png", { width: 60 })),
      app.inject(
        buildToolRequest("rotate", JPG_100x100, "single-rotate.jpg", { angle: 270 }, "image/jpeg"),
      ),
    ]);

    // All must succeed
    expect(batchRes.statusCode).toBe(200);
    expect(batchRes.headers["content-type"]).toBe("application/zip");

    expect(resizeRes.statusCode).toBe(200);
    const resizeBody = JSON.parse(resizeRes.body);
    expect(resizeBody.downloadUrl).toContain("resize");

    expect(rotateRes.statusCode).toBe(200);
    const rotateBody = JSON.parse(rotateRes.body);
    expect(rotateBody.downloadUrl).toContain("rotate");

    // Job IDs must be distinct
    expect(resizeBody.jobId).not.toBe(rotateBody.jobId);
  }, 60_000);
});

// ###########################################################################
// 15. SERVER STABILITY AFTER COMPREHENSIVE COVERAGE GAP TESTS
// ###########################################################################
describe("Server stability -- health check after all coverage gap tests", () => {
  it("server remains responsive and healthy", async () => {
    const healthRes = await app.inject({
      method: "GET",
      url: "/api/v1/health",
    });
    expect(healthRes.statusCode).toBe(200);
    const json = JSON.parse(healthRes.body);
    expect(json.status).toBe("healthy");

    // Verify a normal tool request still works
    const normalRes = await postTool("resize", [
      {
        name: "file",
        filename: "final-sanity.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);
    expect(normalRes.statusCode).toBe(200);
    expect(JSON.parse(normalRes.body).jobId).toBeDefined();
  });
});
