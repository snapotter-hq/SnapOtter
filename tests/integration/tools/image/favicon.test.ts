/**
 * Integration tests for the favicon tool.
 *
 * Generates a ZIP archive containing favicon assets (multiple PNG sizes,
 * ICO, manifest.json, HTML snippet). Custom route that streams a ZIP
 * response via reply.hijack().
 */

import { execFileSync } from "node:child_process";
import AdmZip from "adm-zip";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

/** Check if ImageMagick is available on this system. */
function checkMagickAvailable(): boolean {
  try {
    execFileSync("magick", ["--version"], { timeout: 5_000, stdio: "ignore" });
    return true;
  } catch {
    try {
      execFileSync("convert", ["--version"], { timeout: 5_000, stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }
}

const HAS_MAGICK = checkMagickAvailable();

const PNG = readFixture(fixtures.image.base.png200);

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
      url: "/api/v1/tools/image/favicon",
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
      url: "/api/v1/tools/image/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(Buffer.from(res.rawPayload));
    const manifestEntry = zip.getEntry("manifest.json");
    expect(manifestEntry).toBeDefined();
    const manifest = JSON.parse(manifestEntry?.getData().toString("utf-8"));
    expect(manifest.icons).toBeDefined();
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  it("HTML snippet contains link tags", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "logo.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(Buffer.from(res.rawPayload));
    const snippetEntry = zip.getEntry("favicon-snippet.html");
    expect(snippetEntry).toBeDefined();
    const html = snippetEntry?.getData().toString("utf-8");
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
      url: "/api/v1/tools/image/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(Buffer.from(res.rawPayload));
    for (const name of ["favicon-16x16.png", "favicon-32x32.png", "favicon.ico"]) {
      const entry = zip.getEntry(name);
      expect(entry).toBeDefined();
      expect(entry?.header.size).toBeGreaterThan(0);
    }
  });

  it("uses subfolder structure for multiple images", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "icon1.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "icon2.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/favicon",
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
      url: "/api/v1/tools/image/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toContain("No image file");
  });

  // ── Additional coverage: SVG input ─────────────────────────────
  it("generates favicons from SVG input", async () => {
    const SVG = readFixture(fixtures.image.base.svg100);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "logo.svg", contentType: "image/svg+xml", content: SVG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/favicon",
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
        content: readFixture(fixtures.image.base.jpg100),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/favicon",
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
        content: readFixture(fixtures.image.base.webp50),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/favicon",
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
  it("generates favicons from HEIC input", { timeout: 120_000 }, async () => {
    const HEIC = readFixture(fixtures.image.base.heic200);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.heic", contentType: "image/heic", content: HEIC },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/favicon",
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
      url: "/api/v1/tools/image/favicon",
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
      const meta = await sharp(entry?.getData()).metadata();
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
      url: "/api/v1/tools/image/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(Buffer.from(res.rawPayload));
    const manifest = JSON.parse(zip.getEntry("manifest.json")?.getData().toString("utf-8"));
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
      url: "/api/v1/tools/image/favicon",
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
      url: "/api/v1/tools/image/favicon",
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
      url: "/api/v1/tools/image/favicon",
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
      url: "/api/v1/tools/image/favicon",
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
    const TINY = readFixture(fixtures.image.edge.px1);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.png", contentType: "image/png", content: TINY },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/favicon",
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
    const meta = await sharp(entry16?.getData()).metadata();
    expect(meta.width).toBe(16);
    expect(meta.height).toBe(16);
  });

  // ── Large stress file ─────────────────────────────────────────────

  it("generates favicons from stress-large.jpg", async () => {
    const LARGE = readFixture(fixtures.image.stressLarge);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "large.jpg", contentType: "image/jpeg", content: LARGE },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/favicon",
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

  it("generates favicons from portrait HEIC", { timeout: 120_000 }, async () => {
    const HEIC_PORTRAIT = readFixture(fixtures.image.portraitHeic);
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
      url: "/api/v1/tools/image/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(Buffer.from(res.rawPayload));
    const entries = zip.getEntries().map((e) => e.entryName);
    expect(entries).toContain("favicon-32x32.png");

    // Square output even from portrait input (fit: cover)
    const entry32 = zip.getEntry("favicon-32x32.png");
    const meta = await sharp(entry32?.getData()).metadata();
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
      url: "/api/v1/tools/image/favicon",
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
      url: "/api/v1/tools/image/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(Buffer.from(res.rawPayload));
    const entries = zip.getEntries().map((e) => e.entryName);
    expect(entries).toContain("favicon-16x16.png");
    expect(entries).toContain("manifest.json");
  });

  // ── Rejects unauthenticated request ──────────────────────────────

  it("rejects unauthenticated request", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "logo.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/favicon",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });

  // ── ICO file is a valid PNG (simple ICO format) ──────────────────

  it("favicon.ico entry has non-zero content", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "logo.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(Buffer.from(res.rawPayload));
    const icoEntry = zip.getEntry("favicon.ico");
    expect(icoEntry).toBeDefined();
    const icoData = icoEntry!.getData();
    expect(icoData.length).toBeGreaterThan(0);
  });

  // ── Three images produce three subfolders ────────────────────────

  it("generates favicons for 3 images in subfolders", async () => {
    const JPG = readFixture(fixtures.image.base.jpg100);
    const WEBP = readFixture(fixtures.image.base.webp50);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "brand1.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "brand2.jpg", contentType: "image/jpeg", content: JPG },
      { name: "file", filename: "brand3.webp", contentType: "image/webp", content: WEBP },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(Buffer.from(res.rawPayload));
    const entries = zip.getEntries().map((e) => e.entryName);
    expect(entries.some((e) => e.startsWith("brand1/"))).toBe(true);
    expect(entries.some((e) => e.startsWith("brand2/"))).toBe(true);
    expect(entries.some((e) => e.startsWith("brand3/"))).toBe(true);
  });

  // ── Single file with dot in name ─────────────────────────────────

  it("handles filename with multiple dots", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "my.app.logo.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(Buffer.from(res.rawPayload));
    const manifest = JSON.parse(zip.getEntry("manifest.json")?.getData().toString("utf-8"));
    expect(manifest.name).toBe("my.app.logo");
  });

  // ── TIFF input format ─────────────────────────────────────────────

  it("generates favicons from TIFF input", async () => {
    const TIFF = readFixture(fixtures.image.formats("tiff"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "logo.tiff", contentType: "image/tiff", content: TIFF },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(Buffer.from(res.rawPayload));
    const entries = zip.getEntries().map((e) => e.entryName);
    expect(entries).toContain("favicon-16x16.png");
    expect(entries).toContain("favicon-32x32.png");
    expect(entries).toContain("favicon.ico");
  });

  // ── AVIF input format ───────────────────────────────────────────

  it("generates favicons from AVIF input", async () => {
    const AVIF = readFixture(fixtures.image.formats("avif"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "logo.avif", contentType: "image/avif", content: AVIF },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(Buffer.from(res.rawPayload));
    const entries = zip.getEntries().map((e) => e.entryName);
    expect(entries).toContain("favicon-32x32.png");
    expect(entries).toContain("android-chrome-192x192.png");
  });

  // ── Verify ICO dimensions ───────────────────────────────────────

  it("favicon.ico has correct dimensions", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "logo.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(Buffer.from(res.rawPayload));
    const icoEntry = zip.getEntry("favicon.ico");
    expect(icoEntry).toBeDefined();
    const icoData = icoEntry!.getData();
    expect(icoData.length).toBeGreaterThan(0);

    if (HAS_MAGICK) {
      // Real ICO header
      expect(icoData[0]).toBe(0x00);
      expect(icoData[2]).toBe(0x01);
    } else {
      // Fallback: PNG wrapped as .ico
      const meta = await sharp(icoData).metadata();
      expect(meta.width).toBe(32);
      expect(meta.height).toBe(32);
      expect(meta.format).toBe("png");
    }
  });

  // ── Apple touch icon is 180x180 ─────────────────────────────────

  it("apple-touch-icon.png has correct 180x180 dimensions", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "logo.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(Buffer.from(res.rawPayload));
    const entry = zip.getEntry("apple-touch-icon.png");
    expect(entry).toBeDefined();
    const meta = await sharp(entry?.getData()).metadata();
    expect(meta.width).toBe(180);
    expect(meta.height).toBe(180);
  });

  // ── Animated GIF input ────────────────────────────────────────────

  it("generates favicons from animated GIF input", async () => {
    const GIF = readFixture(fixtures.image.animated.gif);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "anim.gif", contentType: "image/gif", content: GIF },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(Buffer.from(res.rawPayload));
    const entries = zip.getEntries().map((e) => e.entryName);
    expect(entries).toContain("favicon-16x16.png");
    expect(entries).toContain("favicon.ico");
  });

  // ── Batch: 5+ images ────────────────────────────────────────────

  it("generates favicons for 5 images in subfolders", async () => {
    const JPG = readFixture(fixtures.image.base.jpg100);
    const WEBP = readFixture(fixtures.image.base.webp50);
    const TINY = readFixture(fixtures.image.edge.px1);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      { name: "file", filename: "c.webp", contentType: "image/webp", content: WEBP },
      { name: "file", filename: "d.png", contentType: "image/png", content: TINY },
      { name: "file", filename: "e.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(Buffer.from(res.rawPayload));
    const entries = zip.getEntries().map((e) => e.entryName);
    expect(entries.some((e) => e.startsWith("a/"))).toBe(true);
    expect(entries.some((e) => e.startsWith("b/"))).toBe(true);
    expect(entries.some((e) => e.startsWith("c/"))).toBe(true);
    expect(entries.some((e) => e.startsWith("d/"))).toBe(true);
    expect(entries.some((e) => e.startsWith("e/"))).toBe(true);
  });

  // ── HEIF format input ────────────────────────────────────────────

  it("generates favicons from HEIF input", { timeout: 120_000 }, async () => {
    const HEIF = readFixture(fixtures.image.motorcycle);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.heif", contentType: "image/heif", content: HEIF },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(Buffer.from(res.rawPayload));
    const entries = zip.getEntries().map((e) => e.entryName);
    expect(entries).toContain("favicon-16x16.png");
    expect(entries).toContain("favicon.ico");
  });

  // ── All favicon PNG sizes are valid images ──────────────────────

  it("all generated PNG files are valid images with non-zero data", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "logo.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(Buffer.from(res.rawPayload));

    const pngEntries = [
      "favicon-16x16.png",
      "favicon-32x32.png",
      "favicon-48x48.png",
      "apple-touch-icon.png",
      "android-chrome-192x192.png",
      "android-chrome-512x512.png",
    ];

    for (const name of pngEntries) {
      const entry = zip.getEntry(name);
      expect(entry).toBeDefined();
      const data = entry?.getData();
      expect(data.length).toBeGreaterThan(0);
      const meta = await sharp(data).metadata();
      expect(meta.format).toBe("png");
    }
  });

  // ── Multi-size ICO (magick-gated) ──────────────────────────────

  it("favicon.ico is a real multi-size ICO when magick is available", async () => {
    if (!HAS_MAGICK) {
      // Skip the ICO header assertion when magick is unavailable;
      // the fallback produces a PNG-renamed-as-ICO which is still functional.
      return;
    }

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "logo.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(Buffer.from(res.rawPayload));
    const icoEntry = zip.getEntry("favicon.ico");
    expect(icoEntry).toBeDefined();
    const icoData = icoEntry!.getData();

    // Real ICO header: bytes 0-1 = 0x0000 (reserved), bytes 2-3 = 0x0100 (type 1 = ICO)
    expect(icoData[0]).toBe(0x00);
    expect(icoData[1]).toBe(0x00);
    expect(icoData[2]).toBe(0x01);
    expect(icoData[3]).toBe(0x00);

    // Image count at offset 4-5 (little-endian); should be >= 4 (16/32/48/256)
    const imageCount = icoData[4] | (icoData[5] << 8);
    expect(imageCount).toBeGreaterThanOrEqual(4);
  });

  // ── ICO output has valid content ────────────────────────────────

  it("ICO output has valid content", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "logo.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(Buffer.from(res.rawPayload));
    const icoEntry = zip.getEntry("favicon.ico");
    expect(icoEntry).toBeDefined();

    const icoData = icoEntry!.getData();
    expect(icoData.length).toBeGreaterThan(0);

    if (HAS_MAGICK) {
      // Real ICO: header check
      expect(icoData[0]).toBe(0x00);
      expect(icoData[2]).toBe(0x01);
    } else {
      // Fallback: PNG wrapped, so Sharp can read it
      const meta = await sharp(icoData).metadata();
      expect(meta.width).toBe(32);
      expect(meta.height).toBe(32);
    }
  });

  // ── Favicon from stress-large.jpg verifies 512x512 is square ───

  it("512x512 chrome icon is square from large rectangular input", async () => {
    const LARGE = readFixture(fixtures.image.stressLarge);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "large.jpg", contentType: "image/jpeg", content: LARGE },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(Buffer.from(res.rawPayload));
    const entry512 = zip.getEntry("android-chrome-512x512.png");
    expect(entry512).toBeDefined();
    const meta = await sharp(entry512?.getData()).metadata();
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
  });

  // ── GIF with settings combination ───────────────────────────────

  it("generates favicons from GIF with empty settings", async () => {
    const GIF = readFixture(fixtures.image.animated.gif);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "anim.gif", contentType: "image/gif", content: GIF },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(Buffer.from(res.rawPayload));
    const entries = zip.getEntries().map((e) => e.entryName);
    expect(entries).toContain("favicon-16x16.png");
    expect(entries).toContain("favicon-32x32.png");
    expect(entries).toContain("manifest.json");
    expect(entries).toContain("favicon-snippet.html");
  });

  // ── Manifest icons array has correct structure ────────────────

  it("manifest icons have correct src, sizes, and type fields", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "logo.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(Buffer.from(res.rawPayload));
    const manifest = JSON.parse(zip.getEntry("manifest.json")?.getData().toString("utf-8"));
    expect(manifest.icons).toHaveLength(2);
    for (const icon of manifest.icons) {
      expect(icon.src).toBeDefined();
      expect(icon.sizes).toBeDefined();
      expect(icon.type).toBe("image/png");
    }
    expect(manifest.background_color).toBe("#ffffff");
  });

  // ── HTML snippet contains all expected link tags ──────────────

  it("HTML snippet contains 16, 32, 48, apple-touch, and manifest links", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "logo.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zip = new AdmZip(Buffer.from(res.rawPayload));
    const html = zip.getEntry("favicon-snippet.html")?.getData().toString("utf-8");
    expect(html).toContain("favicon-16x16.png");
    expect(html).toContain("favicon-32x32.png");
    expect(html).toContain("favicon-48x48.png");
    expect(html).toContain("apple-touch-icon.png");
    expect(html).toContain("manifest.json");
  });

  // ── Total ZIP size is positive ────────────────────────────────

  it("generated ZIP has positive total size", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "logo.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const zipBuffer = Buffer.from(res.rawPayload);
    expect(zipBuffer.length).toBeGreaterThan(0);
    const zip = new AdmZip(zipBuffer);
    const totalSize = zip.getEntries().reduce((s, e) => s + (e.header.size || 0), 0);
    expect(totalSize).toBeGreaterThan(0);
  });

  // ── Settings: radius + padding ──────────────────────────────────

  it("accepts radius and padding settings", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "logo.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ radius: 50, padding: 10 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/zip");

    const zip = new AdmZip(Buffer.from(res.rawPayload));
    const entries = zip.getEntries().map((e) => e.entryName);
    expect(entries).toContain("favicon-32x32.png");
    expect(entries).toContain("favicon.ico");
    expect(entries).toContain("manifest.json");

    // Verify the 32x32 icon is still exactly 32x32 after padding/radius
    const entry32 = zip.getEntry("favicon-32x32.png");
    expect(entry32).toBeDefined();
    const meta = await sharp(entry32?.getData()).metadata();
    expect(meta.width).toBe(32);
    expect(meta.height).toBe(32);
  });

  // ── Settings: full combo with size filter + themeColor ──────────

  it("respects sizes filter and themeColor in manifest", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "logo.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          background: "#ff0000",
          padding: 20,
          radius: 25,
          sizes: [16, 32, 512],
          themeColor: "#336699",
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/favicon",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/zip");

    const zip = new AdmZip(Buffer.from(res.rawPayload));
    const entries = zip.getEntries().map((e) => e.entryName);

    // Only selected PNG sizes emitted
    expect(entries).toContain("favicon-16x16.png");
    expect(entries).toContain("favicon-32x32.png");
    expect(entries).toContain("android-chrome-512x512.png");
    expect(entries).not.toContain("favicon-48x48.png");
    expect(entries).not.toContain("apple-touch-icon.png");
    expect(entries).not.toContain("android-chrome-192x192.png");

    // ICO, manifest, snippet always present
    expect(entries).toContain("favicon.ico");
    expect(entries).toContain("manifest.json");
    expect(entries).toContain("favicon-snippet.html");

    // themeColor reflected in manifest
    const manifest = JSON.parse(zip.getEntry("manifest.json")?.getData().toString("utf-8"));
    expect(manifest.theme_color).toBe("#336699");
    expect(manifest.background_color).toBe("#336699");
  });
});
