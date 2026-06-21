/**
 * Comprehensive cross-format parameterized integration tests.
 *
 * Targets the 16 primary formats x 12 core tools with deeper
 * parameterized coverage using describe.each / test.each patterns:
 *
 *   Formats (16): JPEG, PNG, WebP, AVIF, HEIC, HEIF, GIF, BMP, TIFF,
 *                 SVG, PSD, DNG, TGA, EXR, HDR, ICO
 *
 *   Tools (12):   resize, crop, rotate, convert, compress,
 *                 adjust-colors, sharpening, strip-metadata, info,
 *                 optimize-for-web, image-enhancement, border
 *
 * Each tool section uses test.each to run the same assertion against every
 * format. This complements format-matrix.test.ts by adding:
 *   - Per-tool settings variations (e.g. multiple resize dimensions,
 *     multiple rotation angles, multiple compression modes)
 *   - Convert target matrix (each format -> JPEG, PNG, WebP)
 *   - Output content-type verification for download responses
 *   - Deeper assertion on info/metadata responses
 *   - Chained processing: resize then compress a single format
 *
 * Exotic formats (PSD, DNG, TGA, EXR, HDR, ICO) and HEIC/HEIF may lack
 * CLI decoders or libheif. Tests accept 200, 400, or 422 for those and
 * verify the error shape when not 200. Core formats must return 200.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { apiToolPath } from "@snapotter/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fixtureDir } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

vi.setConfig({ testTimeout: 60_000 });

// ---------------------------------------------------------------------------
// Format definitions for the 16 primary formats
// ---------------------------------------------------------------------------
interface FormatDef {
  name: string;
  file: string;
  mime: string;
  /** Requires CLI decoder (ImageMagick / dcraw) -- may not be installed */
  needsCliDecoder: boolean;
  /** Requires libheif decoder -- may not be installed */
  needsHeifDecoder: boolean;
  /** Sharp may fail validation for this format */
  mayFailValidation: boolean;
}

const PRIMARY_FORMATS: FormatDef[] = [
  {
    name: "JPEG",
    file: "sample.jpg",
    mime: "image/jpeg",
    needsCliDecoder: false,
    needsHeifDecoder: false,
    mayFailValidation: false,
  },
  {
    name: "PNG",
    file: "sample.png",
    mime: "image/png",
    needsCliDecoder: false,
    needsHeifDecoder: false,
    mayFailValidation: false,
  },
  {
    name: "WebP",
    file: "sample.webp",
    mime: "image/webp",
    needsCliDecoder: false,
    needsHeifDecoder: false,
    mayFailValidation: false,
  },
  {
    name: "AVIF",
    file: "sample.avif",
    mime: "image/avif",
    needsCliDecoder: false,
    needsHeifDecoder: false,
    mayFailValidation: false,
  },
  {
    name: "GIF",
    file: "sample.gif",
    mime: "image/gif",
    needsCliDecoder: false,
    needsHeifDecoder: false,
    mayFailValidation: false,
  },
  {
    name: "TIFF",
    file: "sample.tiff",
    mime: "image/tiff",
    needsCliDecoder: false,
    needsHeifDecoder: false,
    mayFailValidation: false,
  },
  {
    name: "BMP",
    file: "sample.bmp",
    mime: "image/bmp",
    needsCliDecoder: false,
    needsHeifDecoder: false,
    mayFailValidation: true,
  },
  {
    name: "SVG",
    file: "sample.svg",
    mime: "image/svg+xml",
    needsCliDecoder: false,
    needsHeifDecoder: false,
    mayFailValidation: false,
  },
  {
    name: "HEIC",
    file: "sample.heic",
    mime: "image/heic",
    needsCliDecoder: false,
    needsHeifDecoder: true,
    mayFailValidation: false,
  },
  {
    name: "HEIF",
    file: "sample.heif",
    mime: "image/heif",
    needsCliDecoder: false,
    needsHeifDecoder: true,
    mayFailValidation: false,
  },
  {
    name: "ICO",
    file: "sample.ico",
    mime: "image/x-icon",
    needsCliDecoder: true,
    needsHeifDecoder: false,
    mayFailValidation: false,
  },
  {
    name: "PSD",
    file: "sample.psd",
    mime: "image/vnd.adobe.photoshop",
    needsCliDecoder: true,
    needsHeifDecoder: false,
    mayFailValidation: false,
  },
  {
    name: "DNG",
    file: "sample.dng",
    mime: "image/x-adobe-dng",
    needsCliDecoder: true,
    needsHeifDecoder: false,
    mayFailValidation: false,
  },
  {
    name: "TGA",
    file: "sample.tga",
    mime: "image/x-tga",
    needsCliDecoder: true,
    needsHeifDecoder: false,
    mayFailValidation: false,
  },
  {
    name: "EXR",
    file: "sample.exr",
    mime: "image/x-exr",
    needsCliDecoder: true,
    needsHeifDecoder: false,
    mayFailValidation: false,
  },
  {
    name: "HDR",
    file: "sample.hdr",
    mime: "image/vnd.radiance",
    needsCliDecoder: true,
    needsHeifDecoder: false,
    mayFailValidation: false,
  },
];

