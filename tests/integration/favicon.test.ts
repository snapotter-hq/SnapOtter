/**
 * Integration tests for the favicon tool.
 *
 * Generates a ZIP archive containing favicon assets (multiple PNG sizes,
 * ICO, manifest.json, HTML snippet). Custom route that streams a ZIP
 * response via reply.hijack().
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

describe("favicon", () => {
  it("generates favicon ZIP from a single image", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "logo.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/zip");

    // Parse the ZIP and verify expected files
    const zipBuffer = Buffer.from(res.rawPayload);
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries().map((e) => e.entryName);

    expect(entries).toContain("favicon-16x16.png");
    expect(entries).toContain("favicon-32x32.png");
    expect(entries).toContain("favicon-48x48.png");
    expect(entries).toContain("apple-touch-icon.png");
    expect(entries).toContain("android-chrome-192x192.png");
    expect(entries).toContain("android-chrome-512x512.png");
    expect(entries).toContain("favicon.ico");
    expect(entries).toContain("manifest.json");
    expect(entries).toContain("favicon-snippet.html");
  });

  it("manifest.json is valid JSON", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "logo.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(Buffer.from(res.rawPayload));
    const manifestEntry = zip.getEntry("manifest.json");
    expect(manifestEntry).toBeDefined();
    const manifest = JSON.parse(manifestEntry!.getData().toString("utf-8"));
    expect(manifest.icons).toBeDefined();
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  it("HTML snippet contains link tags", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "logo.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(Buffer.from(res.rawPayload));
    const snippetEntry = zip.getEntry("favicon-snippet.html");
    expect(snippetEntry).toBeDefined();
    const html = snippetEntry!.getData().toString("utf-8");
    expect(html).toContain('<link rel="icon"');
    expect(html).toContain('<link rel="apple-touch-icon"');
    expect(html).toContain('<link rel="manifest"');
  });

  it("favicon PNG entries have non-zero size", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "logo.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(Buffer.from(res.rawPayload));
    for (const name of ["favicon-16x16.png", "favicon-32x32.png", "favicon.ico"]) {
      const entry = zip.getEntry(name);
      expect(entry).toBeDefined();
      expect(entry!.header.size).toBeGreaterThan(0);
    }
  });

  it("uses subfolder structure for multiple images", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "icon1.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "icon2.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(Buffer.from(res.rawPayload));
    const entries = zip.getEntries().map((e) => e.entryName);
    // Multiple files get per-image subfolder prefixes
    expect(entries.some((e) => e.startsWith("icon1/"))).toBe(true);
    expect(entries.some((e) => e.startsWith("icon2/"))).toBe(true);
  });

  it("rejects request without any files", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toContain("No image file");
  });

  // ── Additional coverage: SVG input ─────────────────────────────
  it("generates favicons from SVG input", async () => {
    const SVG = readFileSync(join(FIXTURES, "test-100x100.svg"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "logo.svg", contentType: "image/svg+xml", content: SVG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/zip");

    const zip = new AdmZip(Buffer.from(res.rawPayload));
    const entries = zip.getEntries().map((e) => e.entryName);
    expect(entries).toContain("favicon-16x16.png");
    expect(entries).toContain("favicon-32x32.png");
    expect(entries).toContain("android-chrome-512x512.png");
    expect(entries).toContain("favicon.ico");
  });

  // ── Additional coverage: JPEG input ────────────────────────────
  it("generates favicons from JPEG input", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "logo.jpg",
        contentType: "image/jpeg",
        content: readFileSync(join(FIXTURES, "test-100x100.jpg")),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(Buffer.from(res.rawPayload));
    const entries = zip.getEntries().map((e) => e.entryName);
    expect(entries).toContain("favicon-16x16.png");
    expect(entries).toContain("favicon.ico");
  });

  // ── Additional coverage: WebP input ────────────────────────────
  it("generates favicons from WebP input", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "logo.webp",
        contentType: "image/webp",
        content: readFileSync(join(FIXTURES, "test-50x50.webp")),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(Buffer.from(res.rawPayload));
    const entries = zip.getEntries().map((e) => e.entryName);
    expect(entries).toContain("android-chrome-192x192.png");
    expect(entries).toContain("manifest.json");
  });

  // ── Additional coverage: HEIC input ────────────────────────────
  it("generates favicons from HEIC input", async () => {
    const HEIC = readFileSync(join(FIXTURES, "test-200x150.heic"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.heic", contentType: "image/heic", content: HEIC },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(Buffer.from(res.rawPayload));
    const entries = zip.getEntries().map((e) => e.entryName);
    expect(entries).toContain("favicon-32x32.png");
    expect(entries).toContain("favicon.ico");
  });

  // ── Additional coverage: favicon PNG sizes are correct ─────────
  it("generates correct pixel dimensions for each favicon size", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "logo.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(Buffer.from(res.rawPayload));

    const expectedSizes: Record<string, number> = {
      "favicon-16x16.png": 16,
      "favicon-32x32.png": 32,
      "favicon-48x48.png": 48,
      "apple-touch-icon.png": 180,
      "android-chrome-192x192.png": 192,
      "android-chrome-512x512.png": 512,
    };

    for (const [name, expectedSize] of Object.entries(expectedSizes)) {
      const entry = zip.getEntry(name);
      expect(entry).toBeDefined();
      const meta = await sharp(entry!.getData()).metadata();
      expect(meta.width).toBe(expectedSize);
      expect(meta.height).toBe(expectedSize);
    }
  });

  // ── Additional coverage: manifest.json contains app name ──────
  it("manifest.json uses the file stem as app name", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "my-app-logo.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(Buffer.from(res.rawPayload));
    const manifest = JSON.parse(zip.getEntry("manifest.json")!.getData().toString("utf-8"));
    expect(manifest.name).toBe("my-app-logo");
    expect(manifest.short_name).toBe("my-app-logo");
    expect(manifest.theme_color).toBe("#ffffff");
    expect(manifest.display).toBe("standalone");
  });

  // ── Additional coverage: invalid settings JSON ─────────────────
  it("rejects invalid settings JSON", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "logo.png", contentType: "image/png", content: PNG },
      { name: "settings", content: "not-json" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toContain("Settings must be valid JSON");
  });

  // ── Additional coverage: invalid image data ────────────────────
  it("rejects corrupted image data", async () => {
    const badBuffer = Buffer.from("this is not an image");
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "bad.png", contentType: "image/png", content: badBuffer },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toContain("Invalid file");
  });

  // ── Additional coverage: Content-Disposition header ────────────
  it("response has correct Content-Disposition header", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "logo.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const disposition = res.headers["content-disposition"] as string;
    expect(disposition).toContain("attachment");
    expect(disposition).toContain("favicons-");
    expect(disposition).toContain(".zip");
  });

  // ── Additional coverage: subfolder manifest per image ──────────
  it("each subfolder in multi-image has its own manifest and snippet", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "brand1.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "brand2.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(Buffer.from(res.rawPayload));
    const entries = zip.getEntries().map((e) => e.entryName);
    expect(entries).toContain("brand1/manifest.json");
    expect(entries).toContain("brand2/manifest.json");
    expect(entries).toContain("brand1/favicon-snippet.html");
    expect(entries).toContain("brand2/favicon-snippet.html");
    expect(entries).toContain("brand1/favicon.ico");
    expect(entries).toContain("brand2/favicon.ico");
  });

  // ── Branch coverage: line 33 (multipart parse error catch) ────────
  // The multipart parse error (lines 48-53) triggers on malformed streams
  // which is very hard to synthesize in inject(). The settings path is
  // already covered by the invalid JSON test above.

  // ── Branch coverage: lines 74-77 (settings JSON parse catch) ──────
  // Already covered by "rejects invalid settings JSON" test above.

  // ── Branch coverage: lines 144-150 (processing error after hijack) ──
  // This branch is the catch block when processing fails AFTER reply.hijack()
  // has already been called. When headers have been sent, the code skips
  // the 422 reply. We test the pre-hijack path here (corrupted data
  // that fails file validation triggers before hijack).

  // ── Tiny 1x1 input ───────────────────────────────────────────────

  it("generates favicons from a 1x1 pixel image", async () => {
    const TINY = readFileSync(join(FIXTURES, "test-1x1.png"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.png", contentType: "image/png", content: TINY },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(Buffer.from(res.rawPayload));
    const entries = zip.getEntries().map((e) => e.entryName);
    expect(entries).toContain("favicon-16x16.png");
    expect(entries).toContain("android-chrome-512x512.png");

    // Verify the 16x16 is actually 16x16 even from a 1x1 source
    const entry16 = zip.getEntry("favicon-16x16.png");
    expect(entry16).toBeDefined();
    const meta = await sharp(entry16!.getData()).metadata();
    expect(meta.width).toBe(16);
    expect(meta.height).toBe(16);
  });

  // ── Large stress file ─────────────────────────────────────────────

  it("generates favicons from stress-large.jpg", async () => {
    const LARGE = readFileSync(join(FIXTURES, "content", "stress-large.jpg"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "large.jpg", contentType: "image/jpeg", content: LARGE },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(Buffer.from(res.rawPayload));
    const entries = zip.getEntries().map((e) => e.entryName);
    expect(entries).toContain("favicon-32x32.png");
    expect(entries).toContain("android-chrome-512x512.png");
  });

  // ── Portrait HEIC input ───────────────────────────────────────────

  it("generates favicons from portrait HEIC", async () => {
    const HEIC_PORTRAIT = readFileSync(join(FIXTURES, "test-portrait.heic"));
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "portrait.heic",
        contentType: "image/heic",
        content: HEIC_PORTRAIT,
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(Buffer.from(res.rawPayload));
    const entries = zip.getEntries().map((e) => e.entryName);
    expect(entries).toContain("favicon-32x32.png");

    // Square output even from portrait input (fit: cover)
    const entry32 = zip.getEntry("favicon-32x32.png");
    const meta = await sharp(entry32!.getData()).metadata();
    expect(meta.width).toBe(32);
    expect(meta.height).toBe(32);
  });

  // ── Empty settings object ─────────────────────────────────────────

  it("accepts empty settings object", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "logo.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(Buffer.from(res.rawPayload));
    const entries = zip.getEntries().map((e) => e.entryName);
    expect(entries).toContain("favicon-16x16.png");
  });

  // ── No settings field at all ──────────────────────────────────────

  it("works when no settings field is provided", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "logo.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(Buffer.from(res.rawPayload));
    const entries = zip.getEntries().map((e) => e.entryName);
    expect(entries).toContain("favicon-16x16.png");
    expect(entries).toContain("manifest.json");
  });
});
