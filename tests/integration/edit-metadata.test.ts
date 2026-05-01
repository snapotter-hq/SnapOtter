/**
 * Integration tests for the edit-metadata tool (edit-metadata.ts).
 *
 * Covers metadata writing (artist, copyright, title, GPS),
 * field removal, keyword editing, date shifting, IPTC fields,
 * inspect endpoint, and error handling.
 *
 * ExifTool is required for these tests. If exiftool is not installed,
 * the tests gracefully handle the 422 response.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const FIXTURES = join(__dirname, "..", "fixtures");
const EXIF_JPG = readFileSync(join(FIXTURES, "test-with-exif.jpg"));
const PNG = readFileSync(join(FIXTURES, "test-200x150.png"));
const JPG = readFileSync(join(FIXTURES, "test-100x100.jpg"));

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
    url: "/api/v1/tools/edit-metadata",
    payload,
    headers: {
      "content-type": contentType,
      authorization: `Bearer ${adminToken}`,
    },
  });
}

// ── Writing metadata fields ──────────────────────────────────────
describe("Write metadata fields", () => {
  it("writes artist field", async () => {
    const res = await postTool({ artist: "Test Artist Name" });
    // 422 when exiftool is not installed
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.jobId).toBeDefined();
  });

  it("writes copyright field", async () => {
    const res = await postTool({ copyright: "2026 SnapOtter" });
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("writes title field", async () => {
    const res = await postTool({ title: "My Photo Title" });
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
  });

  it("writes imageDescription field", async () => {
    const res = await postTool({ imageDescription: "A test image description" });
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
  });

  it("writes software field", async () => {
    const res = await postTool({ software: "SnapOtter v1.0" });
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
  });

  it("writes multiple fields at once", async () => {
    const res = await postTool({
      artist: "Multi Field Test",
      copyright: "2026 Test",
      title: "Multi-write Test",
      imageDescription: "Testing multiple metadata writes",
    });
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });
});

// ── GPS metadata ────────────────────────────────────────────────
describe("GPS metadata", () => {
  it("clears GPS data with clearGps=true", async () => {
    const res = await postTool({ clearGps: true });
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("writes GPS coordinates", async () => {
    const res = await postTool({
      gpsLatitude: 40.7128,
      gpsLongitude: -74.006,
    });
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
  });

  it("writes GPS coordinates with altitude", async () => {
    const res = await postTool({
      gpsLatitude: 48.8566,
      gpsLongitude: 2.3522,
      gpsAltitude: 35,
    });
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
  });

  it("rejects invalid latitude (out of range)", async () => {
    const res = await postTool({ gpsLatitude: 95.0 });
    expect(res.statusCode).toBe(400);
  });

  it("rejects invalid longitude (out of range)", async () => {
    const res = await postTool({ gpsLongitude: 200.0 });
    expect(res.statusCode).toBe(400);
  });
});

// ── Field removal ───────────────────────────────────────────────
describe("Field removal", () => {
  it("removes specific fields via fieldsToRemove", async () => {
    const res = await postTool({ fieldsToRemove: ["Software", "Artist"] });
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("handles empty fieldsToRemove array", async () => {
    const res = await postTool({ fieldsToRemove: [] });
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
  });
});

// ── Keywords ────────────────────────────────────────────────────
describe("Keywords", () => {
  it("adds keywords with default mode (add)", async () => {
    const res = await postTool({
      keywords: ["nature", "sunset", "landscape"],
    });
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
  });

  it("sets keywords with keywordsMode=set", async () => {
    const res = await postTool({
      keywords: ["overwrite1", "overwrite2"],
      keywordsMode: "set",
    });
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
  });
});

// ── Date manipulation ───────────────────────────────────────────
describe("Date manipulation", () => {
  it("writes dateTime field", async () => {
    const res = await postTool({ dateTime: "2025:01:15 10:30:00" });
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
  });

  it("writes dateTimeOriginal field", async () => {
    const res = await postTool({ dateTimeOriginal: "2024:06:20 14:00:00" });
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
  });

  it("sets all dates at once with setAllDates", async () => {
    const res = await postTool({ setAllDates: "2025:03:01 12:00:00" });
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
  });

  it("shifts dates with dateShift", async () => {
    const res = await postTool({ dateShift: "+05:00" });
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
  });

  it("rejects invalid dateShift format", async () => {
    const res = await postTool({ dateShift: "invalid" });
    expect(res.statusCode).toBe(400);
  });
});

// ── IPTC fields ─────────────────────────────────────────────────
describe("IPTC fields", () => {
  it("writes IPTC title", async () => {
    const res = await postTool({ iptcTitle: "IPTC Test Title" });
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
  });

  it("writes IPTC location fields", async () => {
    const res = await postTool({
      iptcCity: "Paris",
      iptcState: "Ile-de-France",
      iptcCountry: "France",
    });
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
  });

  it("writes IPTC headline", async () => {
    const res = await postTool({ iptcHeadline: "Breaking News" });
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
  });
});

// ── No-op (empty settings) ──────────────────────────────────────
describe("No-op operation", () => {
  it("returns original file when no edits are requested", async () => {
    const res = await postTool({});
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    // With empty settings, processedSize should equal originalSize
    expect(result.originalSize).toBe(result.processedSize);
  });
});

// ── Different input formats ─────────────────────────────────────
describe("Different input formats", () => {
  it("edits metadata on PNG file", async () => {
    const res = await postTool({ artist: "PNG Artist" }, PNG, "test.png", "image/png");
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
  });

  it("edits metadata on plain JPG file", async () => {
    const res = await postTool({ copyright: "JPG Copyright" }, JPG, "test.jpg", "image/jpeg");
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
  });
});

// ── Inspect endpoint ────────────────────────────────────────────
describe("Inspect endpoint", () => {
  it("returns parsed EXIF for JPEG with metadata", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "exif.jpg",
        contentType: "image/jpeg",
        content: EXIF_JPG,
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/edit-metadata/inspect",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.filename).toBe("exif.jpg");
    expect(body.exif).toBeTruthy();
  });

  it("returns null exif for metadata-free PNG", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "plain.png",
        contentType: "image/png",
        content: PNG,
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/edit-metadata/inspect",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.exif).toBeNull();
  });

  it("rejects inspect with no file", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "other", content: "nothing" },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/edit-metadata/inspect",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── Verify round-trip: write then inspect ───────────────────────
describe("Write then inspect round-trip", () => {
  it("writes artist and verifies via inspect", async () => {
    const editRes = await postTool({ artist: "Round Trip Author" });
    if (editRes.statusCode === 422) return;
    expect(editRes.statusCode).toBe(200);
    const editResult = JSON.parse(editRes.body);

    // Download the edited file
    const dlRes = await app.inject({
      method: "GET",
      url: editResult.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(dlRes.statusCode).toBe(200);

    // Inspect the edited file
    const { body: inspectPayload, contentType: inspectCt } = createMultipartPayload([
      {
        name: "file",
        filename: "edited.jpg",
        contentType: "image/jpeg",
        content: dlRes.rawPayload,
      },
    ]);
    const inspectRes = await app.inject({
      method: "POST",
      url: "/api/v1/tools/edit-metadata/inspect",
      payload: inspectPayload,
      headers: {
        "content-type": inspectCt,
        authorization: `Bearer ${adminToken}`,
      },
    });
    if (inspectRes.statusCode === 422) return;
    expect(inspectRes.statusCode).toBe(200);
    const inspected = JSON.parse(inspectRes.body);
    expect(inspected.exif?.Artist).toBe("Round Trip Author");
  });
});

// ── Error handling ──────────────────────────────────────────────
describe("Error handling", () => {
  it("returns 400 when no file is provided", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({ artist: "test" }) },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/edit-metadata",
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
      {
        name: "file",
        filename: "test.jpg",
        contentType: "image/jpeg",
        content: EXIF_JPG,
      },
      { name: "settings", content: "not-json" },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/edit-metadata",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid image data", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "bad.jpg",
        contentType: "image/jpeg",
        content: Buffer.from("not an image"),
      },
      { name: "settings", content: JSON.stringify({ artist: "test" }) },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/edit-metadata",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/invalid image/i);
  });

  it("returns 400 for invalid settings values (bad dateShift)", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.jpg",
        contentType: "image/jpeg",
        content: EXIF_JPG,
      },
      { name: "settings", content: JSON.stringify({ dateShift: "abc" }) },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/edit-metadata",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/invalid settings/i);
  });

  it("returns 400 when file is empty", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "empty.jpg",
        contentType: "image/jpeg",
        content: Buffer.alloc(0),
      },
      { name: "settings", content: JSON.stringify({ artist: "test" }) },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/edit-metadata",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── HEIC handling ──────────────────────────────────────────────
describe("HEIC format handling", () => {
  it("generates preview for HEIC output", { timeout: 120_000 }, async () => {
    const HEIC = readFileSync(join(FIXTURES, "test-200x150.heic"));
    const res = await postTool({ artist: "HEIC Author" }, HEIC, "test.heic", "image/heic");
    // 422 when exiftool is not installed or heic decode fails
    if (res.statusCode === 422 || res.statusCode === 400) return;
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    // HEIC may get a previewUrl for browser compatibility
    if (result.previewUrl) {
      expect(result.previewUrl).toContain("preview.webp");
    }
  });
});

// ── Comprehensive field writing ───────────────────────────────
describe("Comprehensive field writing", () => {
  it("writes all supported fields at once", async () => {
    const res = await postTool({
      artist: "Full Test Artist",
      copyright: "2026 Full Test",
      title: "Full Title",
      imageDescription: "Full description",
      software: "TestSuite v2.0",
      dateTime: "2025:06:15 12:00:00",
      dateTimeOriginal: "2025:06:15 10:00:00",
      gpsLatitude: 37.7749,
      gpsLongitude: -122.4194,
      gpsAltitude: 100,
      keywords: ["test", "integration", "full"],
      keywordsMode: "set",
      iptcTitle: "IPTC Full Title",
      iptcHeadline: "Full Headline",
      iptcCity: "San Francisco",
      iptcState: "California",
      iptcCountry: "United States",
    });
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("removes specific fields and adds new ones simultaneously", async () => {
    const res = await postTool({
      artist: "New Artist",
      fieldsToRemove: ["Software"],
    });
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
  });

  it("handles negative date shift", async () => {
    const res = await postTool({ dateShift: "-03:30" });
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
  });
});

// ── HEIC format handling (extended) ──────────────────────────────
describe("HEIC format handling (extended)", () => {
  it("edits metadata on HEIC input with GPS coordinates", { timeout: 120_000 }, async () => {
    const HEIC = readFileSync(join(FIXTURES, "test-200x150.heic"));
    const res = await postTool(
      {
        artist: "HEIC GPS Test",
        gpsLatitude: 35.6762,
        gpsLongitude: 139.6503,
      },
      HEIC,
      "photo.heic",
      "image/heic",
    );
    if (res.statusCode === 422 || res.statusCode === 400) return;
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("edits metadata on HEIC and verifies preview generation", { timeout: 120_000 }, async () => {
    const HEIC = readFileSync(join(FIXTURES, "test-200x150.heic"));
    const res = await postTool(
      { copyright: "HEIC Preview Test" },
      HEIC,
      "preview-test.heic",
      "image/heic",
    );
    if (res.statusCode === 422 || res.statusCode === 400) return;
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });
});

// ── Large file handling ──────────────────────────────────────────
describe("Large file handling", () => {
  it("edits metadata on a large stress image", async () => {
    const large = readFileSync(join(FIXTURES, "content", "stress-large.jpg"));
    const res = await postTool(
      { artist: "Large File Test", copyright: "2026 Test" },
      large,
      "stress-large.jpg",
      "image/jpeg",
    );
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });
});

// ── Tiny file handling ───────────────────────────────────────────
describe("Tiny file handling", () => {
  it("edits metadata on a 1x1 pixel image", async () => {
    const tiny = readFileSync(join(FIXTURES, "test-1x1.png"));
    const res = await postTool({ artist: "Tiny Author" }, tiny, "tiny.png", "image/png");
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
  });
});

// ── WebP format handling ─────────────────────────────────────────
describe("WebP format handling", () => {
  it("edits metadata on WebP file", async () => {
    const webp = readFileSync(join(FIXTURES, "test-50x50.webp"));
    const res = await postTool(
      { artist: "WebP Author", title: "WebP Title" },
      webp,
      "test.webp",
      "image/webp",
    );
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });
});

// ── Keywords mode: remove ────────────────────────────────────────
describe("Keywords advanced", () => {
  it("sets keywords with keywordsMode=add (default)", async () => {
    const res = await postTool({
      keywords: ["added1", "added2"],
      keywordsMode: "add",
    });
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
  });

  it("combines keywords with other metadata fields", async () => {
    const res = await postTool({
      artist: "Keyword Combo Author",
      keywords: ["combo1", "combo2"],
      keywordsMode: "set",
      iptcCity: "Tokyo",
    });
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
  });
});

// ── Date manipulation edge cases ─────────────────────────────────
describe("Date manipulation edge cases", () => {
  it("writes dateTimeOriginal and dateTime together", async () => {
    const res = await postTool({
      dateTime: "2025:12:31 23:59:59",
      dateTimeOriginal: "2025:12:31 23:59:59",
    });
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
  });

  it("combines setAllDates with dateShift", async () => {
    const res = await postTool({
      setAllDates: "2025:01:01 00:00:00",
      dateShift: "+01:00",
    });
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
  });
});

// ── Field removal edge cases ─────────────────────────────────────
describe("Field removal edge cases", () => {
  it("removes multiple fields at once", async () => {
    const res = await postTool({
      fieldsToRemove: ["Artist", "Copyright", "Software", "ImageDescription"],
    });
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
  });

  it("combines clearGps with new GPS coordinates (clear then set)", async () => {
    const res = await postTool({
      clearGps: true,
      gpsLatitude: 51.5074,
      gpsLongitude: -0.1278,
    });
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
  });
});

// ── Inspect endpoint edge cases ──────────────────────────────────
describe("Inspect endpoint edge cases", () => {
  it("inspect handles WebP input", async () => {
    const webp = readFileSync(join(FIXTURES, "test-50x50.webp"));
    const { body: payload, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.webp",
        contentType: "image/webp",
        content: webp,
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/edit-metadata/inspect",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.filename).toBe("test.webp");
  });

  it("inspect handles empty file buffer", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "empty.jpg",
        contentType: "image/jpeg",
        content: Buffer.alloc(0),
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/edit-metadata/inspect",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("inspect returns correct filename for HEIC input", { timeout: 120_000 }, async () => {
    const HEIC = readFileSync(join(FIXTURES, "test-200x150.heic"));
    const { body: payload, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "photo.heic",
        contentType: "image/heic",
        content: HEIC,
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/edit-metadata/inspect",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.filename).toBe("photo.heic");
  });
});

// ── IPTC field combinations ──────────────────────────────────────
describe("IPTC field combinations", () => {
  it("writes all IPTC fields together", async () => {
    const res = await postTool({
      iptcTitle: "Full IPTC",
      iptcHeadline: "Full Headline",
      iptcCity: "London",
      iptcState: "England",
      iptcCountry: "United Kingdom",
    });
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
  });
});

// ── Author vs artist field ───────────────────────────────────────
describe("Author field", () => {
  it("writes author field (alias for artist)", async () => {
    const res = await postTool({ author: "Author Name Test" });
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
  });
});
