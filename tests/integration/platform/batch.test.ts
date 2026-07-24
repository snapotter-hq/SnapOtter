/**
 * Integration tests for the batch processing route (batch.ts).
 *
 * Covers edge cases: filename deduplication, partial failure handling,
 * clientJobId passthrough, file results header, invalid settings,
 * non-existent tools, and ZIP response format validation.
 */

import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { qpdfAvailable } from "@snapotter/doc-engine";
import { ffmpegAvailable } from "@snapotter/media-engine";
import AdmZip from "adm-zip";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import { sharedRedis } from "../../../apps/api/src/jobs/connection.js";
import { bullPrefix } from "../../../apps/api/src/jobs/types.js";
import { fixtureDir, fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

// ── Targeted partial mocks (pass-through unless a test arms them) ──
//
// Each mock defaults to the real implementation so the existing tests in this
// file keep exercising the genuine pipeline. Individual tests flip a hoisted
// flag inside try/finally to reach branches that are otherwise untestable:
//  - ocr-limits: the OCR aggregate cap is a hard 512 MB constant; shrinking it
//    is the only sane way to exercise the enforcement branch (same pattern as
//    tests/integration/tools/document/ocr-pdf-streaming-ingress.test.ts).
//  - heic-converter: forces decodeHeic to fail so the route's per-file HEIC
//    failure handling runs even on hosts where the decoder CLI exists.
//  - object-storage: poisons getObjectStream for a specific job's outputs/
//    prefix to exercise the ZIP streaming error paths after headers are sent.
const ocrLimitsMock = vi.hoisted(() => ({
  override: null as { fileBytes: number; aggregateBytes: number } | null,
}));

const heicMock = vi.hoisted(() => ({ failDecode: false }));

const storageMock = vi.hoisted(() => ({
  poison: new Map<string, "reject" | "stream-error">(),
}));

vi.mock("../../../apps/api/src/lib/ocr-limits.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/lib/ocr-limits.js")>();
  return {
    ...actual,
    resolveOcrUploadLimits: (maxUploadSizeMb: number) =>
      ocrLimitsMock.override ?? actual.resolveOcrUploadLimits(maxUploadSizeMb),
  };
});

vi.mock("../../../apps/api/src/lib/heic-converter.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/heic-converter.js")>();
  return {
    ...actual,
    decodeHeic: async (...args: Parameters<typeof actual.decodeHeic>) => {
      if (heicMock.failDecode) throw new Error("Injected HEIC decode failure");
      return actual.decodeHeic(...args);
    },
  };
});

vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>();
  const { Readable } = await import("node:stream");
  return {
    ...actual,
    getObjectStream: async (key: string) => {
      for (const [prefix, mode] of storageMock.poison) {
        if (!key.startsWith(prefix)) continue;
        if (mode === "reject") throw new Error(`test poison: refusing to open ${key}`);
        // Error only once a consumer reads, so the failure surfaces inside
        // archiver (which has error listeners attached) instead of as an
        // unhandled 'error' event on an unowned stream.
        return new Readable({
          read() {
            this.destroy(new Error(`test poison: stream error for ${key}`));
          },
        });
      }
      return actual.getObjectStream(key);
    },
  };
});

const PNG = readFixture(fixtures.image.base.png200);
const JPG = readFixture(fixtures.image.base.jpg100);
const WEBP = readFixture(fixtures.image.base.webp50);
const TINY_MP4 = readFixture(fixtures.video.tiny("mp4"));
const TINY_MOV = readFixture(fixtures.video.tiny("mov"));
const HEIC = readFixture(fixtures.image.base.heic200);
const PDF3 = readFixture(fixtures.document.pdf3);

/** Mirrors findDecodeCmd in heic-converter.ts: --version must succeed. */
function heifDecoderAvailable(): boolean {
  for (const cmd of ["heif-convert", "heif-dec"]) {
    const probe = spawnSync(cmd, ["--version"], { timeout: 5_000 });
    if (!probe.error && probe.status === 0) return true;
  }
  return false;
}
const heifDecoderPresent = heifDecoderAvailable();

