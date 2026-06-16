/**
 * Integration tests for the batch processing route (batch.ts).
 *
 * Covers edge cases: filename deduplication, partial failure handling,
 * clientJobId passthrough, file results header, invalid settings,
 * non-existent tools, and ZIP response format validation.
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ffmpegAvailable } from "@snapotter/media-engine";
import AdmZip from "adm-zip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sharedRedis } from "../../apps/api/src/jobs/connection.js";
import { bullPrefix } from "../../apps/api/src/jobs/types.js";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const FIXTURES = join(__dirname, "..", "fixtures");
const PNG = readFileSync(join(FIXTURES, "test-200x150.png"));
const JPG = readFileSync(join(FIXTURES, "test-100x100.jpg"));
const WEBP = readFileSync(join(FIXTURES, "test-50x50.webp"));
const TINY_MP4 = readFileSync(join(FIXTURES, "media", "tiny.mp4"));
const TINY_MOV = readFileSync(join(FIXTURES, "media", "tiny.mov"));

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

// ── ZIP response validation ─────────────────────────────────────
describe("ZIP response format", () => {
  it("returns valid ZIP with correct entry count", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize/batch",
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");

    const zip = new AdmZip(res.rawPayload);
    const entries = zip.getEntries();
    expect(entries.length).toBe(2);
  });

  it("includes Content-Disposition header with tool name", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize/batch",
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const disposition = res.headers["content-disposition"] as string;
    expect(disposition).toContain("batch-resize");
  });
});

// ── Filename deduplication ──────────────────────────────────────
describe("Filename deduplication in batch", () => {
  it("deduplicates identical output filenames", async () => {
    // Upload two files with the same name — output names should be deduped
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "same.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "same.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize/batch",
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
      body,
    });

    expect(res.statusCode).toBe(200);

    const zip = new AdmZip(res.rawPayload);
    const names = zip.getEntries().map((e) => e.entryName);
    // Names should be unique
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });
});

// ── X-File-Results header ───────────────────────────────────────
describe("X-File-Results header", () => {
  it("maps file indices to output filenames", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "first.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "second.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ width: 80 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize/batch",
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const fileResults = JSON.parse(decodeURIComponent(res.headers["x-file-results"] as string));
    expect(fileResults).toBeDefined();
    // Should have entries for index 0 and 1
    expect(fileResults["0"]).toBeDefined();
    expect(fileResults["1"]).toBeDefined();
  });

  it("encodes non-ASCII filenames in header without ERR_INVALID_CHAR", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "图片测试.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "テスト.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ width: 80 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize/batch",
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const raw = res.headers["x-file-results"] as string;
    expect(raw).toMatch(/^[\x20-\x7E]+$/);
    const fileResults = JSON.parse(decodeURIComponent(raw));
    expect(fileResults["0"]).toContain("图片测试");
    expect(fileResults["1"]).toContain("テスト");
  });

  it("handles mixed ASCII and non-ASCII filenames", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "normal.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "élève-photo.jpg", contentType: "image/jpeg", content: JPG },
      { name: "file", filename: "📷-snap.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ width: 80 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize/batch",
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const raw = res.headers["x-file-results"] as string;
    expect(raw).toMatch(/^[\x20-\x7E]+$/);
    const fileResults = JSON.parse(decodeURIComponent(raw));
    expect(fileResults["0"]).toContain("normal");
    expect(fileResults["1"]).toContain("élève");
    expect(fileResults["2"]).toContain("📷");
  });

  it("round-trips filenames with special URI characters", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "file with spaces & (parens).png",
        contentType: "image/png",
        content: PNG,
      },
      { name: "settings", content: JSON.stringify({ width: 80 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize/batch",
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const fileResults = JSON.parse(decodeURIComponent(res.headers["x-file-results"] as string));
    expect(fileResults["0"]).toBeDefined();
  });
});

// ── ClientJobId passthrough ─────────────────────────────────────
describe("ClientJobId passthrough", () => {
  it("uses provided clientJobId in response header", async () => {
    const clientJobId = "my-custom-batch-id-42";

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
      { name: "clientJobId", content: clientJobId },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize/batch",
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["x-job-id"]).toBe(clientJobId);
  });

  it("generates a job ID when clientJobId is not provided", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize/batch",
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["x-job-id"]).toBeDefined();
    expect((res.headers["x-job-id"] as string).length).toBeGreaterThan(0);
  });
});

// ── Error handling ──────────────────────────────────────────────
describe("Batch error handling", () => {
  it("returns 404 for non-existent tool", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/totally-fake-tool/batch",
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
      body,
    });

    expect(res.statusCode).toBe(404);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/not found/i);
  });

  it("returns 400 for no files in batch", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize/batch",
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/no image/i);
  });

  it("returns 400 for invalid settings JSON", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: "not-json-at-all" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize/batch",
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid tool settings", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ width: -100 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize/batch",
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
  });
});

// ── Mixed format batch ──────────────────────────────────────────
describe("Mixed format batch", () => {
  it("processes PNG, JPG, and WebP in a single batch", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      { name: "file", filename: "c.webp", contentType: "image/webp", content: WEBP },
      { name: "settings", content: JSON.stringify({ width: 30 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize/batch",
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
      body,
    });

    expect(res.statusCode).toBe(200);

    const zip = new AdmZip(res.rawPayload);
    expect(zip.getEntries().length).toBe(3);
  });
});

// ── Batch with default settings ─────────────────────────────────
describe("Batch with default settings", () => {
  it("uses default settings when settings field is omitted", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/strip-metadata/batch",
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
  });
});

// ── Exotic format batch processing ─────────────────────────────
describe("Exotic format batch processing", () => {
  const FORMATS_DIR = join(FIXTURES, "formats");

  const exoticFormats = [
    { ext: "pbm", mime: "image/x-portable-bitmap" },
    { ext: "pgm", mime: "image/x-portable-graymap" },
    { ext: "ppm", mime: "image/x-portable-pixmap" },
    { ext: "tiff", mime: "image/tiff" },
    { ext: "qoi", mime: "application/octet-stream" },
    { ext: "jp2", mime: "image/jp2" },
    { ext: "svgz", mime: "image/svg+xml" },
    { ext: "dds", mime: "application/octet-stream" },
    { ext: "dpx", mime: "application/octet-stream" },
    { ext: "eps", mime: "application/postscript" },
    { ext: "tga", mime: "image/x-tga" },
    { ext: "psd", mime: "image/vnd.adobe.photoshop" },
    { ext: "hdr", mime: "image/vnd.radiance" },
    { ext: "ico", mime: "image/x-icon" },
    { ext: "cur", mime: "image/x-icon" },
  ];

  const formatsNeedingDelegates = [
    { ext: "fits", mime: "application/fits" },
    { ext: "exr", mime: "image/x-exr" },
  ];

  const settings = JSON.stringify({ mode: "quality", quality: 50 });

  async function batchCompress(ext: string, mime: string) {
    const fileBuffer = readFileSync(join(FORMATS_DIR, `sample.${ext}`));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: `sample.${ext}`, contentType: mime, content: fileBuffer },
      { name: "settings", content: settings },
    ]);
    return app.inject({
      method: "POST",
      url: "/api/v1/tools/compress/batch",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });
  }

  for (const { ext, mime } of exoticFormats) {
    it(`processes ${ext.toUpperCase()} through batch compress`, async () => {
      const res = await batchCompress(ext, mime);
      expect(res.statusCode).toBe(200);
      const fileResults = JSON.parse(decodeURIComponent(res.headers["x-file-results"] as string));
      expect(fileResults["0"]).toBeDefined();
    });
  }

  for (const { ext, mime } of formatsNeedingDelegates) {
    it(`processes ${ext.toUpperCase()} through batch compress (needs ImageMagick delegate)`, async () => {
      const res = await batchCompress(ext, mime);
      expect([200, 422]).toContain(res.statusCode);
    });
  }

  it("processes mixed exotic formats (PBM + TIFF + QOI) in one batch", async () => {
    const pbm = readFileSync(join(FORMATS_DIR, "sample.pbm"));
    const tiff = readFileSync(join(FORMATS_DIR, "sample.tiff"));
    const qoi = readFileSync(join(FORMATS_DIR, "sample.qoi"));

    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "sample.pbm",
        contentType: "image/x-portable-bitmap",
        content: pbm,
      },
      { name: "file", filename: "sample.tiff", contentType: "image/tiff", content: tiff },
      {
        name: "file",
        filename: "sample.qoi",
        contentType: "application/octet-stream",
        content: qoi,
      },
      { name: "settings", content: settings },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compress/batch",
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const fileResults = JSON.parse(decodeURIComponent(res.headers["x-file-results"] as string));
    expect(fileResults["0"]).toBeDefined();
    expect(fileResults["1"]).toBeDefined();
    expect(fileResults["2"]).toBeDefined();

    const zip = new AdmZip(res.rawPayload);
    expect(zip.getEntries().length).toBe(3);
  });
});

// ── Batch preserves upload order ────────────────────────────────
describe("Batch preserves upload order", () => {
  it("X-File-Results indices match upload order", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "alpha.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "beta.jpg", contentType: "image/jpeg", content: JPG },
      { name: "file", filename: "gamma.webp", contentType: "image/webp", content: WEBP },
      { name: "settings", content: JSON.stringify({ width: 40 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize/batch",
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const fileResults = JSON.parse(decodeURIComponent(res.headers["x-file-results"] as string));

    // Index 0 should be derived from alpha, 1 from beta, 2 from gamma
    expect(fileResults["0"]).toContain("alpha");
    expect(fileResults["1"]).toContain("beta");
    expect(fileResults["2"]).toContain("gamma");
  });
});

// ── Legacy batch SSE semantics ────────────────────────────────
describe("Legacy batch SSE wire parity", () => {
  it("terminal SSE frame has completedFiles === totalFiles on mixed batch", async () => {
    // Mixed batch: 2 valid images + 1 invalid file (fails pre-validation)
    const clientJobId = randomUUID();

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "good1.png", contentType: "image/png", content: PNG },
      {
        name: "file",
        filename: "bad.txt",
        contentType: "text/plain",
        content: Buffer.from("not an image"),
      },
      { name: "file", filename: "good2.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
      { name: "clientJobId", content: clientJobId },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize/batch",
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
      body,
    });

    // Batch succeeds overall (2 of 3 files processed)
    expect(res.statusCode).toBe(200);

    // Read the terminal SSE replay frame from Redis
    const terminalKeyName = `${bullPrefix()}:terminal:${clientJobId}`;
    let frame: string | null = null;
    for (let i = 0; i < 40; i++) {
      frame = await sharedRedis().get(terminalKeyName);
      if (frame) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    expect(frame).not.toBeNull();
    const parsed = JSON.parse(frame!);

    // Legacy semantics: completedFiles = total finished (successes + failures)
    expect(parsed.totalFiles).toBe(3);
    expect(parsed.completedFiles).toBe(3);
    expect(parsed.failedFiles).toBe(1);
    expect(parsed.status).toBe("completed");
    expect(parsed.type).toBe("batch");
  });
});

// ── Non-image modality (regression) ─────────────────────────────
// Batch used to hardcode image validation (validateImageBuffer + Sharp), so
// every video/audio/document input failed with "Invalid image". The route now
// validates via the per-modality input handler.
describe.skipIf(!ffmpegAvailable())("Non-image modality batch", () => {
  it("processes multiple video files through a video tool and returns a ZIP", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.mp4", contentType: "video/mp4", content: TINY_MP4 },
      { name: "file", filename: "b.mov", contentType: "video/quicktime", content: TINY_MOV },
      { name: "settings", content: JSON.stringify({ transform: "cw90" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/rotate-video/batch",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    const zip = new AdmZip(res.rawPayload);
    expect(zip.getEntries().length).toBe(2);
    // Regression guard: a real video must not be rejected as "Invalid image".
    const fileResults = JSON.parse(decodeURIComponent(res.headers["x-file-results"] as string));
    expect(fileResults["0"]).toBeDefined();
    expect(fileResults["1"]).toBeDefined();
  }, 60_000);
});
