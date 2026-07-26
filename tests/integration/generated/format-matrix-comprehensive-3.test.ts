/**
 * Comprehensive cross-format parameterized integration tests, part 3 of 4.
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
  type FormatDef,
  getTimeout,
  needsFallback,
  PRIMARY_FORMATS,
  setupMatrixApp,
} from "./format-matrix-comprehensive.shared.js";

vi.setConfig({ testTimeout: 60_000 });

setupMatrixApp();

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
          expect([200, 202, 400, 422]).toContain(res.statusCode);

          // Response must be valid JSON (not HTML, not raw text)
          let body: Record<string, unknown>;
          try {
            body = JSON.parse(res.body);
          } catch {
            throw new Error(
              `${fmt.name} + ${tool.id}: response is not valid JSON: ${res.body.slice(0, 200)}`,
            );
          }

          if (res.statusCode >= 400) {
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
            expect([200, 202, 400, 422]).toContain(res.statusCode);

            const body = JSON.parse(res.body);
            if (res.statusCode >= 400) {
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
      expect([200, 202, 400, 422]).toContain(res.statusCode);

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
