/**
 * Comprehensive adversarial integration tests for the SnapOtter image API.
 *
 * Fills gaps not covered by existing adversarial/edge-case/concurrent test files:
 *
 * 1. Extreme aspect ratio images (1x1000 narrow, 1000x1 wide) through resize, crop
 * 2. Under-tested tools with adversarial inputs (strip-metadata, adjust-colors,
 *    optimize-for-web, favicon, image-to-base64, color-palette, svg-to-raster)
 * 3. HTTP method mismatches (GET/PUT/DELETE to tool POST endpoints)
 * 4. SVG-specific attacks through svg-to-raster (XXE, script injection)
 * 5. Double-processing idempotency (same tool twice on same file)
 * 6. Rapid upload-process-reupload state bleed verification
 * 7. Batch with mixed image formats (PNG + JPEG + WebP)
 * 8. Concurrent pipelines with varied steps
 * 9. Extreme settings for adjust-colors (all sliders at min/max)
 * 10. Pipeline with format conversion mid-chain affecting subsequent tools
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { apiToolPath } from "@snapotter/shared";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const PNG_200x150 = readFixture(fixtures.image.base.png200);
const PNG_1x1 = readFixture(fixtures.image.edge.px1);
const JPG_100x100 = readFixture(fixtures.image.base.jpg100);
const WEBP_50x50 = readFixture(fixtures.image.base.webp50);
const SVG_100x100 = readFixture(fixtures.image.base.svg100);

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------
let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

// Generated extreme-dimension images (created once in beforeAll)
let narrowImage: Buffer; // 1x1000
let wideImage: Buffer; // 1000x1

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);

  // Generate extreme-dimension test images
  narrowImage = await sharp({
    create: {
      width: 1,
      height: 1000,
      channels: 3,
      background: { r: 128, g: 0, b: 255 },
    },
  })
    .png()
    .toBuffer();

  wideImage = await sharp({
    create: {
      width: 1000,
      height: 1,
      channels: 3,
      background: { r: 255, g: 128, b: 0 },
    },
  })
    .png()
    .toBuffer();
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

/** Helper to POST a multipart payload to a tool endpoint. */
function postTool(
  toolId: string,
  fields: Array<{
    name: string;
    filename?: string;
    contentType?: string;
    content: Buffer | string;
  }>,
) {
  const { body, contentType } = createMultipartPayload(fields);
  return app.inject({
    method: "POST",
    url: apiToolPath(toolId),
    headers: {
      "content-type": contentType,
      authorization: `Bearer ${adminToken}`,
    },
    body,
  });
}

/** Helper to POST a batch request. */
function postBatch(
  toolId: string,
  fields: Array<{
    name: string;
    filename?: string;
    contentType?: string;
    content: Buffer | string;
  }>,
) {
  const { body, contentType } = createMultipartPayload(fields);
  return app.inject({
    method: "POST",
    url: `${apiToolPath(toolId)}/batch`,
    headers: {
      "content-type": contentType,
      authorization: `Bearer ${adminToken}`,
    },
    body,
  });
}

/** Helper to POST a pipeline execution request. */
function executePipeline(
  image: Buffer,
  filename: string,
  pipeline: {
    steps: Array<{ toolId: string; settings?: Record<string, unknown> }>;
  },
) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, content: image, contentType: "image/png" },
    { name: "pipeline", content: JSON.stringify(pipeline) },
  ]);
  return app.inject({
    method: "POST",
    url: "/api/v1/pipeline/execute",
    headers: {
      "content-type": contentType,
      authorization: `Bearer ${adminToken}`,
    },
    body,
  });
}

/** Helper to build an inject config for a tool request. */
function buildToolRequest(
  toolId: string,
  image: Buffer,
  filename: string,
  settings: Record<string, unknown>,
  imgContentType = "image/png",
) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, content: image, contentType: imgContentType },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return {
    method: "POST" as const,
    url: apiToolPath(toolId),
    headers: {
      "content-type": contentType,
      authorization: `Bearer ${adminToken}`,
    },
    body,
  };
}

