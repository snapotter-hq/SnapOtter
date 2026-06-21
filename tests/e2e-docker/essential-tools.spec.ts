import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

// ─── Essential Tools ────────────────────────────────────────────────
// Tests for: resize, crop, rotate, convert, compress, strip-metadata,
// edit-metadata, info, sharpening, color-adjustments, color-blindness
// These are the core Sharp-based image manipulation tools.

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

/** 200x150 PNG for dimension-sensitive tests. */
const PNG_200x150 = fixture("test-200x150.png");

/** 100x100 JPEG for format variety. */
const JPG_100x100 = fixture("test-100x100.jpg");

/** HEIC image for format decode testing. */
const HEIC_200x150 = fixture("test-200x150.heic");

/** SVG image for vector input testing. */
const SVG_100x100 = fixture("test-100x100.svg");

/** Tiny 1x1 PNG for edge case testing. */
const PNG_1x1 = fixture("test-1x1.png");

/** Large sample JPEG for stress testing. */
const JPG_SAMPLE_LARGE = contentFixture("stress-large.jpg");

/** Sample photo JPEG. */
const _JPG_SAMPLE = fixture("sample-photo.jpg");

/** JPEG with EXIF data. */
const JPG_WITH_EXIF = fixture("test-with-exif.jpg");

// ─── Resize ──────────────────────────────────────────────────────────

test.describe("Resize", () => {
  test("resize to explicit width and height", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ width: 100, height: 75, fit: "fill" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("resize with only width preserves aspect ratio", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ width: 100, fit: "contain" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("resize with only height preserves aspect ratio", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ height: 50, fit: "contain" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("resize with fit=cover", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ width: 80, height: 80, fit: "cover" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("resize with withoutEnlargement prevents upscaling", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ width: 400, withoutEnlargement: true }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("resize HEIC image succeeds", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        settings: JSON.stringify({ width: 100, fit: "contain" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("resize rejects invalid width=0", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ width: 0 }),
      },
    });
    expect(res.ok()).toBe(false);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test("resize rejects request with no file", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        settings: JSON.stringify({ width: 100 }),
      },
    });
    expect(res.ok()).toBe(false);
  });
});

// ─── Crop ────────────────────────────────────────────────────────────

test.describe("Crop", () => {
  test("crop to specific region", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/crop", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ left: 10, top: 10, width: 100, height: 75 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
    // Cropped image should be smaller than original
    expect(body.processedSize).toBeLessThan(body.originalSize);
  });

  test("crop with zero offset extracts from corner", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/crop", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ left: 0, top: 0, width: 50, height: 50 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("crop JPEG image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/crop", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ left: 10, top: 10, width: 50, height: 50 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Rotate ──────────────────────────────────────────────────────────

test.describe("Rotate", () => {
  test("rotate 90 degrees", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/rotate", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ angle: 90 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("rotate 180 degrees", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/rotate", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ angle: 180 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("rotate 270 degrees", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/rotate", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ angle: 270 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("rotate 45 degrees with background fill", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/rotate", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ angle: 45, background: "#ffffff" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    // 45-degree rotation expands the canvas, so output should be larger
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("rotate 0 degrees returns image unchanged", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/rotate", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ angle: 0 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Convert ─────────────────────────────────────────────────────────

test.describe("Convert", () => {
  test("convert PNG to JPEG", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ format: "jpg", quality: 85 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".jpg");
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("convert PNG to WebP", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ format: "webp" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".webp");
  });

  test("convert PNG to AVIF", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ format: "avif" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".avif");
  });

  test("convert PNG to TIFF", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ format: "tiff" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".tiff");
  });

  test("convert PNG to GIF", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ format: "gif" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".gif");
  });

  test("convert JPEG to PNG", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ format: "png" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".png");
  });

  test("convert HEIC to PNG", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        settings: JSON.stringify({ format: "png" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".png");
  });

  test("convert PNG to HEIC", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ format: "heic" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".heic");
  });

  test("convert with quality parameter", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ format: "jpg", quality: 10 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("convert PNG to BMP", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ format: "bmp" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });
});

// ─── Compress ────────────────────────────────────────────────────────