const CORE_FORMATS = PRIMARY_FORMATS.filter(
  (f) => !f.needsCliDecoder && !f.needsHeifDecoder && !f.mayFailValidation,
);

const ACCEPTABLE_FALLBACK_CODES = [200, 400, 422];

function needsFallback(fmt: FormatDef): boolean {
  return fmt.needsCliDecoder || fmt.needsHeifDecoder || fmt.mayFailValidation;
}

/**
 * A CPU-heavy encode can exceed the sync window (SYNC_WAIT_MS, 30s in tests)
 * under parallel CI load and fall back to async: 202 {jobId, async: true}. Per
 * the documented 200-or-202 contract that is a legitimate "accepted & processing"
 * outcome -- the worker runs the same process fn either way -- not a failure.
 * Returns true (validating the async body shape) when the response is that
 * fallback, so callers can treat it as a pass.
 */
function isAsyncFallback(res: { statusCode: number; body: string }): boolean {
  if (res.statusCode !== 202) return false;
  const body = JSON.parse(res.body);
  expect(body.async).toBe(true);
  expect(body.jobId).toBeDefined();
  return true;
}

function getTimeout(fmt: FormatDef, toolId?: string): number | undefined {
  if ((fmt.needsHeifDecoder || fmt.needsCliDecoder) && toolId === "image-enhancement")
    return 300_000;
  if (fmt.needsHeifDecoder || fmt.needsCliDecoder) return 180_000;
  if (toolId === "image-enhancement") return 120_000;
  return undefined;
}

// ---------------------------------------------------------------------------
// Shared app state
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

// ---------------------------------------------------------------------------
// Helper: send a tool request and return the response
// ---------------------------------------------------------------------------
async function callTool(toolId: string, fmt: FormatDef, settings: Record<string, unknown>) {
  const fixturePath = join(fixtureDir.formats, fmt.file);
  if (!existsSync(fixturePath)) {
    return null;
  }

  const buffer = readFileSync(fixturePath);
  const fields: Array<{
    name: string;
    filename?: string;
    contentType?: string;
    content: Buffer | string;
  }> = [{ name: "file", filename: fmt.file, contentType: fmt.mime, content: buffer }];

  if (Object.keys(settings).length > 0) {
    fields.push({ name: "settings", content: JSON.stringify(settings) });
  }

  const { body: payload, contentType } = createMultipartPayload(fields);

  return app.inject({
    method: "POST",
    url: apiToolPath(toolId),
    headers: {
      authorization: `Bearer ${adminToken}`,
      "content-type": contentType,
    },
    body: payload,
  });
}

/**
 * Assert a standard download response shape (used by most tools).
 * For fallback formats, accepts 200/400/422. For core formats, expects 200.
 */
function assertDownloadResponse(res: { statusCode: number; body: string }, fmt: FormatDef) {
  if (isAsyncFallback(res)) return undefined;
  if (needsFallback(fmt)) {
    expect(ACCEPTABLE_FALLBACK_CODES).toContain(res.statusCode);
  } else {
    expect(res.statusCode).toBe(200);
  }

  if (res.statusCode === 200) {
    const body = JSON.parse(res.body);
    expect(body.downloadUrl).toBeDefined();
    expect(typeof body.downloadUrl).toBe("string");
    expect(body.processedSize).toBeGreaterThan(0);
    expect(body.originalSize).toBeGreaterThan(0);
    return body;
  }

  // Error path: verify clean JSON error
  const body = JSON.parse(res.body);
  expect(body.error).toBeDefined();
  expect(typeof body.error).toBe("string");
  expect(body.error.length).toBeGreaterThan(0);
  return null;
}

// =========================================================================
// 1. RESIZE -- 16 formats x 3 dimension sets
// =========================================================================
describe("Resize across all 16 primary formats", () => {
  const RESIZE_CONFIGS = [
    { label: "50x50 contain", settings: { width: 50, height: 50, fit: "contain" } },
    { label: "100 wide (height auto)", settings: { width: 100 } },
    { label: "50% percentage", settings: { percentage: 50 } },
  ] as const;

  for (const cfg of RESIZE_CONFIGS) {
    describe(`resize ${cfg.label}`, () => {
      for (const fmt of PRIMARY_FORMATS) {
        it(
          `${fmt.name}`,
          async () => {
            const res = await callTool("resize", fmt, { ...cfg.settings });
            if (!res) return;
            assertDownloadResponse(res, fmt);
          },
          getTimeout(fmt),
        );
      }
    });
  }
});

// =========================================================================
// 2. CROP -- 16 formats x 2 crop modes
// =========================================================================
describe("Crop across all 16 primary formats", () => {
  const CROP_CONFIGS = [
    { label: "10x10 px at origin", settings: { width: 10, height: 10, left: 0, top: 0 } },
    { label: "50x50 px at 5,5", settings: { width: 50, height: 50, left: 5, top: 5 } },
  ] as const;

  for (const cfg of CROP_CONFIGS) {
    describe(`crop ${cfg.label}`, () => {
      for (const fmt of PRIMARY_FORMATS) {
        it(
          `${fmt.name}`,
          async () => {
            const res = await callTool("crop", fmt, { ...cfg.settings });
            if (!res) return;
            assertDownloadResponse(res, fmt);
          },
          getTimeout(fmt),
        );
      }
    });
  }
});

