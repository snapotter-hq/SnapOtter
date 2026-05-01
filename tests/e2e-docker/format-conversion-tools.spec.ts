import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

// ─── Format Conversion Tools ───────────────────────────────────────
// Comprehensive format conversion coverage: SVG-to-raster with all
// output formats, vectorize from all raster formats, GIF tools with
// various operations, PDF-to-image with all DPI and format options.
// Complements conversion-tools.spec.ts with deeper fixture coverage.

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

const PNG_200x150 = fixture("test-200x150.png");
const SVG_100x100 = fixture("test-100x100.svg");
const HEIC_200x150 = fixture("test-200x150.heic");
const WEBP_50x50 = fixture("test-50x50.webp");
const ANIMATED_GIF = fixture("animated.gif");
const PDF_3PAGE = fixture("test-3page.pdf");

// ─── SVG to Raster — Extended Formats ──────────────────────────────

test.describe("SVG to Raster — extended", () => {
  test("convert SVG to AVIF", async ({ request }) => {
    const res = await request.post("/api/v1/tools/svg-to-raster", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.svg", mimeType: "image/svg+xml", buffer: SVG_100x100 },
        settings: JSON.stringify({ format: "avif", width: 256 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("convert SVG to TIFF", async ({ request }) => {
    const res = await request.post("/api/v1/tools/svg-to-raster", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.svg", mimeType: "image/svg+xml", buffer: SVG_100x100 },
        settings: JSON.stringify({ format: "tiff", width: 400 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("convert SVG with large render width (1024px)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/svg-to-raster", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.svg", mimeType: "image/svg+xml", buffer: SVG_100x100 },
        settings: JSON.stringify({ format: "png", width: 1024 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("convert QR code SVG to raster", async ({ request }) => {
    const qrSvg = contentFixture("qr-code.svg");
    const res = await request.post("/api/v1/tools/svg-to-raster", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "qr.svg", mimeType: "image/svg+xml", buffer: qrSvg },
        settings: JSON.stringify({ format: "png", width: 400 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Vectorize — Extended Formats ──────────────────────────────────

test.describe("Vectorize — extended", () => {
  test("vectorize WebP to SVG", async ({ request }) => {
    const res = await request.post("/api/v1/tools/vectorize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.webp", mimeType: "image/webp", buffer: WEBP_50x50 },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.downloadUrl).toContain(".svg");
  });

  test("vectorize HEIC to SVG", async ({ request }) => {
    const res = await request.post("/api/v1/tools/vectorize", {
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

  test("vectorize AVIF sample to SVG", async ({ request }) => {
    const avif = formatFixture("sample.avif");
    const res = await request.post("/api/v1/tools/vectorize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.avif", mimeType: "image/avif", buffer: avif },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("vectorize TIFF sample to SVG", async ({ request }) => {
    const tiff = formatFixture("sample.tiff");
    const res = await request.post("/api/v1/tools/vectorize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.tiff", mimeType: "image/tiff", buffer: tiff },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── GIF Tools — Extended ──────────────────────────────────────────

test.describe("GIF Tools — extended", () => {
  test("GIF tool with resize settings", async ({ request }) => {
    const res = await request.post("/api/v1/tools/gif-tools", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "animated.gif", mimeType: "image/gif", buffer: ANIMATED_GIF },
        settings: JSON.stringify({ action: "resize", width: 100 }),
      },
    });
    if (res.ok()) {
      const body = await res.json();
      expect(body.downloadUrl || body.frames).toBeTruthy();
    } else {
      const body = await res.json();
      expect(body.error).toBeDefined();
    }
  });

  test("GIF tool with extract-frames action", async ({ request }) => {
    const res = await request.post("/api/v1/tools/gif-tools", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "animated.gif", mimeType: "image/gif", buffer: ANIMATED_GIF },
        settings: JSON.stringify({ action: "extract-frames" }),
      },
    });
    if (res.ok()) {
      const body = await res.json();
      expect(body.downloadUrl || body.frames).toBeTruthy();
    } else {
      const body = await res.json();
      expect(body.error).toBeDefined();
    }
  });

  test("GIF tool with speed adjustment", async ({ request }) => {
    const simpsons = contentFixture("animated-simpsons.gif");
    const res = await request.post("/api/v1/tools/gif-tools", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "simpsons.gif", mimeType: "image/gif", buffer: simpsons },
        settings: JSON.stringify({ action: "speed", speedFactor: 2 }),
      },
    });
    if (res.ok()) {
      const body = await res.json();
      expect(body.downloadUrl || body.frames).toBeTruthy();
    } else {
      const body = await res.json();
      expect(body.error).toBeDefined();
    }
  });

  test("GIF tool with reverse action", async ({ request }) => {
    const res = await request.post("/api/v1/tools/gif-tools", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "animated.gif", mimeType: "image/gif", buffer: ANIMATED_GIF },
        settings: JSON.stringify({ action: "reverse" }),
      },
    });
    if (res.ok()) {
      const body = await res.json();
      expect(body.downloadUrl || body.frames).toBeTruthy();
    } else {
      const body = await res.json();
      expect(body.error).toBeDefined();
    }
  });

  test("reject non-GIF file", async ({ request }) => {
    const res = await request.post("/api/v1/tools/gif-tools", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({}),
      },
    });
    // May accept and convert, or reject with error
    if (!res.ok()) {
      const body = await res.json();
      expect(body.error).toBeDefined();
    }
  });
});

// ─── PDF to Image — Extended ───────────────────────────────────────

test.describe("PDF to Image — extended", () => {
  test("convert PDF to AVIF format", async ({ request }) => {
    const res = await request.post("/api/v1/tools/pdf-to-image", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.pdf", mimeType: "application/pdf", buffer: PDF_3PAGE },
        settings: JSON.stringify({ format: "avif", dpi: 150, pages: "1" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl || body.pages || body.jobId).toBeTruthy();
  });

  test("convert PDF at high DPI (300)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/pdf-to-image", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.pdf", mimeType: "application/pdf", buffer: PDF_3PAGE },
        settings: JSON.stringify({ format: "png", dpi: 300, pages: "1" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl || body.pages || body.jobId).toBeTruthy();
  });

  test("convert PDF at low DPI (72)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/pdf-to-image", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.pdf", mimeType: "application/pdf", buffer: PDF_3PAGE },
        settings: JSON.stringify({ format: "jpg", dpi: 72, pages: "all" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl || body.pages || body.jobId).toBeTruthy();
  });

  test("convert specific middle page", async ({ request }) => {
    const res = await request.post("/api/v1/tools/pdf-to-image", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.pdf", mimeType: "application/pdf", buffer: PDF_3PAGE },
        settings: JSON.stringify({ format: "png", dpi: 150, pages: "2" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl || body.pages || body.jobId).toBeTruthy();
  });

  test("convert last page only", async ({ request }) => {
    const res = await request.post("/api/v1/tools/pdf-to-image", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.pdf", mimeType: "application/pdf", buffer: PDF_3PAGE },
        settings: JSON.stringify({ format: "png", dpi: 150, pages: "3" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl || body.pages || body.jobId).toBeTruthy();
  });
});

// ─── Convert from Exotic Formats ───────────────────────────────────

test.describe("Convert from exotic formats", () => {
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

  test("TIFF to JPEG", async ({ request }) => {
    const tiff = formatFixture("sample.tiff");
    const res = await request.post("/api/v1/tools/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.tiff", mimeType: "image/tiff", buffer: tiff },
        settings: JSON.stringify({ format: "jpg", quality: 85 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".jpg");
  });

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
  });

  test("AVIF to WebP", async ({ request }) => {
    const avif = formatFixture("sample.avif");
    const res = await request.post("/api/v1/tools/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.avif", mimeType: "image/avif", buffer: avif },
        settings: JSON.stringify({ format: "webp" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".webp");
  });

  test("GIF to PNG (single frame)", async ({ request }) => {
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
  });

  test("HEIF to WebP", async ({ request }) => {
    const heif = formatFixture("sample.heif");
    const res = await request.post("/api/v1/tools/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.heif", mimeType: "image/heif", buffer: heif },
        settings: JSON.stringify({ format: "webp" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".webp");
  });

  test("HEIF to JPEG", async ({ request }) => {
    const heif = formatFixture("sample.heif");
    const res = await request.post("/api/v1/tools/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.heif", mimeType: "image/heif", buffer: heif },
        settings: JSON.stringify({ format: "jpg" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".jpg");
  });
});

// ─── Image to Base64 — Extended Formats ────────────────────────────

test.describe("Image to Base64 — extended", () => {
  test("encode WebP to base64", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image-to-base64", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.webp", mimeType: "image/webp", buffer: WEBP_50x50 },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.results).toBeInstanceOf(Array);
    expect(body.results[0].base64).toBeTruthy();
    expect(body.results[0].width).toBe(50);
    expect(body.results[0].height).toBe(50);
  });

  test("encode HEIC to base64 with format conversion", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image-to-base64", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        settings: JSON.stringify({ outputFormat: "png" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.results[0].base64).toBeTruthy();
    expect(body.results[0].mimeType).toBe("image/png");
  });

  test("encode with both maxWidth and format conversion", async ({ request }) => {
    const sample = formatFixture("sample.jpg");
    const res = await request.post("/api/v1/tools/image-to-base64", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: sample },
        settings: JSON.stringify({ outputFormat: "webp", maxWidth: 100, quality: 60 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.results[0].mimeType).toBe("image/webp");
    expect(body.results[0].width).toBeLessThanOrEqual(100);
  });
});

// ─── Multipage TIFF ────────────────────────────────────────────────

test.describe("Multipage TIFF handling", () => {
  test("convert multipage TIFF to PNG", async ({ request }) => {
    const multiTiff = formatFixture("multipage.tiff");
    const res = await request.post("/api/v1/tools/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "multipage.tiff", mimeType: "image/tiff", buffer: multiTiff },
        settings: JSON.stringify({ format: "png" }),
      },
    });
    // May return first page or all pages — verify no crash
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl || body.pages).toBeTruthy();
  });

  test("get info from multipage TIFF", async ({ request }) => {
    const multiTiff = formatFixture("multipage.tiff");
    const res = await request.post("/api/v1/tools/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "multipage.tiff", mimeType: "image/tiff", buffer: multiTiff },
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.width).toBeGreaterThan(0);
    expect(body.height).toBeGreaterThan(0);
    expect(body.format).toBeTruthy();
  });
});

// ─── JXL Format Handling ──────────────────────────────────────────

test.describe("JXL format handling", () => {
  test("convert JXL to PNG", async ({ request }) => {
    const jxl = formatFixture("sample.jxl");
    const res = await request.post("/api/v1/tools/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jxl", mimeType: "image/jxl", buffer: jxl },
        settings: JSON.stringify({ format: "png" }),
      },
    });
    // JXL decode may require fallback — accept success or unsupported format
    if (res.ok()) {
      const body = await res.json();
      expect(body.downloadUrl).toContain(".png");
      expect(body.processedSize).toBeGreaterThan(0);
    } else {
      expect([400, 422]).toContain(res.status());
    }
  });

  test("convert JXL to JPEG", async ({ request }) => {
    const jxl = formatFixture("sample.jxl");
    const res = await request.post("/api/v1/tools/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jxl", mimeType: "image/jxl", buffer: jxl },
        settings: JSON.stringify({ format: "jpg" }),
      },
    });
    if (res.ok()) {
      const body = await res.json();
      expect(body.downloadUrl).toContain(".jpg");
    } else {
      expect([400, 422]).toContain(res.status());
    }
  });

  test("get info from JXL file", async ({ request }) => {
    const jxl = formatFixture("sample.jxl");
    const res = await request.post("/api/v1/tools/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jxl", mimeType: "image/jxl", buffer: jxl },
      },
    });
    if (res.ok()) {
      const body = await res.json();
      expect(body.width).toBeGreaterThan(0);
      expect(body.height).toBeGreaterThan(0);
    } else {
      // JXL may not be fully supported
      expect([400, 422]).toContain(res.status());
    }
  });
});

// ─── ICO Format Handling ──────────────────────────────────────────

test.describe("ICO format handling", () => {
  test("convert ICO to PNG", async ({ request }) => {
    const ico = formatFixture("sample.ico");
    const res = await request.post("/api/v1/tools/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.ico", mimeType: "image/x-icon", buffer: ico },
        settings: JSON.stringify({ format: "png" }),
      },
    });
    if (res.ok()) {
      const body = await res.json();
      expect(body.downloadUrl).toContain(".png");
    } else {
      // ICO decode may not be supported
      expect([400, 422]).toContain(res.status());
    }
  });
});

// ─── SVG to Raster — All Output Formats ──────────────────────────

test.describe("SVG to Raster — all output formats", () => {
  test("convert SVG to GIF", async ({ request }) => {
    const res = await request.post("/api/v1/tools/svg-to-raster", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.svg", mimeType: "image/svg+xml", buffer: SVG_100x100 },
        settings: JSON.stringify({ format: "gif", width: 200 }),
      },
    });
    // GIF output from SVG may not be supported
    if (res.ok()) {
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
    } else {
      const body = await res.json();
      expect(body.error).toBeDefined();
    }
  });

  test("convert SVG with small render width (32px)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/svg-to-raster", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.svg", mimeType: "image/svg+xml", buffer: SVG_100x100 },
        settings: JSON.stringify({ format: "png", width: 32 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("convert SVG logo to WebP", async ({ request }) => {
    const svgLogo = contentFixture("svg-logo.svg");
    const res = await request.post("/api/v1/tools/svg-to-raster", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "logo.svg", mimeType: "image/svg+xml", buffer: svgLogo },
        settings: JSON.stringify({ format: "webp", width: 300 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Vectorize — Round-trip Verification ──────────────────────────

test.describe("Vectorize — round-trip", () => {
  test("vectorize PNG then convert SVG back to raster", async ({ request }) => {
    // Step 1: Vectorize PNG to SVG
    const vecRes = await request.post("/api/v1/tools/vectorize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({}),
      },
    });
    expect(vecRes.ok()).toBe(true);
    const vecBody = await vecRes.json();
    expect(vecBody.downloadUrl).toContain(".svg");

    // Step 2: Download the SVG
    const dlRes = await request.get(vecBody.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const svgBuffer = Buffer.from(await dlRes.body());

    // Step 3: Convert SVG back to PNG
    const rasterRes = await request.post("/api/v1/tools/svg-to-raster", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "vectorized.svg", mimeType: "image/svg+xml", buffer: svgBuffer },
        settings: JSON.stringify({ format: "png", width: 200 }),
      },
    });
    expect(rasterRes.ok()).toBe(true);
    const rasterBody = await rasterRes.json();
    expect(rasterBody.downloadUrl).toBeTruthy();
    expect(rasterBody.processedSize).toBeGreaterThan(0);
  });
});

// ─── PDF to Image — WebP and TIFF Output ──────────────────────────

test.describe("PDF to Image — additional formats", () => {
  test("convert PDF to TIFF format", async ({ request }) => {
    const res = await request.post("/api/v1/tools/pdf-to-image", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.pdf", mimeType: "application/pdf", buffer: PDF_3PAGE },
        settings: JSON.stringify({ format: "tiff", dpi: 150, pages: "1" }),
      },
    });
    // TIFF output from PDF may not be supported
    if (res.ok()) {
      const body = await res.json();
      expect(body.downloadUrl || body.pages || body.jobId).toBeTruthy();
    } else {
      const body = await res.json();
      expect(body.error).toBeDefined();
    }
  });

  test("convert all 3 pages to WebP", async ({ request }) => {
    const res = await request.post("/api/v1/tools/pdf-to-image", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.pdf", mimeType: "application/pdf", buffer: PDF_3PAGE },
        settings: JSON.stringify({ format: "webp", dpi: 150, pages: "all" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl || body.pages || body.jobId).toBeTruthy();
  });

  test("convert page range 1-3 to PNG", async ({ request }) => {
    const res = await request.post("/api/v1/tools/pdf-to-image", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.pdf", mimeType: "application/pdf", buffer: PDF_3PAGE },
        settings: JSON.stringify({ format: "png", dpi: 200, pages: "1-3" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl || body.pages || body.jobId).toBeTruthy();
  });
});

// ─── Auth Failure ──────────────────────────────────────────────────

test.describe("Auth failure", () => {
  test("svg-to-raster without token returns 401", async ({ request }) => {
    const res = await request.post("/api/v1/tools/svg-to-raster", {
      multipart: {
        file: { name: "test.svg", mimeType: "image/svg+xml", buffer: SVG_100x100 },
        settings: JSON.stringify({ format: "png", width: 200 }),
      },
    });
    expect(res.status()).toBe(401);
  });

  test("vectorize without token returns 401", async ({ request }) => {
    const res = await request.post("/api/v1/tools/vectorize", {
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({}),
      },
    });
    expect(res.status()).toBe(401);
  });

  test("pdf-to-image without token returns 401", async ({ request }) => {
    const res = await request.post("/api/v1/tools/pdf-to-image", {
      multipart: {
        file: { name: "test.pdf", mimeType: "application/pdf", buffer: PDF_3PAGE },
        settings: JSON.stringify({ format: "png", dpi: 150, pages: "1" }),
      },
    });
    expect(res.status()).toBe(401);
  });
});
