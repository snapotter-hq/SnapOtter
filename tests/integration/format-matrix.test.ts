/**
 * Cross-format matrix integration test.
 *
 * For each supported input format, verifies that the most commonly used
 * non-AI tools (resize, convert, info) work correctly via the API.
 *
 * Some formats (PSD, EXR, HDR, TGA, DNG) require CLI decoders (ImageMagick,
 * dcraw) that may not be installed in every test environment. For those
 * formats, the test accepts either 200 or 422 and documents the reason.
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
  // BMP: Sharp can't parse all BMP variants; validation may fail with 400
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
  // JXL: Sharp may not support JXL metadata reading; validation may fail with 400
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
// Shared state
// ---------------------------------------------------------------------------
let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

// Only include formats whose fixture files actually exist
let availableFormats: FormatSample[];

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);

  availableFormats = FORMAT_SAMPLES.filter((fmt) => existsSync(join(FORMATS_DIR, fmt.file)));
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

// ---------------------------------------------------------------------------
// Cross-format matrix
// ---------------------------------------------------------------------------
describe("Cross-format matrix", () => {
  for (const fmt of FORMAT_SAMPLES) {
    describe(`${fmt.name} input (${fmt.file})`, () => {
      // Skip formats whose fixture files don't exist
      const fixturePath = join(FORMATS_DIR, fmt.file);

      // ------------------------------------------------------------------
      // RESIZE: POST /api/v1/tools/resize with width=50, height=50
      // ------------------------------------------------------------------
      it("can be resized", async () => {
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
            content: JSON.stringify({ width: 50, height: 50 }),
          },
        ]);

        const res = await app.inject({
          method: "POST",
          url: "/api/v1/tools/resize",
          headers: {
            authorization: `Bearer ${adminToken}`,
            "content-type": contentType,
          },
          body: payload,
        });

        // CLI-decoded formats may return 422 if ImageMagick / decoder not available.
        // Formats with incomplete Sharp support may return 400 from validation.
        if (fmt.needsCliDecoder || fmt.needsHeifDecoder || fmt.mayFailValidation) {
          expect([200, 400, 422]).toContain(res.statusCode);
        } else {
          expect(res.statusCode).toBe(200);
        }

        if (res.statusCode === 200) {
          const body = JSON.parse(res.body);
          expect(body.downloadUrl).toBeDefined();
          expect(body.processedSize).toBeGreaterThan(0);
        }
      });

      // ------------------------------------------------------------------
      // INFO: POST /api/v1/tools/info — metadata extraction
      // ------------------------------------------------------------------
      it("can get info", async () => {
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
          url: "/api/v1/tools/info",
          headers: {
            authorization: `Bearer ${adminToken}`,
            "content-type": contentType,
          },
          body: payload,
        });

        // CLI-decoded formats may return 422 if decoder not available.
        // Formats with incomplete Sharp support may return 400 from validation.
        if (fmt.needsCliDecoder || fmt.needsHeifDecoder || fmt.mayFailValidation) {
          expect([200, 400, 422]).toContain(res.statusCode);
        } else {
          expect(res.statusCode).toBe(200);
        }

        if (res.statusCode === 200) {
          const body = JSON.parse(res.body);
          expect(body.width).toBeGreaterThan(0);
          expect(body.height).toBeGreaterThan(0);
          expect(body.fileSize).toBeGreaterThan(0);
          expect(body.format).toBeDefined();
        }
      });

      // ------------------------------------------------------------------
      // CONVERT: POST /api/v1/tools/convert to PNG output
      // (Skip if input is already PNG)
      // ------------------------------------------------------------------
      if (fmt.name !== "PNG") {
        it("can be converted to PNG", async () => {
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
            body: payload,
          });

          // CLI-decoded formats may return 422 if decoder not available.
          // Formats with incomplete Sharp support may return 400 from validation.
          if (fmt.needsCliDecoder || fmt.needsHeifDecoder || fmt.mayFailValidation) {
            expect([200, 400, 422]).toContain(res.statusCode);
          } else {
            expect(res.statusCode).toBe(200);
          }

          if (res.statusCode === 200) {
            const body = JSON.parse(res.body);
            expect(body.downloadUrl).toContain(".png");
            expect(body.processedSize).toBeGreaterThan(0);
          }
        });
      }
    });
  }
});
