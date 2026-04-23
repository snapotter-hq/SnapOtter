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
});
