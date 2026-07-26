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

/*
 * Shared preamble for format-matrix-1..4.test.ts.
 *
 * The suite used to live in a single format-matrix.test.ts. Vitest shards by
 * file and runs one file's tests serially inside a single fork, so that one
 * file set the wall-clock floor for the whole Integration job. Splitting the
 * describe blocks across four part files lets them run in parallel; this module
 * holds the fixtures, tool table, and helpers they all share.
 */

import { afterAll, beforeAll, expect } from "vitest";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

// ---------------------------------------------------------------------------
// Format sample definitions
// ---------------------------------------------------------------------------
export interface FormatSample {
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

export const FORMAT_SAMPLES: FormatSample[] = [
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
  {
    name: "SVGZ",
    file: "sample.svgz",
    mime: "image/svg+xml",
    needsCliDecoder: false,
    needsHeifDecoder: false,
    mayFailValidation: true,
  },
  {
    name: "JP2",
    file: "sample.jp2",
    mime: "image/jp2",
    needsCliDecoder: true,
    needsHeifDecoder: false,
    mayFailValidation: false,
  },
  {
    name: "EPS",
    file: "sample.eps",
    mime: "application/postscript",
    needsCliDecoder: true,
    needsHeifDecoder: false,
    mayFailValidation: false,
  },
  {
    name: "PPM",
    file: "sample.ppm",
    mime: "image/x-portable-pixmap",
    needsCliDecoder: true,
    needsHeifDecoder: false,
    mayFailValidation: false,
  },
  {
    name: "PGM",
    file: "sample.pgm",
    mime: "image/x-portable-graymap",
    needsCliDecoder: true,
    needsHeifDecoder: false,
    mayFailValidation: false,
  },
  {
    name: "PBM",
    file: "sample.pbm",
    mime: "image/x-portable-bitmap",
    needsCliDecoder: true,
    needsHeifDecoder: false,
    mayFailValidation: false,
  },
  {
    name: "DDS",
    file: "sample.dds",
    mime: "image/vnd.ms-dds",
    needsCliDecoder: true,
    needsHeifDecoder: false,
    mayFailValidation: false,
  },
  {
    name: "CUR",
    file: "sample.cur",
    mime: "image/x-icon",
    needsCliDecoder: true,
    needsHeifDecoder: false,
    mayFailValidation: false,
  },
  {
    name: "DPX",
    file: "sample.dpx",
    mime: "image/x-dpx",
    needsCliDecoder: true,
    needsHeifDecoder: false,
    mayFailValidation: false,
  },
  {
    name: "FITS",
    file: "sample.fits",
    mime: "image/fits",
    needsCliDecoder: true,
    needsHeifDecoder: false,
    mayFailValidation: false,
  },
  {
    name: "APNG",
    file: "sample.apng",
    mime: "image/apng",
    needsCliDecoder: false,
    needsHeifDecoder: false,
    mayFailValidation: false,
  },
  {
    name: "QOI",
    file: "sample.qoi",
    mime: "image/x-qoi",
    needsCliDecoder: true,
    needsHeifDecoder: false,
    mayFailValidation: false,
  },
];

/** Number of part files the cross-format matrix is spread across. */
export const CROSS_MATRIX_PART_COUNT = 2;

/** Striped so the parts partition FORMAT_SAMPLES exactly. */
export function formatSamplesForPart(part: number): FormatSample[] {
  return FORMAT_SAMPLES.filter((_, i) => i % CROSS_MATRIX_PART_COUNT === part - 1);
}

// ---------------------------------------------------------------------------
// Tool definitions — settings each tool requires
// ---------------------------------------------------------------------------
export interface ToolDef {
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

export const TOOLS: ToolDef[] = [
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
export const ACCEPTABLE_FALLBACK_CODES = [200, 202, 400, 422];

export function needsFallback(fmt: FormatSample): boolean {
  return fmt.needsCliDecoder || fmt.needsHeifDecoder || fmt.mayFailValidation;
}

/**
 * A heavy encode can exceed SYNC_WAIT_MS (30s in tests) under parallel CI load
 * and fall back to 202 {jobId, async: true}. Per the 200-or-202 API contract
 * that is a legitimate "accepted & processing" outcome, not a failure.
 * Returns true (validating the async body shape) so callers can early-return.
 */
export function isAsyncFallback(res: { statusCode: number; body: string }): boolean {
  if (res.statusCode !== 202) return false;
  const body = JSON.parse(res.body);
  expect(body.async).toBe(true);
  expect(body.jobId).toBeDefined();
  return true;
}

/**
 * Build multipart payload for a tool request.
 * Info route does not use a "settings" field; image-to-base64 uses its own
 * settings parsing; everything else uses the standard factory shape.
 */
export function buildPayload(
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
export let app: TestApp["app"];
export let adminToken: string;

/** Registers the per-file app lifecycle each part file shares. */
export function setupMatrixApp(): void {
  beforeAll(async () => {
    testApp = await buildTestApp();
    app = testApp.app;
    adminToken = await loginAsAdmin(app);
  }, 30_000);

  afterAll(async () => {
    await testApp.cleanup();
  }, 10_000);
}
