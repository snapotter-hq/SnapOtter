/**
 * Comprehensive format conversion tests.
 *
 * Verifies that every supported input format can be converted to every
 * supported output format via the /api/v1/tools/convert endpoint.
 * Also tests SVG-to-raster via the dedicated endpoint.
 */

import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const FIXTURES = join(__dirname, "..", "fixtures");

// All output formats accepted by the convert tool
const OUTPUT_FORMATS = [
  "jpg",
  "png",
  "webp",
  "avif",
  "tiff",
  "gif",
  "heic",
  "heif",
  "jxl",
  "bmp",
  "ico",
  "jp2",
  "qoi",
  "psd",
  "ppm",
  "eps",
  "tga",
] as const;

// Formats whose CLI encoder (cjxl, heif-enc, opj_compress, magick) may not
// be installed in every dev/CI environment. Allow graceful 422 for these.
const CLI_ENCODED_FORMATS = new Set([
  "heic",
  "heif",
  "jxl",
  "bmp",
  "ico",
  "jp2",
  "qoi",
  "psd",
  "ppm",
  "eps",
  "tga",
]);

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------
let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

// Input buffers generated from the PNG fixture (created in beforeAll)
const inputs: Record<string, { buffer: Buffer; filename: string; contentType: string }> = {};

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);

  // Base fixture
  const png = readFileSync(join(FIXTURES, "test-200x150.png"));

  // Generate all raster input formats from the PNG fixture
  inputs.png = { buffer: png, filename: "test.png", contentType: "image/png" };
  inputs.jpg = {
    buffer: await sharp(png).jpeg().toBuffer(),
    filename: "test.jpg",
    contentType: "image/jpeg",
  };
  inputs.webp = {
    buffer: await sharp(png).webp().toBuffer(),
    filename: "test.webp",
    contentType: "image/webp",
  };
  inputs.avif = {
    buffer: await sharp(png).avif().toBuffer(),
    filename: "test.avif",
    contentType: "image/avif",
  };
  inputs.tiff = {
    buffer: await sharp(png).tiff().toBuffer(),
    filename: "test.tiff",
    contentType: "image/tiff",
  };
  inputs.gif = {
    buffer: await sharp(png).gif().toBuffer(),
    filename: "test.gif",
    contentType: "image/gif",
  };
  inputs.heic = {
    buffer: readFileSync(join(FIXTURES, "test-200x150.heic")),
    filename: "test.heic",
    contentType: "image/heic",
  };
  inputs.svg = {
    buffer: readFileSync(join(FIXTURES, "test-100x100.svg")),
    filename: "test.svg",
    contentType: "image/svg+xml",
  };
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

