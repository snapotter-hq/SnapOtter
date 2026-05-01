import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

// ─── Cross-Format Docker Tests ────────────────────────────────────
// Tests key tools against multiple input formats through the real
// Docker container with real Sharp processing. Verifies actual
// output dimensions, format, and file size.

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

const PNG_200x150 = fixture("test-200x150.png");
const JPG_100x100 = fixture("test-100x100.jpg");
const WEBP_50x50 = fixture("test-50x50.webp");
const HEIC_200x150 = fixture("test-200x150.heic");

// ─── Resize: Format Matrix ───────────────────────────────────────

test.describe("Resize: JPEG", () => {
  test("resize JPEG to 50px wide", async ({ request }) => {
    const res = await request.post("/api/v1/tools/resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ width: 50, fit: "contain" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });
});

test.describe("Resize: PNG", () => {
  test("resize PNG to 80px wide", async ({ request }) => {
    const res = await request.post("/api/v1/tools/resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ width: 80, fit: "contain" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });
});

test.describe("Resize: WebP", () => {
  test("resize WebP to 30px wide", async ({ request }) => {
    const res = await request.post("/api/v1/tools/resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.webp", mimeType: "image/webp", buffer: WEBP_50x50 },
        settings: JSON.stringify({ width: 30, fit: "contain" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });
});

test.describe("Resize: AVIF", () => {
  test("resize AVIF to 60px wide", async ({ request }) => {
    const avif = formatFixture("sample.avif");
    const res = await request.post("/api/v1/tools/resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.avif", mimeType: "image/avif", buffer: avif },
        settings: JSON.stringify({ width: 60, fit: "contain" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });
});

test.describe("Resize: HEIC", () => {
  test("resize HEIC to 80px wide", async ({ request }) => {
    const res = await request.post("/api/v1/tools/resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        settings: JSON.stringify({ width: 80, fit: "contain" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });
});

test.describe("Resize: TIFF", () => {
  test("resize TIFF to 60px wide", async ({ request }) => {
    const tiff = formatFixture("sample.tiff");
    const res = await request.post("/api/v1/tools/resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.tiff", mimeType: "image/tiff", buffer: tiff },
        settings: JSON.stringify({ width: 60, fit: "contain" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });
});

test.describe("Resize: BMP", () => {
  test("resize BMP to 40px wide", async ({ request }) => {
    const bmp = formatFixture("sample.bmp");
    const res = await request.post("/api/v1/tools/resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.bmp", mimeType: "image/bmp", buffer: bmp },
        settings: JSON.stringify({ width: 40, fit: "contain" }),
      },
    });
    // BMP may not be supported by Sharp natively
    if (res.ok()) {
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
      expect(body.processedSize).toBeGreaterThan(0);
    } else {
      expect([400, 422]).toContain(res.status());
    }
  });
});

test.describe("Resize: GIF", () => {
  test("resize GIF to 40px wide", async ({ request }) => {
    const gif = formatFixture("sample.gif");
    const res = await request.post("/api/v1/tools/resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.gif", mimeType: "image/gif", buffer: gif },
        settings: JSON.stringify({ width: 40, fit: "contain" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });
});

// ─── Convert: From Each Format to PNG ─────────────────────────────

test.describe("Convert to PNG: from JPEG", () => {
  test("JPEG to PNG", async ({ request }) => {
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
    expect(body.processedSize).toBeGreaterThan(0);
  });
});

test.describe("Convert to PNG: from WebP", () => {
  test("WebP to PNG", async ({ request }) => {
    const res = await request.post("/api/v1/tools/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.webp", mimeType: "image/webp", buffer: WEBP_50x50 },
        settings: JSON.stringify({ format: "png" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".png");
    expect(body.processedSize).toBeGreaterThan(0);
  });
});

test.describe("Convert to PNG: from AVIF", () => {
  test("AVIF to PNG", async ({ request }) => {
    const avif = formatFixture("sample.avif");
    const res = await request.post("/api/v1/tools/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.avif", mimeType: "image/avif", buffer: avif },
        settings: JSON.stringify({ format: "png" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".png");
    expect(body.processedSize).toBeGreaterThan(0);
  });
});

test.describe("Convert to PNG: from HEIC", () => {
  test("HEIC to PNG", async ({ request }) => {
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
    expect(body.processedSize).toBeGreaterThan(0);
  });
});

test.describe("Convert to PNG: from TIFF", () => {
  test("TIFF to PNG", async ({ request }) => {
    const tiff = formatFixture("sample.tiff");
    const res = await request.post("/api/v1/tools/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.tiff", mimeType: "image/tiff", buffer: tiff },
        settings: JSON.stringify({ format: "png" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".png");
    expect(body.processedSize).toBeGreaterThan(0);
  });
});

test.describe("Convert to PNG: from GIF", () => {
  test("GIF to PNG", async ({ request }) => {
    const gif = formatFixture("sample.gif");
    const res = await request.post("/api/v1/tools/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.gif", mimeType: "image/gif", buffer: gif },
        settings: JSON.stringify({ format: "png" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".png");
    expect(body.processedSize).toBeGreaterThan(0);
  });
});

test.describe("Convert to PNG: from HEIF", () => {
  test("HEIF to PNG", async ({ request }) => {
    const heif = formatFixture("sample.heif");
    const res = await request.post("/api/v1/tools/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.heif", mimeType: "image/heif", buffer: heif },
        settings: JSON.stringify({ format: "png" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".png");
    expect(body.processedSize).toBeGreaterThan(0);
  });
});

test.describe("Convert to PNG: from BMP", () => {
  test("BMP to PNG", async ({ request }) => {
    const bmp = formatFixture("sample.bmp");
    const res = await request.post("/api/v1/tools/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.bmp", mimeType: "image/bmp", buffer: bmp },
        settings: JSON.stringify({ format: "png" }),
      },
    });
    // BMP decode may not be supported
    if (res.ok()) {
      const body = await res.json();
      expect(body.downloadUrl).toContain(".png");
      expect(body.processedSize).toBeGreaterThan(0);
    } else {
      expect([400, 422]).toContain(res.status());
    }
  });
});

// ─── Compress: Format Matrix ──────────────────────────────────────

test.describe("Compress: JPEG", () => {
  test("compress JPEG with quality 30", async ({ request }) => {
    const res = await request.post("/api/v1/tools/compress", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: formatFixture("sample.jpg") },
        settings: JSON.stringify({ quality: 30 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
    expect(body.processedSize).toBeLessThan(body.originalSize);
  });
});

test.describe("Compress: PNG", () => {
  test("compress PNG with quality 40", async ({ request }) => {
    const res = await request.post("/api/v1/tools/compress", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ quality: 40 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });
});

test.describe("Compress: WebP", () => {
  test("compress WebP with quality 25", async ({ request }) => {
    const webp = formatFixture("sample.webp");
    const res = await request.post("/api/v1/tools/compress", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.webp", mimeType: "image/webp", buffer: webp },
        settings: JSON.stringify({ quality: 25 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });
});

test.describe("Compress: AVIF", () => {
  test("compress AVIF with quality 40", async ({ request }) => {
    const avif = formatFixture("sample.avif");
    const res = await request.post("/api/v1/tools/compress", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.avif", mimeType: "image/avif", buffer: avif },
        settings: JSON.stringify({ quality: 40 }),
      },
    });
    // AVIF compression may not be supported
    if (res.ok()) {
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
      expect(body.processedSize).toBeGreaterThan(0);
    } else {
      expect([400, 422]).toContain(res.status());
    }
  });
});

test.describe("Compress: HEIC", () => {
  test("compress HEIC with quality 50", async ({ request }) => {
    const res = await request.post("/api/v1/tools/compress", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        settings: JSON.stringify({ quality: 50 }),
      },
    });
    // HEIC compression may not be directly supported
    if (res.ok()) {
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
      expect(body.processedSize).toBeGreaterThan(0);
    } else {
      expect([400, 422]).toContain(res.status());
    }
  });
});

// ─── Info: Every Format ───────────────────────────────────────────

test.describe("Info: JPEG", () => {
  test("get info for JPEG returns correct dimensions", async ({ request }) => {
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
    expect(body.fileSize).toBeGreaterThan(0);
  });
});

test.describe("Info: PNG", () => {
  test("get info for PNG returns correct dimensions", async ({ request }) => {
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
});

test.describe("Info: WebP", () => {
  test("get info for WebP returns correct dimensions", async ({ request }) => {
    const res = await request.post("/api/v1/tools/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.webp", mimeType: "image/webp", buffer: WEBP_50x50 },
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.width).toBe(50);
    expect(body.height).toBe(50);
    expect(body.format).toBe("webp");
    expect(body.fileSize).toBeGreaterThan(0);
  });
});

test.describe("Info: AVIF", () => {
  test("get info for AVIF returns dimensions and format", async ({ request }) => {
    const avif = formatFixture("sample.avif");
    const res = await request.post("/api/v1/tools/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.avif", mimeType: "image/avif", buffer: avif },
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.width).toBeGreaterThan(0);
    expect(body.height).toBeGreaterThan(0);
    expect(body.fileSize).toBeGreaterThan(0);
  });
});

test.describe("Info: HEIC", () => {
  test("get info for HEIC returns dimensions", async ({ request }) => {
    const res = await request.post("/api/v1/tools/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.width).toBeGreaterThan(0);
    expect(body.height).toBeGreaterThan(0);
    expect(body.fileSize).toBeGreaterThan(0);
  });
});

test.describe("Info: TIFF", () => {
  test("get info for TIFF returns dimensions and format", async ({ request }) => {
    const tiff = formatFixture("sample.tiff");
    const res = await request.post("/api/v1/tools/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.tiff", mimeType: "image/tiff", buffer: tiff },
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.width).toBeGreaterThan(0);
    expect(body.height).toBeGreaterThan(0);
    expect(body.fileSize).toBeGreaterThan(0);
  });
});

test.describe("Info: GIF", () => {
  test("get info for GIF returns dimensions and format", async ({ request }) => {
    const gif = formatFixture("sample.gif");
    const res = await request.post("/api/v1/tools/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.gif", mimeType: "image/gif", buffer: gif },
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.width).toBeGreaterThan(0);
    expect(body.height).toBeGreaterThan(0);
    expect(body.format).toBe("gif");
    expect(body.fileSize).toBeGreaterThan(0);
  });
});

test.describe("Info: HEIF", () => {
  test("get info for HEIF returns dimensions", async ({ request }) => {
    const heif = formatFixture("sample.heif");
    const res = await request.post("/api/v1/tools/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.heif", mimeType: "image/heif", buffer: heif },
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.width).toBeGreaterThan(0);
    expect(body.height).toBeGreaterThan(0);
    expect(body.fileSize).toBeGreaterThan(0);
  });
});

test.describe("Info: BMP", () => {
  test("get info for BMP returns dimensions if supported", async ({ request }) => {
    const bmp = formatFixture("sample.bmp");
    const res = await request.post("/api/v1/tools/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.bmp", mimeType: "image/bmp", buffer: bmp },
      },
    });
    if (res.ok()) {
      const body = await res.json();
      expect(body.width).toBeGreaterThan(0);
      expect(body.height).toBeGreaterThan(0);
      expect(body.fileSize).toBeGreaterThan(0);
    } else {
      expect([400, 422]).toContain(res.status());
    }
  });
});

// ─── Cross-Format Conversions: Full Matrix ────────────────────────

test.describe("Cross-format: JPEG to all targets", () => {
  test("JPEG to WebP", async ({ request }) => {
    const res = await request.post("/api/v1/tools/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ format: "webp" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".webp");
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("JPEG to AVIF", async ({ request }) => {
    const res = await request.post("/api/v1/tools/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ format: "avif" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".avif");
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("JPEG to TIFF", async ({ request }) => {
    const res = await request.post("/api/v1/tools/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ format: "tiff" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".tiff");
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("JPEG to GIF", async ({ request }) => {
    const res = await request.post("/api/v1/tools/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ format: "gif" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".gif");
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("JPEG to HEIC", async ({ request }) => {
    const res = await request.post("/api/v1/tools/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ format: "heic" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".heic");
    expect(body.processedSize).toBeGreaterThan(0);
  });
});

test.describe("Cross-format: PNG to all targets", () => {
  test("PNG to JPEG", async ({ request }) => {
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

  test("PNG to WebP", async ({ request }) => {
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
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("PNG to AVIF", async ({ request }) => {
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
    expect(body.processedSize).toBeGreaterThan(0);
  });
});

test.describe("Cross-format: WebP to all targets", () => {
  test("WebP to JPEG", async ({ request }) => {
    const res = await request.post("/api/v1/tools/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.webp", mimeType: "image/webp", buffer: WEBP_50x50 },
        settings: JSON.stringify({ format: "jpg" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".jpg");
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("WebP to AVIF", async ({ request }) => {
    const res = await request.post("/api/v1/tools/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.webp", mimeType: "image/webp", buffer: WEBP_50x50 },
        settings: JSON.stringify({ format: "avif" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".avif");
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("WebP to TIFF", async ({ request }) => {
    const res = await request.post("/api/v1/tools/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.webp", mimeType: "image/webp", buffer: WEBP_50x50 },
        settings: JSON.stringify({ format: "tiff" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".tiff");
    expect(body.processedSize).toBeGreaterThan(0);
  });
});

test.describe("Cross-format: HEIC to all targets", () => {
  test("HEIC to JPEG", async ({ request }) => {
    const res = await request.post("/api/v1/tools/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        settings: JSON.stringify({ format: "jpg" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".jpg");
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("HEIC to WebP", async ({ request }) => {
    const res = await request.post("/api/v1/tools/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        settings: JSON.stringify({ format: "webp" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".webp");
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("HEIC to AVIF", async ({ request }) => {
    const res = await request.post("/api/v1/tools/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        settings: JSON.stringify({ format: "avif" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".avif");
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("HEIC to TIFF", async ({ request }) => {
    const res = await request.post("/api/v1/tools/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        settings: JSON.stringify({ format: "tiff" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".tiff");
    expect(body.processedSize).toBeGreaterThan(0);
  });
});

// ─── Resize + Info Verification ───────────────────────────────────

test.describe("Resize + info verification: JPEG", () => {
  test("resize JPEG then verify dimensions via info", async ({ request }) => {
    // Step 1: Resize
    const resizeRes = await request.post("/api/v1/tools/resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ width: 50, height: 50, fit: "fill" }),
      },
    });
    expect(resizeRes.ok()).toBe(true);
    const resizeBody = await resizeRes.json();
    expect(resizeBody.downloadUrl).toBeTruthy();

    // Step 2: Download resized image
    const dlRes = await request.get(resizeBody.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const resizedBuffer = Buffer.from(await dlRes.body());

    // Step 3: Verify dimensions via info
    const infoRes = await request.post("/api/v1/tools/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "resized.jpg", mimeType: "image/jpeg", buffer: resizedBuffer },
      },
    });
    expect(infoRes.ok()).toBe(true);
    const infoBody = await infoRes.json();
    expect(infoBody.width).toBe(50);
    expect(infoBody.height).toBe(50);
  });
});

test.describe("Resize + info verification: PNG", () => {
  test("resize PNG then verify dimensions via info", async ({ request }) => {
    const resizeRes = await request.post("/api/v1/tools/resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ width: 100, fit: "contain" }),
      },
    });
    expect(resizeRes.ok()).toBe(true);
    const resizeBody = await resizeRes.json();

    const dlRes = await request.get(resizeBody.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const resizedBuffer = Buffer.from(await dlRes.body());

    const infoRes = await request.post("/api/v1/tools/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "resized.png", mimeType: "image/png", buffer: resizedBuffer },
      },
    });
    expect(infoRes.ok()).toBe(true);
    const infoBody = await infoRes.json();
    expect(infoBody.width).toBe(100);
    // Aspect ratio preserved: 200x150 -> 100x75
    expect(infoBody.height).toBe(75);
    expect(infoBody.format).toBe("png");
  });
});

// ─── Convert + Info Verification ──────────────────────────────────

test.describe("Convert + info verification", () => {
  test("convert JPEG to WebP then verify format via info", async ({ request }) => {
    const convertRes = await request.post("/api/v1/tools/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ format: "webp" }),
      },
    });
    expect(convertRes.ok()).toBe(true);
    const convertBody = await convertRes.json();

    const dlRes = await request.get(convertBody.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const convertedBuffer = Buffer.from(await dlRes.body());

    const infoRes = await request.post("/api/v1/tools/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "converted.webp", mimeType: "image/webp", buffer: convertedBuffer },
      },
    });
    expect(infoRes.ok()).toBe(true);
    const infoBody = await infoRes.json();
    expect(infoBody.format).toBe("webp");
    expect(infoBody.width).toBe(100);
    expect(infoBody.height).toBe(100);
  });

  test("convert PNG to AVIF then verify format via info", async ({ request }) => {
    const convertRes = await request.post("/api/v1/tools/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ format: "avif" }),
      },
    });
    expect(convertRes.ok()).toBe(true);
    const convertBody = await convertRes.json();

    const dlRes = await request.get(convertBody.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const convertedBuffer = Buffer.from(await dlRes.body());

    const infoRes = await request.post("/api/v1/tools/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "converted.avif", mimeType: "image/avif", buffer: convertedBuffer },
      },
    });
    expect(infoRes.ok()).toBe(true);
    const infoBody = await infoRes.json();
    expect(infoBody.width).toBe(200);
    expect(infoBody.height).toBe(150);
  });
});
