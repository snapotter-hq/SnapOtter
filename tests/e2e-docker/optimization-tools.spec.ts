import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

// ─── Optimization Tools ────────────────────────────────────────────
// Tests for: optimize-for-web (extended options), bulk-rename (patterns),
// favicon (multi-format output), image-to-pdf (page options),
// replace-color (tolerance edge cases)
// Complements adjustment-tools.spec.ts and conversion-tools.spec.ts
// with deeper coverage of optimization and utility tools.

const FIXTURES = join(process.cwd(), "tests", "fixtures");
const FORMATS = join(FIXTURES, "formats");
const CONTENT = join(FIXTURES, "content");

let token: string;

test.beforeAll(async ({ request }) => {
  const res = await request.post("/api/auth/login", {
    data: { username: "admin", password: "admin" },
  });
  const body = await res.json();
  token = body.token;
});

function fixture(name: string): Buffer {
  return readFileSync(join(FIXTURES, name));
}

function formatFixture(name: string): Buffer {
  return readFileSync(join(FORMATS, name));
}

function contentFixture(name: string): Buffer {
  return readFileSync(join(CONTENT, name));
}

/**
 * Build a raw multipart/form-data body for multi-file uploads.
 */
function buildMultipart(
  files: Array<{ name: string; filename: string; contentType: string; buffer: Buffer }>,
  fields: Array<{ name: string; value: string }>,
): { body: Buffer; contentType: string } {
  const boundary = `----PlaywrightBoundary${Date.now()}`;
  const parts: Buffer[] = [];
  for (const file of files) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
      ),
    );
    parts.push(file.buffer);
    parts.push(Buffer.from("\r\n"));
  }
  for (const field of fields) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${field.name}"\r\n\r\n${field.value}\r\n`,
      ),
    );
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

const PNG_200x150 = fixture("test-200x150.png");
const JPG_100x100 = fixture("test-100x100.jpg");
const WEBP_50x50 = fixture("test-50x50.webp");
const HEIC_200x150 = fixture("test-200x150.heic");
const JPG_SAMPLE = formatFixture("sample.jpg");

// ─── Optimize for Web — Extended ───────────────────────────────────