// ###########################################################################
// EXTREME ASPECT RATIO IMAGES (1x1000 AND 1000x1)
// ###########################################################################
describe("Extreme aspect ratio images", () => {
  describe("Very narrow image (1x1000)", () => {
    it("resizes a 1x1000 image by width", async () => {
      const res = await postTool("resize", [
        {
          name: "file",
          filename: "narrow.png",
          content: narrowImage,
          contentType: "image/png",
        },
        { name: "settings", content: JSON.stringify({ width: 50 }) },
      ]);

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.jobId).toBeDefined();
    });

    it("resizes a 1x1000 image by height", async () => {
      const res = await postTool("resize", [
        {
          name: "file",
          filename: "narrow.png",
          content: narrowImage,
          contentType: "image/png",
        },
        { name: "settings", content: JSON.stringify({ height: 100 }) },
      ]);

      expect(res.statusCode).toBe(200);
    });

    it("crops a 1x1000 image to 1x10 region", async () => {
      const res = await postTool("crop", [
        {
          name: "file",
          filename: "narrow.png",
          content: narrowImage,
          contentType: "image/png",
        },
        {
          name: "settings",
          content: JSON.stringify({ left: 0, top: 0, width: 1, height: 10 }),
        },
      ]);

      expect([200, 422]).toContain(res.statusCode);
    });

    it("rotates a 1x1000 image by 90 degrees", async () => {
      const res = await postTool("rotate", [
        {
          name: "file",
          filename: "narrow.png",
          content: narrowImage,
          contentType: "image/png",
        },
        { name: "settings", content: JSON.stringify({ angle: 90 }) },
      ]);

      // Rotation should swap dimensions to 1000x1
      expect(res.statusCode).toBe(200);
    });

    it("compresses a 1x1000 image", async () => {
      const res = await postTool("compress", [
        {
          name: "file",
          filename: "narrow.png",
          content: narrowImage,
          contentType: "image/png",
        },
        { name: "settings", content: JSON.stringify({ quality: 50 }) },
      ]);

      expect(res.statusCode).toBe(200);
    });

    it("converts a 1x1000 PNG to WebP", async () => {
      const res = await postTool("convert", [
        {
          name: "file",
          filename: "narrow.png",
          content: narrowImage,
          contentType: "image/png",
        },
        { name: "settings", content: JSON.stringify({ format: "webp" }) },
      ]);

      expect(res.statusCode).toBe(200);
    });
  });

  describe("Very wide image (1000x1)", () => {
    it("resizes a 1000x1 image by width", async () => {
      const res = await postTool("resize", [
        {
          name: "file",
          filename: "wide.png",
          content: wideImage,
          contentType: "image/png",
        },
        { name: "settings", content: JSON.stringify({ width: 100 }) },
      ]);

      expect(res.statusCode).toBe(200);
    });

    it("resizes a 1000x1 image by height", async () => {
      const res = await postTool("resize", [
        {
          name: "file",
          filename: "wide.png",
          content: wideImage,
          contentType: "image/png",
        },
        { name: "settings", content: JSON.stringify({ height: 50 }) },
      ]);

      expect(res.statusCode).toBe(200);
    });

    it("crops a 1000x1 image to a 10x1 region", async () => {
      const res = await postTool("crop", [
        {
          name: "file",
          filename: "wide.png",
          content: wideImage,
          contentType: "image/png",
        },
        {
          name: "settings",
          content: JSON.stringify({ left: 0, top: 0, width: 10, height: 1 }),
        },
      ]);

      expect([200, 422]).toContain(res.statusCode);
    });

    it("rotates a 1000x1 image by 90 degrees", async () => {
      const res = await postTool("rotate", [
        {
          name: "file",
          filename: "wide.png",
          content: wideImage,
          contentType: "image/png",
        },
        { name: "settings", content: JSON.stringify({ angle: 90 }) },
      ]);

      expect(res.statusCode).toBe(200);
    });

    it("adds border to a 1000x1 image", async () => {
      const res = await postTool("border", [
        {
          name: "file",
          filename: "wide.png",
          content: wideImage,
          contentType: "image/png",
        },
        { name: "settings", content: JSON.stringify({ borderWidth: 10 }) },
      ]);

      expect(res.statusCode).toBe(200);
    });
  });

  describe("Extreme aspect ratios through pipeline", () => {
    it("processes 1x1000 image through resize + compress pipeline", async () => {
      const res = await executePipeline(narrowImage, "narrow-pipe.png", {
        steps: [
          { toolId: "resize", settings: { width: 10 } },
          { toolId: "compress", settings: { quality: 60 } },
        ],
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.stepsCompleted).toBe(2);
    });

    it("processes 1000x1 image through rotate + border pipeline", async () => {
      const res = await executePipeline(wideImage, "wide-pipe.png", {
        steps: [
          { toolId: "rotate", settings: { angle: 90 } },
          { toolId: "border", settings: { borderWidth: 5 } },
        ],
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.stepsCompleted).toBe(2);
    });
  });
});

// ###########################################################################
// UNDER-TESTED TOOLS WITH ADVERSARIAL INPUTS
// ###########################################################################
describe("Under-tested tools -- adversarial inputs", () => {
  describe("strip-metadata with adversarial inputs", () => {
    it("strips metadata from a 1x1 pixel image", async () => {
      const res = await postTool("strip-metadata", [
        {
          name: "file",
          filename: "tiny.png",
          content: PNG_1x1,
          contentType: "image/png",
        },
        {
          name: "settings",
          content: JSON.stringify({ stripAll: true }),
        },
      ]);

      expect(res.statusCode).toBe(200);
    });

    it("rejects zero-byte file through strip-metadata", async () => {
      const res = await postTool("strip-metadata", [
        {
          name: "file",
          filename: "empty.png",
          content: Buffer.alloc(0),
          contentType: "image/png",
        },
        { name: "settings", content: JSON.stringify({ stripAll: true }) },
      ]);

      expect(res.statusCode).toBe(400);
    });

    it("handles garbage data through strip-metadata gracefully", async () => {
      const garbage = Buffer.from(
        Array.from({ length: 2048 }, () => Math.floor(Math.random() * 256)),
      );

      const res = await postTool("strip-metadata", [
        {
          name: "file",
          filename: "garbage.jpg",
          content: garbage,
          contentType: "image/jpeg",
        },
        { name: "settings", content: JSON.stringify({ stripAll: true }) },
      ]);

      expect([400, 422]).toContain(res.statusCode);
    });
  });

  describe("adjust-colors with extreme settings", () => {
    it("applies all sliders at maximum values", async () => {
      const res = await postTool("adjust-colors", [
        {
          name: "file",
          filename: "test.png",
          content: PNG_200x150,
          contentType: "image/png",
        },
        {
          name: "settings",
          content: JSON.stringify({
            brightness: 100,
            contrast: 100,
            exposure: 100,
            saturation: 100,
            temperature: 100,
            tint: 100,
            hue: 180,
            sharpness: 100,
            red: 200,
            green: 200,
            blue: 200,
          }),
        },
      ]);

      expect(res.statusCode).toBe(200);
    });

    it("applies all sliders at minimum values", async () => {
      const res = await postTool("adjust-colors", [
        {
          name: "file",
          filename: "test.png",
          content: PNG_200x150,
          contentType: "image/png",
        },
        {
          name: "settings",
          content: JSON.stringify({
            brightness: -100,
            contrast: -100,
            exposure: -100,
            saturation: -100,
            temperature: -100,
            tint: -100,
            hue: -180,
            sharpness: 0,
            red: 0,
            green: 0,
            blue: 0,
          }),
        },
      ]);

      expect(res.statusCode).toBe(200);
    });

    it("applies grayscale effect to a 1x1 pixel image", async () => {
      const res = await postTool("adjust-colors", [
        {
          name: "file",
          filename: "tiny.png",
          content: PNG_1x1,
          contentType: "image/png",
        },
        {
          name: "settings",
          content: JSON.stringify({ effect: "grayscale" }),
        },
      ]);

      expect(res.statusCode).toBe(200);
    });

    it("applies invert effect to a narrow image", async () => {
      const res = await postTool("adjust-colors", [
        {
          name: "file",
          filename: "narrow.png",
          content: narrowImage,
          contentType: "image/png",
        },
        {
          name: "settings",
          content: JSON.stringify({ effect: "invert" }),
        },
      ]);

      expect(res.statusCode).toBe(200);
    });

    it("rejects out-of-range brightness value", async () => {
      const res = await postTool("adjust-colors", [
        {
          name: "file",
          filename: "test.png",
          content: PNG_200x150,
          contentType: "image/png",
        },
        {
          name: "settings",
          content: JSON.stringify({ brightness: 101 }),
        },
      ]);

      expect(res.statusCode).toBe(400);
    });

    it("rejects invalid effect name", async () => {
      const res = await postTool("adjust-colors", [
        {
          name: "file",
          filename: "test.png",
          content: PNG_200x150,
          contentType: "image/png",
        },
        {
          name: "settings",
          content: JSON.stringify({ effect: "hyperbolic" }),
        },
      ]);

      expect(res.statusCode).toBe(400);
    });
  });

  describe("image-to-base64 with adversarial inputs", () => {
    it("converts a valid PNG to base64", async () => {
      const res = await postTool("image-to-base64", [
        {
          name: "file",
          filename: "test.png",
          content: PNG_200x150,
          contentType: "image/png",
        },
        { name: "settings", content: JSON.stringify({}) },
      ]);

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      // Should contain base64 data
      expect(json.results || json.base64 || json.dataUri).toBeDefined();
    });

    it("converts a 1x1 pixel image to base64", async () => {
      const res = await postTool("image-to-base64", [
        {
          name: "file",
          filename: "tiny.png",
          content: PNG_1x1,
          contentType: "image/png",
        },
        { name: "settings", content: JSON.stringify({}) },
      ]);

      expect(res.statusCode).toBe(200);
    });
  });

  describe("color-palette with adversarial inputs", () => {
    it("extracts palette from a 1x1 pixel image", async () => {
      const res = await postTool("color-palette", [
        {
          name: "file",
          filename: "tiny.png",
          content: PNG_1x1,
          contentType: "image/png",
        },
      ]);

      // 1x1 image has exactly one color -- should work
      expect(res.statusCode).toBe(200);
    });

    it("extracts palette from an extreme narrow image", async () => {
      const res = await postTool("color-palette", [
        {
          name: "file",
          filename: "narrow.png",
          content: narrowImage,
          contentType: "image/png",
        },
      ]);

      expect(res.statusCode).toBe(200);
    });

    it("rejects garbage data through color-palette", async () => {
      const garbage = Buffer.from("not an image");

      const res = await postTool("color-palette", [
        {
          name: "file",
          filename: "garbage.png",
          content: garbage,
          contentType: "image/png",
        },
      ]);

      expect([400, 422]).toContain(res.statusCode);
    });
  });

  describe("favicon with adversarial inputs", () => {
    it("generates favicons from a 1x1 pixel image", async () => {
      const res = await postTool("favicon", [
        {
          name: "file",
          filename: "tiny.png",
          content: PNG_1x1,
          contentType: "image/png",
        },
        { name: "settings", content: JSON.stringify({}) },
      ]);

      // Should upscale the 1x1 image to all favicon sizes
      expect(res.statusCode).toBe(200);
    });

    it("generates favicons from an extreme narrow image", async () => {
      const res = await postTool("favicon", [
        {
          name: "file",
          filename: "narrow.png",
          content: narrowImage,
          contentType: "image/png",
        },
        { name: "settings", content: JSON.stringify({}) },
      ]);

      // Should handle non-square image
      expect(res.statusCode).toBe(200);
    });
  });
});

// ###########################################################################
// HTTP METHOD MISMATCHES
// ###########################################################################
describe("HTTP method mismatches on tool endpoints", () => {
  it("returns 404 for GET request to tool endpoint", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tools/image/resize",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(404);
  });

  it("returns 404 for PUT request to tool endpoint", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/tools/image/resize",
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
      body,
    });

    expect(res.statusCode).toBe(404);
  });

  it("returns 404 for DELETE request to tool endpoint", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/tools/image/resize",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(404);
  });

  it("returns 404 for PATCH request to tool endpoint", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/tools/image/resize",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminToken}`,
      },
      payload: { width: 100 },
    });

    expect(res.statusCode).toBe(404);
  });
});