// ---------------------------------------------------------------------------
// Raster-to-raster conversions via /api/v1/tools/convert
// ---------------------------------------------------------------------------
describe("Format conversion matrix", () => {
  const rasterInputs = ["png", "jpg", "webp", "avif", "tiff", "gif", "heic"];

  for (const inputFmt of rasterInputs) {
    for (const outputFmt of OUTPUT_FORMATS) {
      it(`converts ${inputFmt} -> ${outputFmt}`, async () => {
        const input = inputs[inputFmt];
        const { body: payload, contentType } = createMultipartPayload([
          {
            name: "file",
            filename: input.filename,
            contentType: input.contentType,
            content: input.buffer,
          },
          { name: "settings", content: JSON.stringify({ format: outputFmt }) },
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

        // CLI-encoded formats may not have their encoder installed in every environment
        if (res.statusCode === 422 && (inputFmt === "heic" || CLI_ENCODED_FORMATS.has(outputFmt))) {
          return;
        }
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.downloadUrl).toContain(`.${outputFmt}`);
        expect(body.processedSize).toBeGreaterThan(0);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// SVG-to-raster conversions via /api/v1/tools/convert
// ---------------------------------------------------------------------------
describe("SVG via convert tool", () => {
  for (const outputFmt of OUTPUT_FORMATS) {
    it(`converts svg -> ${outputFmt}`, async () => {
      const input = inputs.svg;
      const { body: payload, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: input.filename,
          contentType: input.contentType,
          content: input.buffer,
        },
        { name: "settings", content: JSON.stringify({ format: outputFmt }) },
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

      // CLI-encoded formats may not have their encoder installed in every environment
      if (res.statusCode === 422 && CLI_ENCODED_FORMATS.has(outputFmt)) return;
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.downloadUrl).toContain(`.${outputFmt}`);
      expect(body.processedSize).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------
// SVG-to-raster via dedicated endpoint
// ---------------------------------------------------------------------------
describe("SVG via dedicated svg-to-raster endpoint", () => {
  // Test all 7 output formats
  for (const outputFmt of ["png", "jpg", "webp", "avif", "tiff", "gif", "heif"] as const) {
    it(`converts svg -> ${outputFmt} via svg-to-raster`, async () => {
      const input = inputs.svg;
      const { body: payload, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: input.filename,
          contentType: input.contentType,
          content: input.buffer,
        },
        { name: "settings", content: JSON.stringify({ outputFormat: outputFmt, width: 200 }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/svg-to-raster",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        body: payload,
      });

      // HEIF encoding requires heif-enc which may not be installed in dev/CI
      if (outputFmt === "heif" && res.statusCode === 422) {
        return; // skip gracefully
      }

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.downloadUrl).toContain(`.${outputFmt}`);
      expect(body.processedSize).toBeGreaterThan(0);
    });
  }

  // Quality setting: low quality jpg should be smaller than high quality jpg
  it("respects quality setting (low vs high quality jpg)", async () => {
    const input = inputs.svg;

    const makeRequest = async (quality: number) => {
      const { body: payload, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: input.filename,
          contentType: input.contentType,
          content: input.buffer,
        },
        {
          name: "settings",
          content: JSON.stringify({ outputFormat: "jpg", width: 200, quality }),
        },
      ]);
      return app.inject({
        method: "POST",
        url: "/api/v1/tools/svg-to-raster",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        body: payload,
      });
    };

    const [lowRes, highRes] = await Promise.all([makeRequest(10), makeRequest(95)]);

    expect(lowRes.statusCode).toBe(200);
    expect(highRes.statusCode).toBe(200);

    const lowBody = JSON.parse(lowRes.body);
    const highBody = JSON.parse(highRes.body);

    expect(highBody.processedSize).toBeGreaterThan(lowBody.processedSize);
  });

  // DPI setting: higher DPI without width constraint produces a larger image
  it("respects DPI setting (72 vs 300 dpi png)", async () => {
    const input = inputs.svg;

    const makeRequest = async (dpi: number) => {
      const { body: payload, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: input.filename,
          contentType: input.contentType,
          content: input.buffer,
        },
        {
          name: "settings",
          content: JSON.stringify({ outputFormat: "png", dpi }),
        },
      ]);
      return app.inject({
        method: "POST",
        url: "/api/v1/tools/svg-to-raster",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        body: payload,
      });
    };

    const [lowDpi, highDpi] = await Promise.all([makeRequest(72), makeRequest(300)]);

    expect(lowDpi.statusCode).toBe(200);
    expect(highDpi.statusCode).toBe(200);

    const lowBody = JSON.parse(lowDpi.body);
    const highBody = JSON.parse(highDpi.body);

    expect(highBody.processedSize).toBeGreaterThan(lowBody.processedSize);
  });

  // Non-browser formats should include a previewUrl (moved below animated tests)
  it("returns previewUrl for non-browser format (tiff)", async () => {
    const input = inputs.svg;
    const { body: payload, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: input.filename,
        contentType: input.contentType,
        content: input.buffer,
      },
      {
        name: "settings",
        content: JSON.stringify({ outputFormat: "tiff", width: 200 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body: payload,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.previewUrl).toBeDefined();
    expect(body.previewUrl).toContain("preview.webp");
  });
});

// ---------------------------------------------------------------------------
// Animated format preservation via /api/v1/tools/convert
// ---------------------------------------------------------------------------
describe("Animated format preservation", () => {
  it("preserves animation when converting animated GIF to WebP", async () => {
    const animatedGif = readFileSync(join(FIXTURES, "animated.gif"));
    const { body: payload, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "animated.gif",
        contentType: "image/gif",
        content: animatedGif,
      },
      { name: "settings", content: JSON.stringify({ format: "webp" }) },
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
    expect(body.downloadUrl).toContain(".webp");

    // Download the output and verify it has multiple frames
    const dl = await app.inject({
      method: "GET",
      url: body.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(dl.statusCode).toBe(200);

    const tmpPath = join(tmpdir(), `animated-check-${randomUUID()}.webp`);
    writeFileSync(tmpPath, dl.rawPayload);
    const meta = await sharp(tmpPath, { animated: true }).metadata();
    expect(meta.pages).toBeGreaterThan(1);
  });

  it("converts animated GIF to PNG as single frame without error", async () => {
    const animatedGif = readFileSync(join(FIXTURES, "animated.gif"));
    const { body: payload, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "animated.gif",
        contentType: "image/gif",
        content: animatedGif,
      },
      { name: "settings", content: JSON.stringify({ format: "png" }) },
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
    expect(body.downloadUrl).toContain(".png");

    // Download and verify single frame
    const dl = await app.inject({
      method: "GET",
      url: body.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(dl.statusCode).toBe(200);

    const meta = await sharp(dl.rawPayload).metadata();
    expect(meta.pages ?? 1).toBe(1);
  });
});
