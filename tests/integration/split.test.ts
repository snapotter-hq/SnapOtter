/**
 * Integration tests for the split tool (/api/v1/tools/split).
 *
 * The split tool divides an image into a grid of tiles and returns a ZIP.
 * It uses reply.hijack() to stream the ZIP directly, so responses are
 * raw binary rather than JSON.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import AdmZip from "adm-zip";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const FIXTURES = join(__dirname, "..", "fixtures");
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

describe("Split", () => {
  it("splits a 200x150 image into a 2x2 grid", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ columns: 2, rows: 2 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");

    // Parse the ZIP and verify 4 tiles
    const zip = new AdmZip(res.rawPayload);
    const entries = zip.getEntries();
    expect(entries.length).toBe(4);

    // Verify tile naming convention: test_r1_c1.png, test_r1_c2.png, etc.
    const names = entries.map((e) => e.entryName).sort();
    expect(names).toEqual(["test_r1_c1.png", "test_r1_c2.png", "test_r2_c1.png", "test_r2_c2.png"]);

    // Verify each tile has correct dimensions
    // 200/2 = 100 wide, 150/2 = 75 tall
    for (const entry of entries) {
      const meta = await sharp(entry.getData()).metadata();
      expect(meta.width).toBe(100);
      expect(meta.height).toBe(75);
    }
  });

  it("splits into a 3x3 grid with remainder tiles", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "img.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ columns: 3, rows: 3 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);

    const zip = new AdmZip(res.rawPayload);
    const entries = zip.getEntries();
    expect(entries.length).toBe(9);

    // Bottom-right tile gets the remainder pixels
    // 200/3 = floor 66, last col: 200 - 2*66 = 68
    // 150/3 = floor 50, last row: 150 - 2*50 = 50
    const bottomRight = entries.find((e) => e.entryName === "img_r3_c3.png");
    expect(bottomRight).toBeDefined();
    const meta = await sharp(bottomRight!.getData()).metadata();
    expect(meta.width).toBe(200 - 2 * 66); // 68
    expect(meta.height).toBe(150 - 2 * 50); // 50
  });

  it("splits using fixed tile dimensions", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ tileWidth: 100, tileHeight: 75 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);

    const zip = new AdmZip(res.rawPayload);
    const entries = zip.getEntries();
    // 200/100 = 2 cols, 150/75 = 2 rows = 4 tiles
    expect(entries.length).toBe(4);
  });

  it("converts tile format to webp", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ columns: 2, rows: 1, outputFormat: "webp" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);

    const zip = new AdmZip(res.rawPayload);
    const entries = zip.getEntries();
    expect(entries.length).toBe(2);

    // Verify filenames have .webp extension
    for (const entry of entries) {
      expect(entry.entryName).toMatch(/\.webp$/);
    }

    // Verify actual format is webp
    const meta = await sharp(entries[0].getData()).metadata();
    expect(meta.format).toBe("webp");
  });

  it("uses default settings (3x3 grid) when none provided", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);

    const zip = new AdmZip(res.rawPayload);
    // Default is 3 columns x 3 rows = 9 tiles
    expect(zip.getEntries().length).toBe(9);
  });

  // ── Validation ──────────────────────────────────────────────────────

  it("rejects requests without a file", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({ columns: 2, rows: 2 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/no image/i);
  });

  it("rejects columns exceeding max (100)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ columns: 101, rows: 2 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects unauthenticated requests", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ columns: 2, rows: 2 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });

  // ── Extended coverage: grid modes, output formats, tile dimensions ──

  it("splits into a 1x1 grid (single tile = full image)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ columns: 1, rows: 1 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(res.rawPayload);
    const entries = zip.getEntries();
    expect(entries.length).toBe(1);

    const meta = await sharp(entries[0].getData()).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  it("splits into a 4x1 grid (4 columns, 1 row)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ columns: 4, rows: 1 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(res.rawPayload);
    const entries = zip.getEntries();
    expect(entries.length).toBe(4);

    // Each tile should have full height
    for (const entry of entries) {
      const meta = await sharp(entry.getData()).metadata();
      expect(meta.height).toBe(150);
    }
  });

  it("splits into a 1x3 grid (1 column, 3 rows)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ columns: 1, rows: 3 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(res.rawPayload);
    const entries = zip.getEntries();
    expect(entries.length).toBe(3);

    // Each tile should have full width
    for (const entry of entries) {
      const meta = await sharp(entry.getData()).metadata();
      expect(meta.width).toBe(200);
    }
  });

  it("converts tile format to jpeg with quality", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ columns: 2, rows: 2, outputFormat: "jpg", quality: 70 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(res.rawPayload);
    const entries = zip.getEntries();
    expect(entries.length).toBe(4);

    for (const entry of entries) {
      expect(entry.entryName).toMatch(/\.jpg$/);
      const meta = await sharp(entry.getData()).metadata();
      expect(meta.format).toBe("jpeg");
    }
  });

  it("converts tile format to avif", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ columns: 2, rows: 1, outputFormat: "avif" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(res.rawPayload);
    const entries = zip.getEntries();
    expect(entries.length).toBe(2);

    for (const entry of entries) {
      expect(entry.entryName).toMatch(/\.avif$/);
    }
  });

  it("keeps original format when outputFormat is 'original'", async () => {
    const JPG = readFileSync(join(FIXTURES, "test-100x100.jpg"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ columns: 2, rows: 1, outputFormat: "original" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(res.rawPayload);
    const entries = zip.getEntries();
    expect(entries.length).toBe(2);

    for (const entry of entries) {
      expect(entry.entryName).toMatch(/\.jpg$/);
    }
  });

  it("uses fixed tile dimensions that divide evenly", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ tileWidth: 50, tileHeight: 50 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(res.rawPayload);
    const entries = zip.getEntries();
    // 200/50 = 4 cols, 150/50 = 3 rows = 12 tiles
    expect(entries.length).toBe(12);

    for (const entry of entries) {
      const meta = await sharp(entry.getData()).metadata();
      expect(meta.width).toBe(50);
      expect(meta.height).toBe(50);
    }
  });

  it("uses fixed tile dimensions with remainder (non-even divide)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ tileWidth: 80, tileHeight: 80 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(res.rawPayload);
    const entries = zip.getEntries();
    // 200/80 = ceil(2.5) = 3 cols, 150/80 = ceil(1.875) = 2 rows = 6 tiles
    expect(entries.length).toBe(6);

    // Last column tile should have remainder width
    const lastColTile = entries.find((e) => e.entryName.includes("_r1_c3"));
    expect(lastColTile).toBeDefined();
    const lastColMeta = await sharp(lastColTile!.getData()).metadata();
    expect(lastColMeta.width).toBe(200 - 2 * 80); // 40
    expect(lastColMeta.height).toBe(80);

    // Last row tile should have remainder height
    const lastRowTile = entries.find((e) => e.entryName.includes("_r2_c1"));
    expect(lastRowTile).toBeDefined();
    const lastRowMeta = await sharp(lastRowTile!.getData()).metadata();
    expect(lastRowMeta.width).toBe(80);
    expect(lastRowMeta.height).toBe(150 - 80); // 70
  });

  it("uses fixed tile dimensions with output format conversion", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          tileWidth: 100,
          tileHeight: 75,
          outputFormat: "webp",
          quality: 85,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(res.rawPayload);
    const entries = zip.getEntries();
    expect(entries.length).toBe(4);

    for (const entry of entries) {
      expect(entry.entryName).toMatch(/\.webp$/);
      const meta = await sharp(entry.getData()).metadata();
      expect(meta.format).toBe("webp");
    }
  });

  it("splits a JPEG input image", async () => {
    const JPG = readFileSync(join(FIXTURES, "test-100x100.jpg"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ columns: 2, rows: 2 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(res.rawPayload);
    const entries = zip.getEntries();
    expect(entries.length).toBe(4);

    // Tiles should use the original extension
    for (const entry of entries) {
      expect(entry.entryName).toMatch(/\.jpg$/);
    }
  });

  it("splits a WebP input image", async () => {
    const WEBP = readFileSync(join(FIXTURES, "test-50x50.webp"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "img.webp", contentType: "image/webp", content: WEBP },
      {
        name: "settings",
        content: JSON.stringify({ columns: 2, rows: 2 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(res.rawPayload);
    const entries = zip.getEntries();
    expect(entries.length).toBe(4);

    for (const entry of entries) {
      expect(entry.entryName).toMatch(/\.webp$/);
    }
  });

  it("splits a HEIC input image", async () => {
    const HEIC = readFileSync(join(FIXTURES, "test-200x150.heic"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.heic", contentType: "image/heic", content: HEIC },
      {
        name: "settings",
        content: JSON.stringify({ columns: 2, rows: 2, outputFormat: "png" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(res.rawPayload);
    const entries = zip.getEntries();
    expect(entries.length).toBe(4);

    for (const entry of entries) {
      expect(entry.entryName).toMatch(/\.png$/);
      const meta = await sharp(entry.getData()).metadata();
      expect(meta.format).toBe("png");
    }
  });

  it("returns proper content-disposition header with job ID", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ columns: 2, rows: 2 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    expect(res.headers["content-disposition"]).toMatch(/^attachment; filename="split-/);
  });

  it("rejects rows exceeding max (100)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ columns: 2, rows: 101 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects invalid JSON in settings", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: "not json" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/json/i);
  });

  it("rejects invalid output format", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ columns: 2, rows: 2, outputFormat: "bmp" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  it("handles a 10x10 grid (many tiles)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ columns: 10, rows: 10 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(res.rawPayload);
    const entries = zip.getEntries();
    expect(entries.length).toBe(100);
  });

  // ── Branch coverage: HEIC with grid split (lines 59-165) ────────────

  it("splits a HEIC image into a grid without format conversion", async () => {
    const HEIC = readFileSync(join(FIXTURES, "test-200x150.heic"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.heic", contentType: "image/heic", content: HEIC },
      {
        name: "settings",
        content: JSON.stringify({ columns: 2, rows: 2 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(res.rawPayload);
    const entries = zip.getEntries();
    expect(entries.length).toBe(4);
  });

  // ── Branch coverage: custom tile dimensions with HEIC ───────────────

  it("splits HEIC image using fixed tile dimensions", async () => {
    const HEIC = readFileSync(join(FIXTURES, "test-200x150.heic"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.heic", contentType: "image/heic", content: HEIC },
      {
        name: "settings",
        content: JSON.stringify({ tileWidth: 100, tileHeight: 75, outputFormat: "jpg" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(res.rawPayload);
    const entries = zip.getEntries();
    expect(entries.length).toBe(4);
    for (const entry of entries) {
      expect(entry.entryName).toMatch(/\.jpg$/);
    }
  });

  // ── Branch coverage: 1x1 pixel image split ──────────────────────────

  it("splits a 1x1 pixel image into a single tile", async () => {
    const TINY = readFileSync(join(FIXTURES, "test-1x1.png"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.png", contentType: "image/png", content: TINY },
      {
        name: "settings",
        content: JSON.stringify({ columns: 1, rows: 1 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(res.rawPayload);
    const entries = zip.getEntries();
    expect(entries.length).toBe(1);
    const meta = await sharp(entries[0].getData()).metadata();
    expect(meta.width).toBe(1);
    expect(meta.height).toBe(1);
  });

  // ── Branch coverage: large stress image ─────────────────────────────

  it("splits a large stress image", async () => {
    const LARGE = readFileSync(join(FIXTURES, "content", "stress-large.jpg"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "large.jpg", contentType: "image/jpeg", content: LARGE },
      {
        name: "settings",
        content: JSON.stringify({ columns: 3, rows: 3, outputFormat: "jpg", quality: 80 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(res.rawPayload);
    const entries = zip.getEntries();
    expect(entries.length).toBe(9);
    for (const entry of entries) {
      expect(entry.entryName).toMatch(/\.jpg$/);
    }
  });

  // ── Branch coverage: tile dimensions larger than image ──────────────

  it("uses tile dimensions larger than the image (single tile)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ tileWidth: 500, tileHeight: 500 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(res.rawPayload);
    const entries = zip.getEntries();
    // 200/500 = ceil(0.4) = 1 col, 150/500 = ceil(0.3) = 1 row = 1 tile
    expect(entries.length).toBe(1);
    const meta = await sharp(entries[0].getData()).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  // ── Branch coverage: tile dimensions with avif format conversion ────

  it("splits using tile dimensions with avif output format", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          tileWidth: 100,
          tileHeight: 75,
          outputFormat: "avif",
          quality: 60,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(res.rawPayload);
    const entries = zip.getEntries();
    expect(entries.length).toBe(4);
    for (const entry of entries) {
      expect(entry.entryName).toMatch(/\.avif$/);
    }
  });

  // ── Branch coverage: file without extension ─────────────────────────

  it("handles a file without an extension (uses .png default)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "noext", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ columns: 2, rows: 2 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(res.rawPayload);
    const entries = zip.getEntries();
    expect(entries.length).toBe(4);
  });

  // ── Branch coverage: PNG format conversion ──────────────────────────

  it("converts tiles to explicit png format from jpg source", async () => {
    const JPG = readFileSync(join(FIXTURES, "test-100x100.jpg"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ columns: 2, rows: 2, outputFormat: "png" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(res.rawPayload);
    const entries = zip.getEntries();
    expect(entries.length).toBe(4);
    for (const entry of entries) {
      expect(entry.entryName).toMatch(/\.png$/);
      const meta = await sharp(entry.getData()).metadata();
      expect(meta.format).toBe("png");
    }
  });

  // ── Branch coverage: split with jpg quality conversion ──────────────

  it("splits PNG source to jpg tiles with custom quality setting", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ columns: 2, rows: 1, outputFormat: "jpg", quality: 50 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(res.rawPayload);
    const entries = zip.getEntries();
    expect(entries.length).toBe(2);
    for (const entry of entries) {
      expect(entry.entryName).toMatch(/\.jpg$/);
      const meta = await sharp(entry.getData()).metadata();
      expect(meta.format).toBe("jpeg");
    }
  });

  // ── Branch coverage: portrait image split ───────────────────────────

  it("splits a portrait image into a grid", async () => {
    const PORTRAIT = readFileSync(join(FIXTURES, "test-portrait.jpg"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "portrait.jpg", contentType: "image/jpeg", content: PORTRAIT },
      {
        name: "settings",
        content: JSON.stringify({ columns: 2, rows: 3 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(res.rawPayload);
    const entries = zip.getEntries();
    expect(entries.length).toBe(6);
  });

  // ── Branch coverage: HEIC split with webp output ────────────────────

  it("splits HEIC image with webp output format", async () => {
    const HEIC = readFileSync(join(FIXTURES, "test-200x150.heic"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.heic", contentType: "image/heic", content: HEIC },
      {
        name: "settings",
        content: JSON.stringify({ columns: 2, rows: 2, outputFormat: "webp", quality: 75 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(res.rawPayload);
    const entries = zip.getEntries();
    expect(entries.length).toBe(4);
    for (const entry of entries) {
      expect(entry.entryName).toMatch(/\.webp$/);
      const meta = await sharp(entry.getData()).metadata();
      expect(meta.format).toBe("webp");
    }
  });

  // ── Branch coverage: tileWidth only (no tileHeight) uses grid mode ─

  it("falls back to grid columns/rows when only tileWidth is provided", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ tileWidth: 50, columns: 2, rows: 2 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(res.rawPayload);
    const entries = zip.getEntries();
    // Without tileHeight, tileWidth is ignored, falls back to columns/rows: 2x2 = 4
    expect(entries.length).toBe(4);
  });

  // ── Branch coverage: columns 0 is clamped by Zod min(1) ────────────

  it("rejects columns less than minimum (1)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ columns: 0, rows: 2 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Branch coverage: tileHeight below min(10) ──────────────────────

  it("rejects tileHeight below minimum (10)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ tileWidth: 50, tileHeight: 5 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Branch coverage: exif-oriented image split ──────────────────────

  it("splits an image with EXIF orientation data", async () => {
    const EXIF = readFileSync(join(FIXTURES, "test-with-exif.jpg"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "exif.jpg", contentType: "image/jpeg", content: EXIF },
      {
        name: "settings",
        content: JSON.stringify({ columns: 2, rows: 2, outputFormat: "png" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(res.rawPayload);
    const entries = zip.getEntries();
    expect(entries.length).toBe(4);
    for (const entry of entries) {
      const meta = await sharp(entry.getData()).metadata();
      expect(meta.format).toBe("png");
      expect(meta.width).toBeGreaterThan(0);
      expect(meta.height).toBeGreaterThan(0);
    }
  });

  // ── Batch endpoint for split (exercises registerToolProcessFn) ──────

  it("splits via batch endpoint with grid mode", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "batch1.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ columns: 2, rows: 2 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split/batch",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    const zip = new AdmZip(res.rawPayload);
    const entries = zip.getEntries();
    expect(entries.length).toBeGreaterThan(0);
  });

  it("splits via batch endpoint with tileWidth and tileHeight", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "batch-tile.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ tileWidth: 100, tileHeight: 75 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split/batch",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
  });

  it("splits via batch endpoint with output format conversion", async () => {
    const JPG = readFileSync(join(FIXTURES, "test-100x100.jpg"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "batch-fmt.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ columns: 2, rows: 2, outputFormat: "webp", quality: 80 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split/batch",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("splits via batch endpoint with avif output and custom quality", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "batch-avif.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ columns: 2, rows: 1, outputFormat: "avif", quality: 60 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split/batch",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("splits via batch endpoint with remainder tiles", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "batch-rem.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ tileWidth: 80, tileHeight: 80 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split/batch",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  // ── Additional edge cases ──────────────────────────────────────────

  it("splits large stress image via batch endpoint", async () => {
    const LARGE = readFileSync(join(FIXTURES, "content", "stress-large.jpg"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "stress.jpg", contentType: "image/jpeg", content: LARGE },
      {
        name: "settings",
        content: JSON.stringify({ columns: 2, rows: 2, outputFormat: "jpg", quality: 70 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split/batch",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("splits with original format preserved via batch endpoint", async () => {
    const JPG = readFileSync(join(FIXTURES, "test-100x100.jpg"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "keep.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ columns: 2, rows: 1, outputFormat: "original" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split/batch",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("splits file without extension via batch endpoint", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "noext", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ columns: 2, rows: 2 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/split/batch",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
  });
});
