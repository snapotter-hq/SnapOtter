/**
 * Comprehensive cross-format parameterized integration tests, part 2 of 4.
 *
 * Split from format-matrix-comprehensive.test.ts so the parts shard and run in
 * parallel; shared setup and helpers live in
 * ./format-matrix-comprehensive.shared.ts.
 */

import { describe, expect, it, vi } from "vitest";
import { createMultipartPayload } from "../test-server.js";
import {
  ACCEPTABLE_FALLBACK_CODES,
  adminToken,
  app,
  assertDownloadResponse,
  CORE_FORMATS,
  callTool,
  getTimeout,
  isAsyncFallback,
  needsFallback,
  PRIMARY_FORMATS,
  setupMatrixApp,
} from "./format-matrix-comprehensive.shared.js";

vi.setConfig({ testTimeout: 60_000 });

setupMatrixApp();

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
            if (res.statusCode >= 400) {
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
