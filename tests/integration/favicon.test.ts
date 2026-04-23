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
});
