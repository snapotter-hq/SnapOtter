/**
 * Cross-format matrix, part 4 of 4 (see format-matrix.shared.ts).
 *
 * Holds the conversion, watermark-image and image-to-pdf blocks. Split out of
 * format-matrix.test.ts because vitest shards by file and runs a file's tests
 * serially in one fork.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fixtureDir, fixtures } from "../../fixtures/index.js";
import { settleAsyncFallback } from "../settle-job.js";
import { createMultipartPayload } from "../test-server.js";
import {
  ACCEPTABLE_FALLBACK_CODES,
  adminToken,
  app,
  FORMAT_SAMPLES,
  needsFallback,
  setupMatrixApp,
} from "./format-matrix.shared.js";

setupMatrixApp();

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

      const testTimeout = outFmt === "avif" ? 120_000 : 120_000;
      it(`${fmt.name} -> ${outFmt}`, { timeout: testTimeout }, async () => {
        const fixturePath = join(fixtureDir.formats, fmt.file);
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
          url: "/api/v1/tools/image/convert",
          headers: {
            authorization: `Bearer ${adminToken}`,
            "content-type": contentType,
          },
          body: payload,
        });

        if (await settleAsyncFallback(res)) return;
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
// Watermark-image cross-format matrix
//
// watermark-image requires TWO file uploads (file + watermark), so it cannot
// use the standard TOOLS/buildPayload path. We test each input format as the
// main image with a fixed PNG watermark, and also each format as the watermark
// image with a fixed PNG main image.
// ---------------------------------------------------------------------------
describe("Watermark-image cross-format matrix", () => {
  // Use the PNG fixture as the known-good counterpart
  const PNG_PATH = fixtures.image.formats("png");

  describe("format as main image (watermark is PNG)", () => {
    for (const fmt of FORMAT_SAMPLES) {
      const perTestTimeout = fmt.needsHeifDecoder || fmt.needsCliDecoder ? 180_000 : 60_000;

      it(
        `${fmt.name} main image with PNG watermark`,
        async () => {
          const fixturePath = join(fixtureDir.formats, fmt.file);
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
            url: "/api/v1/tools/image/watermark-image",
            headers: {
              authorization: `Bearer ${adminToken}`,
              "content-type": contentType,
            },
            body: payload,
          });

          if (await settleAsyncFallback(res)) return;
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
      const perTestTimeout = fmt.needsHeifDecoder || fmt.needsCliDecoder ? 180_000 : 60_000;

      it(
        `PNG main image with ${fmt.name} watermark`,
        async () => {
          const fixturePath = join(fixtureDir.formats, fmt.file);
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
            url: "/api/v1/tools/image/watermark-image",
            headers: {
              authorization: `Bearer ${adminToken}`,
              "content-type": contentType,
            },
            body: payload,
          });

          if (await settleAsyncFallback(res)) return;
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
          const fixturePath = join(fixtureDir.formats, fmt.file);
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
            url: "/api/v1/tools/image/watermark-image",
            headers: {
              authorization: `Bearer ${adminToken}`,
              "content-type": contentType,
            },
            body: payload,
          });

          if (await settleAsyncFallback(res)) return;
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
      const perTestTimeout = fmt.needsHeifDecoder || fmt.needsCliDecoder ? 180_000 : 60_000;

      it(
        `converts ${fmt.name} to PDF`,
        async () => {
          const fixturePath = join(fixtureDir.formats, fmt.file);
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
            url: "/api/v1/tools/image/image-to-pdf",
            headers: {
              authorization: `Bearer ${adminToken}`,
              "content-type": contentType,
            },
            body: payload,
          });

          if (await settleAsyncFallback(res)) return;
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
          const fixturePath = join(fixtureDir.formats, fmt.file);
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
            url: "/api/v1/tools/image/image-to-pdf",
            headers: {
              authorization: `Bearer ${adminToken}`,
              "content-type": contentType,
            },
            body: payload,
          });

          if (await settleAsyncFallback(res)) return;
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
        const fixturePath = join(fixtureDir.formats, fmt.file);
        const pngPath = fixtures.image.formats("png");
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
          url: "/api/v1/tools/image/image-to-pdf",
          headers: {
            authorization: `Bearer ${adminToken}`,
            "content-type": contentType,
          },
          body: payload,
        });

        if (await settleAsyncFallback(res)) return;
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.pages).toBe(2);
        expect(body.processedSize).toBeGreaterThan(0);
      });
    }
  });

  describe("multipage TIFF to PDF", () => {
    const multipagePath = fixtures.image.multipageTiff;

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
        url: "/api/v1/tools/image/image-to-pdf",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        body: payload,
      });

      expect([200, 202, 400, 422]).toContain(res.statusCode);

      if (await settleAsyncFallback(res)) return;
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
        const fixturePath = join(fixtureDir.formats, fmt.file);
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
          url: "/api/v1/tools/image/image-to-pdf",
          headers: {
            authorization: `Bearer ${adminToken}`,
            "content-type": contentType,
          },
          body: payload,
        });

        // Must not crash with 500
        if (await settleAsyncFallback(res)) return;
        if (await settleAsyncFallback(res)) return;
        expect(res.statusCode).not.toBe(500);
        expect([200, 202, 400, 422]).toContain(res.statusCode);

        const body = JSON.parse(res.body);
        if (res.statusCode >= 400) {
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
  const PNG_PATH = fixtures.image.formats("png");

  describe("exotic format as main image", () => {
    for (const fmt of EXOTIC_FORMATS) {
      it(`${fmt.name} main + PNG watermark: no crash`, async () => {
        const fixturePath = join(fixtureDir.formats, fmt.file);
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
          url: "/api/v1/tools/image/watermark-image",
          headers: {
            authorization: `Bearer ${adminToken}`,
            "content-type": contentType,
          },
          body: payload,
        });

        expect(res.statusCode).not.toBe(500);
        expect([200, 202, 400, 422]).toContain(res.statusCode);

        const body = JSON.parse(res.body);
        if (res.statusCode >= 400) {
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
        const fixturePath = join(fixtureDir.formats, fmt.file);
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
          url: "/api/v1/tools/image/watermark-image",
          headers: {
            authorization: `Bearer ${adminToken}`,
            "content-type": contentType,
          },
          body: payload,
        });

        if (await settleAsyncFallback(res)) return;
        expect(res.statusCode).not.toBe(500);
        expect([200, 202, 400, 422]).toContain(res.statusCode);

        const body = JSON.parse(res.body);
        if (res.statusCode >= 400) {
          expect(body.error).toBeDefined();
          expect(typeof body.error).toBe("string");
          expect(body.error.length).toBeGreaterThan(0);
        }
      });
    }
  });
});
