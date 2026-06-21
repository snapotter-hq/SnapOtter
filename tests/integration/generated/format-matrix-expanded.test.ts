/**
 * Expanded cross-format matrix integration tests.
 *
 * Covers tools NOT tested in format-matrix.test.ts or format-matrix-ai.test.ts:
 *
 *   Single-file tools:
 *     - color-blindness   (createToolRoute factory, standard response)
 *     - beautify           (custom route, download response)
 *     - edit-metadata      (custom route + /inspect endpoint)
 *     - vectorize          (custom route, raster -> SVG)
 *     - split              (custom route, streams ZIP)
 *     - favicon            (custom route, streams ZIP)
 *     - meme-generator     (custom route, download response)
 *     - barcode-read       (custom route, JSON result)
 *
 *   Multi-file tools (tested with pairs of format fixtures):
 *     - compose            (base + overlay)
 *     - compare            (image A + image B)
 *     - collage            (2+ images, template-based)
 *     - stitch             (2+ images, horizontal/vertical join)
 *
 *   SVG-only tool:
 *     - svg-to-raster      (only accepts SVG input)
 *
 *   AI tool with 501 guard:
 *     - transparency-fixer (returns 501 when AI sidecar is not installed)
 *
 * For exotic formats (PSD, EXR, HDR, TGA, DNG, ICO, JXL, etc.) the test
 * accepts both success (200) and graceful errors (400, 422) since CLI
 * decoders may not be installed. For HEIC/HEIF the test accepts 422 when
 * libheif is unavailable. No tool should ever return 500 (server crash).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtureDir, fixtures } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

// ---------------------------------------------------------------------------
// Format sample definitions (subset relevant to the expanded tools)
// ---------------------------------------------------------------------------
interface FormatSample {
  name: string;
  file: string;
  mime: string;
  needsCliDecoder: boolean;
  needsHeifDecoder: boolean;
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

/** Core formats: natively readable by Sharp without CLI decoders */
const CORE_FORMATS = FORMAT_SAMPLES.filter(
  (f) => !f.needsCliDecoder && !f.needsHeifDecoder && !f.mayFailValidation,
);

/** Exotic formats: need CLI decoders or HEIF support */
const EXOTIC_FORMATS = FORMAT_SAMPLES.filter(
  (f) => f.needsCliDecoder || f.needsHeifDecoder || f.mayFailValidation,
);

/** Status codes we accept for formats that may lack decoder support */
const ACCEPTABLE_FALLBACK_CODES = [200, 400, 422];

