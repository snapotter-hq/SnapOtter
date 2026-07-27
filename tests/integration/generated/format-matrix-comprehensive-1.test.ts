/**
 * Comprehensive cross-format parameterized integration tests, part 1 of 4.
 *
 * Split from format-matrix-comprehensive.test.ts so the parts shard and run in
 * parallel; shared setup and helpers live in
 * ./format-matrix-comprehensive.shared.ts.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fixtureDir } from "../../fixtures/index.js";
import { settleAsyncFallback } from "../settle-job.js";
import { createMultipartPayload } from "../test-server.js";
import {
  ACCEPTABLE_FALLBACK_CODES,
  adminToken,
  app,
  assertDownloadResponse,
  callTool,
  type FormatDef,
  getTimeout,
  needsFallback,
  PRIMARY_FORMATS,
  setupMatrixApp,
} from "./format-matrix-comprehensive.shared.js";

vi.setConfig({ testTimeout: 60_000 });

setupMatrixApp();

describe("Strip-metadata across all 16 primary formats", () => {
  for (const fmt of PRIMARY_FORMATS) {
    it(
      `strips metadata from ${fmt.name}`,
      async () => {
        const res = await callTool("strip-metadata", fmt, { stripAll: true });
        if (!res) return;
        const body = await assertDownloadResponse(res, fmt);

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
            await assertDownloadResponse(res, fmt);
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
            expect([200, 202, 400, 422]).toContain(res.statusCode);
          } else {
            expect(res.statusCode).toBe(200);
          }

          if (await settleAsyncFallback(res)) return;
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
