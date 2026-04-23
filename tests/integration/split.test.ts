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
});