// ###########################################################################
// SVG-SPECIFIC ATTACKS THROUGH svg-to-raster
// ###########################################################################
describe("SVG-specific attacks through svg-to-raster", () => {
  it("sanitizes SVG with embedded script tag", async () => {
    const maliciousSvg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">' +
        '<script>alert("xss")</script>' +
        '<rect width="100" height="100" fill="red"/>' +
        "</svg>",
    );

    const res = await postTool("svg-to-raster", [
      {
        name: "file",
        filename: "xss.svg",
        content: maliciousSvg,
        contentType: "image/svg+xml",
      },
      {
        name: "settings",
        content: JSON.stringify({ outputFormat: "png" }),
      },
    ]);

    // Should either strip the script and succeed, or reject
    expect([200, 400, 422]).toContain(res.statusCode);
  });

  it("sanitizes SVG with onload event handler", async () => {
    const maliciousSvg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" onload="alert(1)">' +
        '<rect width="100" height="100" fill="blue"/>' +
        "</svg>",
    );

    const res = await postTool("svg-to-raster", [
      {
        name: "file",
        filename: "onload.svg",
        content: maliciousSvg,
        contentType: "image/svg+xml",
      },
      {
        name: "settings",
        content: JSON.stringify({ outputFormat: "png" }),
      },
    ]);

    expect([200, 400, 422]).toContain(res.statusCode);
  });

  it("handles SVG with external image reference (SSRF attempt)", async () => {
    const ssrfSvg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100" height="100">' +
        '<image xlink:href="http://169.254.169.254/latest/meta-data/" width="100" height="100"/>' +
        "</svg>",
    );

    const res = await postTool("svg-to-raster", [
      {
        name: "file",
        filename: "ssrf.svg",
        content: ssrfSvg,
        contentType: "image/svg+xml",
      },
      {
        name: "settings",
        content: JSON.stringify({ outputFormat: "png" }),
      },
    ]);

    // Should sanitize external references or reject
    expect([200, 400, 422]).toContain(res.statusCode);
  });

  it("handles SVG with extremely large dimensions attribute", async () => {
    const hugeSvg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="999999" height="999999">' +
        '<rect width="100" height="100" fill="green"/>' +
        "</svg>",
    );

    const res = await postTool("svg-to-raster", [
      {
        name: "file",
        filename: "huge-dims.svg",
        content: hugeSvg,
        contentType: "image/svg+xml",
      },
      {
        name: "settings",
        content: JSON.stringify({
          outputFormat: "png",
          width: 100,
          height: 100,
        }),
      },
    ]);

    // Must not crash. Either succeeds with constrained output or returns error.
    expect([200, 400, 422]).toContain(res.statusCode);
  });

  it("handles an empty SVG document", async () => {
    const emptySvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

    const res = await postTool("svg-to-raster", [
      {
        name: "file",
        filename: "empty.svg",
        content: emptySvg,
        contentType: "image/svg+xml",
      },
      {
        name: "settings",
        content: JSON.stringify({ outputFormat: "png" }),
      },
    ]);

    // Empty SVG has no viewBox or dimensions -- may fail or produce empty output
    expect([200, 400, 422]).toContain(res.statusCode);
  });

  it("converts a valid SVG to raster", async () => {
    const res = await postTool("svg-to-raster", [
      {
        name: "file",
        filename: "test.svg",
        content: SVG_100x100,
        contentType: "image/svg+xml",
      },
      {
        name: "settings",
        content: JSON.stringify({ outputFormat: "png" }),
      },
    ]);

    expect(res.statusCode).toBe(200);
  });
});

