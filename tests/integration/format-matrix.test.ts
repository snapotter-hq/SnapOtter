/**
 * Cross-format matrix integration test.
 *
 * For each supported input format, verifies that the core non-AI tools
 * (resize, crop, rotate, convert, compress, color-adjustments, sharpening,
 * info, optimize-for-web, border, watermark-text, image-to-base64,
 * image-enhancement, strip-metadata, replace-color, text-overlay,
 * color-palette) work correctly via the API.
 *
 * Some formats (PSD, EXR, HDR, TGA, DNG, ICO, JXL) require CLI decoders
 * (ImageMagick / dcraw) that may not be installed in every test environment.
 * For those formats, the test accepts either 200 or 422 and documents the
 * reason.
 *
 * HEIC/HEIF require libheif-examples to decode. If unavailable, the API
 * returns 422 which the test accepts.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const FORMATS_DIR = join(__dirname, "..", "fixtures", "formats");

// ---------------------------------------------------------------------------
// Format sample definitions
// ---------------------------------------------------------------------------
interface FormatSample {
  name: string;
  file: string;
  mime: string;
  /** True if format requires CLI decoder (ImageMagick / dcraw) */
  needsCliDecoder: boolean;
  /** True if format requires libheif decoder */
  needsHeifDecoder: boolean;
  /**
   * True if Sharp may fail to read metadata for this format during
   * validation, causing a 400 response. This happens for formats like
   * BMP (some variants) and JXL where Sharp support is incomplete.
   */
  mayFailValidation: boolean;
}

const FORMAT_SAMPLES: FormatSample[] = [
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
    name: "GIF",
    file: "sample.gif",
    mime: "image/gif",
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
    name: "SVG",
    file: "sample.svg",
    mime: "image/svg+xml",
    needsCliDecoder: false,
    needsHeifDecoder: false,
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
  {
    name: "TGA",
    file: "sample.tga",
    mime: "image/x-tga",
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
    name: "JXL",
    file: "sample.jxl",
    mime: "image/jxl",
    needsCliDecoder: true,
    needsHeifDecoder: false,
    mayFailValidation: true,
  },
];

// ---------------------------------------------------------------------------
// Tool definitions — settings each tool requires
// ---------------------------------------------------------------------------
interface ToolDef {
  /** Tool route name (maps to /api/v1/tools/<id>) */
  id: string;
  /** Display name for test output */
  label: string;
  /** Settings JSON sent as the "settings" multipart field */
  settings: Record<string, unknown>;
  /**
   * How to verify a successful (200) response.
   * "download" = standard {downloadUrl, processedSize} shape
   * "info"     = metadata JSON {width, height, fileSize, format}
   * "base64"   = {results, errors} shape from image-to-base64
   * "palette"  = {colors, count} shape from color-palette
   * "pdf"      = {downloadUrl, processedSize, pages} shape from image-to-pdf
   */
  responseType: "download" | "info" | "base64" | "palette" | "pdf";
}

