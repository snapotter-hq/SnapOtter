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
 * verify the error shape when not 200. Core formats must return 200. *
 * SPLIT NOTE: this preamble lives in its own module because the original
 * single spec file was split into format-matrix-comprehensive-1..4.test.ts.
 * Vitest shards by FILE and runs one file's tests serially inside a single
 * fork, so one huge spec set the floor for the whole Integration CI job.
 * Four part files run in parallel; this module holds everything they share.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { apiToolPath } from "@snapotter/shared";
import { afterAll, beforeAll, expect } from "vitest";
import { fixtureDir } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

// ---------------------------------------------------------------------------
// Format definitions for the 16 primary formats
// ---------------------------------------------------------------------------
export interface FormatDef {
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

export const PRIMARY_FORMATS: FormatDef[] = [
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

export const CORE_FORMATS = PRIMARY_FORMATS.filter(
  (f) => !f.needsCliDecoder && !f.needsHeifDecoder && !f.mayFailValidation,
);

export const ACCEPTABLE_FALLBACK_CODES = [200, 202, 400, 422];

export function needsFallback(fmt: FormatDef): boolean {
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
export function isAsyncFallback(res: { statusCode: number; body: string }): boolean {
  if (res.statusCode !== 202) return false;
  const body = JSON.parse(res.body);
  expect(body.async).toBe(true);
  expect(body.jobId).toBeDefined();
  return true;
}

export function getTimeout(fmt: FormatDef, toolId?: string): number | undefined {
  if ((fmt.needsHeifDecoder || fmt.needsCliDecoder) && toolId === "image-enhancement")
    return 300_000;
  if (fmt.needsHeifDecoder || fmt.needsCliDecoder) return 180_000;
  if (toolId === "image-enhancement") return 120_000;
  return undefined;
}

// ---------------------------------------------------------------------------
// Shared app state
// ---------------------------------------------------------------------------
export let testApp: TestApp;
export let app: TestApp["app"];
export let adminToken: string;

/** Registers the shared beforeAll/afterAll for a part file. */
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

// ---------------------------------------------------------------------------
// Helper: send a tool request and return the response
// ---------------------------------------------------------------------------
export async function callTool(toolId: string, fmt: FormatDef, settings: Record<string, unknown>) {
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
export function assertDownloadResponse(res: { statusCode: number; body: string }, fmt: FormatDef) {
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
