/**
 * Tier-2 depth tests: real photo/HEIC heroes through real image tool routes.
 *
 * Exercises resize, compress, convert, and info with the typed fixture registry,
 * verifying output dimensions, file validity, and metadata via Sharp decode.
 */

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

const PORTRAIT_JPG = readFixture(fixtures.image.portrait.jpg);
const PORTRAIT_HEIC = readFixture(fixtures.image.portrait.heic);
const EXIF_JPG = readFixture(fixtures.image.exifGps);
const PNG_200 = readFixture(fixtures.image.base.png200);

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

/** POST a file to a tool route and return the raw response. */
async function postTool(
  toolId: string,
  settings: Record<string, unknown>,
  file: Buffer,
  filename: string,
  contentType: string,
) {
  const { body, contentType: ct } = createMultipartPayload([
    { name: "file", filename, contentType, content: file },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return app.inject({
    method: "POST",
    url: apiToolPath(toolId),
    headers: {
      authorization: `Bearer ${adminToken}`,
      "content-type": ct,
    },
    body,
  });
}

/** Download a result from its downloadUrl and return the raw payload. */
async function download(downloadUrl: string): Promise<Buffer> {
  const dl = await app.inject({
    method: "GET",
    url: downloadUrl,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  expect(dl.statusCode).toBe(200);
  return dl.rawPayload;
}

// -----------------------------------------------------------------------
// Resize depth tests
// -----------------------------------------------------------------------
describe("Image depth: resize real heroes", () => {
  it("resizes portrait JPG to 300px wide, output re-decodes at exact dims", async () => {
    const res = await postTool(
      "resize",
      { width: 300 },
      PORTRAIT_JPG,
      "portrait-color.jpg",
      "image/jpeg",
    );
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const payload = await download(envelope.downloadUrl);
    const meta = await sharp(payload).metadata();
    expect(meta.width).toBe(300);
    expect(meta.height).toBeGreaterThan(0);
  });

  it("resizes PNG to 50x50 cover, output is exactly 50x50", async () => {
    const res = await postTool(
      "resize",
      { width: 50, height: 50, fit: "cover" },
      PNG_200,
      "test.png",
      "image/png",
    );
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    const payload = await download(envelope.downloadUrl);
    const meta = await sharp(payload).metadata();
    expect(meta.width).toBe(50);
    expect(meta.height).toBe(50);
  });
});

// -----------------------------------------------------------------------
// Compress depth tests
// -----------------------------------------------------------------------
describe("Image depth: compress real heroes", () => {
  it("compresses portrait JPG, output is valid and smaller", async () => {
    const res = await postTool(
      "compress",
      { mode: "quality", quality: 40 },
      PORTRAIT_JPG,
      "portrait-color.jpg",
      "image/jpeg",
    );
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const payload = await download(envelope.downloadUrl);
    // Output must be a valid image
    const meta = await sharp(payload).metadata();
    expect(meta.width).toBeGreaterThan(0);
    // Compressed size should be smaller than original
    expect(payload.length).toBeLessThan(PORTRAIT_JPG.length);
  });

  it("compresses PNG, output is a valid decodable image", async () => {
    const res = await postTool(
      "compress",
      { mode: "quality", quality: 60 },
      PNG_200,
      "test.png",
      "image/png",
    );
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    const payload = await download(envelope.downloadUrl);
    const meta = await sharp(payload).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });
});

// -----------------------------------------------------------------------
// Convert depth tests (HEIC -> JPG/PNG)
// -----------------------------------------------------------------------
describe("Image depth: convert HEIC hero", { timeout: 120_000 }, () => {
  it("converts HEIC portrait to JPG, output is a valid JPEG", async () => {
    const res = await postTool(
      "convert",
      { format: "jpg", quality: 80 },
      PORTRAIT_HEIC,
      "portrait-headshot.heic",
      "image/heic",
    );
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const payload = await download(envelope.downloadUrl);
    const meta = await sharp(payload).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBeGreaterThan(0);
    expect(meta.height).toBeGreaterThan(0);
  });

  it("converts HEIC portrait to PNG, output is a valid PNG", async () => {
    const res = await postTool(
      "convert",
      { format: "png" },
      PORTRAIT_HEIC,
      "portrait-headshot.heic",
      "image/heic",
    );
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const payload = await download(envelope.downloadUrl);
    const meta = await sharp(payload).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBeGreaterThan(0);
  });
});

// -----------------------------------------------------------------------
// Info / metadata depth tests
// -----------------------------------------------------------------------
describe("Image depth: extract metadata from EXIF hero", () => {
  it("extracts EXIF data from test-with-exif.jpg", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test-with-exif.jpg",
        contentType: "image/jpeg",
        content: EXIF_JPG,
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.hasExif).toBe(true);
    expect(result.format).toBe("jpeg");
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    expect(result.fileSize).toBeGreaterThan(0);
    expect(typeof result.colorSpace).toBe("string");
  });

  it("returns dimensions for portrait JPG hero", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "portrait-color.jpg",
        contentType: "image/jpeg",
        content: PORTRAIT_JPG,
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    expect(result.format).toBe("jpeg");
    expect(result.channels).toBeGreaterThanOrEqual(3);
  });
});
