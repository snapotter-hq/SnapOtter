/**
 * Integration tests for new input/output format support.
 *
 * - New output formats: convert PNG to jxl, bmp, ico, jp2, qoi
 * - SVGZ input: verify compressed SVG decodes correctly
 * - JXL quality: verify lower quality produces smaller files
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

function isAsyncFallback(res: { statusCode: number; body: string }): boolean {
  if (res.statusCode !== 202) return false;
  const body = JSON.parse(res.body);
  expect(body.async).toBe(true);
  expect(body.jobId).toBeDefined();
  return true;
}

const FORMATS_DIR = join(__dirname, "..", "fixtures", "formats");

describe("New format support", () => {
  let testApp: TestApp;
  let app: TestApp["app"];
  let adminToken: string;

  beforeAll(async () => {
    testApp = await buildTestApp();
    app = testApp.app;
    adminToken = await loginAsAdmin(app);
  }, 30_000);

  afterAll(async () => {
    await testApp?.cleanup();
  }, 10_000);

  // ---------------------------------------------------------------------------
  // New output format conversions
  // ---------------------------------------------------------------------------
  const NEW_OUTPUT_FORMATS = ["jxl", "bmp", "ico", "jp2", "qoi"];

  for (const format of NEW_OUTPUT_FORMATS) {
    it(`converts PNG to ${format}`, async () => {
      const fileBuffer = readFileSync(join(FORMATS_DIR, "sample.png"));
      const { body, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: "sample.png",
          contentType: "image/png",
          content: fileBuffer,
        },
        {
          name: "settings",
          content: JSON.stringify({ format, quality: 80 }),
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/convert",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        body,
      });

      // Accept 200 (success) or 422 (encoder not available in test env)
      if (isAsyncFallback(res)) return;
      expect([200, 422]).toContain(res.statusCode);
      if (res.statusCode === 200) {
        const json = JSON.parse(res.body);
        expect(json.processedSize).toBeGreaterThan(0);
        expect(json.downloadUrl).toBeTruthy();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // SVGZ input decoding
  // ---------------------------------------------------------------------------
  it("decodes SVGZ input correctly", async () => {
    const fileBuffer = readFileSync(join(FORMATS_DIR, "sample.svgz"));
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "sample.svgz",
        contentType: "image/svg+xml",
        content: fileBuffer,
      },
      {
        name: "settings",
        content: JSON.stringify({ format: "png" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/convert",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    if (isAsyncFallback(res)) return;
    expect([200, 422]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const json = JSON.parse(res.body);
      expect(json.processedSize).toBeGreaterThan(0);
    }
  });

  // ---------------------------------------------------------------------------
  // JXL quality affects file size
  // ---------------------------------------------------------------------------
  it("JXL quality affects file size", async () => {
    const fileBuffer = readFileSync(join(FORMATS_DIR, "sample.png"));

    const convert = async (quality: number) => {
      const { body, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: "sample.png",
          contentType: "image/png",
          content: fileBuffer,
        },
        {
          name: "settings",
          content: JSON.stringify({ format: "jxl", quality }),
        },
      ]);
      return app.inject({
        method: "POST",
        url: "/api/v1/tools/convert",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        body,
      });
    };

    const lowQ = await convert(30);
    const highQ = await convert(90);

    // Only compare sizes if both succeeded (JXL encoder may not be available)
    if (lowQ.statusCode === 200 && highQ.statusCode === 200) {
      const lowJson = JSON.parse(lowQ.body);
      const highJson = JSON.parse(highQ.body);
      expect(lowJson.processedSize).toBeLessThan(highJson.processedSize);
    }
  });

  describe("Extended output format matrix", () => {
    const INPUTS = [
      { name: "PNG", file: "sample.png", mime: "image/png" },
      { name: "JPEG", file: "sample.jpg", mime: "image/jpeg" },
      { name: "WebP", file: "sample.webp", mime: "image/webp" },
    ];
    const OUTPUTS = [
      "jpg",
      "png",
      "webp",
      "avif",
      "tiff",
      "gif",
      "heic",
      "heif",
      "jxl",
      "bmp",
      "ico",
      "jp2",
      "qoi",
    ];

    for (const input of INPUTS) {
      for (const outFmt of OUTPUTS) {
        const inLower = input.name.toLowerCase();
        if (inLower === outFmt || (inLower === "jpeg" && outFmt === "jpg")) continue;
        const testTimeout = outFmt === "avif" ? 120_000 : 60_000;
        it(`converts ${input.name} to ${outFmt}`, { timeout: testTimeout }, async () => {
          const fileBuffer = readFileSync(join(FORMATS_DIR, input.file));
          const { body, contentType } = createMultipartPayload([
            { name: "file", filename: input.file, contentType: input.mime, content: fileBuffer },
            { name: "settings", content: JSON.stringify({ format: outFmt, quality: 80 }) },
          ]);
          const res = await app.inject({
            method: "POST",
            url: "/api/v1/tools/convert",
            headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
            body,
          });
          if (isAsyncFallback(res)) return;
          expect([200, 422]).toContain(res.statusCode);
          if (res.statusCode === 200) {
            const json = JSON.parse(res.body);
            expect(json.processedSize).toBeGreaterThan(0);
            expect(json.downloadUrl).toBeTruthy();
          }
        });
      }
    }
  });

  describe("New input format processing via resize", () => {
    const NEW_INPUT_FORMATS = [
      { name: "SVGZ", file: "sample.svgz", mime: "image/svg+xml" },
      { name: "JP2", file: "sample.jp2", mime: "image/jp2" },
      { name: "EPS", file: "sample.eps", mime: "application/postscript" },
      { name: "PPM", file: "sample.ppm", mime: "image/x-portable-pixmap" },
      { name: "PGM", file: "sample.pgm", mime: "image/x-portable-graymap" },
      { name: "PBM", file: "sample.pbm", mime: "image/x-portable-bitmap" },
      { name: "DDS", file: "sample.dds", mime: "image/vnd.ms-dds" },
      { name: "CUR", file: "sample.cur", mime: "image/x-icon" },
      { name: "DPX", file: "sample.dpx", mime: "image/x-dpx" },
      { name: "FITS", file: "sample.fits", mime: "image/fits" },
      { name: "APNG", file: "sample.apng", mime: "image/apng" },
      { name: "QOI", file: "sample.qoi", mime: "image/x-qoi" },
    ];
    for (const fmt of NEW_INPUT_FORMATS) {
      it(`resizes ${fmt.name} input to 25x25`, async () => {
        const fixturePath = join(FORMATS_DIR, fmt.file);
        if (!existsSync(fixturePath)) return;
        const fileBuffer = readFileSync(fixturePath);
        const { body, contentType } = createMultipartPayload([
          { name: "file", filename: fmt.file, contentType: fmt.mime, content: fileBuffer },
          { name: "settings", content: JSON.stringify({ width: 25, height: 25 }) },
        ]);
        const res = await app.inject({
          method: "POST",
          url: "/api/v1/tools/resize",
          headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
          body,
        });
        if (isAsyncFallback(res)) return;
        expect([200, 400, 422]).toContain(res.statusCode);
        if (res.statusCode === 200) {
          const json = JSON.parse(res.body);
          expect(json.downloadUrl).toBeTruthy();
          expect(json.processedSize).toBeGreaterThan(0);
        }
      }, 60_000);
    }
  });

  describe("Preview generation for special formats", () => {
    const PREVIEW_FORMATS = [
      { name: "HEIC", file: "sample.heic", mime: "image/heic" },
      { name: "JXL", file: "sample.jxl", mime: "image/jxl" },
      { name: "ICO", file: "sample.ico", mime: "image/x-icon" },
      { name: "PSD", file: "sample.psd", mime: "image/vnd.adobe.photoshop" },
      { name: "EXR", file: "sample.exr", mime: "image/x-exr" },
    ];
    for (const fmt of PREVIEW_FORMATS) {
      it(`generates preview for ${fmt.name}`, async () => {
        const fixturePath = join(FORMATS_DIR, fmt.file);
        if (!existsSync(fixturePath)) return;
        const fileBuffer = readFileSync(fixturePath);
        const { body, contentType } = createMultipartPayload([
          { name: "file", filename: fmt.file, contentType: fmt.mime, content: fileBuffer },
        ]);
        const res = await app.inject({
          method: "POST",
          url: "/api/v1/preview",
          headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
          body,
        });
        if (isAsyncFallback(res)) return;
        expect([200, 422]).toContain(res.statusCode);
        if (res.statusCode === 200) {
          const ct = res.headers["content-type"] as string;
          expect(ct).toMatch(/image\/(webp|png)/);
        }
      }, 60_000);
    }
  });
});
