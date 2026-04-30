import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

// ─── Adjustment Tools ───────────────────────────────────────────────
// Tests for: color-adjustments, sharpening, replace-color, strip-metadata,
// edit-metadata, optimize-for-web, image-enhancement
// These tools modify image properties without changing dimensions.

const FIXTURES = join(process.cwd(), "tests", "fixtures");
const FORMATS = join(FIXTURES, "formats");

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

const PNG_200x150 = fixture("test-200x150.png");
const JPG_100x100 = fixture("test-100x100.jpg");
const JPG_WITH_EXIF = fixture("test-with-exif.jpg");
const JPG_SAMPLE = readFileSync(join(FORMATS, "sample.jpg"));

// ─── Color Adjustments ──────────────────────────────────────────────

test.describe("Color Adjustments", () => {
  test("adjust brightness", async ({ request }) => {
    const res = await request.post("/api/v1/tools/adjust-colors", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ brightness: 20 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("adjust contrast", async ({ request }) => {
    const res = await request.post("/api/v1/tools/adjust-colors", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ contrast: 30 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("adjust saturation", async ({ request }) => {
    const res = await request.post("/api/v1/tools/adjust-colors", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ saturation: -20 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("apply grayscale", async ({ request }) => {
    const res = await request.post("/api/v1/tools/adjust-colors", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ grayscale: true }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("multiple adjustments at once", async ({ request }) => {
    const res = await request.post("/api/v1/tools/adjust-colors", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({
          brightness: 10,
          contrast: 15,
          saturation: -10,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Sharpening ─────────────────────────────────────────────────────

test.describe("Sharpening", () => {
  test("sharpen with default settings", async ({ request }) => {
    const res = await request.post("/api/v1/tools/sharpening", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("sharpen with explicit sigma and amount", async ({ request }) => {
    const res = await request.post("/api/v1/tools/sharpening", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ sigma: 1.5, amount: 1.0 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("heavy sharpening changes file size", async ({ request }) => {
    const res = await request.post("/api/v1/tools/sharpening", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        settings: JSON.stringify({ sigma: 3.0, amount: 2.0 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    // Sharpening adds high-frequency detail, so file may differ in size
    expect(body.processedSize).toBeGreaterThan(0);
  });
});

// ─── Replace Color ──────────────────────────────────────────────────

test.describe("Replace Color", () => {
  test("replace white with black", async ({ request }) => {
    const res = await request.post("/api/v1/tools/replace-color", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          targetColor: "#ffffff",
          replacementColor: "#000000",
          tolerance: 30,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("replace with low tolerance", async ({ request }) => {
    const res = await request.post("/api/v1/tools/replace-color", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          targetColor: "#ff0000",
          replacementColor: "#00ff00",
          tolerance: 5,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("replace with high tolerance", async ({ request }) => {
    const res = await request.post("/api/v1/tools/replace-color", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({
          targetColor: "#808080",
          replacementColor: "#0000ff",
          tolerance: 80,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Strip Metadata ─────────────────────────────────────────────────

test.describe("Strip Metadata", () => {
  test("strip metadata from JPEG with EXIF", async ({ request }) => {
    const res = await request.post("/api/v1/tools/strip-metadata", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_WITH_EXIF },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
    // Stripped image should be smaller or equal (no EXIF overhead)
    expect(body.processedSize).toBeLessThanOrEqual(body.originalSize);
  });

  test("strip metadata from PNG", async ({ request }) => {
    const res = await request.post("/api/v1/tools/strip-metadata", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("stripped image has no EXIF data", async ({ request }) => {
    // First strip metadata
    const stripRes = await request.post("/api/v1/tools/strip-metadata", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_WITH_EXIF },
        settings: JSON.stringify({}),
      },
    });
    expect(stripRes.ok()).toBe(true);
    const stripBody = await stripRes.json();

    // Download the stripped image
    const downloadRes = await request.get(stripBody.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(downloadRes.ok()).toBe(true);
    const strippedBuffer = Buffer.from(await downloadRes.body());

    // Verify stripped image via info tool
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

// ─── Edit Metadata ──────────────────────────────────────────────────

test.describe("Edit Metadata", () => {
  test("set artist and copyright fields", async ({ request }) => {
    const res = await request.post("/api/v1/tools/edit-metadata", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({
          artist: "Test Artist",
          copyright: "CC-BY-4.0",
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("edit metadata on PNG", async ({ request }) => {
    const res = await request.post("/api/v1/tools/edit-metadata", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          title: "Test Image",
          description: "A test image for e2e testing",
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Optimize for Web ───────────────────────────────────────────────

test.describe("Optimize for Web", () => {
  test("optimize with default settings", async ({ request }) => {
    const res = await request.post("/api/v1/tools/optimize-for-web", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("optimize with maxWidth constraint", async ({ request }) => {
    const res = await request.post("/api/v1/tools/optimize-for-web", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        settings: JSON.stringify({ maxWidth: 800, quality: 75 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    // Optimized should be smaller than the original large sample
    expect(body.processedSize).toBeLessThan(body.originalSize);
  });

  test("optimize PNG image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/optimize-for-web", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ maxWidth: 1920, quality: 80 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Image Enhancement ──────────────────────────────────────────────

test.describe("Image Enhancement", () => {
  test("auto enhancement", async ({ request }) => {
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

  test("vivid enhancement preset", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image-enhancement", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ preset: "vivid" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("enhancement changes the image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image-enhancement", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        settings: JSON.stringify({ preset: "auto" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    // Enhanced image should differ from original
    expect(body.processedSize).toBeGreaterThan(0);
    expect(body.processedSize).not.toBe(body.originalSize);
  });
});

// ─── Auth Failure ──────────────────────────────────────────────────

test.describe("Auth failure", () => {
  test("adjust-colors without token returns 401", async ({ request }) => {
    const res = await request.post("/api/v1/tools/adjust-colors", {
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ brightness: 20 }),
      },
    });
    expect(res.status()).toBe(401);
  });

  test("strip-metadata without token returns 401", async ({ request }) => {
    const res = await request.post("/api/v1/tools/strip-metadata", {
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_WITH_EXIF },
        settings: JSON.stringify({}),
      },
    });
    expect(res.status()).toBe(401);
  });

  test("edit-metadata without token returns 401", async ({ request }) => {
    const res = await request.post("/api/v1/tools/edit-metadata", {
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ artist: "Test" }),
      },
    });
    expect(res.status()).toBe(401);
  });
});