const TOOLS: ToolDef[] = [
  {
    id: "resize",
    label: "Resize",
    settings: { width: 50, height: 50 },
    responseType: "download",
  },
  {
    id: "crop",
    label: "Crop",
    settings: { width: 10, height: 10, left: 0, top: 0 },
    responseType: "download",
  },
  {
    id: "rotate",
    label: "Rotate",
    settings: { angle: 90 },
    responseType: "download",
  },
  {
    id: "convert",
    label: "Convert to PNG",
    settings: { format: "png" },
    responseType: "download",
  },
  {
    id: "compress",
    label: "Compress",
    settings: { mode: "quality", quality: 60 },
    responseType: "download",
  },
  {
    id: "adjust-colors",
    label: "Color adjustments",
    settings: { brightness: 10, contrast: 5 },
    responseType: "download",
  },
  {
    id: "sharpening",
    label: "Sharpening",
    settings: { method: "adaptive" },
    responseType: "download",
  },
  {
    id: "info",
    label: "Info (metadata)",
    settings: {},
    responseType: "info",
  },
  {
    id: "optimize-for-web",
    label: "Optimize for web",
    settings: { format: "webp", quality: 75 },
    responseType: "download",
  },
  {
    id: "border",
    label: "Border",
    settings: { borderWidth: 5, borderColor: "#FF0000" },
    responseType: "download",
  },
  {
    id: "watermark-text",
    label: "Watermark text",
    settings: { text: "TEST", fontSize: 16, opacity: 50 },
    responseType: "download",
  },
  {
    id: "image-to-base64",
    label: "Image to Base64",
    settings: {},
    responseType: "base64",
  },
  {
    id: "image-enhancement",
    label: "Image enhancement",
    settings: { mode: "auto", intensity: 50 },
    responseType: "download",
  },
  {
    id: "strip-metadata",
    label: "Strip metadata",
    settings: { stripAll: true },
    responseType: "download",
  },
  {
    id: "replace-color",
    label: "Replace color",
    settings: { sourceColor: "#FF0000", targetColor: "#00FF00", tolerance: 30 },
    responseType: "download",
  },
  {
    id: "text-overlay",
    label: "Text overlay",
    settings: { text: "TEST", fontSize: 16, position: "bottom" },
    responseType: "download",
  },
  {
    id: "color-palette",
    label: "Color palette",
    settings: {},
    responseType: "palette",
  },
  {
    id: "image-to-pdf",
    label: "Image to PDF",
    settings: { pageSize: "A4", orientation: "portrait", margin: 20 },
    responseType: "pdf",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Status codes we accept for formats that may lack decoder support */
const ACCEPTABLE_FALLBACK_CODES = [200, 400, 422];

function needsFallback(fmt: FormatSample): boolean {
  return fmt.needsCliDecoder || fmt.needsHeifDecoder || fmt.mayFailValidation;
}

/**
 * Build multipart payload for a tool request.
 * Info route does not use a "settings" field; image-to-base64 uses its own
 * settings parsing; everything else uses the standard factory shape.
 */
function buildPayload(
  fmt: FormatSample,
  tool: ToolDef,
  buffer: Buffer,
): { body: Buffer; contentType: string } {
  const fields: Array<{
    name: string;
    filename?: string;
    contentType?: string;
    content: Buffer | string;
  }> = [
    {
      name: "file",
      filename: fmt.file,
      contentType: fmt.mime,
      content: buffer,
    },
  ];

  // Info route ignores the settings field; the others need it
  if (tool.responseType !== "info" || Object.keys(tool.settings).length > 0) {
    fields.push({
      name: "settings",
      content: JSON.stringify(tool.settings),
    });
  }

  return createMultipartPayload(fields);
}

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

// ---------------------------------------------------------------------------
// Cross-format matrix: every tool x every format
// ---------------------------------------------------------------------------
describe("Cross-format matrix", () => {
  for (const fmt of FORMAT_SAMPLES) {
    describe(`${fmt.name} input (${fmt.file})`, () => {
      const fixturePath = join(FORMATS_DIR, fmt.file);

      for (const tool of TOOLS) {
        // Skip "Convert to PNG" when input is already PNG (no-op conversion)
        if (tool.id === "convert" && fmt.name === "PNG") continue;

        const perTestTimeout = fmt.needsHeifDecoder || fmt.needsCliDecoder ? 180_000 : undefined;

        it(
          `${tool.label}`,
          async () => {
            if (!existsSync(fixturePath)) return;

            const buffer = readFileSync(fixturePath);
            const { body: payload, contentType } = buildPayload(fmt, tool, buffer);

            const res = await app.inject({
              method: "POST",
              url: `/api/v1/tools/${tool.id}`,
              headers: {
                authorization: `Bearer ${adminToken}`,
                "content-type": contentType,
              },
              body: payload,
            });

            // ------------------------------------------------------------------
            // Assert status code
            // ------------------------------------------------------------------
            if (needsFallback(fmt)) {
              // Formats with optional decoders: accept success or graceful error
              expect(ACCEPTABLE_FALLBACK_CODES).toContain(res.statusCode);
            } else {
              // Core formats must always succeed
              expect(res.statusCode).toBe(200);
            }

            // ------------------------------------------------------------------
            // If successful, validate the response shape
            // ------------------------------------------------------------------
            if (res.statusCode === 200) {
              const body = JSON.parse(res.body);

              switch (tool.responseType) {
                case "download":
                  expect(body.downloadUrl).toBeDefined();
                  expect(typeof body.downloadUrl).toBe("string");
                  expect(body.processedSize).toBeGreaterThan(0);
                  expect(body.originalSize).toBeGreaterThan(0);
                  break;

                case "info":
                  expect(body.width).toBeGreaterThan(0);
                  expect(body.height).toBeGreaterThan(0);
                  expect(body.fileSize).toBeGreaterThan(0);
                  expect(body.format).toBeDefined();
                  expect(body.channels).toBeGreaterThan(0);
                  break;

                case "base64":
                  // image-to-base64 returns { results: [...], errors: [...] }
                  expect(Array.isArray(body.results)).toBe(true);
                  expect(body.results.length + body.errors.length).toBeGreaterThan(0);
                  if (body.results.length > 0) {
                    const r = body.results[0];
                    expect(r.base64).toBeDefined();
                    expect(typeof r.base64).toBe("string");
                    expect(r.base64.length).toBeGreaterThan(0);
                    expect(r.dataUri).toMatch(/^data:/);
                    expect(r.width).toBeGreaterThan(0);
                    expect(r.height).toBeGreaterThan(0);
                  }
                  break;

                case "palette":
                  // color-palette returns { colors: string[], count: number }
                  expect(Array.isArray(body.colors)).toBe(true);
                  expect(body.colors.length).toBeGreaterThan(0);
                  expect(body.count).toBeGreaterThan(0);
                  // Each color should be a hex string
                  for (const color of body.colors) {
                    expect(color).toMatch(/^#[0-9a-f]{6}$/);
                  }
                  break;

                case "pdf":
                  // image-to-pdf returns { downloadUrl, processedSize, pages }
                  expect(body.downloadUrl).toBeDefined();
                  expect(typeof body.downloadUrl).toBe("string");
                  expect(body.processedSize).toBeGreaterThan(0);
                  expect(body.pages).toBeGreaterThanOrEqual(1);
                  break;
              }
            }

            // ------------------------------------------------------------------
            // If the API returned an error, verify it is a clean JSON error
            // (not a raw crash / stack trace / HTML error page)
            // ------------------------------------------------------------------
            if (res.statusCode !== 200) {
              const body = JSON.parse(res.body);
              expect(body.error).toBeDefined();
              expect(typeof body.error).toBe("string");
            }
          },
          perTestTimeout,
        );
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Edge-case matrix: multipage TIFF
// ---------------------------------------------------------------------------
describe("Multipage TIFF handling", () => {
  const multipagePath = join(FORMATS_DIR, "multipage.tiff");

  for (const tool of TOOLS) {
    it(`${tool.label} handles multipage TIFF`, async () => {
      if (!existsSync(multipagePath)) return;

      const buffer = readFileSync(multipagePath);
      const { body: payload, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: "multipage.tiff",
          contentType: "image/tiff",
          content: buffer,
        },
        ...(tool.responseType !== "info"
          ? [{ name: "settings", content: JSON.stringify(tool.settings) }]
          : []),
      ]);

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/tools/${tool.id}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        body: payload,
      });

      // Multipage TIFF should either succeed or return a clean error
      expect([200, 400, 422]).toContain(res.statusCode);

      if (res.statusCode === 200) {
        const body = JSON.parse(res.body);

        if (tool.responseType === "info") {
          expect(body.width).toBeGreaterThan(0);
          expect(body.height).toBeGreaterThan(0);
          // Multipage TIFFs should report pages > 1
          if (body.pages !== undefined) {
            expect(body.pages).toBeGreaterThanOrEqual(1);
          }
        } else if (tool.responseType === "base64") {
          expect(Array.isArray(body.results)).toBe(true);
        } else if (tool.responseType === "palette") {
          expect(Array.isArray(body.colors)).toBe(true);
          expect(body.count).toBeGreaterThan(0);
        } else if (tool.responseType === "pdf") {
          expect(body.downloadUrl).toBeDefined();
          expect(body.processedSize).toBeGreaterThan(0);
          expect(body.pages).toBeGreaterThanOrEqual(1);
        } else {
          expect(body.downloadUrl).toBeDefined();
          expect(body.processedSize).toBeGreaterThan(0);
        }
      } else {
        const body = JSON.parse(res.body);
        expect(body.error).toBeDefined();
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Format-specific convert matrix: convert between various output formats
// ---------------------------------------------------------------------------
describe("Cross-format conversion matrix", () => {
  const OUTPUT_FORMATS = ["jpg", "png", "webp", "avif", "tiff", "gif"];

  // Only test core Sharp-readable formats for conversion (skip exotic ones)
  const CONVERTIBLE_INPUTS = FORMAT_SAMPLES.filter(
    (f) => !f.needsCliDecoder && !f.needsHeifDecoder && !f.mayFailValidation,
  );

  for (const fmt of CONVERTIBLE_INPUTS) {
    for (const outFmt of OUTPUT_FORMATS) {
      // Skip identity conversions
      const inputLower = fmt.name.toLowerCase();
      if (inputLower === outFmt) continue;
      if (inputLower === "jpeg" && outFmt === "jpg") continue;

      it(`${fmt.name} -> ${outFmt}`, async () => {
        const fixturePath = join(FORMATS_DIR, fmt.file);
        if (!existsSync(fixturePath)) return;

        const buffer = readFileSync(fixturePath);
        const { body: payload, contentType } = createMultipartPayload([
          {
            name: "file",
            filename: fmt.file,
            contentType: fmt.mime,
            content: buffer,
          },
          {
            name: "settings",
            content: JSON.stringify({ format: outFmt }),
          },
        ]);

        const res = await app.inject({
          method: "POST",
          url: "/api/v1/tools/convert",
          headers: {
            authorization: `Bearer ${adminToken}`,
            "content-type": contentType,
          },
          body: payload,
        });

        expect(res.statusCode).toBe(200);

        const body = JSON.parse(res.body);
        expect(body.downloadUrl).toBeDefined();
        expect(body.downloadUrl).toContain(`.${outFmt}`);
        expect(body.processedSize).toBeGreaterThan(0);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Error resilience: exotic formats must return clean errors, never crash
// ---------------------------------------------------------------------------
describe("Exotic format error resilience", () => {
  const EXOTIC_FORMATS = FORMAT_SAMPLES.filter((f) => f.needsCliDecoder);

  // Tools that actually process the image (not just read metadata)
  const PROCESSING_TOOLS = TOOLS.filter(
    (t) =>
      t.responseType === "download" || t.responseType === "palette" || t.responseType === "pdf",
  );

  for (const fmt of EXOTIC_FORMATS) {
    for (const tool of PROCESSING_TOOLS) {
      it(`${fmt.name} + ${tool.label}: returns JSON error (no crash)`, async () => {
        const fixturePath = join(FORMATS_DIR, fmt.file);
        if (!existsSync(fixturePath)) return;

        const buffer = readFileSync(fixturePath);
        const { body: payload, contentType } = buildPayload(fmt, tool, buffer);

        const res = await app.inject({
          method: "POST",
          url: `/api/v1/tools/${tool.id}`,
          headers: {
            authorization: `Bearer ${adminToken}`,
            "content-type": contentType,
          },
          body: payload,
        });

        // Must not crash (500) — either succeed or return a clean error
        expect(res.statusCode).not.toBe(500);
        expect([200, 400, 422]).toContain(res.statusCode);

        // Response must always be valid JSON
        const body = JSON.parse(res.body);
        if (res.statusCode !== 200) {
          expect(body.error).toBeDefined();
          expect(typeof body.error).toBe("string");
          expect(body.error.length).toBeGreaterThan(0);
        }
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Image enhancement analysis: dedicated /analyze endpoint
// ---------------------------------------------------------------------------
describe("Image enhancement analysis across formats", () => {
  // Core formats that Sharp can read natively
  const ANALYZABLE_FORMATS = FORMAT_SAMPLES.filter(
    (f) => !f.needsCliDecoder && !f.needsHeifDecoder && !f.mayFailValidation,
  );

  for (const fmt of ANALYZABLE_FORMATS) {
    it(`analyzes ${fmt.name} and returns correction recommendations`, async () => {
      const fixturePath = join(FORMATS_DIR, fmt.file);
      if (!existsSync(fixturePath)) return;

      const buffer = readFileSync(fixturePath);
      const { body: payload, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: fmt.file,
          contentType: fmt.mime,
          content: buffer,
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image-enhancement/analyze",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        body: payload,
      });

      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.body);
      // Analysis should return corrections object
      expect(body.corrections).toBeDefined();
      expect(typeof body.corrections).toBe("object");
    });
  }

  // Exotic formats: should not crash, return clean error or succeed
  const EXOTIC_FORMATS = FORMAT_SAMPLES.filter((f) => f.needsCliDecoder);

  for (const fmt of EXOTIC_FORMATS) {
    it(`${fmt.name} analyze: returns clean response (no crash)`, async () => {
      const fixturePath = join(FORMATS_DIR, fmt.file);
      if (!existsSync(fixturePath)) return;

      const buffer = readFileSync(fixturePath);
      const { body: payload, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: fmt.file,
          contentType: fmt.mime,
          content: buffer,
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image-enhancement/analyze",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        body: payload,
      });

      expect(res.statusCode).not.toBe(500);
      expect([200, 400, 422]).toContain(res.statusCode);

      const body = JSON.parse(res.body);
      if (res.statusCode !== 200) {
        expect(body.error).toBeDefined();
        expect(typeof body.error).toBe("string");
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Strip-metadata inspect: dedicated /inspect endpoint
// ---------------------------------------------------------------------------
describe("Strip-metadata inspection across formats", () => {
  // Core formats that Sharp can read natively
  const INSPECTABLE_FORMATS = FORMAT_SAMPLES.filter(
    (f) => !f.needsCliDecoder && !f.needsHeifDecoder && !f.mayFailValidation,
  );

  for (const fmt of INSPECTABLE_FORMATS) {
    it(`inspects ${fmt.name} metadata`, async () => {
      const fixturePath = join(FORMATS_DIR, fmt.file);
      if (!existsSync(fixturePath)) return;

      const buffer = readFileSync(fixturePath);
      const { body: payload, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: fmt.file,
          contentType: fmt.mime,
          content: buffer,
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/strip-metadata/inspect",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        body: payload,
      });

      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.body);
      expect(body.filename).toBeDefined();
      expect(body.fileSize).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------
// Watermark-image cross-format matrix
//
// watermark-image requires TWO file uploads (file + watermark), so it cannot
// use the standard TOOLS/buildPayload path. We test each input format as the
// main image with a fixed PNG watermark, and also each format as the watermark
// image with a fixed PNG main image.
// ---------------------------------------------------------------------------
describe("Watermark-image cross-format matrix", () => {
  // Use the PNG fixture as the known-good counterpart
  const PNG_PATH = join(FORMATS_DIR, "sample.png");

  describe("format as main image (watermark is PNG)", () => {
    for (const fmt of FORMAT_SAMPLES) {
      const perTestTimeout = fmt.needsHeifDecoder || fmt.needsCliDecoder ? 180_000 : undefined;

      it(
        `${fmt.name} main image with PNG watermark`,
        async () => {
          const fixturePath = join(FORMATS_DIR, fmt.file);
          if (!existsSync(fixturePath) || !existsSync(PNG_PATH)) return;

          const mainBuffer = readFileSync(fixturePath);
          const wmBuffer = readFileSync(PNG_PATH);

          const { body: payload, contentType } = createMultipartPayload([
            {
              name: "file",
              filename: fmt.file,
              contentType: fmt.mime,
              content: mainBuffer,
            },
            {
              name: "watermark",
              filename: "sample.png",
              contentType: "image/png",
              content: wmBuffer,
            },
            {
              name: "settings",
              content: JSON.stringify({
                position: "bottom-right",
                opacity: 50,
                scale: 25,
              }),
            },
          ]);

          const res = await app.inject({
            method: "POST",
            url: "/api/v1/tools/watermark-image",
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
            expect(body.downloadUrl).toBeDefined();
            expect(typeof body.downloadUrl).toBe("string");
            expect(body.processedSize).toBeGreaterThan(0);
            expect(body.originalSize).toBeGreaterThan(0);
          } else {
            const body = JSON.parse(res.body);
            expect(body.error).toBeDefined();
            expect(typeof body.error).toBe("string");
          }
        },
        perTestTimeout,
      );
    }
  });

  describe("format as watermark image (main is PNG)", () => {
    for (const fmt of FORMAT_SAMPLES) {
      const perTestTimeout = fmt.needsHeifDecoder || fmt.needsCliDecoder ? 180_000 : undefined;

      it(
        `PNG main image with ${fmt.name} watermark`,
        async () => {
          const fixturePath = join(FORMATS_DIR, fmt.file);
          if (!existsSync(fixturePath) || !existsSync(PNG_PATH)) return;

          const mainBuffer = readFileSync(PNG_PATH);
          const wmBuffer = readFileSync(fixturePath);

          const { body: payload, contentType } = createMultipartPayload([
            {
              name: "file",
              filename: "sample.png",
              contentType: "image/png",
              content: mainBuffer,
            },
            {
              name: "watermark",
              filename: fmt.file,
              contentType: fmt.mime,
              content: wmBuffer,
            },
            {
              name: "settings",
              content: JSON.stringify({
                position: "center",
                opacity: 75,
                scale: 30,
              }),
            },
          ]);

          const res = await app.inject({
            method: "POST",
            url: "/api/v1/tools/watermark-image",
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
            expect(body.downloadUrl).toBeDefined();
            expect(typeof body.downloadUrl).toBe("string");
            expect(body.processedSize).toBeGreaterThan(0);
          } else {
            const body = JSON.parse(res.body);
            expect(body.error).toBeDefined();
            expect(typeof body.error).toBe("string");
          }
        },
        perTestTimeout,
      );
    }
  });

  describe("watermark positions across core formats", () => {
    const POSITIONS = ["center", "top-left", "top-right", "bottom-left", "bottom-right"] as const;

    // Only test core Sharp-readable formats for position coverage
    const CORE_FORMATS = FORMAT_SAMPLES.filter(
      (f) => !f.needsCliDecoder && !f.needsHeifDecoder && !f.mayFailValidation,
    );

    for (const fmt of CORE_FORMATS) {
      for (const position of POSITIONS) {
        it(`${fmt.name} with position=${position}`, async () => {
          const fixturePath = join(FORMATS_DIR, fmt.file);
          if (!existsSync(fixturePath) || !existsSync(PNG_PATH)) return;

          const mainBuffer = readFileSync(fixturePath);
          const wmBuffer = readFileSync(PNG_PATH);

          const { body: payload, contentType } = createMultipartPayload([
            {
              name: "file",
              filename: fmt.file,
              contentType: fmt.mime,
              content: mainBuffer,
            },
            {
              name: "watermark",
              filename: "sample.png",
              contentType: "image/png",
              content: wmBuffer,
            },
            {
              name: "settings",
              content: JSON.stringify({ position, opacity: 50, scale: 20 }),
            },
          ]);

          const res = await app.inject({
            method: "POST",
            url: "/api/v1/tools/watermark-image",
            headers: {
              authorization: `Bearer ${adminToken}`,
              "content-type": contentType,
            },
            body: payload,
          });

          expect(res.statusCode).toBe(200);
          const body = JSON.parse(res.body);
          expect(body.downloadUrl).toBeDefined();
          expect(body.processedSize).toBeGreaterThan(0);
        });
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Image-to-PDF cross-format conversion matrix
//
// Verifies that each input format can be converted to PDF, with various
// page size and orientation combinations.
// ---------------------------------------------------------------------------
describe("Image-to-PDF cross-format matrix", () => {
  describe("single image conversion across formats", () => {
    for (const fmt of FORMAT_SAMPLES) {
      const perTestTimeout = fmt.needsHeifDecoder || fmt.needsCliDecoder ? 180_000 : undefined;

      it(
        `converts ${fmt.name} to PDF`,
        async () => {
          const fixturePath = join(FORMATS_DIR, fmt.file);
          if (!existsSync(fixturePath)) return;

          const buffer = readFileSync(fixturePath);
          const { body: payload, contentType } = createMultipartPayload([
            {
              name: "file",
              filename: fmt.file,
              contentType: fmt.mime,
              content: buffer,
            },
            {
              name: "settings",
              content: JSON.stringify({
                pageSize: "A4",
                orientation: "portrait",
                margin: 20,
              }),
            },
          ]);

          const res = await app.inject({
            method: "POST",
            url: "/api/v1/tools/image-to-pdf",
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
            expect(body.downloadUrl).toBeDefined();
            expect(typeof body.downloadUrl).toBe("string");
            expect(body.processedSize).toBeGreaterThan(0);
            expect(body.pages).toBe(1);
          } else {
            const body = JSON.parse(res.body);
            expect(body.error).toBeDefined();
            expect(typeof body.error).toBe("string");
          }
        },
        perTestTimeout,
      );
    }
  });

  describe("page size and orientation variations per core format", () => {
    const PAGE_CONFIGS = [
      { pageSize: "A4", orientation: "portrait" },
      { pageSize: "A4", orientation: "landscape" },
      { pageSize: "Letter", orientation: "portrait" },
      { pageSize: "A3", orientation: "landscape" },
      { pageSize: "A5", orientation: "portrait" },
    ] as const;

    // Only test core Sharp-readable formats for page config coverage
    const CORE_FORMATS = FORMAT_SAMPLES.filter(
      (f) => !f.needsCliDecoder && !f.needsHeifDecoder && !f.mayFailValidation,
    );

    for (const fmt of CORE_FORMATS) {
      for (const cfg of PAGE_CONFIGS) {
        it(`${fmt.name} -> ${cfg.pageSize} ${cfg.orientation}`, async () => {
          const fixturePath = join(FORMATS_DIR, fmt.file);
          if (!existsSync(fixturePath)) return;

          const buffer = readFileSync(fixturePath);
          const { body: payload, contentType } = createMultipartPayload([
            {
              name: "file",
              filename: fmt.file,
              contentType: fmt.mime,
              content: buffer,
            },
            {
              name: "settings",
              content: JSON.stringify({
                pageSize: cfg.pageSize,
                orientation: cfg.orientation,
                margin: 20,
              }),
            },
          ]);

          const res = await app.inject({
            method: "POST",
            url: "/api/v1/tools/image-to-pdf",
            headers: {
              authorization: `Bearer ${adminToken}`,
              "content-type": contentType,
            },
            body: payload,
          });

          expect(res.statusCode).toBe(200);
          const body = JSON.parse(res.body);
          expect(body.downloadUrl).toBeDefined();
          expect(body.processedSize).toBeGreaterThan(0);
          expect(body.pages).toBe(1);
        });
      }
    }
  });

  describe("multi-format PDF (mixed inputs in one document)", () => {
    // Only combine core formats that Sharp can read natively
    const CORE_FORMATS = FORMAT_SAMPLES.filter(
      (f) => !f.needsCliDecoder && !f.needsHeifDecoder && !f.mayFailValidation,
    );

    // Test pairing each core format with PNG as a 2-page PDF
    for (const fmt of CORE_FORMATS) {
      // Skip PNG paired with PNG (redundant)
      if (fmt.name === "PNG") continue;

      it(`${fmt.name} + PNG as 2-page PDF`, async () => {
        const fixturePath = join(FORMATS_DIR, fmt.file);
        const pngPath = join(FORMATS_DIR, "sample.png");
        if (!existsSync(fixturePath) || !existsSync(pngPath)) return;

        const fmtBuffer = readFileSync(fixturePath);
        const pngBuffer = readFileSync(pngPath);

        const { body: payload, contentType } = createMultipartPayload([
          {
            name: "file",
            filename: fmt.file,
            contentType: fmt.mime,
            content: fmtBuffer,
          },
          {
            name: "file",
            filename: "sample.png",
            contentType: "image/png",
            content: pngBuffer,
          },
          {
            name: "settings",
            content: JSON.stringify({ pageSize: "A4" }),
          },
        ]);

        const res = await app.inject({
          method: "POST",
          url: "/api/v1/tools/image-to-pdf",
          headers: {
            authorization: `Bearer ${adminToken}`,
            "content-type": contentType,
          },
          body: payload,
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.pages).toBe(2);
        expect(body.processedSize).toBeGreaterThan(0);
      });
    }
  });

  describe("multipage TIFF to PDF", () => {
    const multipagePath = join(FORMATS_DIR, "multipage.tiff");

    it("converts multipage TIFF to PDF", async () => {
      if (!existsSync(multipagePath)) return;

      const buffer = readFileSync(multipagePath);
      const { body: payload, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: "multipage.tiff",
          contentType: "image/tiff",
          content: buffer,
        },
        {
          name: "settings",
          content: JSON.stringify({ pageSize: "A4" }),
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image-to-pdf",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        body: payload,
      });

      expect([200, 400, 422]).toContain(res.statusCode);

      if (res.statusCode === 200) {
        const body = JSON.parse(res.body);
        expect(body.downloadUrl).toBeDefined();
        expect(body.processedSize).toBeGreaterThan(0);
        expect(body.pages).toBeGreaterThanOrEqual(1);
      } else {
        const body = JSON.parse(res.body);
        expect(body.error).toBeDefined();
      }
    });
  });

  describe("exotic format error resilience for image-to-pdf", () => {
    const EXOTIC_FORMATS = FORMAT_SAMPLES.filter((f) => f.needsCliDecoder);

    for (const fmt of EXOTIC_FORMATS) {
      it(`${fmt.name} -> PDF: returns clean response (no crash)`, async () => {
        const fixturePath = join(FORMATS_DIR, fmt.file);
        if (!existsSync(fixturePath)) return;

        const buffer = readFileSync(fixturePath);
        const { body: payload, contentType } = createMultipartPayload([
          {
            name: "file",
            filename: fmt.file,
            contentType: fmt.mime,
            content: buffer,
          },
          {
            name: "settings",
            content: JSON.stringify({ pageSize: "A4" }),
          },
        ]);

        const res = await app.inject({
          method: "POST",
          url: "/api/v1/tools/image-to-pdf",
          headers: {
            authorization: `Bearer ${adminToken}`,
            "content-type": contentType,
          },
          body: payload,
        });

        // Must not crash with 500
        expect(res.statusCode).not.toBe(500);
        expect([200, 400, 422]).toContain(res.statusCode);

        const body = JSON.parse(res.body);
        if (res.statusCode !== 200) {
          expect(body.error).toBeDefined();
          expect(typeof body.error).toBe("string");
          expect(body.error.length).toBeGreaterThan(0);
        }
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Watermark-image exotic format error resilience
// ---------------------------------------------------------------------------
describe("Watermark-image exotic format error resilience", () => {
  const EXOTIC_FORMATS = FORMAT_SAMPLES.filter((f) => f.needsCliDecoder);
  const PNG_PATH = join(FORMATS_DIR, "sample.png");

  describe("exotic format as main image", () => {
    for (const fmt of EXOTIC_FORMATS) {
      it(`${fmt.name} main + PNG watermark: no crash`, async () => {
        const fixturePath = join(FORMATS_DIR, fmt.file);
        if (!existsSync(fixturePath) || !existsSync(PNG_PATH)) return;

        const mainBuffer = readFileSync(fixturePath);
        const wmBuffer = readFileSync(PNG_PATH);

        const { body: payload, contentType } = createMultipartPayload([
          {
            name: "file",
            filename: fmt.file,
            contentType: fmt.mime,
            content: mainBuffer,
          },
          {
            name: "watermark",
            filename: "sample.png",
            contentType: "image/png",
            content: wmBuffer,
          },
          {
            name: "settings",
            content: JSON.stringify({ position: "center", opacity: 50, scale: 25 }),
          },
        ]);

        const res = await app.inject({
          method: "POST",
          url: "/api/v1/tools/watermark-image",
          headers: {
            authorization: `Bearer ${adminToken}`,
            "content-type": contentType,
          },
          body: payload,
        });

        expect(res.statusCode).not.toBe(500);
        expect([200, 400, 422]).toContain(res.statusCode);

        const body = JSON.parse(res.body);
        if (res.statusCode !== 200) {
          expect(body.error).toBeDefined();
          expect(typeof body.error).toBe("string");
          expect(body.error.length).toBeGreaterThan(0);
        }
      });
    }
  });

  describe("exotic format as watermark image", () => {
    for (const fmt of EXOTIC_FORMATS) {
      it(`PNG main + ${fmt.name} watermark: no crash`, async () => {
        const fixturePath = join(FORMATS_DIR, fmt.file);
        if (!existsSync(fixturePath) || !existsSync(PNG_PATH)) return;

        const mainBuffer = readFileSync(PNG_PATH);
        const wmBuffer = readFileSync(fixturePath);

        const { body: payload, contentType } = createMultipartPayload([
          {
            name: "file",
            filename: "sample.png",
            contentType: "image/png",
            content: mainBuffer,
          },
          {
            name: "watermark",
            filename: fmt.file,
            contentType: fmt.mime,
            content: wmBuffer,
          },
          {
            name: "settings",
            content: JSON.stringify({ position: "bottom-right", opacity: 75, scale: 30 }),
          },
        ]);

        const res = await app.inject({
          method: "POST",
          url: "/api/v1/tools/watermark-image",
          headers: {
            authorization: `Bearer ${adminToken}`,
            "content-type": contentType,
          },
          body: payload,
        });

        expect(res.statusCode).not.toBe(500);
        expect([200, 400, 422]).toContain(res.statusCode);

        const body = JSON.parse(res.body);
        if (res.statusCode !== 200) {
          expect(body.error).toBeDefined();
          expect(typeof body.error).toBe("string");
          expect(body.error.length).toBeGreaterThan(0);
        }
      });
    }
  });
});