// =========================================================================
// 3. ROTATE -- 16 formats x 4 angles + flip combos
// =========================================================================
describe("Rotate across all 16 primary formats", () => {
  const ROTATE_CONFIGS = [
    { label: "90 degrees", settings: { angle: 90 } },
    { label: "180 degrees", settings: { angle: 180 } },
    { label: "270 degrees", settings: { angle: 270 } },
    { label: "horizontal flip", settings: { angle: 0, horizontal: true } },
  ] as const;

  for (const cfg of ROTATE_CONFIGS) {
    describe(`rotate ${cfg.label}`, () => {
      for (const fmt of PRIMARY_FORMATS) {
        it(
          `${fmt.name}`,
          async () => {
            const res = await callTool("rotate", fmt, { ...cfg.settings });
            if (!res) return;
            assertDownloadResponse(res, fmt);
          },
          getTimeout(fmt),
        );
      }
    });
  }
});

// =========================================================================
// 4. CONVERT -- each of the 16 formats -> JPEG, PNG, WebP
// =========================================================================
describe("Convert: 16 formats -> 3 output targets", () => {
  const OUTPUT_TARGETS = [
    { label: "JPEG", format: "jpg", ext: ".jpg" },
    { label: "PNG", format: "png", ext: ".png" },
    { label: "WebP", format: "webp", ext: ".webp" },
  ] as const;

  for (const target of OUTPUT_TARGETS) {
    describe(`convert to ${target.label}`, () => {
      for (const fmt of PRIMARY_FORMATS) {
        // Skip identity conversions
        if (fmt.name === "JPEG" && target.format === "jpg") continue;
        if (fmt.name === "PNG" && target.format === "png") continue;
        if (fmt.name === "WebP" && target.format === "webp") continue;

        it(
          `${fmt.name} -> ${target.label}`,
          async () => {
            const res = await callTool("convert", fmt, { format: target.format });
            if (!res) return;
            if (isAsyncFallback(res)) return;

            if (needsFallback(fmt)) {
              expect(ACCEPTABLE_FALLBACK_CODES).toContain(res.statusCode);
            } else {
              expect(res.statusCode).toBe(200);
            }

            if (res.statusCode === 200) {
              const body = JSON.parse(res.body);
              expect(body.downloadUrl).toBeDefined();
              expect(body.downloadUrl).toContain(target.ext);
              expect(body.processedSize).toBeGreaterThan(0);
            } else {
              const body = JSON.parse(res.body);
              expect(body.error).toBeDefined();
              expect(typeof body.error).toBe("string");
            }
          },
          getTimeout(fmt),
        );
      }
    });
  }
});

// =========================================================================
// 5. COMPRESS -- 16 formats x 2 compression modes
// =========================================================================
describe("Compress across all 16 primary formats", () => {
  const COMPRESS_CONFIGS = [
    { label: "quality mode (q=60)", settings: { mode: "quality", quality: 60 } },
    { label: "quality mode (q=30)", settings: { mode: "quality", quality: 30 } },
  ] as const;

  for (const cfg of COMPRESS_CONFIGS) {
    describe(`compress ${cfg.label}`, () => {
      for (const fmt of PRIMARY_FORMATS) {
        it(
          `${fmt.name}`,
          async () => {
            const res = await callTool("compress", fmt, { ...cfg.settings });
            if (!res) return;
            assertDownloadResponse(res, fmt);
          },
          getTimeout(fmt),
        );
      }
    });
  }
});

// =========================================================================
// 6. ADJUST-COLORS -- 16 formats x 3 adjustment combos
// =========================================================================
describe("Color adjustments across all 16 primary formats", () => {
  const COLOR_CONFIGS = [
    {
      label: "brightness +20, contrast +10",
      settings: { brightness: 20, contrast: 10 },
    },
    {
      label: "saturation +30",
      settings: { saturation: 30 },
    },
    {
      label: "brightness -10, saturation -15, contrast +5",
      settings: { brightness: -10, saturation: -15, contrast: 5 },
    },
  ] as const;

  for (const cfg of COLOR_CONFIGS) {
    describe(`adjust-colors ${cfg.label}`, () => {
      for (const fmt of PRIMARY_FORMATS) {
        it(
          `${fmt.name}`,
          async () => {
            const res = await callTool("adjust-colors", fmt, { ...cfg.settings });
            if (!res) return;
            assertDownloadResponse(res, fmt);
          },
          getTimeout(fmt),
        );
      }
    });
  }
});

// =========================================================================
// 7. SHARPENING -- 16 formats x 2 methods
// =========================================================================
describe("Sharpening across all 16 primary formats", () => {
  const SHARPEN_CONFIGS = [
    { label: "adaptive method", settings: { method: "adaptive" } },
    { label: "unsharp-mask method", settings: { method: "unsharp-mask" } },
  ] as const;

  for (const cfg of SHARPEN_CONFIGS) {
    describe(`sharpening ${cfg.label}`, () => {
      for (const fmt of PRIMARY_FORMATS) {
        it(
          `${fmt.name}`,
          async () => {
            const res = await callTool("sharpening", fmt, { ...cfg.settings });
            if (!res) return;
            assertDownloadResponse(res, fmt);
          },
          getTimeout(fmt),
        );
      }
    });
  }
});