// validateImageBuffer needs Sharp to read HEIC container metadata before the
// route ever reaches decodeHeic. Prebuilt Sharp can usually parse the boxes
// even without an HEVC pixel decoder, but gate on it rather than assume.
const heicMetadataReadable = await sharp(HEIC)
  .metadata()
  .then(() => true)
  .catch(() => false);

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
      url: "/api/v1/tools/image/resize/batch",
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
      url: "/api/v1/tools/image/resize/batch",
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
      url: "/api/v1/tools/image/resize/batch",
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
      url: "/api/v1/tools/image/resize/batch",
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
      url: "/api/v1/tools/image/resize/batch",
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
      url: "/api/v1/tools/image/resize/batch",
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
      url: "/api/v1/tools/image/resize/batch",
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
      url: "/api/v1/tools/image/resize/batch",
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
      url: "/api/v1/tools/image/resize/batch",
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
      url: "/api/v1/tools/image/resize/batch",
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    // Batch is modality-aware now, so the empty-input error is generic
    // ("No files provided") rather than the legacy image-specific message.
    expect(result.error).toMatch(/no files/i);
  });

  it("returns 400 for invalid settings JSON", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: "not-json-at-all" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/resize/batch",
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
      url: "/api/v1/tools/image/resize/batch",
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
      url: "/api/v1/tools/image/resize/batch",
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
      url: "/api/v1/tools/image/strip-metadata/batch",
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
    const fileBuffer = readFileSync(join(fixtureDir.formats, `sample.${ext}`));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: `sample.${ext}`, contentType: mime, content: fileBuffer },
      { name: "settings", content: settings },
    ]);
    return app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compress/batch",
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
    const pbm = readFixture(fixtures.image.formats("pbm"));
    const tiff = readFixture(fixtures.image.formats("tiff"));
    const qoi = readFixture(fixtures.image.formats("qoi"));

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
      url: "/api/v1/tools/image/compress/batch",
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
      url: "/api/v1/tools/image/resize/batch",
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
      url: "/api/v1/tools/image/resize/batch",
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
      url: "/api/v1/tools/video/rotate-video/batch",
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

// ── Route lookup edge cases ─────────────────────────────────────
describe("Batch route lookup", () => {
  it("returns 404 NOT_FOUND when the tool exists but the section is wrong", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
    ]);

    // resize is an image tool; requesting it under /video must not resolve.
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/video/resize/batch",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(res.statusCode).toBe(404);
    const result = JSON.parse(res.body);
    expect(result.code).toBe("NOT_FOUND");
    expect(result.error).toBe("Not found");
  });

  it("returns 404 NOT_FOUND for an unknown toolId on a well-formed batch URL", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "settings", content: "{}" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/definitely-not-a-tool/batch",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe("NOT_FOUND");
  });

  it("returns 404 for a real tool that has no process-fn registry entry", async () => {
    // compare is a catalog tool with a custom multi-file contract; it is in
    // REGISTRY_EXEMPT and never calls createToolRoute/registerToolProcessFn,
    // so the batch route must reject it after the catalog lookup succeeds.
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "settings", content: "{}" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare/batch",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toBe('Tool "compare" not found');
  });
});

// ── Batch size cap ──────────────────────────────────────────────
describe("Batch size limit", () => {
  it.skipIf(!(env.MAX_BATCH_SIZE > 0))(
    "rejects a batch with more than MAX_BATCH_SIZE files",
    async () => {
      const fields: Parameters<typeof createMultipartPayload>[0] = Array.from(
        { length: env.MAX_BATCH_SIZE + 1 },
        (_, i) => ({
          name: "file",
          filename: `file-${i}.png`,
          contentType: "image/png",
          content: PNG,
        }),
      );
      fields.push({ name: "settings", content: JSON.stringify({ width: 50 }) });
      const { body, contentType } = createMultipartPayload(fields);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/resize/batch",
        headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
        body,
      });

      expect(res.statusCode).toBe(400);
      const result = JSON.parse(res.body);
      // The multipart parser's file-count limit rejects before the route's own
      // "too many files" check, so accept either rejection message.
      expect(result.error).toMatch(/too many files|failed to parse multipart/i);
    },
  );
});

// ── AI tool without its model bundle ────────────────────────────
describe("Batch AI tool with missing bundle", () => {
  it("returns 501 FEATURE_NOT_INSTALLED before touching any file", async () => {
    // No AI bundles are ever installed in the test environment, so
    // remove-background (bundle: background-removal) must be refused after
    // settings validation but before per-file processing.
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "subject.png", contentType: "image/png", content: PNG },
      { name: "settings", content: "{}" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-background/batch",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(res.statusCode).toBe(501);
    const result = JSON.parse(res.body);
    expect(result.error).toBe("Feature not installed");
    expect(result.code).toBe("FEATURE_NOT_INSTALLED");
    expect(result.feature).toBe("background-removal");
    expect(result.featureName).toBeDefined();
    expect(result.estimatedSize).toBeDefined();
  });
});

