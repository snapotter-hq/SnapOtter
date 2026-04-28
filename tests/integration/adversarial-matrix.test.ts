/**
 * Adversarial matrix integration tests for the SnapOtter image API.
 *
 * Covers gaps not addressed by adversarial.test.ts, adversarial-extended.test.ts,
 * concurrent.test.ts, or edge-cases.test.ts:
 *
 * - Memory pressure: 10 sequential large-file uploads, back-to-back tool chain
 * - Corrupted headers through non-resize tools (compress, crop, convert, rotate)
 * - Wrong content-type headers (application/json with binary data)
 * - Unicode filenames: emoji-only, very long (200+ chars)
 * - Extreme dimensions: resize to 1x1, crop with 0 dimensions, rotate 1x1 by 45
 * - Pipeline: 21+ steps (over limit), same step 10x same settings, up-then-down
 * - Batch: all identical files, mixed valid/invalid through multiple tools
 * - Parameter boundaries: quality -1/999, width "abc"/NaN, angle -360/720/999
 * - Concurrent: 10 resize with large file, data integrity verification
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const FIXTURES = join(__dirname, "..", "fixtures");
const PNG_200x150 = readFileSync(join(FIXTURES, "test-200x150.png"));
const PNG_1x1 = readFileSync(join(FIXTURES, "test-1x1.png"));
const JPG_100x100 = readFileSync(join(FIXTURES, "test-100x100.jpg"));
const STRESS_LARGE = readFileSync(join(FIXTURES, "content", "stress-large.jpg"));

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
    url: `/api/v1/tools/${toolId}`,
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
    url: `/api/v1/tools/${toolId}/batch`,
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
    url: `/api/v1/tools/${toolId}`,
    headers: {
      "content-type": contentType,
      authorization: `Bearer ${adminToken}`,
    },
    body,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MEMORY PRESSURE -- 10 SEQUENTIAL LARGE FILE UPLOADS
// ═══════════════════════════════════════════════════════════════════════════
describe("Memory pressure -- 10 sequential large-file resize uploads", () => {
  it("processes stress-large.jpg 10 times sequentially without degradation", async () => {
    const results: Array<{ statusCode: number; jobId: string }> = [];

    for (let i = 0; i < 10; i++) {
      const res = await postTool("resize", [
        {
          name: "file",
          filename: `stress-seq-${i}.jpg`,
          content: STRESS_LARGE,
          contentType: "image/jpeg",
        },
        { name: "settings", content: JSON.stringify({ width: 300 }) },
      ]);

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.jobId).toBeDefined();
      results.push({ statusCode: res.statusCode, jobId: json.jobId });
    }

    // All 10 must produce unique job IDs
    const jobIds = results.map((r) => r.jobId);
    expect(new Set(jobIds).size).toBe(10);

    // Verify server is still responsive after 10 large uploads
    const healthRes = await app.inject({
      method: "GET",
      url: "/api/v1/health",
    });
    expect(healthRes.statusCode).toBe(200);
  }, 300_000);
});

// ═══════════════════════════════════════════════════════════════════════════
// MEMORY PRESSURE -- BACK-TO-BACK TOOL CHAIN WITH LARGE FILE
// ═══════════════════════════════════════════════════════════════════════════
describe("Memory pressure -- large file through resize, compress, rotate back-to-back", () => {
  it("processes stress-large.jpg through resize then compress then rotate sequentially", async () => {
    const resizeRes = await postTool("resize", [
      {
        name: "file",
        filename: "chain-resize.jpg",
        content: STRESS_LARGE,
        contentType: "image/jpeg",
      },
      { name: "settings", content: JSON.stringify({ width: 500 }) },
    ]);
    expect(resizeRes.statusCode).toBe(200);
    expect(JSON.parse(resizeRes.body).processedSize).toBeLessThan(
      JSON.parse(resizeRes.body).originalSize,
    );

    const compressRes = await postTool("compress", [
      {
        name: "file",
        filename: "chain-compress.jpg",
        content: STRESS_LARGE,
        contentType: "image/jpeg",
      },
      { name: "settings", content: JSON.stringify({ quality: 30 }) },
    ]);
    expect(compressRes.statusCode).toBe(200);
    expect(JSON.parse(compressRes.body).processedSize).toBeLessThan(
      JSON.parse(compressRes.body).originalSize,
    );

    const rotateRes = await postTool("rotate", [
      {
        name: "file",
        filename: "chain-rotate.jpg",
        content: STRESS_LARGE,
        contentType: "image/jpeg",
      },
      { name: "settings", content: JSON.stringify({ angle: 180 }) },
    ]);
    expect(rotateRes.statusCode).toBe(200);
    expect(JSON.parse(rotateRes.body).jobId).toBeDefined();
  }, 180_000);
});

// ═══════════════════════════════════════════════════════════════════════════
// CORRUPTED HEADERS THROUGH NON-RESIZE TOOLS
// ═══════════════════════════════════════════════════════════════════════════
describe("Corrupted headers through non-resize tools", () => {
  it("rejects random binary garbage through compress gracefully", async () => {
    const garbage = Buffer.from(
      Array.from({ length: 4096 }, () => Math.floor(Math.random() * 256)),
    );

    const res = await postTool("compress", [
      {
        name: "file",
        filename: "garbage.jpg",
        content: garbage,
        contentType: "image/jpeg",
      },
      { name: "settings", content: JSON.stringify({ quality: 50 }) },
    ]);

    expect([400, 422]).toContain(res.statusCode);
    const json = JSON.parse(res.body);
    expect(json.error).toBeDefined();
  });

  it("rejects random binary garbage through crop gracefully", async () => {
    const garbage = Buffer.from(
      Array.from({ length: 2048 }, () => Math.floor(Math.random() * 256)),
    );

    const res = await postTool("crop", [
      {
        name: "file",
        filename: "garbage.png",
        content: garbage,
        contentType: "image/png",
      },
      {
        name: "settings",
        content: JSON.stringify({ left: 0, top: 0, width: 10, height: 10 }),
      },
    ]);

    expect([400, 422]).toContain(res.statusCode);
  });

  it("rejects random binary garbage through convert gracefully", async () => {
    const garbage = Buffer.from(
      Array.from({ length: 2048 }, () => Math.floor(Math.random() * 256)),
    );

    const res = await postTool("convert", [
      {
        name: "file",
        filename: "garbage.png",
        content: garbage,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ format: "webp" }) },
    ]);

    expect([400, 422]).toContain(res.statusCode);
  });

  it("handles .jpg extension with PNG magic bytes through compress", async () => {
    // PNG data sent as .jpg -- Sharp should auto-detect and process correctly
    const res = await postTool("compress", [
      {
        name: "file",
        filename: "really-a-png.jpg",
        content: PNG_200x150,
        contentType: "image/jpeg",
      },
      { name: "settings", content: JSON.stringify({ quality: 60 }) },
    ]);

    // Sharp detects via magic bytes, not extension
    expect(res.statusCode).toBe(200);
  });

  it("handles .png extension with JPEG magic bytes through crop", async () => {
    // JPEG data sent as .png -- Sharp should auto-detect and process correctly
    const res = await postTool("crop", [
      {
        name: "file",
        filename: "really-a-jpeg.png",
        content: JPG_100x100,
        contentType: "image/png",
      },
      {
        name: "settings",
        content: JSON.stringify({ left: 0, top: 0, width: 50, height: 50 }),
      },
    ]);

    expect(res.statusCode).toBe(200);
  });

  it("handles .png extension with JPEG content through rotate", async () => {
    const res = await postTool("rotate", [
      {
        name: "file",
        filename: "mislabeled.png",
        content: JPG_100x100,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ angle: 90 }) },
    ]);

    expect(res.statusCode).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// WRONG CONTENT-TYPE HEADER MISMATCHES
// ═══════════════════════════════════════════════════════════════════════════
describe("Wrong content-type header -- application/json with binary data", () => {
  it("processes image when part content-type is application/json", async () => {
    // The multipart part claims to be JSON but contains a real PNG image
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "application/json",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    // Sharp detects format from magic bytes, not content-type
    expect(res.statusCode).toBe(200);
  });

  it("processes image when part content-type is image/png but data is JPEG", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "test.jpg",
        content: JPG_100x100,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
    ]);

    // Sharp detects actual JPEG format
    expect(res.statusCode).toBe(200);
  });

  it("processes image when part content-type is video/mp4 (completely wrong)", async () => {
    const res = await postTool("compress", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "video/mp4",
      },
      { name: "settings", content: JSON.stringify({ quality: 80 }) },
    ]);

    // Sharp ignores content-type and reads magic bytes
    expect(res.statusCode).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// UNICODE FILENAMES -- ADDITIONAL PATTERNS
// ═══════════════════════════════════════════════════════════════════════════
describe("Unicode filenames -- additional adversarial patterns", () => {
  it("handles emoji-only filename: \u{1F3A8}.jpg", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "\u{1F3A8}.jpg",
        content: JPG_100x100,
        contentType: "image/jpeg",
      },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
    ]);

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });

  it("handles multiple emoji in filename: \u{1F4F7}\u{1F30D}\u{2728}.png", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "\u{1F4F7}\u{1F30D}\u{2728}.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 80 }) },
    ]);

    expect(res.statusCode).toBe(200);
  });

  it("handles very long filename (250+ chars)", async () => {
    const longBase = "a".repeat(250);
    const longName = `${longBase}.png`;

    const res = await postTool("compress", [
      {
        name: "file",
        filename: longName,
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ quality: 70 }) },
    ]);

    // sanitizeFilename may truncate but should not crash
    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });

  it("handles filename with tab and newline characters", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "tab\there\nnewline.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 80 }) },
    ]);

    // Whitespace should be sanitized or stripped
    expect([200, 400]).toContain(res.statusCode);
  });

  it("handles filename with unicode zero-width characters", async () => {
    // Zero-width joiner, zero-width space
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "test​‍image.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 80 }) },
    ]);

    expect(res.statusCode).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EXTREME DIMENSIONS -- RESIZE TO 1x1 OUTPUT
// ═══════════════════════════════════════════════════════════════════════════
describe("Extreme dimensions -- resize to 1x1 output", () => {
  it("resizes a 200x150 image down to 1x1", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "shrink-to-pixel.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      {
        name: "settings",
        content: JSON.stringify({ width: 1, height: 1 }),
      },
    ]);

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.processedSize).toBeLessThan(json.originalSize);
  });

  it("resizes a JPEG image down to 1x1", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "shrink-jpg.jpg",
        content: JPG_100x100,
        contentType: "image/jpeg",
      },
      {
        name: "settings",
        content: JSON.stringify({ width: 1, height: 1 }),
      },
    ]);

    expect(res.statusCode).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EXTREME DIMENSIONS -- CROP EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════
describe("Extreme dimensions -- crop edge cases", () => {
  it("rejects crop with 0 width", async () => {
    const res = await postTool("crop", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      {
        name: "settings",
        content: JSON.stringify({ left: 0, top: 0, width: 0, height: 10 }),
      },
    ]);

    // z.number().positive() rejects 0
    expect(res.statusCode).toBe(400);
  });

  it("rejects crop with 0 height", async () => {
    const res = await postTool("crop", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      {
        name: "settings",
        content: JSON.stringify({ left: 0, top: 0, width: 10, height: 0 }),
      },
    ]);

    expect(res.statusCode).toBe(400);
  });

  it("rejects crop with negative width", async () => {
    const res = await postTool("crop", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      {
        name: "settings",
        content: JSON.stringify({ left: 0, top: 0, width: -10, height: 10 }),
      },
    ]);

    expect(res.statusCode).toBe(400);
  });

  it("rejects crop with negative left offset", async () => {
    const res = await postTool("crop", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      {
        name: "settings",
        content: JSON.stringify({ left: -5, top: 0, width: 10, height: 10 }),
      },
    ]);

    // z.number().min(0) rejects negative left
    expect(res.statusCode).toBe(400);
  });

  it("crops a 1x1 region from a normal image", async () => {
    const res = await postTool("crop", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      {
        name: "settings",
        content: JSON.stringify({ left: 50, top: 50, width: 1, height: 1 }),
      },
    ]);

    expect([200, 422]).toContain(res.statusCode);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EXTREME DIMENSIONS -- ROTATE 1x1 BY NON-ORTHOGONAL ANGLE
// ═══════════════════════════════════════════════════════════════════════════
describe("Extreme dimensions -- rotate 1x1 by non-orthogonal angles", () => {
  it("rotates a 1x1 image by 45 degrees", async () => {
    const res = await postTool("rotate", [
      {
        name: "file",
        filename: "tiny.png",
        content: PNG_1x1,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ angle: 45 }) },
    ]);

    // A 45-degree rotation of a 1x1 image produces a slightly larger image
    // with transparent corners. Must not crash.
    expect([200, 422]).toContain(res.statusCode);
  });

  it("rotates a 1x1 image by 1 degree", async () => {
    const res = await postTool("rotate", [
      {
        name: "file",
        filename: "tiny.png",
        content: PNG_1x1,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ angle: 1 }) },
    ]);

    expect([200, 422]).toContain(res.statusCode);
  });

  it("rotates a 1x1 image by 359 degrees", async () => {
    const res = await postTool("rotate", [
      {
        name: "file",
        filename: "tiny.png",
        content: PNG_1x1,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ angle: 359 }) },
    ]);

    expect([200, 422]).toContain(res.statusCode);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARAMETER BOUNDARY -- QUALITY VALUES
// ═══════════════════════════════════════════════════════════════════════════
describe("Parameter boundary -- compress quality values", () => {
  it("rejects quality of -1", async () => {
    const res = await postTool("compress", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ quality: -1 }) },
    ]);

    // z.number().min(1) rejects -1
    expect(res.statusCode).toBe(400);
  });

  it("rejects quality of 999", async () => {
    const res = await postTool("compress", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ quality: 999 }) },
    ]);

    // z.number().max(100) rejects 999
    expect(res.statusCode).toBe(400);
  });

  it("accepts quality at exact minimum (1)", async () => {
    const res = await postTool("compress", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ quality: 1 }) },
    ]);

    expect(res.statusCode).toBe(200);
  });

  it("accepts quality at midpoint (50)", async () => {
    const res = await postTool("compress", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ quality: 50 }) },
    ]);

    expect(res.statusCode).toBe(200);
  });

  it("accepts quality at 99", async () => {
    const res = await postTool("compress", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ quality: 99 }) },
    ]);

    expect(res.statusCode).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARAMETER BOUNDARY -- WIDTH / HEIGHT VALUES
// ═══════════════════════════════════════════════════════════════════════════
describe("Parameter boundary -- resize width/height values", () => {
  it("accepts width of 1 (minimum positive integer)", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 1 }) },
    ]);

    expect(res.statusCode).toBe(200);
  });

  it("rejects width of -1", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: -1 }) },
    ]);

    expect(res.statusCode).toBe(400);
  });

  it("rejects width as string 'abc'", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: '{"width": "abc"}' },
    ]);

    // Zod z.number() rejects string
    expect(res.statusCode).toBe(400);
  });

  it("rejects height as string 'NaN'", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: '{"height": "NaN"}' },
    ]);

    expect(res.statusCode).toBe(400);
  });

  it("handles width of 99999 without crashing", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 99999 }) },
    ]);

    // May succeed (Sharp allows large dims), fail at processing, or be
    // rejected by validation. Must not crash.
    // Note: Sharp will actually attempt to upscale, which can take significant
    // time on a small CPU. The PROCESSING_TIMEOUT_S config may kill it.
    expect([200, 400, 422]).toContain(res.statusCode);
  }, 120_000);
});

// ═══════════════════════════════════════════════════════════════════════════
// PARAMETER BOUNDARY -- ROTATION ANGLE VALUES
// ═══════════════════════════════════════════════════════════════════════════
describe("Parameter boundary -- rotation angle values", () => {
  it("handles angle of -360 (full negative rotation)", async () => {
    const res = await postTool("rotate", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ angle: -360 }) },
    ]);

    // -360 is effectively 0 degrees; Sharp allows negative angles
    expect([200, 400]).toContain(res.statusCode);
  });

  it("handles angle of -1 (slight counter-clockwise rotation)", async () => {
    const res = await postTool("rotate", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ angle: -1 }) },
    ]);

    // Sharp supports negative angles
    expect([200, 400]).toContain(res.statusCode);
  });

  it("handles angle of 360 (full rotation, equivalent to 0)", async () => {
    const res = await postTool("rotate", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ angle: 360 }) },
    ]);

    expect([200, 400]).toContain(res.statusCode);
  });

  it("handles angle of 720 (double full rotation)", async () => {
    const res = await postTool("rotate", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ angle: 720 }) },
    ]);

    // Sharp may normalize or process as-is
    expect([200, 400]).toContain(res.statusCode);
  });

  it("handles angle of 999 without crashing", async () => {
    const res = await postTool("rotate", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ angle: 999 }) },
    ]);

    // Sharp treats this as 999 mod 360 = 279 degrees effectively
    expect([200, 400]).toContain(res.statusCode);
  });

  it("rejects angle as string 'abc'", async () => {
    const res = await postTool("rotate", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: '{"angle": "abc"}' },
    ]);

    // z.number() rejects string
    expect(res.statusCode).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE -- 21+ STEPS (OVER LIMIT)
// ═══════════════════════════════════════════════════════════════════════════
describe("Pipeline -- exceeding step limits", () => {
  it("handles pipeline with 20 steps (many repeated resize operations)", async () => {
    // MAX_PIPELINE_STEPS defaults to 0 (unlimited) in test env, so this should succeed
    const steps = Array.from({ length: 20 }, () => ({
      toolId: "resize",
      settings: { percentage: 99 },
    }));

    const res = await executePipeline(PNG_200x150, "twenty-steps.png", { steps });

    // With no MAX_PIPELINE_STEPS set, this should succeed
    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.stepsCompleted).toBe(20);
  }, 120_000);

  it("handles pipeline with 25 steps (deep chain)", async () => {
    // If there is a limit set, this tests it. If unlimited, it should succeed.
    const steps = Array.from({ length: 25 }, () => ({
      toolId: "compress",
      settings: { quality: 99 },
    }));

    const res = await executePipeline(PNG_200x150, "twentyfive-steps.png", { steps });

    // No MAX_PIPELINE_STEPS in test config, so should succeed
    expect([200, 400]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const json = JSON.parse(res.body);
      expect(json.stepsCompleted).toBe(25);
    } else {
      // If rejected, should have a clear error about step limits
      const json = JSON.parse(res.body);
      expect(json.error).toMatch(/step|pipeline|max/i);
    }
  }, 120_000);
});

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE -- SAME STEP REPEATED WITH IDENTICAL SETTINGS
// ═══════════════════════════════════════════════════════════════════════════
describe("Pipeline -- same step repeated 10 times with identical settings", () => {
  it("handles 10 identical compress steps (quality=80) in a pipeline", async () => {
    const steps = Array.from({ length: 10 }, () => ({
      toolId: "compress",
      settings: { quality: 80 },
    }));

    const res = await executePipeline(PNG_200x150, "repeat-compress.png", { steps });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.stepsCompleted).toBe(10);
  }, 60_000);

  it("handles 10 identical rotate steps (angle=90) -- net result 2.5 full rotations", async () => {
    const steps = Array.from({ length: 10 }, () => ({
      toolId: "rotate",
      settings: { angle: 90 },
    }));

    const res = await executePipeline(PNG_200x150, "repeat-rotate.png", { steps });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.stepsCompleted).toBe(10);
  }, 60_000);
});

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE -- CONFLICTING OPERATIONS (RESIZE UP THEN DOWN)
// ═══════════════════════════════════════════════════════════════════════════
describe("Pipeline -- conflicting operations", () => {
  it("handles resize up (500px) then resize down (50px)", async () => {
    const res = await executePipeline(PNG_200x150, "up-then-down.png", {
      steps: [
        { toolId: "resize", settings: { width: 500 } },
        { toolId: "resize", settings: { width: 50 } },
      ],
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.stepsCompleted).toBe(2);
    // Final size should be small since we downsized to 50px
    expect(json.processedSize).toBeLessThan(json.originalSize);
  });

  it("handles resize down (10px) then resize up (1000px)", async () => {
    const res = await executePipeline(PNG_200x150, "down-then-up.png", {
      steps: [
        { toolId: "resize", settings: { width: 10 } },
        { toolId: "resize", settings: { width: 1000 } },
      ],
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.stepsCompleted).toBe(2);
  });

  it("handles convert to webp, then convert to jpeg (format ping-pong)", async () => {
    const res = await executePipeline(PNG_200x150, "format-pingpong.png", {
      steps: [
        { toolId: "convert", settings: { format: "webp" } },
        { toolId: "convert", settings: { format: "jpg" } },
      ],
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.stepsCompleted).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BATCH -- ALL IDENTICAL FILES
// ═══════════════════════════════════════════════════════════════════════════
describe("Batch -- all identical files", () => {
  it("handles batch with 5 identical PNG files", async () => {
    const res = await postBatch("resize", [
      { name: "file", filename: "same-1.png", contentType: "image/png", content: PNG_200x150 },
      { name: "file", filename: "same-2.png", contentType: "image/png", content: PNG_200x150 },
      { name: "file", filename: "same-3.png", contentType: "image/png", content: PNG_200x150 },
      { name: "file", filename: "same-4.png", contentType: "image/png", content: PNG_200x150 },
      { name: "file", filename: "same-5.png", contentType: "image/png", content: PNG_200x150 },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
    ]);

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    const fileResults = JSON.parse(res.headers["x-file-results"] as string);
    expect(Object.keys(fileResults).length).toBe(5);
  });

  it("handles batch with all identical files and same filename", async () => {
    // All files have the exact same name -- deduplication should produce unique names in ZIP
    const res = await postBatch("compress", [
      { name: "file", filename: "photo.png", contentType: "image/png", content: PNG_200x150 },
      { name: "file", filename: "photo.png", contentType: "image/png", content: PNG_200x150 },
      { name: "file", filename: "photo.png", contentType: "image/png", content: PNG_200x150 },
      { name: "settings", content: JSON.stringify({ quality: 60 }) },
    ]);

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    const fileResults = JSON.parse(res.headers["x-file-results"] as string);
    const names = Object.values(fileResults);
    // All three entries should have unique names in the ZIP
    expect(new Set(names).size).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BATCH -- MIXED VALID/INVALID THROUGH COMPRESS AND ROTATE
// ═══════════════════════════════════════════════════════════════════════════
describe("Batch -- mixed valid/invalid through compress and rotate", () => {
  it("handles batch compress with mix of valid images and garbage", async () => {
    const garbage = Buffer.from("not a real image at all, just text");

    const res = await postBatch("compress", [
      { name: "file", filename: "valid.png", contentType: "image/png", content: PNG_200x150 },
      { name: "file", filename: "garbage.jpg", contentType: "image/jpeg", content: garbage },
      { name: "file", filename: "valid.jpg", contentType: "image/jpeg", content: JPG_100x100 },
      { name: "settings", content: JSON.stringify({ quality: 50 }) },
    ]);

    // Batch processes valid files and skips invalid ones
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
  });

  it("handles batch rotate with mix of valid images and empty files", async () => {
    const res = await postBatch("rotate", [
      { name: "file", filename: "valid.png", contentType: "image/png", content: PNG_200x150 },
      { name: "file", filename: "empty.png", contentType: "image/png", content: Buffer.alloc(0) },
      { name: "file", filename: "valid.jpg", contentType: "image/jpeg", content: JPG_100x100 },
      { name: "settings", content: JSON.stringify({ angle: 90 }) },
    ]);

    // Empty files are skipped during parsing; remaining valid files succeed
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CONCURRENT -- 10 RESIZE WITH LARGE FILE, DATA INTEGRITY
// ═══════════════════════════════════════════════════════════════════════════
describe("Concurrent -- 10 simultaneous resize with large file", () => {
  it("fires 10 simultaneous resize requests with stress-large.jpg -- all return 200 with valid data", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        app.inject(
          buildToolRequest(
            "resize",
            STRESS_LARGE,
            `concurrent-large-${i}.jpg`,
            { width: 100 + i * 20 },
            "image/jpeg",
          ),
        ),
      ),
    );

    for (const res of results) {
      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.jobId).toBeDefined();
      expect(json.downloadUrl).toBeDefined();
      // All processed files should be smaller than original since we downsize
      expect(json.processedSize).toBeLessThan(json.originalSize);
    }

    // All 10 must produce unique job IDs (no race condition corruption)
    const jobIds = results.map((r) => JSON.parse(r.body).jobId);
    expect(new Set(jobIds).size).toBe(10);

    // All download URLs must be unique
    const urls = results.map((r) => JSON.parse(r.body).downloadUrl);
    expect(new Set(urls).size).toBe(10);
  }, 300_000);
});

// ═══════════════════════════════════════════════════════════════════════════
// CONCURRENT -- RAPID SEQUENTIAL WITH NO DELAY
// ═══════════════════════════════════════════════════════════════════════════
describe("Concurrent -- rapid sequential requests with zero delay", () => {
  it("fires 15 resize requests sequentially with no delay between them", async () => {
    const results = [];
    for (let i = 0; i < 15; i++) {
      const res = await app.inject(
        buildToolRequest("resize", PNG_200x150, `rapid-fire-${i}.png`, {
          width: 30 + i * 5,
        }),
      );
      results.push(res);
    }

    for (const res of results) {
      expect(res.statusCode).toBe(200);
    }

    // All should produce unique job IDs
    const jobIds = results.map((r) => JSON.parse(r.body).jobId);
    expect(new Set(jobIds).size).toBe(15);
  }, 60_000);
});

// ═══════════════════════════════════════════════════════════════════════════
// CONCURRENT -- PARALLEL BATCH + PIPELINE + SINGLE
// ═══════════════════════════════════════════════════════════════════════════
describe("Concurrent -- parallel batch, pipeline, and single requests", () => {
  it("runs batch, pipeline, and single resize simultaneously without corruption", async () => {
    // Single request
    const singleReq = app.inject(
      buildToolRequest("resize", PNG_200x150, "single.png", { width: 80 }),
    );

    // Batch request
    const batchPayload = createMultipartPayload([
      { name: "file", filename: "b1.png", content: PNG_200x150, contentType: "image/png" },
      { name: "file", filename: "b2.jpg", content: JPG_100x100, contentType: "image/jpeg" },
      { name: "settings", content: JSON.stringify({ width: 40 }) },
    ]);
    const batchReq = app.inject({
      method: "POST",
      url: "/api/v1/tools/resize/batch",
      headers: {
        "content-type": batchPayload.contentType,
        authorization: `Bearer ${adminToken}`,
      },
      body: batchPayload.body,
    });

    // Pipeline request
    const pipelinePayload = createMultipartPayload([
      { name: "file", filename: "pipe.png", content: PNG_200x150, contentType: "image/png" },
      {
        name: "pipeline",
        content: JSON.stringify({
          steps: [
            { toolId: "resize", settings: { width: 60 } },
            { toolId: "compress", settings: { quality: 70 } },
          ],
        }),
      },
    ]);
    const pipelineReq = app.inject({
      method: "POST",
      url: "/api/v1/pipeline/execute",
      headers: {
        "content-type": pipelinePayload.contentType,
        authorization: `Bearer ${adminToken}`,
      },
      body: pipelinePayload.body,
    });

    const [singleRes, batchRes, pipelineRes] = await Promise.all([
      singleReq,
      batchReq,
      pipelineReq,
    ]);

    // Single request
    expect(singleRes.statusCode).toBe(200);
    const singleBody = JSON.parse(singleRes.body);
    expect(singleBody.jobId).toBeDefined();

    // Batch request
    expect(batchRes.statusCode).toBe(200);
    expect(batchRes.headers["content-type"]).toBe("application/zip");

    // Pipeline request
    expect(pipelineRes.statusCode).toBe(200);
    const pipelineBody = JSON.parse(pipelineRes.body);
    expect(pipelineBody.stepsCompleted).toBe(2);
    expect(pipelineBody.jobId).toBeDefined();

    // Job IDs across all three must be unique
    expect(singleBody.jobId).not.toBe(pipelineBody.jobId);
  }, 120_000);
});

// ═══════════════════════════════════════════════════════════════════════════
// EMPTY FILE WITH VALID EXTENSION THROUGH MULTIPLE TOOLS
// ═══════════════════════════════════════════════════════════════════════════
describe("Empty file (0 bytes) with valid extension through various tools", () => {
  it("rejects empty .jpg file through text-overlay with 400", async () => {
    const res = await postTool("text-overlay", [
      {
        name: "file",
        filename: "empty.jpg",
        content: Buffer.alloc(0),
        contentType: "image/jpeg",
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

  it("rejects empty .webp file through watermark-text with 400", async () => {
    const res = await postTool("watermark-text", [
      {
        name: "file",
        filename: "empty.webp",
        content: Buffer.alloc(0),
        contentType: "image/webp",
      },
      {
        name: "settings",
        content: JSON.stringify({ text: "WM", fontSize: 12, opacity: 50 }),
      },
    ]);

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SERVER STABILITY AFTER ADVERSARIAL BARRAGE
// ═══════════════════════════════════════════════════════════════════════════
describe("Server stability -- health check after adversarial barrage", () => {
  it("server remains responsive after processing all preceding tests", async () => {
    // This test runs last (due to describe ordering) and verifies the server
    // did not leak memory or enter a degraded state from all the abuse above.
    const healthRes = await app.inject({
      method: "GET",
      url: "/api/v1/health",
    });
    expect(healthRes.statusCode).toBe(200);
    const json = JSON.parse(healthRes.body);
    expect(json.status).toBe("healthy");

    // Also verify a normal tool request still works
    const normalRes = await postTool("resize", [
      {
        name: "file",
        filename: "sanity-check.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);
    expect(normalRes.statusCode).toBe(200);
    expect(JSON.parse(normalRes.body).jobId).toBeDefined();
  });
});