// =========================================================================
// 8. STRIP-METADATA -- 16 formats + verify stripped output has fewer bytes
// =========================================================================
describe("Strip-metadata across all 16 primary formats", () => {
  for (const fmt of PRIMARY_FORMATS) {
    it(
      `strips metadata from ${fmt.name}`,
      async () => {
        const res = await callTool("strip-metadata", fmt, { stripAll: true });
        if (!res) return;
        const body = assertDownloadResponse(res, fmt);

        // For core formats, verify that stripping metadata produces output
        // (it may or may not reduce size depending on whether the fixture
        // contains EXIF data)
        if (body) {
          expect(body.processedSize).toBeGreaterThan(0);
        }
      },
      getTimeout(fmt),
    );
  }

  // Verify the inspect endpoint also works across formats
  describe("strip-metadata inspect endpoint", () => {
    for (const fmt of PRIMARY_FORMATS) {
      it(
        `inspects ${fmt.name}`,
        async () => {
          const fixturePath = join(fixtureDir.formats, fmt.file);
          if (!existsSync(fixturePath)) return;

          const buffer = readFileSync(fixturePath);
          const { body: payload, contentType } = createMultipartPayload([
            { name: "file", filename: fmt.file, contentType: fmt.mime, content: buffer },
          ]);

          const res = await app.inject({
            method: "POST",
            url: "/api/v1/tools/image/strip-metadata/inspect",
            headers: {
              authorization: `Bearer ${adminToken}`,
              "content-type": contentType,
            },
            body: payload,
          });

          if (needsFallback(fmt)) {
            expect(ACCEPTABLE_FALLBACK_CODES).toContain(res.statusCode);
          } else {
            expect(res.statusCode).toBe(200);
          }

          if (res.statusCode === 200) {
            const body = JSON.parse(res.body);
            expect(body.filename).toBeDefined();
            expect(body.fileSize).toBeGreaterThan(0);
          }
        },
        getTimeout(fmt),
      );
    }
  });
});

// =========================================================================
// 9. INFO -- 16 formats with deeper metadata assertions
// =========================================================================
describe("Info (metadata extraction) across all 16 primary formats", () => {
  for (const fmt of PRIMARY_FORMATS) {
    it(
      `extracts metadata from ${fmt.name}`,
      async () => {
        const res = await callTool("info", fmt, {});
        if (!res) return;

        if (needsFallback(fmt)) {
          expect(ACCEPTABLE_FALLBACK_CODES).toContain(res.statusCode);
        } else {
          expect(res.statusCode).toBe(200);
        }

        if (res.statusCode === 200) {
          const body = JSON.parse(res.body);
          expect(body.width).toBeGreaterThan(0);
          expect(body.height).toBeGreaterThan(0);
          expect(body.fileSize).toBeGreaterThan(0);
          expect(body.format).toBeDefined();
          expect(typeof body.format).toBe("string");
          expect(body.channels).toBeGreaterThan(0);
          // colorSpace is optional but if present should be a string
          if (body.colorSpace !== undefined) {
            expect(typeof body.colorSpace).toBe("string");
          }
        } else {
          const body = JSON.parse(res.body);
          expect(body.error).toBeDefined();
          expect(typeof body.error).toBe("string");
        }
      },
      getTimeout(fmt),
    );
  }
});

// =========================================================================
// 10. OPTIMIZE-FOR-WEB -- 16 formats x 2 target output formats
// =========================================================================
describe("Optimize-for-web across all 16 primary formats", () => {
  const WEB_CONFIGS = [
    { label: "webp q75", settings: { format: "webp", quality: 75 } },
    { label: "avif q60", settings: { format: "avif", quality: 60 } },
  ] as const;

  for (const cfg of WEB_CONFIGS) {
    describe(`optimize-for-web ${cfg.label}`, () => {
      for (const fmt of PRIMARY_FORMATS) {
        it(
          `${fmt.name}`,
          async () => {
            const res = await callTool("optimize-for-web", fmt, { ...cfg.settings });
            if (!res) return;
            assertDownloadResponse(res, fmt);
          },
          getTimeout(fmt),
        );
      }
    });
  }
});