// ── OCR aggregate ingress cap (buffered path) ───────────────────
describe("OCR batch aggregate size limit", () => {
  it("rejects a buffered OCR batch whose bytes cross the aggregate cap", async () => {
    // The real aggregate cap is a hard 512 MB constant, far beyond what a
    // test can upload; shrink it through the ocr-limits seam and verify the
    // route counts streamed chunks and aborts with 413 mid-parse.
    ocrLimitsMock.override = { fileBytes: 10 * 1024 * 1024, aggregateBytes: 64 };
    try {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "scan.png", contentType: "image/png", content: PNG },
        { name: "settings", content: JSON.stringify({ quality: "fast" }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/ocr/batch",
        headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
        body,
      });

      expect(res.statusCode).toBe(413);
      const result = JSON.parse(res.body);
      expect(result.error).toBe("Upload exceeds the allowed size");
      expect(result.details).toMatch(/aggregate safety limit/);
    } finally {
      ocrLimitsMock.override = null;
    }
  });
});

// ── HEIC ingress branches ───────────────────────────────────────
describe("HEIC batch ingress", () => {
  it.skipIf(!heicMetadataReadable || !heifDecoderPresent)(
    "decodes HEIC input and returns a processed ZIP",
    async () => {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "test-200x150.heic", contentType: "image/heic", content: HEIC },
        { name: "settings", content: JSON.stringify({ width: 50 }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/resize/batch",
        headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
        body,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("application/zip");
      const zip = new AdmZip(res.rawPayload);
      expect(zip.getEntries().length).toBe(1);
      const fileResults = JSON.parse(decodeURIComponent(res.headers["x-file-results"] as string));
      expect(fileResults["0"]).toBeDefined();
    },
    60_000,
  );

  it.skipIf(!heicMetadataReadable)(
    "records a per-file failure when HEIC decoding fails",
    async () => {
      heicMock.failDecode = true;
      try {
        const { body, contentType } = createMultipartPayload([
          {
            name: "file",
            filename: "test-200x150.heic",
            contentType: "image/heic",
            content: HEIC,
          },
          { name: "settings", content: JSON.stringify({ width: 50 }) },
        ]);

        const res = await app.inject({
          method: "POST",
          url: "/api/v1/tools/image/resize/batch",
          headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
          body,
        });

        // The only file fails pre-validation, so the whole batch is a 422.
        expect(res.statusCode).toBe(422);
        const result = JSON.parse(res.body);
        expect(result.error).toBe("All files failed processing");
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].filename).toBe("test-200x150.heic");
        expect(result.errors[0].error).toBe("Failed to decode HEIC file");
      } finally {
        heicMock.failDecode = false;
      }
    },
  );
});

// ── CLI-decode fallback + all-children-failed ───────────────────
describe("Batch where every worker job fails", () => {
  it("returns 422 with per-file errors when all enqueued children fail", async () => {
    // A QOI header with impossible channel/colorspace bytes passes magic-byte
    // ingress validation (CLI-decoded formats skip the Sharp probe), fails
    // every decoder in the CLI fallback chain, is uploaded raw, and then
    // fails in the worker. That drives the post-processing "all files
    // failed" branch, which is unreachable via ingress validation alone.
    const garbageQoi = Buffer.concat([
      Buffer.from("qoif"),
      // width=1, height=1, channels=0xff (invalid), colorspace=0xff (invalid)
      Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 0xff, 0xff]),
      Buffer.alloc(64, 0xab),
    ]);

    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "garbage.qoi",
        contentType: "application/octet-stream",
        content: garbageQoi,
      },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/resize/batch",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(res.statusCode).toBe(422);
    const result = JSON.parse(res.body);
    expect(result.error).toBe("All files failed processing");
    expect(result.errors).toHaveLength(1);
    // The CLI-decode fallback renames the upload to .png before enqueueing.
    expect(String(result.errors[0].filename)).toMatch(/garbage/);
    expect(typeof result.errors[0].error).toBe("string");
    expect(result.errors[0].error.length).toBeGreaterThan(0);
  }, 60_000);
});

// ── Non-image modality: partial failure through the document handler ──
describe.skipIf(!qpdfAvailable())("Document batch partial failure", () => {
  it("processes the valid PDF and records the invalid one as a per-file error", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "doc-ok.pdf", contentType: "application/pdf", content: PDF3 },
      {
        name: "file",
        filename: "bad.pdf",
        contentType: "application/pdf",
        content: Buffer.from("this is definitely not a pdf"),
      },
      { name: "settings", content: JSON.stringify({ angle: 90 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf/rotate-pdf/batch",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");

    const zip = new AdmZip(res.rawPayload);
    const entries = zip.getEntries().map((e) => e.entryName);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatch(/doc-ok/);

    // Only the surviving file may appear in the results header, keyed by its
    // original upload index.
    const fileResults = JSON.parse(decodeURIComponent(res.headers["x-file-results"] as string));
    expect(Object.keys(fileResults)).toEqual(["0"]);
    expect(fileResults["0"]).toMatch(/doc-ok/);
  }, 60_000);
});