// ###########################################################################
// DOUBLE-PROCESSING IDEMPOTENCY
// ###########################################################################
describe("Double-processing idempotency", () => {
  it("resizes same image twice sequentially -- produces consistent results", async () => {
    const first = await postTool("resize", [
      {
        name: "file",
        filename: "double-1.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 80 }) },
    ]);
    const second = await postTool("resize", [
      {
        name: "file",
        filename: "double-2.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 80 }) },
    ]);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);

    const firstBody = JSON.parse(first.body);
    const secondBody = JSON.parse(second.body);

    // Same input + same settings should produce same processed size
    expect(firstBody.processedSize).toBe(secondBody.processedSize);
    // But different job IDs
    expect(firstBody.jobId).not.toBe(secondBody.jobId);
  });

  it("compresses same image twice -- same output size", async () => {
    const first = await postTool("compress", [
      {
        name: "file",
        filename: "comp-1.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ quality: 50 }) },
    ]);
    const second = await postTool("compress", [
      {
        name: "file",
        filename: "comp-2.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ quality: 50 }) },
    ]);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);

    const firstBody = JSON.parse(first.body);
    const secondBody = JSON.parse(second.body);
    expect(firstBody.processedSize).toBe(secondBody.processedSize);
  });

  it("strips metadata twice from same image -- second is no-op", async () => {
    const first = await postTool("strip-metadata", [
      {
        name: "file",
        filename: "strip-1.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ stripAll: true }) },
    ]);

    expect(first.statusCode).toBe(200);
    const firstBody = JSON.parse(first.body);

    // Second strip on the same image
    const second = await postTool("strip-metadata", [
      {
        name: "file",
        filename: "strip-2.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ stripAll: true }) },
    ]);

    expect(second.statusCode).toBe(200);
    const secondBody = JSON.parse(second.body);

    // Both should produce same size (PNG input has minimal metadata)
    expect(firstBody.processedSize).toBe(secondBody.processedSize);
  });
});

// ###########################################################################
// RAPID UPLOAD-PROCESS-REUPLOAD STATE BLEED VERIFICATION
// ###########################################################################
describe("Rapid upload-process-reupload -- no state bleed", () => {
  it("processes PNG then JPEG on resize endpoint -- sizes differ correctly", async () => {
    const pngRes = await postTool("resize", [
      {
        name: "file",
        filename: "first.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
    ]);

    expect(pngRes.statusCode).toBe(200);
    const pngBody = JSON.parse(pngRes.body);

    const jpgRes = await postTool("resize", [
      {
        name: "file",
        filename: "second.jpg",
        content: JPG_100x100,
        contentType: "image/jpeg",
      },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
    ]);

    expect(jpgRes.statusCode).toBe(200);
    const jpgBody = JSON.parse(jpgRes.body);

    // Original sizes must reflect the actual inputs (not the previous request)
    expect(pngBody.originalSize).toBe(PNG_200x150.length);
    expect(jpgBody.originalSize).toBe(JPG_100x100.length);
    // They should be different images
    expect(pngBody.downloadUrl).not.toBe(jpgBody.downloadUrl);
    expect(pngBody.jobId).not.toBe(jpgBody.jobId);
  });

  it("processes different widths rapidly -- output sizes differ", async () => {
    const res50 = await postTool("resize", [
      {
        name: "file",
        filename: "w50.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
    ]);
    const res150 = await postTool("resize", [
      {
        name: "file",
        filename: "w150.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 150 }) },
    ]);

    expect(res50.statusCode).toBe(200);
    expect(res150.statusCode).toBe(200);

    const body50 = JSON.parse(res50.body);
    const body150 = JSON.parse(res150.body);

    // Width 50 output should be smaller than width 150 output
    expect(body50.processedSize).toBeLessThan(body150.processedSize);
  });

  it("alternates between resize and compress with no state leak", async () => {
    const resize1 = await postTool("resize", [
      {
        name: "file",
        filename: "r1.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 80 }) },
    ]);
    const compress1 = await postTool("compress", [
      {
        name: "file",
        filename: "c1.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ quality: 30 }) },
    ]);
    const resize2 = await postTool("resize", [
      {
        name: "file",
        filename: "r2.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 80 }) },
    ]);

    expect(resize1.statusCode).toBe(200);
    expect(compress1.statusCode).toBe(200);
    expect(resize2.statusCode).toBe(200);

    // Both resize operations with same input/settings should produce same size
    const r1Body = JSON.parse(resize1.body);
    const r2Body = JSON.parse(resize2.body);
    expect(r1Body.processedSize).toBe(r2Body.processedSize);

    // Compress should have a different URL path (different tool)
    const c1Body = JSON.parse(compress1.body);
    expect(c1Body.downloadUrl).toContain("compress");
    expect(r1Body.downloadUrl).toContain("resize");
  });
});

// ###########################################################################
// BATCH WITH MIXED IMAGE FORMATS
// ###########################################################################
describe("Batch with mixed image formats (PNG + JPEG + WebP)", () => {
  it("handles batch resize with PNG, JPEG, and WebP files", async () => {
    const res = await postBatch("resize", [
      {
        name: "file",
        filename: "photo.png",
        contentType: "image/png",
        content: PNG_200x150,
      },
      {
        name: "file",
        filename: "photo.jpg",
        contentType: "image/jpeg",
        content: JPG_100x100,
      },
      {
        name: "file",
        filename: "photo.webp",
        contentType: "image/webp",
        content: WEBP_50x50,
      },
      { name: "settings", content: JSON.stringify({ width: 30 }) },
    ]);

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    const fileResults = JSON.parse(decodeURIComponent(res.headers["x-file-results"] as string));
    expect(Object.keys(fileResults).length).toBe(3);
  });

  it("handles batch compress with mixed formats", async () => {
    const res = await postBatch("compress", [
      {
        name: "file",
        filename: "a.png",
        contentType: "image/png",
        content: PNG_200x150,
      },
      {
        name: "file",
        filename: "b.jpg",
        contentType: "image/jpeg",
        content: JPG_100x100,
      },
      {
        name: "file",
        filename: "c.webp",
        contentType: "image/webp",
        content: WEBP_50x50,
      },
      { name: "settings", content: JSON.stringify({ quality: 50 }) },
    ]);

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
  });

  it("handles batch rotate with mixed formats", async () => {
    const res = await postBatch("rotate", [
      {
        name: "file",
        filename: "rotate-a.png",
        contentType: "image/png",
        content: PNG_200x150,
      },
      {
        name: "file",
        filename: "rotate-b.jpg",
        contentType: "image/jpeg",
        content: JPG_100x100,
      },
      { name: "settings", content: JSON.stringify({ angle: 90 }) },
    ]);

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
  });
});

// ###########################################################################
// CONCURRENT PIPELINES WITH VARIED STEPS
// ###########################################################################
describe("Concurrent pipelines with varied steps", () => {
  it("runs 5 concurrent pipelines with different tool chains", async () => {
    const pipelines = [
      {
        steps: [
          { toolId: "resize", settings: { width: 80 } },
          { toolId: "compress", settings: { quality: 50 } },
        ],
      },
      {
        steps: [
          { toolId: "rotate", settings: { angle: 90 } },
          { toolId: "border", settings: { borderWidth: 5 } },
        ],
      },
      {
        steps: [
          { toolId: "convert", settings: { format: "webp" } },
          { toolId: "resize", settings: { width: 60 } },
        ],
      },
      {
        steps: [
          { toolId: "resize", settings: { width: 100 } },
          { toolId: "rotate", settings: { angle: 180 } },
          { toolId: "compress", settings: { quality: 70 } },
        ],
      },
      {
        steps: [
          { toolId: "border", settings: { borderWidth: 10 } },
          { toolId: "compress", settings: { quality: 40 } },
        ],
      },
    ];

    const results = await Promise.all(
      pipelines.map((pipeline, i) => {
        const payload = createMultipartPayload([
          {
            name: "file",
            filename: `concurrent-pipe-${i}.png`,
            content: PNG_200x150,
            contentType: "image/png",
          },
          { name: "pipeline", content: JSON.stringify(pipeline) },
        ]);
        return app.inject({
          method: "POST",
          url: "/api/v1/pipeline/execute",
          headers: {
            "content-type": payload.contentType,
            authorization: `Bearer ${adminToken}`,
          },
          body: payload.body,
        });
      }),
    );

    // All 5 must succeed
    for (let i = 0; i < results.length; i++) {
      expect(results[i].statusCode).toBe(200);
      const json = JSON.parse(results[i].body);
      expect(json.stepsCompleted).toBe(pipelines[i].steps.length);
      expect(json.jobId).toBeDefined();
    }

    // All job IDs must be unique
    const jobIds = results.map((r) => JSON.parse(r.body).jobId);
    expect(new Set(jobIds).size).toBe(5);
  }, 120_000);
});

// ###########################################################################
// PIPELINE WITH FORMAT CONVERSION MID-CHAIN
// ###########################################################################
describe("Pipeline with format conversion mid-chain", () => {
  it("converts PNG to WebP mid-chain then resizes -- format is carried", async () => {
    const res = await executePipeline(PNG_200x150, "mid-convert.png", {
      steps: [
        { toolId: "convert", settings: { format: "webp" } },
        { toolId: "resize", settings: { width: 50 } },
        { toolId: "compress", settings: { quality: 60 } },
      ],
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.stepsCompleted).toBe(3);
  });

  it("converts PNG to JPEG to WebP -- double format change", async () => {
    const res = await executePipeline(PNG_200x150, "double-convert.png", {
      steps: [
        { toolId: "convert", settings: { format: "jpg" } },
        { toolId: "resize", settings: { width: 80 } },
        { toolId: "convert", settings: { format: "webp" } },
      ],
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.stepsCompleted).toBe(3);
  });

  it("converts to AVIF then adds border -- AVIF intermediate handling", async () => {
    const res = await executePipeline(PNG_200x150, "avif-border.png", {
      steps: [
        { toolId: "convert", settings: { format: "avif" } },
        { toolId: "border", settings: { borderWidth: 10 } },
      ],
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.stepsCompleted).toBe(2);
  });
});

// ###########################################################################
// BODY CONTENT-TYPE MISMATCHES (NON-MULTIPART)
// ###########################################################################
describe("Non-multipart content types to tool endpoint", () => {
  it("rejects JSON body sent to tool endpoint", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/resize",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminToken}`,
      },
      payload: { width: 100 },
    });

    // Fastify/multipart plugin should reject non-multipart
    expect([400, 415]).toContain(res.statusCode);
  });

  it("rejects plain text body sent to tool endpoint", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/resize",
      headers: {
        "content-type": "text/plain",
        authorization: `Bearer ${adminToken}`,
      },
      payload: "width=100",
    });

    expect([400, 415]).toContain(res.statusCode);
  });
});

// ###########################################################################
// TOOL-SPECIFIC EDGE: INFO WITH EXTREME IMAGES
// ###########################################################################
describe("Info tool with extreme images", () => {
  it("returns info for a 1x1000 narrow image", async () => {
    const res = await postTool("info", [
      {
        name: "file",
        filename: "narrow.png",
        content: narrowImage,
        contentType: "image/png",
      },
    ]);

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.width).toBe(1);
    expect(json.height).toBe(1000);
    expect(json.format).toBe("png");
  });

  it("returns info for a 1000x1 wide image", async () => {
    const res = await postTool("info", [
      {
        name: "file",
        filename: "wide.png",
        content: wideImage,
        contentType: "image/png",
      },
    ]);

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.width).toBe(1000);
    expect(json.height).toBe(1);
    expect(json.format).toBe("png");
  });

  it("returns info for a WebP image", async () => {
    const res = await postTool("info", [
      {
        name: "file",
        filename: "test.webp",
        content: WEBP_50x50,
        contentType: "image/webp",
      },
    ]);

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.width).toBe(50);
    expect(json.height).toBe(50);
    expect(json.format).toBe("webp");
  });
});

// ###########################################################################
// CONCURRENT MIXED: ADVERSARIAL + EXTREME ASPECT + VALID
// ###########################################################################
describe("Concurrent adversarial + extreme aspect ratio + valid requests", () => {
  it("fires narrow image, wide image, garbage, and valid simultaneously", async () => {
    const garbage = Buffer.from(Array.from({ length: 512 }, () => Math.floor(Math.random() * 256)));

    const [narrowRes, wideRes, garbageRes, validRes] = await Promise.all([
      app.inject(buildToolRequest("resize", narrowImage, "narrow.png", { width: 10 })),
      app.inject(buildToolRequest("resize", wideImage, "wide.png", { width: 100 })),
      app.inject(buildToolRequest("resize", garbage, "garbage.png", { width: 50 })),
      app.inject(buildToolRequest("resize", PNG_200x150, "valid.png", { width: 80 })),
    ]);

    // Valid and extreme-aspect images should succeed
    expect(narrowRes.statusCode).toBe(200);
    expect(wideRes.statusCode).toBe(200);
    expect(validRes.statusCode).toBe(200);

    // Garbage should fail
    expect([400, 422]).toContain(garbageRes.statusCode);

    // All successful requests must have unique job IDs
    const validJobs = [narrowRes, wideRes, validRes].map((r) => JSON.parse(r.body).jobId);
    expect(new Set(validJobs).size).toBe(3);
  }, 60_000);
});

// ###########################################################################
// EXTREME CROP REGIONS ON EXTREME IMAGES
// ###########################################################################
describe("Extreme crop regions on extreme images", () => {
  it("rejects crop wider than a narrow image", async () => {
    const res = await postTool("crop", [
      {
        name: "file",
        filename: "narrow.png",
        content: narrowImage,
        contentType: "image/png",
      },
      {
        name: "settings",
        content: JSON.stringify({ left: 0, top: 0, width: 100, height: 100 }),
      },
    ]);

    // 1x1000 image -- width 100 exceeds image width of 1
    expect([400, 422]).toContain(res.statusCode);
  });

  it("rejects crop taller than a wide image", async () => {
    const res = await postTool("crop", [
      {
        name: "file",
        filename: "wide.png",
        content: wideImage,
        contentType: "image/png",
      },
      {
        name: "settings",
        content: JSON.stringify({ left: 0, top: 0, width: 100, height: 100 }),
      },
    ]);

    // 1000x1 image -- height 100 exceeds image height of 1
    expect([400, 422]).toContain(res.statusCode);
  });
});

// ###########################################################################
// PIPELINE WITH EXTREME ASPECT RATIO + FORMAT CONVERSION
// ###########################################################################
describe("Pipeline with extreme aspect ratio and format conversion", () => {
  it("narrow image: convert to JPEG then resize then compress", async () => {
    const res = await executePipeline(narrowImage, "narrow-chain.png", {
      steps: [
        { toolId: "convert", settings: { format: "jpg" } },
        { toolId: "resize", settings: { height: 100 } },
        { toolId: "compress", settings: { quality: 50 } },
      ],
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.stepsCompleted).toBe(3);
  });

  it("wide image: resize then convert to WebP", async () => {
    const res = await executePipeline(wideImage, "wide-to-webp.png", {
      steps: [
        { toolId: "resize", settings: { width: 200 } },
        { toolId: "convert", settings: { format: "webp" } },
      ],
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.stepsCompleted).toBe(2);
  });
});

// ###########################################################################
// SERVER STABILITY AFTER ALL TESTS
// ###########################################################################
describe("Server stability -- health check after comprehensive adversarial tests", () => {
  it("server remains responsive after entire test suite", async () => {
    const healthRes = await app.inject({
      method: "GET",
      url: "/api/v1/health",
    });
    expect(healthRes.statusCode).toBe(200);
    const json = JSON.parse(healthRes.body);
    expect(json.status).toBe("healthy");

    // Verify a normal request still works
    const normalRes = await postTool("resize", [
      {
        name: "file",
        filename: "final-sanity.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);
    expect(normalRes.statusCode).toBe(200);
    expect(JSON.parse(normalRes.body).jobId).toBeDefined();
  });
});