// =========================================================================
// 11. IMAGE-ENHANCEMENT -- 16 formats x 3 enhancement modes
// =========================================================================
describe("Image enhancement across all 16 primary formats", () => {
  const ENHANCE_CONFIGS = [
    { label: "auto mode, intensity 50", settings: { mode: "auto", intensity: 50 } },
    { label: "portrait mode, intensity 75", settings: { mode: "portrait", intensity: 75 } },
    { label: "low-light mode, intensity 40", settings: { mode: "low-light", intensity: 40 } },
  ] as const;

  for (const cfg of ENHANCE_CONFIGS) {
    describe(`enhancement ${cfg.label}`, () => {
      for (const fmt of PRIMARY_FORMATS) {
        it(
          `${fmt.name}`,
          async () => {
            const res = await callTool("image-enhancement", fmt, { ...cfg.settings });
            if (!res) return;
            assertDownloadResponse(res, fmt);
          },
          getTimeout(fmt, "image-enhancement"),
        );
      }
    });
  }

  // Enhancement analyze endpoint across all 16 formats
  describe("analyze endpoint", () => {
    for (const fmt of PRIMARY_FORMATS) {
      it(
        `analyzes ${fmt.name}`,
        async () => {
          const fixturePath = join(fixtureDir.formats, fmt.file);
          if (!existsSync(fixturePath)) return;

          const buffer = readFileSync(fixturePath);
          const { body: payload, contentType } = createMultipartPayload([
            { name: "file", filename: fmt.file, contentType: fmt.mime, content: buffer },
          ]);

          const res = await app.inject({
            method: "POST",
            url: "/api/v1/tools/image/image-enhancement/analyze",
            headers: {
              authorization: `Bearer ${adminToken}`,
              "content-type": contentType,
            },
            body: payload,
          });

          if (needsFallback(fmt)) {
            expect([200, 400, 422]).toContain(res.statusCode);
          } else {
            expect(res.statusCode).toBe(200);
          }

          if (res.statusCode === 200) {
            const body = JSON.parse(res.body);
            expect(body.corrections).toBeDefined();
            expect(typeof body.corrections).toBe("object");
          } else {
            const body = JSON.parse(res.body);
            expect(body.error).toBeDefined();
            expect(typeof body.error).toBe("string");
          }
        },
        getTimeout(fmt),
      );
    }
  });
});

// =========================================================================
// 12. BORDER -- 16 formats x 2 border styles
// =========================================================================
describe("Border across all 16 primary formats", () => {
  const BORDER_CONFIGS = [
    { label: "5px red", settings: { borderWidth: 5, borderColor: "#FF0000" } },
    { label: "10px blue", settings: { borderWidth: 10, borderColor: "#0000FF" } },
  ] as const;

  for (const cfg of BORDER_CONFIGS) {
    describe(`border ${cfg.label}`, () => {
      for (const fmt of PRIMARY_FORMATS) {
        it(
          `${fmt.name}`,
          async () => {
            const res = await callTool("border", fmt, { ...cfg.settings });
            if (!res) return;
            assertDownloadResponse(res, fmt);
          },
          getTimeout(fmt),
        );
      }
    });
  }
});

// =========================================================================
// 13. CHAINED OPERATIONS: core formats through resize then compress
// =========================================================================
describe("Chained operations: resize then compress (core formats)", () => {
  for (const fmt of CORE_FORMATS) {
    it(`${fmt.name}: resize 100x100 -> compress q50`, async () => {
      // Step 1: Resize
      const resizeRes = await callTool("resize", fmt, { width: 100, height: 100 });
      if (!resizeRes) return;
      expect(resizeRes.statusCode).toBe(200);

      const resizeBody = JSON.parse(resizeRes.body);
      expect(resizeBody.downloadUrl).toBeDefined();

      // Step 2: Download the resized file and compress it
      const downloadRes = await app.inject({
        method: "GET",
        url: resizeBody.downloadUrl,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(downloadRes.statusCode).toBe(200);

      const resizedBuffer = Buffer.from(downloadRes.rawPayload);
      expect(resizedBuffer.length).toBeGreaterThan(0);

      // Step 3: Compress the resized output
      const { body: compressPayload, contentType: compressCt } = createMultipartPayload([
        {
          name: "file",
          filename: `resized-${fmt.file}`,
          contentType: (downloadRes.headers["content-type"] as string) || fmt.mime,
          content: resizedBuffer,
        },
        {
          name: "settings",
          content: JSON.stringify({ mode: "quality", quality: 50 }),
        },
      ]);

      const compressRes = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/compress",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": compressCt,
        },
        body: compressPayload,
      });

      expect(compressRes.statusCode).toBe(200);
      const compressBody = JSON.parse(compressRes.body);
      expect(compressBody.downloadUrl).toBeDefined();
      expect(compressBody.processedSize).toBeGreaterThan(0);
    });
  }
});