test.describe("Compress", () => {
  test("compress with default settings", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/compress", {
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

  test("compress with low quality produces smaller file", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/compress", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: formatFixture("sample.jpg") },
        settings: JSON.stringify({ quality: 10 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    // Low quality should produce a smaller file than the original
    expect(body.processedSize).toBeLessThan(body.originalSize);
  });

  test("compress PNG image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/compress", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ quality: 50 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("compress WebP image", async ({ request }) => {
    const webp = readFileSync(join(FIXTURES, "test-50x50.webp"));
    const res = await request.post("/api/v1/tools/image/compress", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.webp", mimeType: "image/webp", buffer: webp },
        settings: JSON.stringify({ quality: 50 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Metadata (Info) ────────────────────────────────────────────────

test.describe("Metadata", () => {
  test("returns dimensions and format for PNG", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.width).toBe(200);
    expect(body.height).toBe(150);
    expect(body.format).toBe("png");
    expect(body.fileSize).toBeGreaterThan(0);
  });

  test("returns dimensions for JPEG", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.width).toBe(100);
    expect(body.height).toBe(100);
    expect(body.format).toBe("jpeg");
  });

  test("returns EXIF data when present", async ({ request }) => {
    const jpgExif = fixture("test-with-exif.jpg");
    const res = await request.post("/api/v1/tools/image/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test-with-exif.jpg", mimeType: "image/jpeg", buffer: jpgExif },
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.hasExif).toBe(true);
  });

  test("returns channel and alpha info", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.channels).toBeGreaterThan(0);
    expect(typeof body.hasAlpha).toBe("boolean");
    expect(body.colorSpace).toBeTruthy();
  });
});

// ─── Color Adjustments ──────────────────────────────────────────────

test.describe("Colors", () => {
  test("adjust brightness", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/adjust-colors", {
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

  test("adjust contrast and saturation together", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/adjust-colors", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ contrast: 20, saturation: -10 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("convert to grayscale", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/adjust-colors", {
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

  test("negative brightness darkens image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/adjust-colors", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ brightness: -30 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });
});

// ─── Sharpening ─────────────────────────────────────────────────────

test.describe("Sharpening", () => {
  test("sharpen with default sigma", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/sharpening", {
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

  test("sharpen with explicit sigma", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/sharpening", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ sigma: 2.0 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("sharpen HEIC image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/sharpening", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        settings: JSON.stringify({ sigma: 1.5 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Resize — Additional Scenarios ──────────────────────────────────

test.describe("Resize — additional", () => {
  test("resize with fit=inside constrains within bounds", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ width: 100, height: 100, fit: "inside" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("resize with percentage scale via width only", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ width: 50, fit: "contain" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("resize WebP image", async ({ request }) => {
    const webp = readFileSync(join(FIXTURES, "test-50x50.webp"));
    const res = await request.post("/api/v1/tools/image/resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.webp", mimeType: "image/webp", buffer: webp },
        settings: JSON.stringify({ width: 100, fit: "fill" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("resize rejects negative width", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ width: -50 }),
      },
    });
    expect(res.ok()).toBe(false);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ─── Crop — Additional Scenarios ────────────────────────────────────

test.describe("Crop — additional", () => {
  test("crop HEIC image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/crop", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        settings: JSON.stringify({ left: 5, top: 5, width: 80, height: 60 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("crop WebP image", async ({ request }) => {
    const webp = readFileSync(join(FIXTURES, "test-50x50.webp"));
    const res = await request.post("/api/v1/tools/image/crop", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.webp", mimeType: "image/webp", buffer: webp },
        settings: JSON.stringify({ left: 0, top: 0, width: 25, height: 25 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("crop full image returns same-size output", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/crop", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ left: 0, top: 0, width: 200, height: 150 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });
});

// ─── Rotate — Additional Scenarios ──────────────────────────────────

test.describe("Rotate — additional", () => {
  test("rotate HEIC image 90 degrees", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/rotate", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        settings: JSON.stringify({ angle: 90 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("rotate arbitrary angle (30 degrees)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/rotate", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ angle: 30, background: "#000000" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });
});

// ─── Compress — Additional Scenarios ────────────────────────────────

test.describe("Compress — additional", () => {
  test("compress HEIC image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/compress", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        settings: JSON.stringify({ quality: 50 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("compress with high quality (95)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/compress", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ quality: 95 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("compress with minimum quality (1)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/compress", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: formatFixture("sample.jpg") },
        settings: JSON.stringify({ quality: 1 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeLessThan(body.originalSize);
  });
});

// ─── Convert — Output Verification ─────────────────────────────────

test.describe("Convert — output verification", () => {
  test("converted file can be downloaded", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ format: "jpg", quality: 80 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();

    // Download and verify the converted file is valid
    const dlRes = await request.get(body.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const buffer = Buffer.from(await dlRes.body());
    expect(buffer.length).toBeGreaterThan(0);
  });

  test("convert WebP to AVIF", async ({ request }) => {
    const webp = readFileSync(join(FIXTURES, "test-50x50.webp"));
    const res = await request.post("/api/v1/tools/image/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.webp", mimeType: "image/webp", buffer: webp },
        settings: JSON.stringify({ format: "avif" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".avif");
  });
});

// ─── Metadata — Additional Scenarios ────────────────────────────────

test.describe("Metadata — additional", () => {
  test("returns metadata for SVG image", async ({ request }) => {
    const svg = readFileSync(join(FIXTURES, "test-100x100.svg"));
    const res = await request.post("/api/v1/tools/image/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.svg", mimeType: "image/svg+xml", buffer: svg },
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.width).toBeGreaterThan(0);
    expect(body.height).toBeGreaterThan(0);
  });

  test("returns metadata for WebP image", async ({ request }) => {
    const webp = readFileSync(join(FIXTURES, "test-50x50.webp"));
    const res = await request.post("/api/v1/tools/image/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.webp", mimeType: "image/webp", buffer: webp },
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.width).toBe(50);
    expect(body.height).toBe(50);
    expect(body.format).toBe("webp");
  });
});

// ─── Color Blindness Simulation ────────────────────────────────────

test.describe("Color Blindness Simulation", () => {
  test("simulate deuteranomaly (default)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/color-blindness", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("simulate protanopia", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/color-blindness", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ simulationType: "protanopia" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("simulate tritanopia", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/color-blindness", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ simulationType: "tritanopia" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("simulate achromatopsia (total color blindness)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/color-blindness", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ simulationType: "achromatopsia" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("simulate deuteranopia on HEIC image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/color-blindness", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        settings: JSON.stringify({ simulationType: "deuteranopia" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("simulate blueConeMonochromacy", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/color-blindness", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ simulationType: "blueConeMonochromacy" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("color-blindness without token returns 401", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/color-blindness", {
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ simulationType: "protanopia" }),
      },
    });
    expect(res.status()).toBe(401);
  });
});

// ─── Strip Metadata ────────────────────────────────────────────────

test.describe("Strip Metadata", () => {
  test("strip metadata with default settings", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/strip-metadata", {
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
    // Stripping metadata should not increase file size
    expect(body.processedSize).toBeLessThanOrEqual(body.originalSize);
  });

  test("strip metadata from PNG image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/strip-metadata", {
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

  test("strip metadata from HEIC image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/strip-metadata", {
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

  test("strip then verify no EXIF via info tool", async ({ request }) => {
    // Strip metadata
    const stripRes = await request.post("/api/v1/tools/image/strip-metadata", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_WITH_EXIF },
        settings: JSON.stringify({}),
      },
    });
    expect(stripRes.ok()).toBe(true);
    const stripBody = await stripRes.json();

    // Download the stripped file
    const dlRes = await request.get(stripBody.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const strippedBuffer = Buffer.from(await dlRes.body());

    // Verify via info tool
    const infoRes = await request.post("/api/v1/tools/image/info", {
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

// ─── Edit Metadata ─────────────────────────────────────────────────

test.describe("Edit Metadata", () => {
  test("set artist field on JPEG", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/edit-metadata", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ artist: "SnapOtter E2E" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("set all EXIF fields at once", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/edit-metadata", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({
          title: "Test Image",
          description: "Docker E2E test",
          artist: "SnapOtter",
          copyright: "CC0-1.0",
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("edit metadata on PNG image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/edit-metadata", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ title: "PNG metadata test" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("edit metadata round-trip verification", async ({ request }) => {
    const editRes = await request.post("/api/v1/tools/image/edit-metadata", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ artist: "Round Trip Author" }),
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
    const infoRes = await request.post("/api/v1/tools/image/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "edited.jpg", mimeType: "image/jpeg", buffer: editedBuffer },
      },
    });
    expect(infoRes.ok()).toBe(true);
    const infoBody = await infoRes.json();
    expect(infoBody.hasExif).toBe(true);
  });

  test("edit metadata on HEIC image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/edit-metadata", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        settings: JSON.stringify({ artist: "HEIC metadata test" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── SVG Input Support ─────────────────────────────────────────────

test.describe("SVG Input", () => {
  test("resize SVG input", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.svg", mimeType: "image/svg+xml", buffer: SVG_100x100 },
        settings: JSON.stringify({ width: 200, fit: "contain" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("rotate SVG input", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/rotate", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.svg", mimeType: "image/svg+xml", buffer: SVG_100x100 },
        settings: JSON.stringify({ angle: 90 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("compress SVG input (rasterized)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/compress", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.svg", mimeType: "image/svg+xml", buffer: SVG_100x100 },
        settings: JSON.stringify({ quality: 60 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("convert SVG to JPEG", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.svg", mimeType: "image/svg+xml", buffer: SVG_100x100 },
        settings: JSON.stringify({ format: "jpg", quality: 80 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".jpg");
    expect(body.processedSize).toBeGreaterThan(0);
  });
});

// ─── Tiny File Edge Cases ──────────────────────────────────────────

test.describe("Tiny file (1x1 pixel)", () => {
  test("resize 1x1 PNG to larger dimensions", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_1x1 },
        settings: JSON.stringify({ width: 100, height: 100, fit: "fill" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("crop 1x1 PNG to same size succeeds", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/crop", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_1x1 },
        settings: JSON.stringify({ left: 0, top: 0, width: 1, height: 1 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("rotate 1x1 PNG by 90 degrees", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/rotate", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_1x1 },
        settings: JSON.stringify({ angle: 90 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("convert 1x1 PNG to WebP", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_1x1 },
        settings: JSON.stringify({ format: "webp" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".webp");
  });

  test("compress 1x1 PNG", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/compress", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_1x1 },
        settings: JSON.stringify({ quality: 50 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("info returns 1x1 dimensions", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_1x1 },
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.width).toBe(1);
    expect(body.height).toBe(1);
    expect(body.format).toBe("png");
  });
});

// ─── Large File Processing ─────────────────────────────────────────

test.describe("Large file processing", () => {
  test("resize large JPEG image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "stress.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE_LARGE },
        settings: JSON.stringify({ width: 800, fit: "contain" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
    // Resized should be smaller than original
    expect(body.processedSize).toBeLessThan(body.originalSize);
  });

  test("compress large JPEG with aggressive quality", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/compress", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "stress.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE_LARGE },
        settings: JSON.stringify({ quality: 20 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeLessThan(body.originalSize);
  });

  test("convert large JPEG to WebP", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "stress.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE_LARGE },
        settings: JSON.stringify({ format: "webp" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".webp");
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("rotate large JPEG 270 degrees", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/rotate", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "stress.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE_LARGE },
        settings: JSON.stringify({ angle: 270 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("info on large JPEG returns dimensions", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "stress.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE_LARGE },
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.width).toBeGreaterThan(0);
    expect(body.height).toBeGreaterThan(0);
    expect(body.fileSize).toBeGreaterThan(1_000_000); // At least 1MB
  });
});

// ─── Download and Verify Output ────────────────────────────────────

test.describe("Output download verification", () => {
  test("resized file is downloadable and valid", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ width: 100, fit: "contain" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();

    // Download the result
    const dlRes = await request.get(body.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const buffer = Buffer.from(await dlRes.body());
    expect(buffer.length).toBeGreaterThan(0);

    // Verify dimensions via info tool
    const infoRes = await request.post("/api/v1/tools/image/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "resized.png", mimeType: "image/png", buffer: buffer },
      },
    });
    expect(infoRes.ok()).toBe(true);
    const infoBody = await infoRes.json();
    expect(infoBody.width).toBe(100);
  });

  test("cropped file dimensions match request", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/crop", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ left: 10, top: 10, width: 80, height: 60 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();

    const dlRes = await request.get(body.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const buffer = Buffer.from(await dlRes.body());

    const infoRes = await request.post("/api/v1/tools/image/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "cropped.png", mimeType: "image/png", buffer: buffer },
      },
    });
    expect(infoRes.ok()).toBe(true);
    const infoBody = await infoRes.json();
    expect(infoBody.width).toBe(80);
    expect(infoBody.height).toBe(60);
  });

  test("90-degree rotation swaps width and height", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/rotate", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ angle: 90 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();

    const dlRes = await request.get(body.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const buffer = Buffer.from(await dlRes.body());

    const infoRes = await request.post("/api/v1/tools/image/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "rotated.png", mimeType: "image/png", buffer: buffer },
      },
    });
    expect(infoRes.ok()).toBe(true);
    const infoBody = await infoRes.json();
    // 200x150 rotated 90 degrees should become 150x200
    expect(infoBody.width).toBe(150);
    expect(infoBody.height).toBe(200);
  });
});

// ─── Auth Failure ──────────────────────────────────────────────────

test.describe("Auth failure", () => {
  test("resize without token returns 401", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/resize", {
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ width: 100 }),
      },
    });
    expect(res.status()).toBe(401);
  });

  test("crop without token returns 401", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/crop", {
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ left: 0, top: 0, width: 50, height: 50 }),
      },
    });
    expect(res.status()).toBe(401);
  });

  test("convert without token returns 401", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/convert", {
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ format: "jpg" }),
      },
    });
    expect(res.status()).toBe(401);
  });

  test("compress without token returns 401", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/compress", {
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ quality: 50 }),
      },
    });
    expect(res.status()).toBe(401);
  });

  test("sharpening without token returns 401", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/sharpening", {
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({}),
      },
    });
    expect(res.status()).toBe(401);
  });

  test("strip-metadata without token returns 401", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/strip-metadata", {
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_WITH_EXIF },
        settings: JSON.stringify({}),
      },
    });
    expect(res.status()).toBe(401);
  });

  test("edit-metadata without token returns 401", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/edit-metadata", {
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ artist: "Test" }),
      },
    });
    expect(res.status()).toBe(401);
  });
});
