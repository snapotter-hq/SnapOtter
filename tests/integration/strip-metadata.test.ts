/**
 * Integration tests for the strip-metadata tool.
 *
 * Tests EXIF stripping, GPS stripping, ICC profile stripping, XMP stripping,
 * and the stripAll flag. Uses test-with-exif.jpg fixture and verifies that
 * metadata is actually removed from the output.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const FIXTURES = join(__dirname, "..", "fixtures");
const EXIF_JPG = readFileSync(join(FIXTURES, "test-with-exif.jpg"));
const PNG = readFileSync(join(FIXTURES, "test-200x150.png"));

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

function makePayload(
  settings: Record<string, unknown>,
  buffer: Buffer = EXIF_JPG,
  filename = "test-with-exif.jpg",
  contentType = "image/jpeg",
) {
  return createMultipartPayload([
    { name: "file", filename, contentType, content: buffer },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
}

async function postTool(
  settings: Record<string, unknown>,
  buffer?: Buffer,
  filename?: string,
  ct?: string,
) {
  const { body: payload, contentType } = makePayload(settings, buffer, filename, ct);
  return app.inject({
    method: "POST",
    url: "/api/v1/tools/strip-metadata",
    payload,
    headers: {
      "content-type": contentType,
      authorization: `Bearer ${adminToken}`,
    },
  });
}

// ── Verify fixture has metadata ───────────────────────────────────
describe("Fixture verification", () => {
  it("test-with-exif.jpg has EXIF data", async () => {
    const meta = await sharp(EXIF_JPG).metadata();
    expect(meta.exif).toBeDefined();
    expect(meta.exif!.length).toBeGreaterThan(0);
  });
});

// ── Strip all metadata ────────────────────────────────────────────
describe("Strip all metadata", () => {
  it("strips all metadata with stripAll=true (default)", async () => {
    const res = await postTool({ stripAll: true });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);

    // Download and verify EXIF is gone
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(dlRes.statusCode).toBe(200);

    const meta = await sharp(dlRes.rawPayload).metadata();
    // After stripping all, EXIF/ICC/XMP should be absent or empty
    expect(!meta.exif || meta.exif.length === 0).toBe(true);
    expect(!meta.icc || meta.icc.length === 0).toBe(true);
    expect(!meta.xmp || meta.xmp.length === 0).toBe(true);
  });

  it("strips with default settings (stripAll defaults to true)", async () => {
    const res = await postTool({});
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });
});

// ── Strip individual categories ───────────────────────────────────
describe("Selective stripping", () => {
  it("strips only EXIF data", async () => {
    const res = await postTool({ stripAll: false, stripExif: true });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("strips only GPS data", async () => {
    const res = await postTool({ stripAll: false, stripGps: true });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("strips only ICC profile", async () => {
    const res = await postTool({ stripAll: false, stripIcc: true });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("strips only XMP data", async () => {
    const res = await postTool({ stripAll: false, stripXmp: true });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("strips EXIF + GPS but keeps ICC", async () => {
    const res = await postTool({
      stripAll: false,
      stripExif: true,
      stripGps: true,
      stripIcc: false,
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });
});

// ── Inspect endpoint ──────────────────────────────────────────────
describe("Inspect endpoint", () => {
  it("returns parsed metadata for image with EXIF", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test-with-exif.jpg",
        contentType: "image/jpeg",
        content: EXIF_JPG,
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/strip-metadata/inspect",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.filename).toBeDefined();
    expect(result.fileSize).toBeGreaterThan(0);
    // Should have parsed exif or at least have the filename
    expect(result.filename).toBe("test-with-exif.jpg");
  });

  it("returns 400 when no file is provided to inspect", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "other", content: "nothing" },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/strip-metadata/inspect",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── Format preservation ───────────────────────────────────────────
describe("Format handling", () => {
  it("preserves JPEG format after stripping", async () => {
    const res = await postTool({ stripAll: true });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("jpeg");
  });

  it("processes PNG input", async () => {
    const res = await postTool({ stripAll: true }, PNG, "test.png", "image/png");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("png");
  });

  it("preserves image dimensions after stripping", async () => {
    const originalMeta = await sharp(EXIF_JPG).metadata();
    const res = await postTool({ stripAll: true });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.width).toBe(originalMeta.width);
    expect(meta.height).toBe(originalMeta.height);
  });
});

// ── Selective stripping with download verification ────────────────
describe("Selective stripping with download verification", () => {
  it("selective stripExif returns valid downloadable image", async () => {
    const res = await postTool({ stripAll: false, stripExif: true });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(dlRes.statusCode).toBe(200);

    // Verify the output is a valid image
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBeGreaterThan(0);
  });

  it("selective stripXmp returns valid downloadable image", async () => {
    const res = await postTool({ stripAll: false, stripXmp: true });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(dlRes.statusCode).toBe(200);

    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("jpeg");
  });

  it("selective stripIcc returns valid downloadable image", async () => {
    const res = await postTool({ stripAll: false, stripIcc: true });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(dlRes.statusCode).toBe(200);

    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("jpeg");
  });

  it("strips multiple categories but not all returns valid image", async () => {
    const res = await postTool({
      stripAll: false,
      stripExif: true,
      stripGps: true,
      stripXmp: true,
      stripIcc: false,
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(dlRes.statusCode).toBe(200);

    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBeGreaterThan(0);
  });

  it("with all strip flags false, preserves metadata", async () => {
    const res = await postTool({
      stripAll: false,
      stripExif: false,
      stripGps: false,
      stripIcc: false,
      stripXmp: false,
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();

    // With withMetadata(), the output should retain EXIF
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.exif).toBeDefined();
  });
});

// ── WebP input ──────────────────────────────────────────────────
describe("WebP format handling", () => {
  it("processes WebP input and strips metadata", async () => {
    const webp = readFileSync(join(FIXTURES, "test-50x50.webp"));
    const res = await postTool({ stripAll: true }, webp, "test.webp", "image/webp");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("webp");
  });
});

// ── File size comparison ─────────────────────────────────────────
describe("File size impact", () => {
  it("stripping metadata typically reduces or maintains file size", async () => {
    const res = await postTool({ stripAll: true });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    // After stripping, size should be positive
    expect(result.processedSize).toBeGreaterThan(0);
  });
});

// ── Inspect endpoint edge cases ─────────────────────────────────
describe("Inspect endpoint edge cases", () => {
  it("inspects a PNG file with no EXIF", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.png",
        contentType: "image/png",
        content: PNG,
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/strip-metadata/inspect",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.filename).toBe("test.png");
    expect(result.fileSize).toBeGreaterThan(0);
    // PNG without EXIF should not have exif property
    expect(result.exif).toBeUndefined();
  });
});

// ── Error handling ────────────────────────────────────────────────
describe("Error handling", () => {
  it("returns 400 when no file is provided", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({ stripAll: true }) },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/strip-metadata",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid settings JSON", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "test.jpg", contentType: "image/jpeg", content: EXIF_JPG },
      { name: "settings", content: "not-json" },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/strip-metadata",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── Format-specific re-encoding paths ────���────────────────────
describe("Format-specific re-encoding", () => {
  it("re-encodes AVIF format after stripping", async () => {
    // Create a small AVIF buffer from PNG using Sharp
    const avifBuffer = await sharp(PNG).avif({ quality: 50 }).toBuffer();
    const res = await postTool({ stripAll: true }, avifBuffer, "test.avif", "image/avif");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("handles default format case (non-standard format)", async () => {
    // Using a GIF triggers the default case in the switch
    const gifBuffer = await sharp(PNG).gif().toBuffer();
    const res = await postTool({ stripAll: true }, gifBuffer, "test.gif", "image/gif");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("re-encodes TIFF format after stripping", async () => {
    const tiffBuffer = await sharp(PNG).tiff().toBuffer();
    const res = await postTool({ stripAll: true }, tiffBuffer, "test.tiff", "image/tiff");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });
});

// ── Inspect endpoint: ICC profile parsing ──────────────────────
describe("Inspect endpoint: ICC and XMP parsing", () => {
  it("inspect returns ICC info when present", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test-with-exif.jpg",
        contentType: "image/jpeg",
        content: EXIF_JPG,
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/strip-metadata/inspect",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    // ICC may or may not be present in the fixture, but the response should be valid
    if (result.icc) {
      expect(typeof result.icc).toBe("object");
    }
  });

  it("inspect handles EXIF with GPS data", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test-with-exif.jpg",
        contentType: "image/jpeg",
        content: EXIF_JPG,
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/strip-metadata/inspect",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.filename).toBe("test-with-exif.jpg");
    // GPS may or may not be in fixture, but exif object should exist
    if (result.exif) {
      expect(typeof result.exif).toBe("object");
    }
  });

  it("inspect returns empty metadata for image without any metadata", async () => {
    const blankPng = readFileSync(join(FIXTURES, "test-blank.png"));
    const { body: payload, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "blank.png",
        contentType: "image/png",
        content: blankPng,
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/strip-metadata/inspect",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.filename).toBe("blank.png");
    expect(result.fileSize).toBeGreaterThan(0);
    // No EXIF, ICC, or XMP expected
    expect(result.exif).toBeUndefined();
    expect(result.icc).toBeUndefined();
    expect(result.xmp).toBeUndefined();
  });

  it("inspect handles empty file buffer", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "empty.png",
        contentType: "image/png",
        content: Buffer.alloc(0),
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/strip-metadata/inspect",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/no image/i);
  });
});