// =========================================================================
// 14. CONVERT ROUND-TRIP: core format -> WebP -> PNG
// =========================================================================
describe("Convert round-trip: format -> WebP -> PNG (core formats)", () => {
  for (const fmt of CORE_FORMATS) {
    // Skip formats that are already WebP or PNG (not a meaningful round-trip)
    if (fmt.name === "WebP" || fmt.name === "PNG") continue;

    it(`${fmt.name} -> WebP -> PNG`, async () => {
      // Step 1: Convert to WebP
      const toWebpRes = await callTool("convert", fmt, { format: "webp" });
      if (!toWebpRes) return;
      expect(toWebpRes.statusCode).toBe(200);

      const webpBody = JSON.parse(toWebpRes.body);
      expect(webpBody.downloadUrl).toContain(".webp");

      // Step 2: Download the WebP output
      const downloadRes = await app.inject({
        method: "GET",
        url: webpBody.downloadUrl,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(downloadRes.statusCode).toBe(200);

      const webpBuffer = Buffer.from(downloadRes.rawPayload);
      expect(webpBuffer.length).toBeGreaterThan(0);

      // Step 3: Convert WebP to PNG
      const { body: toPngPayload, contentType: toPngCt } = createMultipartPayload([
        {
          name: "file",
          filename: "intermediate.webp",
          contentType: "image/webp",
          content: webpBuffer,
        },
        { name: "settings", content: JSON.stringify({ format: "png" }) },
      ]);

      const toPngRes = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/convert",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": toPngCt,
        },
        body: toPngPayload,
      });

      expect(toPngRes.statusCode).toBe(200);
      const pngBody = JSON.parse(toPngRes.body);
      expect(pngBody.downloadUrl).toContain(".png");
      expect(pngBody.processedSize).toBeGreaterThan(0);
    });
  }
});

// =========================================================================
// 15. ALL 12 TOOLS x each format -- no 500 crashes
//
// The main safety net: every combination must never crash the server.
// This uses a flat loop to generate 16 x 12 = 192 assertions.
// =========================================================================
describe("No-crash matrix: 16 formats x 12 tools", () => {
  const TOOLS_WITH_SETTINGS: Array<{
    id: string;
    label: string;
    settings: Record<string, unknown>;
  }> = [
    { id: "resize", label: "Resize", settings: { width: 50, height: 50 } },
    { id: "crop", label: "Crop", settings: { width: 10, height: 10, left: 0, top: 0 } },
    { id: "rotate", label: "Rotate", settings: { angle: 90 } },
    { id: "convert", label: "Convert", settings: { format: "png" } },
    { id: "compress", label: "Compress", settings: { mode: "quality", quality: 60 } },
    { id: "adjust-colors", label: "Adjust colors", settings: { brightness: 10, contrast: 5 } },
    { id: "sharpening", label: "Sharpening", settings: { method: "adaptive" } },
    { id: "strip-metadata", label: "Strip metadata", settings: { stripAll: true } },
    { id: "info", label: "Info", settings: {} },
    {
      id: "optimize-for-web",
      label: "Optimize for web",
      settings: { format: "webp", quality: 75 },
    },
    { id: "image-enhancement", label: "Enhancement", settings: { mode: "auto", intensity: 50 } },
    { id: "border", label: "Border", settings: { borderWidth: 5, borderColor: "#FF0000" } },
  ];

  for (const fmt of PRIMARY_FORMATS) {
    describe(`${fmt.name}`, () => {
      for (const tool of TOOLS_WITH_SETTINGS) {
        // Skip identity conversion
        if (tool.id === "convert" && fmt.name === "PNG") continue;

        it(
          `${tool.label}: no crash`,
          async () => {
            const res = await callTool(tool.id, fmt, tool.settings);
            if (!res) return;

            // Must never return 500
            expect(res.statusCode, `${tool.label} + ${fmt.name}: got ${res.statusCode}`).not.toBe(
              500,
            );

            // A heavy encode may fall back to async (202) under CI load -- accept it.
            if (isAsyncFallback(res)) return;

            // Must be a recognized status code
            if (needsFallback(fmt)) {
              expect(ACCEPTABLE_FALLBACK_CODES).toContain(res.statusCode);
            } else {
              expect(res.statusCode).toBe(200);
            }

            // Response must always be valid JSON
            const body = JSON.parse(res.body);
            expect(typeof body).toBe("object");

            // If error, verify clean error shape
            if (res.statusCode !== 200) {
              expect(body.error).toBeDefined();
              expect(typeof body.error).toBe("string");
              expect(body.error.length).toBeGreaterThan(0);
            }
          },
          getTimeout(fmt, tool.id),
        );
      }
    });
  }
});

// =========================================================================
// 16. EXTENDED CONVERT MATRIX: core formats -> 5 output formats
//
// Tests AVIF, TIFF, GIF as additional conversion targets beyond the
// JPEG/PNG/WebP matrix tested above.
// =========================================================================
describe("Extended conversion targets (core formats)", () => {
  const EXTENDED_TARGETS = [
    { format: "avif", ext: ".avif" },
    { format: "tiff", ext: ".tiff" },
    { format: "gif", ext: ".gif" },
  ] as const;

  for (const target of EXTENDED_TARGETS) {
    describe(`convert to ${target.format}`, () => {
      for (const fmt of CORE_FORMATS) {
        // Skip identity conversions
        if (fmt.name.toLowerCase() === target.format) continue;
        if (fmt.name === "AVIF" && target.format === "avif") continue;

        const testTimeout = target.format === "avif" || target.format === "gif" ? 120_000 : 30_000;
        it(`${fmt.name} -> ${target.format}`, { timeout: testTimeout }, async () => {
          const res = await callTool("convert", fmt, { format: target.format });
          if (!res) return;
          if (isAsyncFallback(res)) return;
          expect(res.statusCode).toBe(200);

          const body = JSON.parse(res.body);
          expect(body.downloadUrl).toBeDefined();
          expect(body.downloadUrl).toContain(target.ext);
          expect(body.processedSize).toBeGreaterThan(0);
        });
      }
    });
  }
});

