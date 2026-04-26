/**
 * Integration tests for the bulk-rename tool (/api/v1/tools/bulk-rename).
 *
 * Covers pattern-based renaming with {{index}}, {{padded}}, {{original}}
 * placeholders, custom start index, ZIP response format, and input validation.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import AdmZip from "adm-zip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const FIXTURES = join(__dirname, "..", "fixtures");
const PNG = readFileSync(join(FIXTURES, "test-200x150.png"));
const JPG = readFileSync(join(FIXTURES, "test-100x100.jpg"));
const WEBP = readFileSync(join(FIXTURES, "test-50x50.webp"));

/** Extract sorted filenames from a ZIP buffer. */
function zipEntryNames(buf: Buffer): string[] {
  const zip = new AdmZip(buf);
  return zip
    .getEntries()
    .map((e) => e.entryName)
    .sort();
}

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

describe("Bulk Rename", () => {
  it("renames files using the default pattern and returns a ZIP", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "pic.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/bulk-rename",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");

    const filenames = zipEntryNames(res.rawPayload);

    // Default pattern is "image-{{index}}", starting at 1
    expect(filenames).toHaveLength(2);
    expect(filenames).toContain("image-1.png");
    expect(filenames).toContain("image-2.jpg");
  });

  it("renames files using a custom pattern with {{index}}", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ pattern: "photo-{{index}}" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/bulk-rename",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);

    const filenames = zipEntryNames(res.rawPayload);
    expect(filenames).toContain("photo-1.png");
    expect(filenames).toContain("photo-2.jpg");
  });

  it("renames files using {{padded}} placeholder", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      { name: "file", filename: "c.webp", contentType: "image/webp", content: WEBP },
      { name: "settings", content: JSON.stringify({ pattern: "img-{{padded}}" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/bulk-rename",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);

    const filenames = zipEntryNames(res.rawPayload);

    // 3 files starting at 1, max index is 3 => 1 char pad
    expect(filenames).toContain("img-1.png");
    expect(filenames).toContain("img-2.jpg");
    expect(filenames).toContain("img-3.webp");
  });

  it("renames files using {{original}} placeholder", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "sunset.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "beach.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ pattern: "backup-{{original}}" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/bulk-rename",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);

    const filenames = zipEntryNames(res.rawPayload);
    expect(filenames).toContain("backup-sunset.png");
    expect(filenames).toContain("backup-beach.jpg");
  });

  it("respects custom startIndex", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ pattern: "file-{{index}}", startIndex: 10 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/bulk-rename",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);

    const filenames = zipEntryNames(res.rawPayload);
    expect(filenames).toContain("file-10.png");
    expect(filenames).toContain("file-11.jpg");
  });

  it("preserves file content after rename", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ pattern: "renamed-{{index}}" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/bulk-rename",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);

    const zip = new AdmZip(res.rawPayload);
    const entry = zip.getEntry("renamed-1.png");
    expect(entry).not.toBeNull();

    const content = entry!.getData();
    expect(content.length).toBe(PNG.length);
    expect(content.equals(PNG)).toBe(true);
  });

  // ── Validation ──────────────────────────────────────────────────────

  it("rejects requests with no files", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({ pattern: "file-{{index}}" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/bulk-rename",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/no files/i);
  });

  it("rejects unauthenticated requests", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/bulk-rename",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });

  // ── Pattern combinations ──────────────────────────────────────

  it("combines {{original}} and {{index}} in one pattern", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "moon.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "star.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ pattern: "{{original}}-{{index}}" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/bulk-rename",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const filenames = zipEntryNames(res.rawPayload);
    expect(filenames).toContain("moon-1.png");
    expect(filenames).toContain("star-2.jpg");
  });

  it("renames a single file correctly", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "solo.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ pattern: "renamed-{{index}}" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/bulk-rename",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const filenames = zipEntryNames(res.rawPayload);
    expect(filenames).toHaveLength(1);
    expect(filenames).toContain("renamed-1.png");
  });

  it("handles many files with padded indices", async () => {
    // Use 10 files (the MAX_BATCH_SIZE in test env) to trigger wider padding
    const files = [];
    for (let i = 0; i < 10; i++) {
      files.push({
        name: "file",
        filename: `img${i}.png`,
        contentType: "image/png",
        content: PNG,
      });
    }
    files.push({
      name: "settings",
      content: JSON.stringify({ pattern: "photo-{{padded}}" }),
    });

    const { body, contentType } = createMultipartPayload(files);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/bulk-rename",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const filenames = zipEntryNames(res.rawPayload);
    expect(filenames).toHaveLength(10);
    // With 10 files, padded index 1 should be "01"
    expect(filenames).toContain("photo-01.png");
    expect(filenames).toContain("photo-10.png");
  });

  it("preserves different file extensions per file", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      { name: "file", filename: "c.webp", contentType: "image/webp", content: WEBP },
      { name: "settings", content: JSON.stringify({ pattern: "output-{{index}}" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/bulk-rename",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const filenames = zipEntryNames(res.rawPayload);
    expect(filenames).toContain("output-1.png");
    expect(filenames).toContain("output-2.jpg");
    expect(filenames).toContain("output-3.webp");
  });

  it("skips empty file buffers (zero-length files)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "real.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "empty.png", contentType: "image/png", content: Buffer.alloc(0) },
      { name: "settings", content: JSON.stringify({ pattern: "item-{{index}}" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/bulk-rename",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const filenames = zipEntryNames(res.rawPayload);
    // Empty file is skipped, so only 1 file should be in the ZIP
    expect(filenames).toHaveLength(1);
    expect(filenames).toContain("item-1.png");
  });

  it("returns 400 for invalid settings JSON", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: "not-json{{{" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/bulk-rename",
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

  it("returns 400 for invalid settings values", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ pattern: "", startIndex: -1 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/bulk-rename",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/invalid settings/i);
  });

  it("handles files with no extension", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "noext", contentType: "application/octet-stream", content: PNG },
      { name: "settings", content: JSON.stringify({ pattern: "renamed-{{index}}" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/bulk-rename",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const filenames = zipEntryNames(res.rawPayload);
    expect(filenames).toHaveLength(1);
    // No extension to preserve
    expect(filenames[0]).toBe("renamed-1");
  });

  it("handles startIndex of 0", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "x.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "y.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ pattern: "zero-{{index}}", startIndex: 0 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/bulk-rename",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const filenames = zipEntryNames(res.rawPayload);
    expect(filenames).toContain("zero-0.png");
    expect(filenames).toContain("zero-1.jpg");
  });
});