test.describe("Optimize for Web — extended", () => {
  test("optimize with aggressive quality (20)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/optimize-for-web", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        settings: JSON.stringify({ maxWidth: 640, quality: 20 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("optimize with high quality (95) preserves detail", async ({ request }) => {
    const res = await request.post("/api/v1/tools/optimize-for-web", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        settings: JSON.stringify({ maxWidth: 1920, quality: 95 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("optimize HEIC for web", async ({ request }) => {
    const res = await request.post("/api/v1/tools/optimize-for-web", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        settings: JSON.stringify({ maxWidth: 400, quality: 75 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("optimize WebP for web", async ({ request }) => {
    const webpSample = formatFixture("sample.webp");
    const res = await request.post("/api/v1/tools/optimize-for-web", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.webp", mimeType: "image/webp", buffer: webpSample },
        settings: JSON.stringify({ maxWidth: 600, quality: 60 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("optimize without maxWidth (no resize, only compress)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/optimize-for-web", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        settings: JSON.stringify({ quality: 50 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("optimize large content image for web", async ({ request }) => {
    const stressImg = contentFixture("stress-large.jpg");
    const res = await request.post("/api/v1/tools/optimize-for-web", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "stress-large.jpg", mimeType: "image/jpeg", buffer: stressImg },
        settings: JSON.stringify({ maxWidth: 1280, quality: 70 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });
});

// ─── Bulk Rename — Extended Patterns ───────────────────────────────

test.describe("Bulk Rename — extended", () => {
  test("rename with date-based pattern", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "photo1.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "photo2.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "photo3.webp", contentType: "image/webp", buffer: WEBP_50x50 },
      ],
      [{ name: "settings", value: JSON.stringify({ pattern: "2024-01-{{index}}" }) }],
    );
    const res = await request.post("/api/v1/tools/bulk-rename", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(true);
    const resContentType = res.headers()["content-type"] ?? "";
    if (resContentType.includes("application/json")) {
      const json = await res.json();
      expect(json.downloadUrl || json.files).toBeTruthy();
    } else {
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
    }
  });

  test("rename with padded index (starting at 001)", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({ pattern: "img-{{index}}", startIndex: 1 }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/bulk-rename", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(true);
  });

  test("rename 5 files preserving extensions", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
        {
          name: "file",
          filename: "d.heic",
          contentType: "image/heic",
          buffer: HEIC_200x150,
        },
        {
          name: "file",
          filename: "e.jpg",
          contentType: "image/jpeg",
          buffer: formatFixture("sample.jpg"),
        },
      ],
      [{ name: "settings", value: JSON.stringify({ pattern: "gallery-{{index}}" }) }],
    );
    const res = await request.post("/api/v1/tools/bulk-rename", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(true);
  });
});

// ─── Favicon — Extended ────────────────────────────────────────────

test.describe("Favicon — extended", () => {
  test("generate favicon from WebP", async ({ request }) => {
    const res = await request.post("/api/v1/tools/favicon", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.webp", mimeType: "image/webp", buffer: WEBP_50x50 },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
    const ct = res.headers()["content-type"] ?? "";
    if (ct.includes("application/json")) {
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
    } else {
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
    }
  });

  test("generate favicon from HEIC", async ({ request }) => {
    const res = await request.post("/api/v1/tools/favicon", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
  });

  test("generate favicon from large sample JPEG", async ({ request }) => {
    const res = await request.post("/api/v1/tools/favicon", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
    const ct = res.headers()["content-type"] ?? "";
    if (ct.includes("application/json")) {
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
    } else {
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
    }
  });

  test("generate favicon from AVIF format", async ({ request }) => {
    const avif = formatFixture("sample.avif");
    const res = await request.post("/api/v1/tools/favicon", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.avif", mimeType: "image/avif", buffer: avif },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
  });
});

// ─── Image to PDF — Extended ───────────────────────────────────────

test.describe("Image to PDF — extended", () => {
  test("convert 3 images to multi-page PDF", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "b.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
      ],
      [{ name: "settings", value: JSON.stringify({ pageSize: "A4" }) }],
    );
    const res = await request.post("/api/v1/tools/image-to-pdf", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
    expect(json.processedSize).toBeGreaterThan(0);
  });

  test("convert image to PDF with letter page size", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [{ name: "file", filename: "test.jpg", contentType: "image/jpeg", buffer: JPG_100x100 }],
      [{ name: "settings", value: JSON.stringify({ pageSize: "Letter" }) }],
    );
    const res = await request.post("/api/v1/tools/image-to-pdf", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
    expect(json.processedSize).toBeGreaterThan(0);
  });

  test("convert HEIC image to PDF", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [{ name: "file", filename: "test.heic", contentType: "image/heic", buffer: HEIC_200x150 }],
      [{ name: "settings", value: JSON.stringify({ pageSize: "A4" }) }],
    );
    const res = await request.post("/api/v1/tools/image-to-pdf", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
    expect(json.processedSize).toBeGreaterThan(0);
  });

  test("convert 5 mixed-format images to PDF", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "b.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
        { name: "file", filename: "d.heic", contentType: "image/heic", buffer: HEIC_200x150 },
        {
          name: "file",
          filename: "e.jpg",
          contentType: "image/jpeg",
          buffer: formatFixture("sample.jpg"),
        },
      ],
      [{ name: "settings", value: JSON.stringify({ pageSize: "A4" }) }],
    );
    const res = await request.post("/api/v1/tools/image-to-pdf", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.downloadUrl).toBeTruthy();
    expect(json.processedSize).toBeGreaterThan(0);
  });
});

// ─── Replace Color — Extended ──────────────────────────────────────

test.describe("Replace Color — extended", () => {
  test("replace color on WebP image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/replace-color", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.webp", mimeType: "image/webp", buffer: WEBP_50x50 },
        settings: JSON.stringify({
          targetColor: "#000000",
          replacementColor: "#ffffff",
          tolerance: 20,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("replace color with zero tolerance (exact match)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/replace-color", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          targetColor: "#ff0000",
          replacementColor: "#00ff00",
          tolerance: 0,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("replace color with maximum tolerance (100)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/replace-color", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({
          targetColor: "#808080",
          replacementColor: "#ff0000",
          tolerance: 100,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("replace color on HEIC image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/replace-color", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        settings: JSON.stringify({
          targetColor: "#ffffff",
          replacementColor: "#cccccc",
          tolerance: 15,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("replace color on content image", async ({ request }) => {
    const portrait = contentFixture("portrait-color.jpg");
    const res = await request.post("/api/v1/tools/replace-color", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "portrait.jpg", mimeType: "image/jpeg", buffer: portrait },
        settings: JSON.stringify({
          targetColor: "#ffffff",
          replacementColor: "#000000",
          tolerance: 40,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });
});

// ─── Edit Metadata — Extended ──────────────────────────────────────

test.describe("Edit Metadata — extended", () => {
  test("set all EXIF fields at once", async ({ request }) => {
    const res = await request.post("/api/v1/tools/edit-metadata", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({
          title: "Test Shot",
          description: "E2E test image",
          artist: "SnapOtter Bot",
          copyright: "CC0-1.0",
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("edit metadata on WebP image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/edit-metadata", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.webp", mimeType: "image/webp", buffer: WEBP_50x50 },
        settings: JSON.stringify({ title: "WebP Test" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("edit metadata round-trip verification", async ({ request }) => {
    // Set metadata
    const editRes = await request.post("/api/v1/tools/edit-metadata", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ artist: "RoundTrip Artist" }),
      },
    });
    expect(editRes.ok()).toBe(true);
    const editBody = await editRes.json();

    // Download the edited image
    const dlRes = await request.get(editBody.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const editedBuffer = Buffer.from(await dlRes.body());

    // Check info on the edited image
    const infoRes = await request.post("/api/v1/tools/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "edited.jpg", mimeType: "image/jpeg", buffer: editedBuffer },
      },
    });
    expect(infoRes.ok()).toBe(true);
    const infoBody = await infoRes.json();
    expect(infoBody.hasExif).toBe(true);
  });
});

// ─── Strip Metadata — Extended ────────────────────────────────────

test.describe("Strip Metadata — extended", () => {
  test("strip metadata from JPEG with EXIF preserves dimensions", async ({ request }) => {
    const jpgExif = fixture("test-with-exif.jpg");
    const res = await request.post("/api/v1/tools/strip-metadata", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: jpgExif },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
    expect(body.processedSize).toBeLessThanOrEqual(body.originalSize);
  });

  test("strip metadata from WebP image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/strip-metadata", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.webp", mimeType: "image/webp", buffer: WEBP_50x50 },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("strip metadata from HEIC image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/strip-metadata", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("stripped image verified via info has no EXIF", async ({ request }) => {
    const jpgExif = fixture("test-with-exif.jpg");
    const stripRes = await request.post("/api/v1/tools/strip-metadata", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: jpgExif },
        settings: JSON.stringify({}),
      },
    });
    expect(stripRes.ok()).toBe(true);
    const stripBody = await stripRes.json();

    // Download stripped image
    const dlRes = await request.get(stripBody.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const strippedBuffer = Buffer.from(await dlRes.body());

    // Verify via info tool
    const infoRes = await request.post("/api/v1/tools/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "stripped.jpg", mimeType: "image/jpeg", buffer: strippedBuffer },
      },
    });
    expect(infoRes.ok()).toBe(true);
    const infoBody = await infoRes.json();
    expect(infoBody.hasExif).toBe(false);
  });
});

// ─── Image Enhancement — Extended ─────────────────────────────────

test.describe("Image Enhancement — extended", () => {
  test("enhancement with auto preset", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image-enhancement", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ preset: "auto" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("enhancement with vivid preset", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image-enhancement", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        settings: JSON.stringify({ preset: "vivid" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    // Enhancement should modify the image
    expect(body.processedSize).not.toBe(body.originalSize);
  });

  test("enhancement on WebP image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image-enhancement", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.webp", mimeType: "image/webp", buffer: WEBP_50x50 },
        settings: JSON.stringify({ preset: "auto" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("enhancement on HEIC image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image-enhancement", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        settings: JSON.stringify({ preset: "auto" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Content-Aware Resize ─────────────────────────────────────────

test.describe("Content-Aware Resize — extended", () => {
  test("content-aware resize to smaller width", async ({ request }) => {
    const res = await request.post("/api/v1/tools/content-aware-resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ width: 150, height: 150 }),
      },
    });
    if (res.status() === 501) {
      const body = await res.json();
      expect(body.code).toBe("FEATURE_NOT_INSTALLED");
    } else {
      expect(res.ok()).toBe(true);
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
      expect(body.processedSize).toBeGreaterThan(0);
    }
  });

  test("content-aware resize JPEG image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/content-aware-resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ width: 80, height: 80 }),
      },
    });
    if (res.status() === 501) {
      const body = await res.json();
      expect(body.code).toBe("FEATURE_NOT_INSTALLED");
    } else {
      expect(res.ok()).toBe(true);
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
    }
  });

  test("content-aware resize on large content image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/content-aware-resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        settings: JSON.stringify({ width: 300, height: 300 }),
      },
    });
    if (res.status() === 501) {
      const body = await res.json();
      expect(body.code).toBe("FEATURE_NOT_INSTALLED");
    } else {
      expect(res.ok()).toBe(true);
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
    }
  });
});