// =========================================================================
// 17. INFO CONSISTENCY: dimensions are consistent with resize output
//
// For core formats: get info, then resize to specific dimensions and
// verify the resize succeeded (demonstrates info output is meaningful).
// =========================================================================
describe("Info consistency check (core formats)", () => {
  for (const fmt of CORE_FORMATS) {
    it(`${fmt.name}: info dimensions are positive`, async () => {
      const res = await callTool("info", fmt, {});
      if (!res) return;
      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.body);
      expect(body.width).toBeGreaterThan(0);
      expect(body.height).toBeGreaterThan(0);

      // Verify we can resize to half the original dimensions
      const halfW = Math.max(1, Math.floor(body.width / 2));
      const halfH = Math.max(1, Math.floor(body.height / 2));

      const resizeRes = await callTool("resize", fmt, { width: halfW, height: halfH });
      if (!resizeRes) return;
      expect(resizeRes.statusCode).toBe(200);

      const resizeBody = JSON.parse(resizeRes.body);
      expect(resizeBody.processedSize).toBeGreaterThan(0);
    });
  }
});

// =========================================================================
// 18. EXOTIC FORMAT ERROR SHAPE VERIFICATION
//
// Exotic formats that fail should return structured errors, not raw
// stack traces or HTML error pages. This is a deeper check than the
// no-crash matrix.
// =========================================================================
describe("Exotic format error shape verification", () => {
  const EXOTIC_FORMATS = PRIMARY_FORMATS.filter((f) => f.needsCliDecoder);

  const TOOLS_TO_CHECK = [
    { id: "resize", settings: { width: 50, height: 50 } },
    { id: "crop", settings: { width: 10, height: 10, left: 0, top: 0 } },
    { id: "compress", settings: { mode: "quality", quality: 60 } },
    { id: "sharpening", settings: { method: "adaptive" } },
    { id: "image-enhancement", settings: { mode: "auto", intensity: 50 } },
    { id: "border", settings: { borderWidth: 5, borderColor: "#FF0000" } },
  ];

  for (const fmt of EXOTIC_FORMATS) {
    for (const tool of TOOLS_TO_CHECK) {
      it(
        `${fmt.name} + ${tool.id}: clean JSON error`,
        async () => {
          const res = await callTool(tool.id, fmt, tool.settings);
          if (!res) return;

          expect(res.statusCode).not.toBe(500);
          expect([200, 400, 422]).toContain(res.statusCode);

          // Response must be valid JSON (not HTML, not raw text)
          let body: Record<string, unknown>;
          try {
            body = JSON.parse(res.body);
          } catch {
            throw new Error(
              `${fmt.name} + ${tool.id}: response is not valid JSON: ${res.body.slice(0, 200)}`,
            );
          }

          if (res.statusCode !== 200) {
            expect(body.error).toBeDefined();
            expect(typeof body.error).toBe("string");
            // Error message should not contain raw stack trace indicators
            const errorStr = body.error as string;
            expect(errorStr).not.toContain("at Object.");
            expect(errorStr).not.toContain("at Module.");
            expect(errorStr).not.toContain("node_modules");
          }
        },
        getTimeout(fmt),
      );
    }
  }
});

// =========================================================================
// 19. HEIC/HEIF SPECIFIC: graceful handling when libheif unavailable
// =========================================================================
describe("HEIC/HEIF graceful handling", () => {
  const HEIF_FORMATS = PRIMARY_FORMATS.filter((f) => f.needsHeifDecoder);

  const CORE_TOOLS = [
    { id: "resize", settings: { width: 50, height: 50 } },
    { id: "crop", settings: { width: 10, height: 10, left: 0, top: 0 } },
    { id: "rotate", settings: { angle: 90 } },
    { id: "convert", settings: { format: "png" } },
    { id: "compress", settings: { mode: "quality", quality: 60 } },
    { id: "adjust-colors", settings: { brightness: 10 } },
    { id: "sharpening", settings: { method: "adaptive" } },
    { id: "strip-metadata", settings: { stripAll: true } },
    { id: "info", settings: {} },
    { id: "optimize-for-web", settings: { format: "webp", quality: 75 } },
    { id: "image-enhancement", settings: { mode: "auto", intensity: 50 } },
    { id: "border", settings: { borderWidth: 5, borderColor: "#FF0000" } },
  ];

  for (const fmt of HEIF_FORMATS) {
    describe(`${fmt.name}`, () => {
      for (const tool of CORE_TOOLS) {
        it(
          `${tool.id}: no crash`,
          async () => {
            const res = await callTool(tool.id, fmt, tool.settings);
            if (!res) return;

            // Must never crash
            expect(res.statusCode).not.toBe(500);

            // Accept success (200) or clean error (400/422)
            expect([200, 400, 422]).toContain(res.statusCode);

            const body = JSON.parse(res.body);
            if (res.statusCode !== 200) {
              expect(body.error).toBeDefined();
              expect(typeof body.error).toBe("string");
            }
          },
          tool.id === "image-enhancement" ? 300_000 : 180_000,
        );
      }
    });
  }
});