function needsFallback(fmt: FormatSample): boolean {
  return fmt.needsCliDecoder || fmt.needsHeifDecoder || fmt.mayFailValidation;
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
// 1. Color-blindness simulation x all formats
//
// Uses createToolRoute factory, returns standard download response.
// ---------------------------------------------------------------------------
describe("Color-blindness simulation cross-format", () => {
  for (const fmt of FORMAT_SAMPLES) {
    const perTestTimeout = fmt.needsHeifDecoder || fmt.needsCliDecoder ? 180_000 : undefined;

    it(
      `processes ${fmt.name} input`,
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
              simulationType: "deuteranomaly",
            }),
          },
        ]);

        const res = await app.inject({
          method: "POST",
          url: "/api/v1/tools/image/color-blindness",
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

// ---------------------------------------------------------------------------
// 2. Beautify x all formats
//
// Custom route, accepts main image + optional background image.
// Returns standard {downloadUrl, processedSize} response.
// ---------------------------------------------------------------------------
describe("Beautify cross-format", () => {
  for (const fmt of FORMAT_SAMPLES) {
    const perTestTimeout = fmt.needsHeifDecoder || fmt.needsCliDecoder ? 180_000 : undefined;

    it(
      `processes ${fmt.name} input`,
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
              padding: 20,
              borderRadius: 8,
              backgroundType: "solid",
              backgroundColor: "#f0f0f0",
            }),
          },
        ]);

        const res = await app.inject({
          method: "POST",
          url: "/api/v1/tools/image/beautify",
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

// ---------------------------------------------------------------------------
// 3. Edit-metadata x all formats
//
// Custom route. Also tests the /inspect endpoint.
// Edit-metadata writes EXIF tags in-place using ExifTool.
// ---------------------------------------------------------------------------
describe("Edit-metadata cross-format", () => {
  describe("edit endpoint", () => {
    for (const fmt of FORMAT_SAMPLES) {
      const perTestTimeout = fmt.needsHeifDecoder || fmt.needsCliDecoder ? 180_000 : undefined;

      it(
        `edits metadata in ${fmt.name} input`,
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
                title: "Test Title",
                author: "Test Author",
              }),
            },
          ]);

          const res = await app.inject({
            method: "POST",
            url: "/api/v1/tools/image/edit-metadata",
            headers: {
              authorization: `Bearer ${adminToken}`,
              "content-type": contentType,
            },
            body: payload,
          });

          if (needsFallback(fmt)) {
            expect(ACCEPTABLE_FALLBACK_CODES).toContain(res.statusCode);
          } else {
            // edit-metadata may also fail with 422 if ExifTool is not installed
            expect([200, 400, 422]).toContain(res.statusCode);
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

  describe("inspect endpoint", () => {
    for (const fmt of FORMAT_SAMPLES) {
      const perTestTimeout = fmt.needsHeifDecoder || fmt.needsCliDecoder ? 180_000 : undefined;

      it(
        `inspects ${fmt.name} metadata`,
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
          ]);

          const res = await app.inject({
            method: "POST",
            url: "/api/v1/tools/image/edit-metadata/inspect",
            headers: {
              authorization: `Bearer ${adminToken}`,
              "content-type": contentType,
            },
            body: payload,
          });

          // Inspect uses ExifTool, which may not be installed; accept clean errors
          expect(res.statusCode).not.toBe(500);
          expect([200, 400, 422]).toContain(res.statusCode);

          const body = JSON.parse(res.body);
          if (res.statusCode === 200) {
            // inspect returns metadata fields; at minimum it is an object
            expect(typeof body).toBe("object");
          } else {
            expect(body.error).toBeDefined();
            expect(typeof body.error).toBe("string");
          }
        },
        perTestTimeout,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Vectorize x all formats
//
// Custom route: converts raster image to SVG via potrace/vtracer.
// Returns {downloadUrl, processedSize} with an SVG output.
// ---------------------------------------------------------------------------
describe("Vectorize cross-format", () => {
  for (const fmt of FORMAT_SAMPLES) {
    const perTestTimeout = fmt.needsHeifDecoder || fmt.needsCliDecoder ? 180_000 : undefined;

    it(
      `vectorizes ${fmt.name} input`,
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
            content: JSON.stringify({ colorMode: "bw", threshold: 128 }),
          },
        ]);

        const res = await app.inject({
          method: "POST",
          url: "/api/v1/tools/image/vectorize",
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
          expect(body.downloadUrl).toContain(".svg");
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

// ---------------------------------------------------------------------------
// 5. Split x core formats
//
// Custom route that streams a ZIP response (reply.hijack).
// We verify the HTTP status is 200 and content-type is application/zip.
// Only tested against core formats since the ZIP streaming response
// prevents JSON error parsing on failure.
// ---------------------------------------------------------------------------
describe("Split cross-format", () => {
  for (const fmt of CORE_FORMATS) {
    it(`splits ${fmt.name} into grid tiles`, async () => {
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
          content: JSON.stringify({ columns: 2, rows: 2 }),
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/split",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        body: payload,
      });

      // Split streams a ZIP, so 200 means the archive was successfully created
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("application/zip");
    });
  }

  // Exotic formats: should not crash
  for (const fmt of EXOTIC_FORMATS) {
    const perTestTimeout = fmt.needsHeifDecoder || fmt.needsCliDecoder ? 180_000 : undefined;

    it(
      `${fmt.name}: no server crash`,
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
            content: JSON.stringify({ columns: 2, rows: 2 }),
          },
        ]);

        const res = await app.inject({
          method: "POST",
          url: "/api/v1/tools/image/split",
          headers: {
            authorization: `Bearer ${adminToken}`,
            "content-type": contentType,
          },
          body: payload,
        });

        // Must not crash. Accept 200 (ZIP streamed) or 422 (clean error)
        expect(res.statusCode).not.toBe(500);
        expect([200, 400, 422]).toContain(res.statusCode);
      },
      perTestTimeout,
    );
  }
});

// ---------------------------------------------------------------------------
// 6. Favicon x core formats
//
// Custom route that streams a ZIP response with favicon variants.
// Only tested against core formats since it hijacks the response.
// ---------------------------------------------------------------------------
describe("Favicon cross-format", () => {
  for (const fmt of CORE_FORMATS) {
    it(`generates favicons from ${fmt.name} input`, async () => {
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
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/favicon",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        body: payload,
      });

      // Favicon streams a ZIP
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("application/zip");
    });
  }

  // NOTE: Exotic format error resilience is not tested for favicon because
  // the route uses reply.hijack() to stream ZIP output. When Sharp fails
  // mid-stream on an exotic format, the archive never finalizes and
  // app.inject() hangs indefinitely. The error path is still safe (the
  // route's try/catch returns 422 before hijack if decoding fails early),
  // but mid-stream failures are inherently untestable via inject().
});

// ---------------------------------------------------------------------------
// 7. Meme-generator x core formats
//
// Custom route, returns {downloadUrl, processedSize}.
// Uses text overlays rendered via SVG compositing.
// ---------------------------------------------------------------------------
describe("Meme-generator cross-format", () => {
  for (const fmt of FORMAT_SAMPLES) {
    const perTestTimeout = fmt.needsHeifDecoder || fmt.needsCliDecoder ? 180_000 : undefined;

    it(
      `generates meme from ${fmt.name} input`,
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
              textLayout: "top-bottom",
              textBoxes: [
                { id: "top", text: "TOP TEXT" },
                { id: "bottom", text: "BOTTOM TEXT" },
              ],
            }),
          },
        ]);

        const res = await app.inject({
          method: "POST",
          url: "/api/v1/tools/image/meme-generator",
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

// ---------------------------------------------------------------------------
// 8. Barcode-read x core formats
//
// Custom route. Returns JSON with barcode scan results and optional overlay.
// Images without barcodes should still return 200 with empty results.
// ---------------------------------------------------------------------------
describe("Barcode-read cross-format", () => {
  for (const fmt of FORMAT_SAMPLES) {
    const perTestTimeout = fmt.needsHeifDecoder || fmt.needsCliDecoder ? 180_000 : undefined;

    it(
      `scans ${fmt.name} input for barcodes`,
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
            content: JSON.stringify({ tryHarder: true }),
          },
        ]);

        const res = await app.inject({
          method: "POST",
          url: "/api/v1/tools/image/barcode-read",
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
          // barcode-read returns { barcodes: [...], overlayUrl?, width, height }
          expect(typeof body).toBe("object");
          // The fixture images likely have no barcodes, so barcodes array
          // should be empty -- but the response must be well-formed
          if (body.barcodes !== undefined) {
            expect(Array.isArray(body.barcodes)).toBe(true);
          }
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

// ---------------------------------------------------------------------------
// 9. SVG-to-raster (SVG-only tool)
//
// Only accepts SVG input. Non-SVG formats should be rejected with 400.
// ---------------------------------------------------------------------------
describe("SVG-to-raster", () => {
  it("converts SVG to PNG", async () => {
    const fixturePath = fixtures.image.formats("svg");
    if (!existsSync(fixturePath)) return;

    const buffer = readFileSync(fixturePath);
    const { body: payload, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "sample.svg",
        contentType: "image/svg+xml",
        content: buffer,
      },
      {
        name: "settings",
        content: JSON.stringify({
          outputFormat: "png",
          width: 200,
          dpi: 150,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/svg-to-raster",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body: payload,
    });

    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    expect(body.downloadUrl).toBeDefined();
    expect(typeof body.downloadUrl).toBe("string");
    expect(body.processedSize).toBeGreaterThan(0);
  });

  // Test multiple output formats from SVG
  const SVG_OUTPUT_FORMATS = ["png", "jpg", "webp", "avif"] as const;

  for (const outFmt of SVG_OUTPUT_FORMATS) {
    const testTimeout = outFmt === "avif" ? 120_000 : 30_000;
    it(`converts SVG to ${outFmt}`, { timeout: testTimeout }, async () => {
      const fixturePath = fixtures.image.formats("svg");
      if (!existsSync(fixturePath)) return;

      const buffer = readFileSync(fixturePath);
      const { body: payload, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: "sample.svg",
          contentType: "image/svg+xml",
          content: buffer,
        },
        {
          name: "settings",
          content: JSON.stringify({ outputFormat: outFmt }),
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/svg-to-raster",
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

  // Non-SVG formats should be rejected
  const NON_SVG_FORMATS = FORMAT_SAMPLES.filter(
    (f) => f.name !== "SVG" && !f.needsCliDecoder && !f.needsHeifDecoder,
  );

  for (const fmt of NON_SVG_FORMATS) {
    it(`rejects ${fmt.name} input with 400`, async () => {
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
          content: JSON.stringify({ outputFormat: "png" }),
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/svg-to-raster",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        body: payload,
      });

      expect(res.statusCode).toBe(400);

      const body = JSON.parse(res.body);
      expect(body.error).toBeDefined();
      expect(typeof body.error).toBe("string");
    });
  }
});

// ---------------------------------------------------------------------------
// 10. Compose (multi-file) x core formats
//
// Requires two files: base image + overlay image. Tests each core format
// as the base image with a fixed PNG overlay, and vice versa.
// ---------------------------------------------------------------------------
describe("Compose cross-format", () => {
  const PNG_PATH = fixtures.image.formats("png");

  describe("format as base image (overlay is PNG)", () => {
    for (const fmt of CORE_FORMATS) {
      it(`${fmt.name} base + PNG overlay`, async () => {
        const fixturePath = join(fixtureDir.formats, fmt.file);
        if (!existsSync(fixturePath) || !existsSync(PNG_PATH)) return;

        const baseBuffer = readFileSync(fixturePath);
        const overlayBuffer = readFileSync(PNG_PATH);

        const { body: payload, contentType } = createMultipartPayload([
          {
            name: "file",
            filename: fmt.file,
            contentType: fmt.mime,
            content: baseBuffer,
          },
          {
            name: "overlay",
            filename: "sample.png",
            contentType: "image/png",
            content: overlayBuffer,
          },
          {
            name: "settings",
            content: JSON.stringify({
              x: 0,
              y: 0,
              opacity: 50,
              blendMode: "over",
            }),
          },
        ]);

        const res = await app.inject({
          method: "POST",
          url: "/api/v1/tools/image/compose",
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
  });

  describe("format as overlay image (base is PNG)", () => {
    for (const fmt of CORE_FORMATS) {
      // Skip PNG-on-PNG (redundant with the reverse test)
      if (fmt.name === "PNG") continue;

      it(`PNG base + ${fmt.name} overlay`, async () => {
        const fixturePath = join(fixtureDir.formats, fmt.file);
        if (!existsSync(fixturePath) || !existsSync(PNG_PATH)) return;

        const baseBuffer = readFileSync(PNG_PATH);
        const overlayBuffer = readFileSync(fixturePath);

        const { body: payload, contentType } = createMultipartPayload([
          {
            name: "file",
            filename: "sample.png",
            contentType: "image/png",
            content: baseBuffer,
          },
          {
            name: "overlay",
            filename: fmt.file,
            contentType: fmt.mime,
            content: overlayBuffer,
          },
          {
            name: "settings",
            content: JSON.stringify({
              x: 0,
              y: 0,
              opacity: 75,
              blendMode: "multiply",
            }),
          },
        ]);

        const res = await app.inject({
          method: "POST",
          url: "/api/v1/tools/image/compose",
          headers: {
            authorization: `Bearer ${adminToken}`,
            "content-type": contentType,
          },
          body: payload,
        });

        // Overlay compositing with opacity < 100 can fail for some formats
        // (e.g., WebP, AVIF) due to alpha channel handling in Sharp.
        // Accept 200 (success) or 422 (processing error) for core formats.
        expect([200, 422]).toContain(res.statusCode);

        if (res.statusCode === 200) {
          const body = JSON.parse(res.body);
          expect(body.downloadUrl).toBeDefined();
          expect(body.processedSize).toBeGreaterThan(0);
        } else {
          const body = JSON.parse(res.body);
          expect(body.error).toBeDefined();
          expect(typeof body.error).toBe("string");
        }
      });
    }
  });

  // Exotic format error resilience
  describe("exotic format as base (no crash)", () => {
    for (const fmt of EXOTIC_FORMATS) {
      const perTestTimeout = fmt.needsHeifDecoder || fmt.needsCliDecoder ? 180_000 : undefined;

      it(
        `${fmt.name} base + PNG overlay: no crash`,
        async () => {
          const fixturePath = join(fixtureDir.formats, fmt.file);
          if (!existsSync(fixturePath) || !existsSync(PNG_PATH)) return;

          const baseBuffer = readFileSync(fixturePath);
          const overlayBuffer = readFileSync(PNG_PATH);

          const { body: payload, contentType } = createMultipartPayload([
            {
              name: "file",
              filename: fmt.file,
              contentType: fmt.mime,
              content: baseBuffer,
            },
            {
              name: "overlay",
              filename: "sample.png",
              contentType: "image/png",
              content: overlayBuffer,
            },
            {
              name: "settings",
              content: JSON.stringify({ x: 0, y: 0, opacity: 50 }),
            },
          ]);

          const res = await app.inject({
            method: "POST",
            url: "/api/v1/tools/image/compose",
            headers: {
              authorization: `Bearer ${adminToken}`,
              "content-type": contentType,
            },
            body: payload,
          });

          expect(res.statusCode).not.toBe(500);
          expect([200, 400, 422]).toContain(res.statusCode);
        },
        perTestTimeout,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 11. Compare (multi-file) x core formats
//
// Requires two files: image A + image B.
// Tests comparing each core format against PNG.
// ---------------------------------------------------------------------------
describe("Compare cross-format", () => {
  const PNG_PATH = fixtures.image.formats("png");

  for (const fmt of CORE_FORMATS) {
    it(`compares ${fmt.name} with PNG`, async () => {
      const fixturePath = join(fixtureDir.formats, fmt.file);
      if (!existsSync(fixturePath) || !existsSync(PNG_PATH)) return;

      const bufferA = readFileSync(fixturePath);
      const bufferB = readFileSync(PNG_PATH);

      const { body: payload, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: fmt.file,
          contentType: fmt.mime,
          content: bufferA,
        },
        {
          name: "file",
          filename: "sample.png",
          contentType: "image/png",
          content: bufferB,
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/compare",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        body: payload,
      });

      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.body);
      // Compare returns similarity metrics and diff image
      expect(typeof body).toBe("object");
      if (body.similarity !== undefined) {
        expect(typeof body.similarity).toBe("number");
      }
    });
  }

  // Exotic format error resilience
  for (const fmt of EXOTIC_FORMATS) {
    const perTestTimeout = fmt.needsHeifDecoder || fmt.needsCliDecoder ? 180_000 : undefined;

    it(
      `${fmt.name} vs PNG: no crash`,
      async () => {
        const fixturePath = join(fixtureDir.formats, fmt.file);
        if (!existsSync(fixturePath) || !existsSync(PNG_PATH)) return;

        const bufferA = readFileSync(fixturePath);
        const bufferB = readFileSync(PNG_PATH);

        const { body: payload, contentType } = createMultipartPayload([
          {
            name: "file",
            filename: fmt.file,
            contentType: fmt.mime,
            content: bufferA,
          },
          {
            name: "file",
            filename: "sample.png",
            contentType: "image/png",
            content: bufferB,
          },
        ]);

        const res = await app.inject({
          method: "POST",
          url: "/api/v1/tools/image/compare",
          headers: {
            authorization: `Bearer ${adminToken}`,
            "content-type": contentType,
          },
          body: payload,
        });

        expect(res.statusCode).not.toBe(500);
        expect([200, 400, 422]).toContain(res.statusCode);
      },
      perTestTimeout,
    );
  }
});

// ---------------------------------------------------------------------------
// 12. Collage (multi-file) x core formats
//
// Requires 2+ images and a template. Tests pairing each core format
// with a PNG fixture in a 2-image collage.
// ---------------------------------------------------------------------------
describe("Collage cross-format", () => {
  const PNG_PATH = fixtures.image.formats("png");

  for (const fmt of CORE_FORMATS) {
    // Skip PNG + PNG (trivial)
    if (fmt.name === "PNG") continue;

    it(`${fmt.name} + PNG in 2-image collage`, async () => {
      const fixturePath = join(fixtureDir.formats, fmt.file);
      if (!existsSync(fixturePath) || !existsSync(PNG_PATH)) return;

      const fmtBuffer = readFileSync(fixturePath);
      const pngBuffer = readFileSync(PNG_PATH);

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
          content: JSON.stringify({
            templateId: "2-h-equal",
            gap: 4,
            outputFormat: "png",
          }),
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/collage",
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

  // Exotic format resilience
  for (const fmt of EXOTIC_FORMATS) {
    const perTestTimeout = fmt.needsHeifDecoder || fmt.needsCliDecoder ? 180_000 : undefined;

    it(
      `${fmt.name} + PNG collage: no crash`,
      async () => {
        const fixturePath = join(fixtureDir.formats, fmt.file);
        if (!existsSync(fixturePath) || !existsSync(PNG_PATH)) return;

        const fmtBuffer = readFileSync(fixturePath);
        const pngBuffer = readFileSync(PNG_PATH);

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
            content: JSON.stringify({
              templateId: "2-h-equal",
              gap: 4,
              outputFormat: "png",
            }),
          },
        ]);

        const res = await app.inject({
          method: "POST",
          url: "/api/v1/tools/image/collage",
          headers: {
            authorization: `Bearer ${adminToken}`,
            "content-type": contentType,
          },
          body: payload,
        });

        expect(res.statusCode).not.toBe(500);
        expect([200, 400, 422]).toContain(res.statusCode);
      },
      perTestTimeout,
    );
  }
});

// ---------------------------------------------------------------------------
// 13. Stitch (multi-file) x core formats
//
// Requires 2+ images. Tests stitching each core format with a PNG fixture.
// ---------------------------------------------------------------------------
describe("Stitch cross-format", () => {
  const PNG_PATH = fixtures.image.formats("png");

  for (const fmt of CORE_FORMATS) {
    // Skip PNG + PNG (trivial)
    if (fmt.name === "PNG") continue;

    it(`stitches ${fmt.name} + PNG horizontally`, async () => {
      const fixturePath = join(fixtureDir.formats, fmt.file);
      if (!existsSync(fixturePath) || !existsSync(PNG_PATH)) return;

      const fmtBuffer = readFileSync(fixturePath);
      const pngBuffer = readFileSync(PNG_PATH);

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
          content: JSON.stringify({
            direction: "horizontal",
            resizeMode: "fit",
            format: "png",
          }),
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/stitch",
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

  // Exotic format resilience
  for (const fmt of EXOTIC_FORMATS) {
    const perTestTimeout = fmt.needsHeifDecoder || fmt.needsCliDecoder ? 180_000 : undefined;

    it(
      `${fmt.name} + PNG stitch: no crash`,
      async () => {
        const fixturePath = join(fixtureDir.formats, fmt.file);
        if (!existsSync(fixturePath) || !existsSync(PNG_PATH)) return;

        const fmtBuffer = readFileSync(fixturePath);
        const pngBuffer = readFileSync(PNG_PATH);

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
            content: JSON.stringify({
              direction: "horizontal",
              resizeMode: "fit",
              format: "png",
            }),
          },
        ]);

        const res = await app.inject({
          method: "POST",
          url: "/api/v1/tools/image/stitch",
          headers: {
            authorization: `Bearer ${adminToken}`,
            "content-type": contentType,
          },
          body: payload,
        });

        expect(res.statusCode).not.toBe(500);
        expect([200, 400, 422]).toContain(res.statusCode);
      },
      perTestTimeout,
    );
  }
});

// ---------------------------------------------------------------------------
// 14. Transparency-fixer (AI tool with 501 guard) x formats
//
// Returns 501 when AI sidecar is not installed.
// Tests that the validation layer works correctly for all formats.
// ---------------------------------------------------------------------------
describe("Transparency-fixer cross-format", () => {
  for (const fmt of FORMAT_SAMPLES) {
    const perTestTimeout = fmt.needsHeifDecoder || fmt.needsCliDecoder ? 180_000 : undefined;

    it(
      `${fmt.name}: returns 501 or accepts input`,
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
            content: JSON.stringify({ defringe: 30, outputFormat: "png" }),
          },
        ]);

        const res = await app.inject({
          method: "POST",
          url: "/api/v1/tools/image/transparency-fixer",
          headers: {
            authorization: `Bearer ${adminToken}`,
            "content-type": contentType,
          },
          body: payload,
        });

        // Must never crash
        expect(res.statusCode).not.toBe(500);

        // Acceptable: 200 (sync success), 202 (async accepted), 400 (bad input),
        // 422 (processing error), 501 (AI not installed)
        expect([200, 202, 400, 422, 501]).toContain(res.statusCode);

        const body = JSON.parse(res.body);
        if (res.statusCode === 501) {
          expect(body.code).toBe("FEATURE_NOT_INSTALLED");
          expect(body.error).toBeDefined();
        } else if (res.statusCode === 202) {
          expect(body.jobId).toBeDefined();
          expect(body.async).toBe(true);
        } else if (res.statusCode !== 200) {
          expect(body.error).toBeDefined();
          expect(typeof body.error).toBe("string");
        }
      },
      perTestTimeout,
    );
  }
});

// ---------------------------------------------------------------------------
// 15. Color-blindness simulation types x JPEG
//
// Verifies each simulation type works correctly with a single core format.
// ---------------------------------------------------------------------------
describe("Color-blindness simulation types", () => {
  const SIMULATION_TYPES = [
    "protanopia",
    "deuteranopia",
    "tritanopia",
    "protanomaly",
    "deuteranomaly",
    "tritanomaly",
    "achromatopsia",
    "blueConeMonochromacy",
  ] as const;

  for (const simType of SIMULATION_TYPES) {
    it(`simulation: ${simType}`, async () => {
      const fixturePath = fixtures.image.formats("jpg");
      if (!existsSync(fixturePath)) return;

      const buffer = readFileSync(fixturePath);
      const { body: payload, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: "sample.jpg",
          contentType: "image/jpeg",
          content: buffer,
        },
        {
          name: "settings",
          content: JSON.stringify({ simulationType: simType }),
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/color-blindness",
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
});

// ---------------------------------------------------------------------------
// 16. Vectorize color mode variants x JPEG
//
// Verifies both BW and color vectorization modes.
// ---------------------------------------------------------------------------
describe("Vectorize color modes", () => {
  it("BW mode", async () => {
    const fixturePath = fixtures.image.formats("jpg");
    if (!existsSync(fixturePath)) return;

    const buffer = readFileSync(fixturePath);
    const { body: payload, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "sample.jpg",
        contentType: "image/jpeg",
        content: buffer,
      },
      {
        name: "settings",
        content: JSON.stringify({
          colorMode: "bw",
          threshold: 128,
          pathMode: "spline",
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body: payload,
    });

    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    expect(body.downloadUrl).toContain(".svg");
    expect(body.processedSize).toBeGreaterThan(0);
  });

  it("color mode", async () => {
    const fixturePath = fixtures.image.formats("jpg");
    if (!existsSync(fixturePath)) return;

    const buffer = readFileSync(fixturePath);
    const { body: payload, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "sample.jpg",
        contentType: "image/jpeg",
        content: buffer,
      },
      {
        name: "settings",
        content: JSON.stringify({
          colorMode: "color",
          colorPrecision: 4,
          layerDifference: 8,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body: payload,
    });

    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    expect(body.downloadUrl).toContain(".svg");
    expect(body.processedSize).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 17. Compose blend modes x JPEG
//
// Verifies each blend mode works correctly.
// ---------------------------------------------------------------------------
describe("Compose blend modes", () => {
  const BLEND_MODES = ["over", "multiply", "screen", "overlay", "darken", "lighten"] as const;

  const PNG_PATH = fixtures.image.formats("png");

  for (const blendMode of BLEND_MODES) {
    it(`blend mode: ${blendMode}`, async () => {
      const jpgPath = fixtures.image.formats("jpg");
      if (!existsSync(jpgPath) || !existsSync(PNG_PATH)) return;

      const baseBuffer = readFileSync(jpgPath);
      const overlayBuffer = readFileSync(PNG_PATH);

      const { body: payload, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: "sample.jpg",
          contentType: "image/jpeg",
          content: baseBuffer,
        },
        {
          name: "overlay",
          filename: "sample.png",
          contentType: "image/png",
          content: overlayBuffer,
        },
        {
          name: "settings",
          content: JSON.stringify({
            x: 0,
            y: 0,
            opacity: 50,
            blendMode,
          }),
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/compose",
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
});

// ---------------------------------------------------------------------------
// 18. Stitch direction modes x JPEG
//
// Verifies horizontal, vertical, and grid stitching.
// ---------------------------------------------------------------------------
describe("Stitch direction modes", () => {
  const DIRECTIONS = [
    { direction: "horizontal", gridColumns: 2 },
    { direction: "vertical", gridColumns: 2 },
    { direction: "grid", gridColumns: 2 },
  ] as const;

  const JPG_PATH = fixtures.image.formats("jpg");
  const PNG_PATH = fixtures.image.formats("png");

  for (const { direction, gridColumns } of DIRECTIONS) {
    it(`direction: ${direction}`, async () => {
      if (!existsSync(JPG_PATH) || !existsSync(PNG_PATH)) return;

      const bufA = readFileSync(JPG_PATH);
      const bufB = readFileSync(PNG_PATH);

      const { body: payload, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: "sample.jpg",
          contentType: "image/jpeg",
          content: bufA,
        },
        {
          name: "file",
          filename: "sample.png",
          contentType: "image/png",
          content: bufB,
        },
        {
          name: "settings",
          content: JSON.stringify({
            direction,
            gridColumns,
            resizeMode: "fit",
            format: "png",
          }),
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/stitch",
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
});

// ---------------------------------------------------------------------------
// 15b. Find-duplicates (multi-file) x core formats
//
// Requires 2+ images. Tests each core format paired with a PNG fixture.
// find-duplicates computes perceptual hashes and returns duplicate groups.
// ---------------------------------------------------------------------------
describe("Find-duplicates cross-format", () => {
  const PNG_PATH = fixtures.image.formats("png");

  for (const fmt of CORE_FORMATS) {
    it(`detects ${fmt.name} + PNG pair`, async () => {
      const fixturePath = join(fixtureDir.formats, fmt.file);
      if (!existsSync(fixturePath) || !existsSync(PNG_PATH)) return;

      const fmtBuffer = readFileSync(fixturePath);
      const pngBuffer = readFileSync(PNG_PATH);

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
          content: JSON.stringify({ threshold: 8 }),
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/find-duplicates",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        body: payload,
      });

      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.body);
      // find-duplicates returns { totalImages, duplicateGroups, uniqueCount }
      expect(typeof body).toBe("object");
      expect(body.totalImages).toBe(2);
      expect(Array.isArray(body.duplicateGroups)).toBe(true);
    });
  }

  // Exotic format resilience
  for (const fmt of EXOTIC_FORMATS) {
    const perTestTimeout = fmt.needsHeifDecoder || fmt.needsCliDecoder ? 180_000 : undefined;

    it(
      `${fmt.name} + PNG find-duplicates: no crash`,
      async () => {
        const fixturePath = join(fixtureDir.formats, fmt.file);
        if (!existsSync(fixturePath) || !existsSync(PNG_PATH)) return;

        const fmtBuffer = readFileSync(fixturePath);
        const pngBuffer = readFileSync(PNG_PATH);

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
            content: JSON.stringify({ threshold: 8 }),
          },
        ]);

        const res = await app.inject({
          method: "POST",
          url: "/api/v1/tools/image/find-duplicates",
          headers: {
            authorization: `Bearer ${adminToken}`,
            "content-type": contentType,
          },
          body: payload,
        });

        expect(res.statusCode).not.toBe(500);
        expect([200, 400, 422]).toContain(res.statusCode);
      },
      perTestTimeout,
    );
  }
});

// ---------------------------------------------------------------------------
// 19. Error resilience: missing file for expanded tools
//
// Verifies that each expanded tool returns a clean 400 when no file is sent.
// ---------------------------------------------------------------------------
describe("Missing file returns 400 for expanded tools", () => {
  const TOOL_ENDPOINTS = [
    { url: "/api/v1/tools/image/color-blindness", settings: { simulationType: "deuteranomaly" } },
    { url: "/api/v1/tools/image/beautify", settings: { padding: 20 } },
    { url: "/api/v1/tools/image/edit-metadata", settings: { title: "test" } },
    { url: "/api/v1/tools/image/vectorize", settings: { colorMode: "bw" } },
    { url: "/api/v1/tools/image/split", settings: { columns: 2, rows: 2 } },
    { url: "/api/v1/tools/image/favicon", settings: {} },
    {
      url: "/api/v1/tools/image/meme-generator",
      settings: {
        textLayout: "top-bottom",
        textBoxes: [{ id: "top", text: "TEST" }],
      },
    },
    { url: "/api/v1/tools/image/barcode-read", settings: { tryHarder: true } },
    { url: "/api/v1/tools/image/svg-to-raster", settings: { outputFormat: "png" } },
    { url: "/api/v1/tools/image/compose", settings: { x: 0, y: 0 } },
    { url: "/api/v1/tools/image/compare", settings: {} },
    { url: "/api/v1/tools/image/collage", settings: { templateId: "2-h-equal" } },
    { url: "/api/v1/tools/image/stitch", settings: { direction: "horizontal" } },
    { url: "/api/v1/tools/image/find-duplicates", settings: { threshold: 8 } },
  ];

  for (const { url, settings } of TOOL_ENDPOINTS) {
    const toolName = url.split("/").pop();

    it(`${toolName}: no file -> 400`, async () => {
      const { body: payload, contentType } = createMultipartPayload([
        {
          name: "settings",
          content: JSON.stringify(settings),
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url,
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        body: payload,
      });

      expect(res.statusCode).toBe(400);

      const body = JSON.parse(res.body);
      expect(body.error).toBeDefined();
      expect(typeof body.error).toBe("string");
    });
  }
});

// ---------------------------------------------------------------------------
// 20. Unauthenticated requests -> 401 for expanded tools
// ---------------------------------------------------------------------------
describe("Unauthenticated requests return 401 for expanded tools", () => {
  const TOOL_ENDPOINTS = [
    "/api/v1/tools/image/color-blindness",
    "/api/v1/tools/image/beautify",
    "/api/v1/tools/image/edit-metadata",
    "/api/v1/tools/image/vectorize",
    "/api/v1/tools/image/split",
    "/api/v1/tools/image/favicon",
    "/api/v1/tools/image/meme-generator",
    "/api/v1/tools/image/barcode-read",
    "/api/v1/tools/image/svg-to-raster",
    "/api/v1/tools/image/compose",
    "/api/v1/tools/image/compare",
    "/api/v1/tools/image/collage",
    "/api/v1/tools/image/stitch",
    "/api/v1/tools/image/find-duplicates",
    "/api/v1/tools/image/transparency-fixer",
  ];

  for (const url of TOOL_ENDPOINTS) {
    const toolName = url.split("/").pop();

    it(`${toolName}: no auth -> 401`, async () => {
      const fixturePath = fixtures.image.formats("png");
      if (!existsSync(fixturePath)) return;

      const buffer = readFileSync(fixturePath);
      const { body: payload, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: "sample.png",
          contentType: "image/png",
          content: buffer,
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url,
        headers: {
          // No authorization header
          "content-type": contentType,
        },
        body: payload,
      });

      expect(res.statusCode).toBe(401);
    });
  }
});
