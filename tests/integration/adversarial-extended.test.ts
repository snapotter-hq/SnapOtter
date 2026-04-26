/**
 * Extended adversarial integration tests for the SnapOtter image API.
 *
 * Covers: zero-byte uploads across tools, corrupted headers / wrong magic
 * bytes, unicode filenames, extreme dimensions through various tools, batch
 * edge cases, pipeline edge cases, and concurrent stress scenarios.
 *
 * Complements adversarial.test.ts (32 tests), edge-cases.test.ts (24 tests),
 * and concurrent.test.ts.
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
) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, content: image, contentType: "image/png" },
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
// ZERO-BYTE FILES ACROSS MULTIPLE TOOLS
// ═══════════════════════════════════════════════════════════════════════════
describe("Zero-byte file uploads across tools", () => {
  const zeroBuffer = Buffer.alloc(0);

  it("rejects a 0-byte file to /api/v1/tools/resize with 400", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "empty.png",
        content: zeroBuffer,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toBeDefined();
  });

  it("rejects a 0-byte file to /api/v1/tools/compress with 400", async () => {
    const res = await postTool("compress", [
      {
        name: "file",
        filename: "empty.jpg",
        content: zeroBuffer,
        contentType: "image/jpeg",
      },
      { name: "settings", content: JSON.stringify({ quality: 80 }) },
    ]);

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toBeDefined();
  });

  it("rejects a 0-byte file to /api/v1/tools/convert with 400", async () => {
    const res = await postTool("convert", [
      {
        name: "file",
        filename: "empty.png",
        content: zeroBuffer,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ format: "jpg" }) },
    ]);

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toBeDefined();
  });

  it("rejects a 0-byte file to /api/v1/tools/rotate with 400", async () => {
    const res = await postTool("rotate", [
      {
        name: "file",
        filename: "empty.webp",
        content: zeroBuffer,
        contentType: "image/webp",
      },
      { name: "settings", content: JSON.stringify({ angle: 90 }) },
    ]);

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toBeDefined();
  });

  it("rejects a 0-byte file to /api/v1/tools/crop with 400", async () => {
    const res = await postTool("crop", [
      {
        name: "file",
        filename: "empty.png",
        content: zeroBuffer,
        contentType: "image/png",
      },
      {
        name: "settings",
        content: JSON.stringify({
          left: 0,
          top: 0,
          width: 10,
          height: 10,
        }),
      },
    ]);

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toBeDefined();
  });

  it("rejects a 0-byte file to /api/v1/tools/border with 400", async () => {
    const res = await postTool("border", [
      {
        name: "file",
        filename: "empty.png",
        content: zeroBuffer,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ borderWidth: 10 }) },
    ]);

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CORRUPTED HEADERS / WRONG MAGIC BYTES
// ═══════════════════════════════════════════════════════════════════════════
describe("Corrupted headers and wrong magic bytes", () => {
  it("handles PNG magic bytes followed by garbage gracefully", async () => {
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    const corruptedPng = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from(
        "THIS IS GARBAGE CONTENT AFTER A VALID PNG HEADER " +
          "AAAA BBBB CCCC DDDD EEEE FFFF 0000 1111 2222 3333",
      ),
    ]);

    const res = await postTool("resize", [
      {
        name: "file",
        filename: "corrupt-png.png",
        content: corruptedPng,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    // Should fail gracefully with a JSON error, NOT crash the server
    expect([400, 422]).toContain(res.statusCode);
    const json = JSON.parse(res.body);
    expect(json.error).toBeDefined();
  });

  it("handles JPEG SOI marker followed by truncated data gracefully", async () => {
    // JPEG starts with FF D8 (SOI), typically followed by FF E0 (APP0)
    const truncatedJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

    const res = await postTool("compress", [
      {
        name: "file",
        filename: "truncated.jpg",
        content: truncatedJpeg,
        contentType: "image/jpeg",
      },
      { name: "settings", content: JSON.stringify({ quality: 50 }) },
    ]);

    // Must not crash; either 200 (partial decode), 400, or 422
    expect([200, 400, 422]).toContain(res.statusCode);
  });

  it("handles a .jpg file containing actual PNG data (format mismatch)", async () => {
    // Sharp auto-detects via magic bytes, so this should process fine
    const res = await postTool("compress", [
      {
        name: "file",
        filename: "actually-png.jpg",
        content: PNG_200x150,
        contentType: "image/jpeg",
      },
      { name: "settings", content: JSON.stringify({ quality: 75 }) },
    ]);

    // Sharp detects the real format via magic bytes regardless of extension
    expect(res.statusCode).toBe(200);
  });

  it("rejects a BMP header followed by garbage", async () => {
    // BMP magic bytes: 42 4D
    const fakeBmp = Buffer.concat([Buffer.from([0x42, 0x4d]), Buffer.alloc(100, 0xff)]);

    const res = await postTool("resize", [
      {
        name: "file",
        filename: "fake.bmp",
        content: fakeBmp,
        contentType: "image/bmp",
      },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
    ]);

    // BMP is not a supported format OR the garbage content fails validation
    expect([400, 422]).toContain(res.statusCode);
  });

  it("rejects a WebP RIFF header followed by garbage", async () => {
    // WebP starts with RIFF....WEBP
    const fakeWebp = Buffer.concat([
      Buffer.from("RIFF"),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from("WEBP"),
      Buffer.alloc(50, 0xab),
    ]);

    const res = await postTool("resize", [
      {
        name: "file",
        filename: "corrupt.webp",
        content: fakeWebp,
        contentType: "image/webp",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    expect([400, 422]).toContain(res.statusCode);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// UNICODE FILENAMES (EXTENDED)
// ═══════════════════════════════════════════════════════════════════════════
describe("Unicode filenames — extended adversarial", () => {
  it("handles filename with emoji: photo_\u{1F389}.png", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "photo_\u{1F389}.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });

  it("handles filename with CJK characters: 写真.png", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "写真.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    expect(res.statusCode).toBe(200);
  });

  it("handles filename with spaces and special chars: my photo (final).png", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "my photo (final).png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    expect(res.statusCode).toBe(200);
  });

  it("sanitizes path traversal: ../../../etc/passwd.png", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "../../../etc/passwd.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).not.toContain("..");
    expect(json.downloadUrl).not.toContain("etc/passwd");
  });

  it("handles filename with mixed RTL and LTR characters", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "ملف_photo_الصورة.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    expect(res.statusCode).toBe(200);
  });

  it("handles filename with null bytes stripped", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "test\x00hidden.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    // Should succeed — null bytes are stripped by filename sanitization
    expect([200, 400]).toContain(res.statusCode);
  });

  it("handles filename with only an extension", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: ".png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    expect(res.statusCode).toBe(200);
  });

  it("handles filename with double extensions", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "exploit.php.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    // The download URL retains "exploit.php" in the base name but the final
    // extension is still a safe image format (.png). The key security check
    // is that the URL ends with a recognized image extension.
    expect(json.downloadUrl).toMatch(/\.(png|jpg|jpeg|webp|avif|tiff|gif)$/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EXTREME DIMENSIONS THROUGH VARIOUS TOOLS
// ═══════════════════════════════════════════════════════════════════════════
describe("1x1 pixel image through additional tools", () => {
  it("upscales a 1x1 pixel image to 100x100 via resize", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "tiny.png",
        content: PNG_1x1,
        contentType: "image/png",
      },
      {
        name: "settings",
        content: JSON.stringify({ width: 100, height: 100 }),
      },
    ]);

    expect(res.statusCode).toBe(200);
  });

  it("applies crop to a 1x1 pixel image (1x1 crop region)", async () => {
    const res = await postTool("crop", [
      {
        name: "file",
        filename: "tiny.png",
        content: PNG_1x1,
        contentType: "image/png",
      },
      {
        name: "settings",
        content: JSON.stringify({ left: 0, top: 0, width: 1, height: 1 }),
      },
    ]);

    // Should succeed or fail gracefully
    expect([200, 422]).toContain(res.statusCode);
  });

  it("applies border to a 1x1 pixel image", async () => {
    const res = await postTool("border", [
      {
        name: "file",
        filename: "tiny.png",
        content: PNG_1x1,
        contentType: "image/png",
      },
      {
        name: "settings",
        content: JSON.stringify({
          borderWidth: 20,
          borderColor: "#FF0000",
        }),
      },
    ]);

    expect(res.statusCode).toBe(200);
  });

  it("applies watermark-text to a 1x1 pixel image", async () => {
    const res = await postTool("watermark-text", [
      {
        name: "file",
        filename: "tiny.png",
        content: PNG_1x1,
        contentType: "image/png",
      },
      {
        name: "settings",
        content: JSON.stringify({
          text: "WATERMARK",
          fontSize: 12,
          opacity: 50,
        }),
      },
    ]);

    // The watermark will be much larger than the 1x1 image — may succeed
    // or fail depending on how Sharp handles the composite. Must not crash.
    expect([200, 400, 422]).toContain(res.statusCode);
  });

  it("applies sharpening to a 1x1 pixel image", async () => {
    const res = await postTool("sharpening", [
      {
        name: "file",
        filename: "tiny.png",
        content: PNG_1x1,
        contentType: "image/png",
      },
      {
        name: "settings",
        content: JSON.stringify({ method: "adaptive" }),
      },
    ]);

    // Sharpening a 1x1 image is a no-op but should not crash
    expect([200, 422]).toContain(res.statusCode);
  });

  it("applies text-overlay to a 1x1 pixel image", async () => {
    const res = await postTool("text-overlay", [
      {
        name: "file",
        filename: "tiny.png",
        content: PNG_1x1,
        contentType: "image/png",
      },
      {
        name: "settings",
        content: JSON.stringify({
          text: "Hello",
          fontSize: 24,
        }),
      },
    ]);

    // Text overlay on 1x1 image — the SVG overlay will dwarf the image
    expect([200, 422]).toContain(res.statusCode);
  });

  it("converts a 1x1 pixel image from PNG to WebP", async () => {
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
});

// ═══════════════════════════════════════════════════════════════════════════
// BATCH EDGE CASES (EXTENDED)
// ═══════════════════════════════════════════════════════════════════════════
describe("Batch edge cases — extended", () => {
  it("rejects batch with 0 images uploaded to resize", async () => {
    const res = await postBatch("resize", [
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toMatch(/no image/i);
  });

  it("handles batch with duplicate filenames", async () => {
    const res = await postBatch("resize", [
      {
        name: "file",
        filename: "duplicate.png",
        contentType: "image/png",
        content: PNG_200x150,
      },
      {
        name: "file",
        filename: "duplicate.png",
        contentType: "image/png",
        content: PNG_200x150,
      },
      {
        name: "file",
        filename: "duplicate.png",
        contentType: "image/png",
        content: PNG_200x150,
      },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
    ]);

    // Should succeed and deduplicate filenames in the ZIP
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    const fileResults = JSON.parse(res.headers["x-file-results"] as string);
    // All three entries should have unique names
    const names = Object.values(fileResults);
    expect(new Set(names).size).toBe(3);
  });

  it("handles batch with mix of valid and invalid files", async () => {
    const garbage = Buffer.from("this is not an image at all");

    const res = await postBatch("resize", [
      {
        name: "file",
        filename: "valid.png",
        contentType: "image/png",
        content: PNG_200x150,
      },
      {
        name: "file",
        filename: "invalid.png",
        contentType: "image/png",
        content: garbage,
      },
      {
        name: "file",
        filename: "also-valid.jpg",
        contentType: "image/jpeg",
        content: JPG_100x100,
      },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
    ]);

    // Batch should process valid files and skip invalid ones.
    // Since not all files failed, it should return 200 with a ZIP.
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
  });

  it("rejects batch where ALL files are invalid", async () => {
    const garbage1 = Buffer.from("not an image 1");
    const garbage2 = Buffer.from("not an image 2");

    const res = await postBatch("resize", [
      {
        name: "file",
        filename: "bad1.png",
        contentType: "image/png",
        content: garbage1,
      },
      {
        name: "file",
        filename: "bad2.png",
        contentType: "image/png",
        content: garbage2,
      },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
    ]);

    // All files failed — should return 422
    expect(res.statusCode).toBe(422);
    const json = JSON.parse(res.body);
    expect(json.error).toMatch(/all files failed/i);
    expect(json.errors).toBeDefined();
    expect(json.errors.length).toBe(2);
  });

  it("handles batch with zero-byte files (skipped as empty)", async () => {
    // Batch processing silently skips zero-byte parts (buffer.length === 0)
    const res = await postBatch("resize", [
      {
        name: "file",
        filename: "empty.png",
        contentType: "image/png",
        content: Buffer.alloc(0),
      },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
    ]);

    // The zero-byte file is skipped, resulting in 0 valid files
    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toMatch(/no image/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE EDGE CASES (EXTENDED)
// ═══════════════════════════════════════════════════════════════════════════
describe("Pipeline edge cases — extended", () => {
  it("rejects pipeline with 0 steps", async () => {
    const res = await executePipeline(PNG_200x150, "test.png", {
      steps: [],
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toMatch(/pipeline/i);
  });

  it("handles pipeline with conflicting resize then crop larger than result", async () => {
    // Resize to 50x50, then crop region 200x200 — should fail at crop step
    const res = await executePipeline(PNG_200x150, "test.png", {
      steps: [
        { toolId: "resize", settings: { width: 50, height: 50 } },
        {
          toolId: "crop",
          settings: { left: 0, top: 0, width: 200, height: 200 },
        },
      ],
    });

    // Crop exceeds resized dimensions — should fail gracefully (422)
    // or succeed if sharp auto-clips. Must not crash.
    expect([200, 422]).toContain(res.statusCode);
  });

  it("rejects pipeline step with unknown tool name", async () => {
    const res = await executePipeline(PNG_200x150, "test.png", {
      steps: [{ toolId: "resize", settings: { width: 100 } }, { toolId: "imaginary-tool-xyz" }],
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toMatch(/not found/i);
  });

  it("handles pipeline with resize then border then compress chain", async () => {
    const res = await executePipeline(PNG_200x150, "test.png", {
      steps: [
        { toolId: "resize", settings: { width: 80 } },
        {
          toolId: "border",
          settings: { borderWidth: 5, borderColor: "#FF0000" },
        },
        { toolId: "compress", settings: { quality: 50 } },
      ],
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.stepsCompleted).toBe(3);
  });

  it("rejects pipeline with empty settings object for a required-field tool", async () => {
    // watermark-text requires 'text' (min length 1)
    const res = await executePipeline(PNG_200x150, "test.png", {
      steps: [{ toolId: "watermark-text", settings: {} }],
    });

    // Zod validation should reject the missing required 'text' field
    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toMatch(/step 1/i);
  });

  it("handles pipeline that outputs to a different format mid-chain", async () => {
    // Convert to webp, then resize — should work since Sharp handles webp
    const res = await executePipeline(PNG_200x150, "test.png", {
      steps: [
        { toolId: "convert", settings: { format: "webp" } },
        { toolId: "resize", settings: { width: 50 } },
      ],
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.stepsCompleted).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CONCURRENT STRESS — EXTENDED
// ═══════════════════════════════════════════════════════════════════════════
describe("Concurrent stress — 10 simultaneous resize requests", () => {
  it("fires 10 simultaneous resize requests with the same image — all return 200", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        app.inject(
          buildToolRequest("resize", PNG_200x150, `stress-${i}.png`, {
            width: 50,
          }),
        ),
      ),
    );

    for (const res of results) {
      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.jobId).toBeDefined();
      expect(json.downloadUrl).toBeDefined();
    }

    // All 10 must produce unique job IDs
    const jobIds = results.map((r) => JSON.parse(r.body).jobId);
    expect(new Set(jobIds).size).toBe(10);
  }, 120_000);
});

describe("Concurrent stress — 5 different tools simultaneously", () => {
  it("fires resize, crop, rotate, compress, and border simultaneously — all return 200", async () => {
    const [resizeRes, cropRes, rotateRes, compressRes, borderRes] = await Promise.all([
      app.inject(
        buildToolRequest("resize", PNG_200x150, "conc-resize.png", {
          width: 100,
        }),
      ),
      app.inject(
        buildToolRequest("crop", PNG_200x150, "conc-crop.png", {
          left: 0,
          top: 0,
          width: 100,
          height: 100,
        }),
      ),
      app.inject(
        buildToolRequest("rotate", PNG_200x150, "conc-rotate.png", {
          angle: 90,
        }),
      ),
      app.inject(
        buildToolRequest("compress", PNG_200x150, "conc-compress.png", {
          quality: 60,
        }),
      ),
      app.inject(
        buildToolRequest("border", PNG_200x150, "conc-border.png", {
          borderWidth: 10,
          borderColor: "#0000FF",
        }),
      ),
    ]);

    expect(resizeRes.statusCode).toBe(200);
    expect(cropRes.statusCode).toBe(200);
    expect(rotateRes.statusCode).toBe(200);
    expect(compressRes.statusCode).toBe(200);
    expect(borderRes.statusCode).toBe(200);

    // All must have unique job IDs
    const ids = [resizeRes, cropRes, rotateRes, compressRes, borderRes].map(
      (r) => JSON.parse(r.body).jobId,
    );
    expect(new Set(ids).size).toBe(5);
  }, 120_000);
});

// ═══════════════════════════════════════════════════════════════════════════
// CONCURRENT MIX OF ADVERSARIAL AND VALID REQUESTS
// ═══════════════════════════════════════════════════════════════════════════
describe("Concurrent adversarial and valid requests", () => {
  it("processes valid requests correctly even when invalid ones are fired simultaneously", async () => {
    const garbage = Buffer.from(
      Array.from({ length: 1024 }, () => Math.floor(Math.random() * 256)),
    );
    const emptyBuf = Buffer.alloc(0);

    const [valid1, valid2, invalid1, invalid2, valid3] = await Promise.all([
      app.inject(
        buildToolRequest("resize", PNG_200x150, "valid-1.png", {
          width: 80,
        }),
      ),
      app.inject(
        buildToolRequest("rotate", JPG_100x100, "valid-2.jpg", {
          angle: 180,
        }),
      ),
      // Garbage data
      app.inject(buildToolRequest("resize", garbage, "garbage.png", { width: 50 })),
      // Zero-byte file — manually construct since buildToolRequest uses non-empty image
      (() => {
        const { body, contentType } = createMultipartPayload([
          {
            name: "file",
            filename: "empty.png",
            content: emptyBuf,
            contentType: "image/png",
          },
          {
            name: "settings",
            content: JSON.stringify({ width: 50 }),
          },
        ]);
        return app.inject({
          method: "POST",
          url: "/api/v1/tools/resize",
          headers: {
            "content-type": contentType,
            authorization: `Bearer ${adminToken}`,
          },
          body,
        });
      })(),
      app.inject(
        buildToolRequest("compress", PNG_200x150, "valid-3.png", {
          quality: 70,
        }),
      ),
    ]);

    // Valid requests must succeed
    expect(valid1.statusCode).toBe(200);
    expect(valid2.statusCode).toBe(200);
    expect(valid3.statusCode).toBe(200);

    // Invalid requests must fail gracefully
    expect([400, 422]).toContain(invalid1.statusCode);
    expect(invalid2.statusCode).toBe(400);

    // Valid results must have valid job IDs
    expect(JSON.parse(valid1.body).jobId).toBeDefined();
    expect(JSON.parse(valid2.body).jobId).toBeDefined();
    expect(JSON.parse(valid3.body).jobId).toBeDefined();
  }, 120_000);
});

// ═══════════════════════════════════════════════════════════════════════════
// INJECTION IN VARIOUS SETTINGS FIELDS
// ═══════════════════════════════════════════════════════════════════════════
describe("Injection attacks in settings fields", () => {
  it("handles command injection attempt in border color field", async () => {
    const res = await postTool("border", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      {
        name: "settings",
        content: JSON.stringify({
          borderWidth: 10,
          borderColor: "$(rm -rf /)",
        }),
      },
    ]);

    // Zod hex color regex should reject this
    expect(res.statusCode).toBe(400);
  });

  it("handles prototype pollution attempt in settings", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      {
        name: "settings",
        content: JSON.stringify({
          width: 100,
          __proto__: { admin: true },
          constructor: { prototype: { isAdmin: true } },
        }),
      },
    ]);

    // Zod strips unknown keys — the extra fields should be ignored
    expect(res.statusCode).toBe(200);
  });

  it("handles extremely long string in watermark text", async () => {
    const longText = "A".repeat(501); // exceeds 500 char max

    const res = await postTool("watermark-text", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      {
        name: "settings",
        content: JSON.stringify({
          text: longText,
          fontSize: 12,
        }),
      },
    ]);

    // z.string().max(500) should reject this
    expect(res.statusCode).toBe(400);
  });

  it("handles NaN and Infinity in numeric settings", async () => {
    // JSON.stringify(NaN) becomes null, JSON.stringify(Infinity) also becomes null
    // So we pass them as strings which should fail Zod number validation
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      {
        name: "settings",
        content: '{"width": "NaN"}',
      },
    ]);

    // Zod should reject string "NaN" for a z.number() field
    expect(res.statusCode).toBe(400);
  });

  it("handles boolean where number expected", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      {
        name: "settings",
        content: JSON.stringify({ width: true }),
      },
    ]);

    expect(res.statusCode).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CONTENT-TYPE MISMATCHES
// ═══════════════════════════════════════════════════════════════════════════
describe("Content-type header mismatches", () => {
  it("processes image when content-type is application/octet-stream", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "application/octet-stream",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    // Sharp detects format from magic bytes, not content-type
    expect(res.statusCode).toBe(200);
  });

  it("processes image when content-type is completely wrong", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "text/plain",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    // Sharp should still detect the actual format
    expect(res.statusCode).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RAPID-FIRE SEQUENTIAL REQUESTS TO DIFFERENT TOOLS
// ═══════════════════════════════════════════════════════════════════════════
describe("Rapid sequential requests across tools", () => {
  it("handles 8 sequential requests to alternating tools without errors", async () => {
    const tools = [
      { id: "resize", settings: { width: 80 } },
      { id: "rotate", settings: { angle: 90 } },
      { id: "compress", settings: { quality: 70 } },
      { id: "border", settings: { borderWidth: 5 } },
      { id: "resize", settings: { width: 60 } },
      { id: "rotate", settings: { angle: 180 } },
      { id: "compress", settings: { quality: 50 } },
      { id: "border", settings: { borderWidth: 10 } },
    ];

    for (let i = 0; i < tools.length; i++) {
      const tool = tools[i];
      const res = await app.inject(
        buildToolRequest(tool.id, PNG_200x150, `rapid-${i}.png`, tool.settings),
      );
      expect(res.statusCode).toBe(200);
    }
  }, 60_000);
});

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS BOUNDARY VALUES
// ═══════════════════════════════════════════════════════════════════════════
describe("Settings boundary values", () => {
  it("accepts compress quality at minimum boundary (1)", async () => {
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

  it("accepts compress quality at maximum boundary (100)", async () => {
    const res = await postTool("compress", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ quality: 100 }) },
    ]);

    expect(res.statusCode).toBe(200);
  });

  it("rejects compress quality below minimum (0)", async () => {
    const res = await postTool("compress", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ quality: 0 }) },
    ]);

    expect(res.statusCode).toBe(400);
  });

  it("rejects compress quality above maximum (101)", async () => {
    const res = await postTool("compress", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ quality: 101 }) },
    ]);

    expect(res.statusCode).toBe(400);
  });

  it("accepts rotate at 0 degrees", async () => {
    const res = await postTool("rotate", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ angle: 0 }) },
    ]);

    // 0-degree rotation is a valid no-op
    expect([200, 400]).toContain(res.statusCode);
  });

  it("accepts rotate at 359 degrees", async () => {
    const res = await postTool("rotate", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ angle: 359 }) },
    ]);

    expect(res.statusCode).toBe(200);
  });

  it("handles border width at maximum (2000)", async () => {
    const res = await postTool("border", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      {
        name: "settings",
        content: JSON.stringify({ borderWidth: 2000 }),
      },
    ]);

    // May succeed or fail at processing, but must not crash
    expect([200, 400, 422]).toContain(res.statusCode);
  });

  it("rejects border width above maximum (2001)", async () => {
    const res = await postTool("border", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      {
        name: "settings",
        content: JSON.stringify({ borderWidth: 2001 }),
      },
    ]);

    expect(res.statusCode).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MULTI-FORMAT ZERO-BYTE BATCH
// ═══════════════════════════════════════════════════════════════════════════
describe("Batch with only zero-byte files", () => {
  it("rejects batch where all files are zero-byte", async () => {
    const res = await postBatch("resize", [
      {
        name: "file",
        filename: "empty1.png",
        contentType: "image/png",
        content: Buffer.alloc(0),
      },
      {
        name: "file",
        filename: "empty2.png",
        contentType: "image/png",
        content: Buffer.alloc(0),
      },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
    ]);

    // Zero-byte files are skipped during parsing, so 0 valid files
    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toMatch(/no image/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE WITH 1x1 PIXEL IMAGE
// ═══════════════════════════════════════════════════════════════════════════
describe("Pipeline with 1x1 pixel image", () => {
  it("processes 1x1 image through resize + border + compress pipeline", async () => {
    const res = await executePipeline(PNG_1x1, "tiny.png", {
      steps: [
        { toolId: "resize", settings: { width: 50, height: 50 } },
        {
          toolId: "border",
          settings: { borderWidth: 5, borderColor: "#00FF00" },
        },
        { toolId: "compress", settings: { quality: 80 } },
      ],
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.stepsCompleted).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// NON-EXISTENT TOOL ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════
describe("Non-existent tool and route handling", () => {
  it("returns 404 for completely non-existent tool route", async () => {
    const res = await postTool("this-tool-does-not-exist-at-all", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    expect(res.statusCode).toBe(404);
  });

  it("returns 404 for tool endpoint with SQL injection in URL", async () => {
    const res = await postTool("resize'; DROP TABLE users; --", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    expect(res.statusCode).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MEMORY PRESSURE — LARGE FILE SEQUENTIAL UPLOADS
// ═══════════════════════════════════════════════════════════════════════════
describe("Memory pressure — large file (6.7MB) sequential uploads", () => {
  it("processes 5 sequential resize requests with stress-large.jpg — all succeed", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await postTool("resize", [
        {
          name: "file",
          filename: `stress-${i}.jpg`,
          content: STRESS_LARGE,
          contentType: "image/jpeg",
        },
        { name: "settings", content: JSON.stringify({ width: 200 }) },
      ]);

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.jobId).toBeDefined();
      expect(json.processedSize).toBeLessThan(json.originalSize);
    }
  }, 120_000);

  it("processes stress-large.jpg through compress", async () => {
    const res = await postTool("compress", [
      {
        name: "file",
        filename: "stress-compress.jpg",
        content: STRESS_LARGE,
        contentType: "image/jpeg",
      },
      { name: "settings", content: JSON.stringify({ quality: 40 }) },
    ]);

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.processedSize).toBeLessThan(json.originalSize);
  }, 60_000);

  it("processes stress-large.jpg through convert (JPEG to WebP)", async () => {
    const res = await postTool("convert", [
      {
        name: "file",
        filename: "stress-convert.jpg",
        content: STRESS_LARGE,
        contentType: "image/jpeg",
      },
      { name: "settings", content: JSON.stringify({ format: "webp" }) },
    ]);

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  }, 60_000);

  it("processes stress-large.jpg through info", async () => {
    const res = await postTool("info", [
      {
        name: "file",
        filename: "stress-info.jpg",
        content: STRESS_LARGE,
        contentType: "image/jpeg",
      },
    ]);

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.width).toBeGreaterThan(0);
    expect(json.height).toBeGreaterThan(0);
    expect(json.format).toBe("jpeg");
  }, 60_000);

  it("processes stress-large.jpg through rotate", async () => {
    const res = await postTool("rotate", [
      {
        name: "file",
        filename: "stress-rotate.jpg",
        content: STRESS_LARGE,
        contentType: "image/jpeg",
      },
      { name: "settings", content: JSON.stringify({ angle: 90 }) },
    ]);

    expect(res.statusCode).toBe(200);
  }, 60_000);
});

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE LIMIT — MANY STEPS
// ═══════════════════════════════════════════════════════════════════════════
describe("Pipeline with many repeated steps", () => {
  it("handles pipeline with 10 resize steps (repeated operation)", async () => {
    const steps = Array.from({ length: 10 }, () => ({
      toolId: "resize",
      settings: { percentage: 95 },
    }));

    const res = await executePipeline(PNG_200x150, "multi-resize.png", { steps });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.stepsCompleted).toBe(10);
  }, 120_000);

  it("handles pipeline with alternating resize and compress (circular-like)", async () => {
    const steps = [
      { toolId: "resize", settings: { width: 180 } },
      { toolId: "compress", settings: { quality: 90 } },
      { toolId: "resize", settings: { width: 160 } },
      { toolId: "compress", settings: { quality: 80 } },
      { toolId: "resize", settings: { width: 140 } },
      { toolId: "compress", settings: { quality: 70 } },
    ];

    const res = await executePipeline(PNG_200x150, "circular.png", { steps });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.stepsCompleted).toBe(6);
    // Each resize reduces size, so final should be smaller than original
    expect(json.processedSize).toBeLessThan(json.originalSize);
  }, 60_000);

  it("handles pipeline with duplicate consecutive steps (same tool, same settings)", async () => {
    const steps = Array.from({ length: 5 }, () => ({
      toolId: "compress",
      settings: { quality: 50 },
    }));

    const res = await executePipeline(PNG_200x150, "dupe-steps.png", { steps });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.stepsCompleted).toBe(5);
  }, 60_000);

  it("rejects pipeline with only non-existent tool IDs", async () => {
    const res = await executePipeline(PNG_200x150, "bad-pipeline.png", {
      steps: [{ toolId: "fake-tool-a" }, { toolId: "fake-tool-b" }],
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toMatch(/not found/i);
  });

  it("handles pipeline where middle step fails — returns partial step info", async () => {
    // Resize to 10x10, then crop 200x200 (exceeds image), then border
    const res = await executePipeline(PNG_200x150, "mid-fail.png", {
      steps: [
        { toolId: "resize", settings: { width: 10, height: 10 } },
        { toolId: "crop", settings: { left: 0, top: 0, width: 200, height: 200 } },
        { toolId: "border", settings: { borderWidth: 5 } },
      ],
    });

    // Should fail at the crop step (step 2)
    expect([200, 422]).toContain(res.statusCode);
    if (res.statusCode === 422) {
      const json = JSON.parse(res.body);
      expect(json.completedSteps).toBeDefined();
      expect(json.completedSteps.length).toBe(1); // only step 1 completed
    }
  }, 30_000);
});

// ═══════════════════════════════════════════════════════════════════════════
// BATCH LIMITS — BOUNDARY TESTS
// ═══════════════════════════════════════════════════════════════════════════
describe("Batch limits — boundary tests", () => {
  it("handles batch with exactly 1 image (minimum valid batch)", async () => {
    const res = await postBatch("resize", [
      {
        name: "file",
        filename: "single-batch.png",
        contentType: "image/png",
        content: PNG_200x150,
      },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
    ]);

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    const fileResults = JSON.parse(res.headers["x-file-results"] as string);
    expect(Object.keys(fileResults).length).toBe(1);
  });

  it("handles batch at MAX_BATCH_SIZE limit (10 images)", async () => {
    const fields = Array.from({ length: 10 }, (_, i) => ({
      name: "file",
      filename: `batch-max-${i}.png`,
      contentType: "image/png",
      content: PNG_200x150,
    }));
    fields.push({
      name: "settings",
      filename: undefined as unknown as string,
      contentType: undefined as unknown as string,
      content: JSON.stringify({ width: 30 }) as unknown as Buffer,
    });

    const res = await postBatch("resize", fields);

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    const fileResults = JSON.parse(res.headers["x-file-results"] as string);
    expect(Object.keys(fileResults).length).toBe(10);
  }, 120_000);

  it("rejects batch exceeding MAX_BATCH_SIZE (11 images, limit is 10)", async () => {
    const fields = Array.from({ length: 11 }, (_, i) => ({
      name: "file",
      filename: `batch-over-${i}.png`,
      contentType: "image/png",
      content: PNG_200x150,
    }));
    fields.push({
      name: "settings",
      filename: undefined as unknown as string,
      contentType: undefined as unknown as string,
      content: JSON.stringify({ width: 30 }) as unknown as Buffer,
    });

    const res = await postBatch("resize", fields);

    // @fastify/multipart enforces a files limit at the parser level (set to
    // MAX_BATCH_SIZE in upload.ts), so the request fails at multipart parsing
    // before the application-level batch size check runs.
    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// UNICODE FILENAMES — ADDITIONAL EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════
describe("Unicode filenames — specific requested patterns", () => {
  it("handles filename with picture frame emoji: \u{1F5BC}️.jpg", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "\u{1F5BC}️.jpg",
        content: JPG_100x100,
        contentType: "image/jpeg",
      },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
    ]);

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });

  it("handles filename with Japanese katakana: テスト.png", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "テスト.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
    ]);

    expect(res.statusCode).toBe(200);
  });

  it("handles filename with ampersand and equals: file&name=special.jpg", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "file&name=special.jpg",
        content: JPG_100x100,
        contentType: "image/jpeg",
      },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
    ]);

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });

  it("handles filename with URL-encoded characters: %20photo%2F.png", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "%20photo%2F.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
    ]);

    expect(res.statusCode).toBe(200);
  });

  it("handles filename with backslashes: path\\to\\image.png", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "path\\to\\image.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
    ]);

    // Backslashes should be stripped or sanitized
    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).not.toContain("\\");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EXTREME DIMENSIONS — 1x1 IMAGE CROP LARGER THAN IMAGE
// ═══════════════════════════════════════════════════════════════════════════
describe("1x1 pixel image — crop larger than image", () => {
  it("rejects crop of 100x100 on a 1x1 image", async () => {
    const res = await postTool("crop", [
      {
        name: "file",
        filename: "tiny.png",
        content: PNG_1x1,
        contentType: "image/png",
      },
      {
        name: "settings",
        content: JSON.stringify({ left: 0, top: 0, width: 100, height: 100 }),
      },
    ]);

    // Crop region extends beyond image — should fail
    expect([400, 422]).toContain(res.statusCode);
  });

  it("rejects crop with offset beyond 1x1 bounds", async () => {
    const res = await postTool("crop", [
      {
        name: "file",
        filename: "tiny.png",
        content: PNG_1x1,
        contentType: "image/png",
      },
      {
        name: "settings",
        content: JSON.stringify({ left: 5, top: 5, width: 1, height: 1 }),
      },
    ]);

    expect([400, 422]).toContain(res.statusCode);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE WITH LARGE FILE
// ═══════════════════════════════════════════════════════════════════════════
describe("Pipeline with large file (6.7MB)", () => {
  it("processes stress-large.jpg through resize + compress pipeline", async () => {
    const res = await executePipeline(STRESS_LARGE, "stress-pipeline.jpg", {
      steps: [
        { toolId: "resize", settings: { width: 400 } },
        { toolId: "compress", settings: { quality: 50 } },
      ],
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.stepsCompleted).toBe(2);
    expect(json.processedSize).toBeLessThan(json.originalSize);
  }, 120_000);
});

// ═══════════════════════════════════════════════════════════════════════════
// BATCH WITH LARGE FILES
// ═══════════════════════════════════════════════════════════════════════════
describe("Batch with large files", () => {
  it("processes 2 large files in batch resize", async () => {
    const res = await postBatch("resize", [
      {
        name: "file",
        filename: "stress-1.jpg",
        contentType: "image/jpeg",
        content: STRESS_LARGE,
      },
      {
        name: "file",
        filename: "stress-2.jpg",
        contentType: "image/jpeg",
        content: STRESS_LARGE,
      },
      { name: "settings", content: JSON.stringify({ width: 200 }) },
    ]);

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
  }, 120_000);
});