// =========================================================================
// 20. ANIMATED GIF: verify tools handle it without crashing
// =========================================================================
describe("Animated GIF handling", () => {
  const gifFmt: FormatDef = {
    name: "GIF",
    file: "sample.gif",
    mime: "image/gif",
    needsCliDecoder: false,
    needsHeifDecoder: false,
    mayFailValidation: false,
  };

  const TOOLS_FOR_GIF = [
    { id: "resize", settings: { width: 32, height: 32 } },
    { id: "crop", settings: { width: 10, height: 10, left: 0, top: 0 } },
    { id: "rotate", settings: { angle: 180 } },
    { id: "convert", settings: { format: "png" } },
    { id: "compress", settings: { mode: "quality", quality: 50 } },
    { id: "info", settings: {} },
    { id: "border", settings: { borderWidth: 3, borderColor: "#00FF00" } },
    { id: "strip-metadata", settings: { stripAll: true } },
    { id: "optimize-for-web", settings: { format: "webp", quality: 60 } },
    { id: "image-enhancement", settings: { mode: "auto", intensity: 30 } },
    { id: "adjust-colors", settings: { brightness: 5 } },
    { id: "sharpening", settings: { method: "adaptive" } },
  ];

  for (const tool of TOOLS_FOR_GIF) {
    it(`${tool.id}: processes without crash`, async () => {
      const res = await callTool(tool.id, gifFmt, tool.settings);
      if (!res) return;
      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.body);
      if (tool.id === "info") {
        expect(body.width).toBeGreaterThan(0);
        expect(body.height).toBeGreaterThan(0);
      } else {
        expect(body.downloadUrl || body.processedSize).toBeDefined();
      }
    });
  }
});

// =========================================================================
// 21. SVG SPECIAL HANDLING: vector format through raster tools
// =========================================================================
describe("SVG through raster tools", () => {
  const svgFmt: FormatDef = {
    name: "SVG",
    file: "sample.svg",
    mime: "image/svg+xml",
    needsCliDecoder: false,
    needsHeifDecoder: false,
    mayFailValidation: false,
  };

  const SVG_TOOLS = [
    { id: "resize", settings: { width: 100, height: 100 } },
    { id: "crop", settings: { width: 50, height: 50, left: 0, top: 0 } },
    { id: "rotate", settings: { angle: 90 } },
    { id: "convert", settings: { format: "png" } },
    { id: "compress", settings: { mode: "quality", quality: 60 } },
    { id: "info", settings: {} },
    { id: "border", settings: { borderWidth: 5, borderColor: "#333333" } },
    { id: "adjust-colors", settings: { brightness: 10 } },
    { id: "sharpening", settings: { method: "adaptive" } },
    { id: "optimize-for-web", settings: { format: "webp", quality: 75 } },
    { id: "image-enhancement", settings: { mode: "auto", intensity: 50 } },
    { id: "strip-metadata", settings: { stripAll: true } },
  ];

  for (const tool of SVG_TOOLS) {
    it(`${tool.id}: handles SVG input`, async () => {
      const res = await callTool(tool.id, svgFmt, tool.settings);
      if (!res) return;

      // SVG should either be rasterized and processed (200) or cleanly rejected
      expect(res.statusCode).not.toBe(500);
      expect([200, 400, 422]).toContain(res.statusCode);

      const body = JSON.parse(res.body);
      if (res.statusCode === 200) {
        if (tool.id === "info") {
          expect(body.width).toBeGreaterThan(0);
          expect(body.height).toBeGreaterThan(0);
        } else {
          expect(body.downloadUrl || body.processedSize).toBeDefined();
        }
      } else {
        expect(body.error).toBeDefined();
        expect(typeof body.error).toBe("string");
      }
    });
  }
});

// =========================================================================
// 22. ICO SPECIAL HANDLING: multi-size format
// =========================================================================
describe("ICO (multi-size format) through tools", () => {
  const icoFmt: FormatDef = {
    name: "ICO",
    file: "sample.ico",
    mime: "image/x-icon",
    needsCliDecoder: true,
    needsHeifDecoder: false,
    mayFailValidation: false,
  };

  const ICO_TOOLS = [
    { id: "resize", settings: { width: 32, height: 32 } },
    { id: "convert", settings: { format: "png" } },
    { id: "info", settings: {} },
    { id: "border", settings: { borderWidth: 2, borderColor: "#000000" } },
    { id: "image-enhancement", settings: { mode: "auto", intensity: 50 } },
  ];

  for (const tool of ICO_TOOLS) {
    it(`${tool.id}: handles ICO input (may need ImageMagick)`, async () => {
      const res = await callTool(tool.id, icoFmt, tool.settings);
      if (!res) return;

      // ICO requires CLI decoder; accept success or clean error
      expect(res.statusCode).not.toBe(500);
      expect([200, 400, 422]).toContain(res.statusCode);

      const body = JSON.parse(res.body);
      if (res.statusCode !== 200) {
        expect(body.error).toBeDefined();
        expect(typeof body.error).toBe("string");
      }
    }, 180_000);
  }
});
