/**
 * Comprehensive cross-format parameterized integration tests, part 4 of 4.
 *
 * Split from format-matrix-comprehensive.test.ts so the parts shard and run in
 * parallel; shared setup and helpers live in
 * ./format-matrix-comprehensive.shared.ts.
 */

import { describe, expect, it, vi } from "vitest";
import {
  assertDownloadResponse,
  CORE_FORMATS,
  callTool,
  type FormatDef,
  getTimeout,
  isAsyncFallback,
  PRIMARY_FORMATS,
  setupMatrixApp,
} from "./format-matrix-comprehensive.shared.js";

vi.setConfig({ testTimeout: 60_000 });

setupMatrixApp();

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

        const testTimeout = target.format === "avif" || target.format === "gif" ? 120_000 : 120_000;
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
      expect([200, 202, 400, 422]).toContain(res.statusCode);

      const body = JSON.parse(res.body);
      if (res.statusCode >= 400) {
        expect(body.error).toBeDefined();
        expect(typeof body.error).toBe("string");
      }
    }, 180_000);
  }
});
