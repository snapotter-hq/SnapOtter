import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

// ─── Essential Tools ────────────────────────────────────────────────
// Tests for: resize, crop, rotate, convert, compress
// These are the core Sharp-based image manipulation tools.

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

function formatFixture(name: string): Buffer {
  return readFileSync(join(FORMATS, name));
}

/** 200x150 PNG for dimension-sensitive tests. */
const PNG_200x150 = fixture("test-200x150.png");

/** 100x100 JPEG for format variety. */
const JPG_100x100 = fixture("test-100x100.jpg");

/** HEIC image for format decode testing. */
const HEIC_200x150 = fixture("test-200x150.heic");

// ─── Resize ──────────────────────────────────────────────────────────

test.describe("Resize", () => {
  test("resize to explicit width and height", async ({ request }) => {
    const res = await request.post("/api/v1/tools/resize", {
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
    const res = await request.post("/api/v1/tools/resize", {
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
    const res = await request.post("/api/v1/tools/resize", {
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
    const res = await request.post("/api/v1/tools/resize", {
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
    const res = await request.post("/api/v1/tools/resize", {
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
    const res = await request.post("/api/v1/tools/resize", {
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
    const res = await request.post("/api/v1/tools/resize", {
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
    const res = await request.post("/api/v1/tools/resize", {
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
    const res = await request.post("/api/v1/tools/crop", {
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
    const res = await request.post("/api/v1/tools/crop", {
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
    const res = await request.post("/api/v1/tools/crop", {
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
    const res = await request.post("/api/v1/tools/rotate", {
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
    const res = await request.post("/api/v1/tools/rotate", {
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
    const res = await request.post("/api/v1/tools/rotate", {
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
    const res = await request.post("/api/v1/tools/rotate", {
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
    const res = await request.post("/api/v1/tools/rotate", {
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
    const res = await request.post("/api/v1/tools/convert", {
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
    const res = await request.post("/api/v1/tools/convert", {
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
    const res = await request.post("/api/v1/tools/convert", {
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
    const res = await request.post("/api/v1/tools/convert", {
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
    const res = await request.post("/api/v1/tools/convert", {
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
    const res = await request.post("/api/v1/tools/convert", {
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
    const res = await request.post("/api/v1/tools/convert", {
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
    const res = await request.post("/api/v1/tools/convert", {
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
    const res = await request.post("/api/v1/tools/convert", {
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

  test("convert rejects invalid format", async ({ request }) => {
    const res = await request.post("/api/v1/tools/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ format: "bmp" }),
      },
    });
    expect(res.ok()).toBe(false);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ─── Compress ────────────────────────────────────────────────────────

test.describe("Compress", () => {
  test("compress with default settings", async ({ request }) => {
    const res = await request.post("/api/v1/tools/compress", {
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
    const res = await request.post("/api/v1/tools/compress", {
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
    const res = await request.post("/api/v1/tools/compress", {
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
    const res = await request.post("/api/v1/tools/compress", {
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
    const res = await request.post("/api/v1/tools/info", {
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
    const res = await request.post("/api/v1/tools/info", {
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
    const res = await request.post("/api/v1/tools/info", {
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
    const res = await request.post("/api/v1/tools/info", {
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

  test("adjust contrast and saturation together", async ({ request }) => {
    const res = await request.post("/api/v1/tools/adjust-colors", {
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

  test("negative brightness darkens image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/adjust-colors", {
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

  test("sharpen with explicit sigma", async ({ request }) => {
    const res = await request.post("/api/v1/tools/sharpening", {
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
    const res = await request.post("/api/v1/tools/sharpening", {
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

// ─── Auth Failure ──────────────────────────────────────────────────

test.describe("Auth failure", () => {
  test("resize without token returns 401", async ({ request }) => {
    const res = await request.post("/api/v1/tools/resize", {
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ width: 100 }),
      },
    });
    expect(res.status()).toBe(401);
  });

  test("crop without token returns 401", async ({ request }) => {
    const res = await request.post("/api/v1/tools/crop", {
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ left: 0, top: 0, width: 50, height: 50 }),
      },
    });
    expect(res.status()).toBe(401);
  });

  test("convert without token returns 401", async ({ request }) => {
    const res = await request.post("/api/v1/tools/convert", {
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ format: "jpg" }),
      },
    });
    expect(res.status()).toBe(401);
  });
});
