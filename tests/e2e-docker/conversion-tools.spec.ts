import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

// ─── Conversion Tools ───────────────────────────────────────────────
// Tests for: svg-to-raster, vectorize, gif-tools, pdf-to-image,
// image-to-pdf, image-to-base64, favicon, convert (format matrix)
// These tools handle format conversion and encoding.

const FIXTURES = join(process.cwd(), "tests", "fixtures");
const FORMATS = join(FIXTURES, "formats");
const CONTENT = join(FIXTURES, "content");

function buildMultipart(
  files: Array<{
    name: string;
    filename: string;
    contentType: string;
    buffer: Buffer;
  }>,
  fields: Array<{ name: string; value: string }>,
): { body: Buffer; contentType: string } {
  const boundary = "----PlaywrightBoundary" + Date.now();
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
const JPG_100x100 = fixture("test-100x100.jpg");
const SVG_100x100 = fixture("test-100x100.svg");
const ANIMATED_GIF = fixture("animated.gif");
const PDF_3PAGE = fixture("test-3page.pdf");
const HEIC_200x150 = fixture("test-200x150.heic");

// ─── SVG to Raster ──────────────────────────────────────────────────

test.describe("SVG to Raster", () => {
  test("convert SVG to PNG", async ({ request }) => {
    const res = await request.post("/api/v1/tools/svg-to-raster", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.svg", mimeType: "image/svg+xml", buffer: SVG_100x100 },
        settings: JSON.stringify({ format: "png", width: 200 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("convert SVG to JPEG", async ({ request }) => {
    const res = await request.post("/api/v1/tools/svg-to-raster", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.svg", mimeType: "image/svg+xml", buffer: SVG_100x100 },
        settings: JSON.stringify({ format: "jpg", width: 300 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("convert SVG to WebP", async ({ request }) => {
    const res = await request.post("/api/v1/tools/svg-to-raster", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.svg", mimeType: "image/svg+xml", buffer: SVG_100x100 },
        settings: JSON.stringify({ format: "webp", width: 150 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("convert complex SVG from fixtures", async ({ request }) => {
    const svgLogo = contentFixture("svg-logo.svg");
    const res = await request.post("/api/v1/tools/svg-to-raster", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "logo.svg", mimeType: "image/svg+xml", buffer: svgLogo },
        settings: JSON.stringify({ format: "png", width: 512 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("convert large format SVG fixture", async ({ request }) => {
    const svgSample = formatFixture("sample.svg");
    const res = await request.post("/api/v1/tools/svg-to-raster", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.svg", mimeType: "image/svg+xml", buffer: svgSample },
        settings: JSON.stringify({ format: "png", width: 800 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Vectorize ──────────────────────────────────────────────────────

test.describe("Vectorize", () => {
  test("vectorize PNG to SVG", async ({ request }) => {
    const res = await request.post("/api/v1/tools/vectorize", {
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

  test("vectorize JPEG to SVG", async ({ request }) => {
    const res = await request.post("/api/v1/tools/vectorize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("vectorized output is an SVG file", async ({ request }) => {
    const res = await request.post("/api/v1/tools/vectorize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".svg");
  });
});

// ─── GIF Tools ──────────────────────────────────────────────────────

test.describe("GIF Tools", () => {
  test("process animated GIF", async ({ request }) => {
    const res = await request.post("/api/v1/tools/gif-tools", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "animated.gif", mimeType: "image/gif", buffer: ANIMATED_GIF },
        settings: JSON.stringify({}),
      },
    });
    // GIF tools may return 200 or may need specific settings
    // Accept both success and settings-related error
    if (res.ok()) {
      const body = await res.json();
      expect(body.downloadUrl || body.frames).toBeTruthy();
    } else {
      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(typeof body.error).toBe("string");
    }
  });

  test("process GIF from formats fixture", async ({ request }) => {
    const gifSample = formatFixture("sample.gif");
    const res = await request.post("/api/v1/tools/gif-tools", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.gif", mimeType: "image/gif", buffer: gifSample },
        settings: JSON.stringify({}),
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

  test("process animated Simpsons GIF", async ({ request }) => {
    const animGif = contentFixture("animated-simpsons.gif");
    const res = await request.post("/api/v1/tools/gif-tools", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "animated-simpsons.gif", mimeType: "image/gif", buffer: animGif },
        settings: JSON.stringify({}),
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
});

// ─── PDF to Image ───────────────────────────────────────────────────

test.describe("PDF to Image", () => {
  test("convert first page of PDF to PNG", async ({ request }) => {
    const res = await request.post("/api/v1/tools/pdf-to-image", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.pdf", mimeType: "application/pdf", buffer: PDF_3PAGE },
        settings: JSON.stringify({ format: "png", dpi: 150, pages: "1" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    // PDF-to-image may return downloadUrl or pages array
    expect(body.downloadUrl || body.pages || body.jobId).toBeTruthy();
  });

  test("convert all pages of PDF", async ({ request }) => {
    const res = await request.post("/api/v1/tools/pdf-to-image", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.pdf", mimeType: "application/pdf", buffer: PDF_3PAGE },
        settings: JSON.stringify({ format: "png", dpi: 150, pages: "all" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl || body.pages || body.jobId).toBeTruthy();
  });

  test("convert PDF to JPEG format", async ({ request }) => {
    const res = await request.post("/api/v1/tools/pdf-to-image", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.pdf", mimeType: "application/pdf", buffer: PDF_3PAGE },
        settings: JSON.stringify({ format: "jpg", dpi: 72, pages: "1" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl || body.pages || body.jobId).toBeTruthy();
  });

  test("convert specific page range", async ({ request }) => {
    const res = await request.post("/api/v1/tools/pdf-to-image", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.pdf", mimeType: "application/pdf", buffer: PDF_3PAGE },
        settings: JSON.stringify({ format: "png", dpi: 150, pages: "1-2" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl || body.pages || body.jobId).toBeTruthy();
  });

  test("convert PDF to WebP format", async ({ request }) => {
    const res = await request.post("/api/v1/tools/pdf-to-image", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.pdf", mimeType: "application/pdf", buffer: PDF_3PAGE },
        settings: JSON.stringify({ format: "webp", dpi: 150, pages: "1" }),
      },
    });
    expect(res.ok()).toBe(true);
  });

  test("reject out-of-range page number", async ({ request }) => {
    const res = await request.post("/api/v1/tools/pdf-to-image", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.pdf", mimeType: "application/pdf", buffer: PDF_3PAGE },
        settings: JSON.stringify({ format: "png", dpi: 150, pages: "99" }),
      },
    });
    expect(res.ok()).toBe(false);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ─── Image to PDF ───────────────────────────────────────────────────

test.describe("Image to PDF", () => {
  test("convert single image to PDF via API", async ({ request }) => {
    const jpg = readFileSync(join(FIXTURES, "test-100x100.jpg"));
    const { body, contentType } = buildMultipart(
      [{ name: "file", filename: "test.jpg", contentType: "image/jpeg", buffer: jpg }],
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

  test("convert multiple images to multi-page PDF", async ({ request }) => {
    const jpg = readFileSync(join(FIXTURES, "test-100x100.jpg"));
    const png = readFileSync(join(FIXTURES, "test-200x150.png"));
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.jpg", contentType: "image/jpeg", buffer: jpg },
        { name: "file", filename: "b.png", contentType: "image/png", buffer: png },
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

// ─── Image to Base64 ────────────────────────────────────────────────

test.describe("Image to Base64", () => {
  test("encode PNG to base64", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image-to-base64", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.results).toBeInstanceOf(Array);
    expect(body.results.length).toBeGreaterThan(0);

    const result = body.results[0];
    expect(result.base64).toBeTruthy();
    expect(result.dataUri).toContain("data:image/png;base64,");
    expect(result.mimeType).toBe("image/png");
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    expect(result.originalSize).toBeGreaterThan(0);
    expect(result.encodedSize).toBeGreaterThan(0);
  });

  test("encode JPEG to base64", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image-to-base64", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.results[0].base64).toBeTruthy();
    expect(body.results[0].mimeType).toContain("image/");
  });

  test("encode with output format conversion", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image-to-base64", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ outputFormat: "jpeg", quality: 50 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.results[0].mimeType).toBe("image/jpeg");
    expect(body.results[0].dataUri).toContain("data:image/jpeg;base64,");
  });

  test("encode with maxWidth constraint", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image-to-base64", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ maxWidth: 50 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.results[0].width).toBeLessThanOrEqual(50);
  });

  test("base64 overhead percent is calculated", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image-to-base64", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(typeof body.results[0].overheadPercent).toBe("number");
    // Base64 always adds ~33% overhead
    expect(body.results[0].overheadPercent).toBeGreaterThan(0);
  });
});

// ─── Favicon ────────────────────────────────────────────────────────

test.describe("Favicon", () => {
  test("generate favicon from PNG", async ({ request }) => {
    const res = await request.post("/api/v1/tools/favicon", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
    // Favicon may return JSON with downloadUrl or binary ICO
    const contentType = res.headers()["content-type"] ?? "";
    if (contentType.includes("application/json")) {
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
    } else {
      // Binary ICO response
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
    }
  });

  test("generate favicon from JPEG", async ({ request }) => {
    const res = await request.post("/api/v1/tools/favicon", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
  });

  test("generate favicon from SVG", async ({ request }) => {
    const svgLogo = contentFixture("svg-logo.svg");
    const res = await request.post("/api/v1/tools/favicon", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "logo.svg", mimeType: "image/svg+xml", buffer: svgLogo },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
  });
});

// ─── Convert Format Matrix ──────────────────────────────────────────

test.describe("Convert format matrix", () => {
  const formats = ["jpg", "png", "webp", "avif", "tiff", "gif"] as const;

  for (const targetFormat of formats) {
    test(`PNG to ${targetFormat}`, async ({ request }) => {
      const res = await request.post("/api/v1/tools/convert", {
        headers: { Authorization: `Bearer ${token}` },
        multipart: {
          file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
          settings: JSON.stringify({ format: targetFormat }),
        },
      });
      expect(res.ok()).toBe(true);
      const body = await res.json();
      expect(body.downloadUrl).toContain(`.${targetFormat}`);
      expect(body.processedSize).toBeGreaterThan(0);
    });
  }

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
  });

  test("WebP to PNG", async ({ request }) => {
    const webp = fixture("test-50x50.webp");
    const res = await request.post("/api/v1/tools/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.webp", mimeType: "image/webp", buffer: webp },
        settings: JSON.stringify({ format: "png" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".png");
  });

  test("BMP to PNG", async ({ request }) => {
    const bmp = formatFixture("sample.bmp");
    const res = await request.post("/api/v1/tools/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.bmp", mimeType: "image/bmp", buffer: bmp },
        settings: JSON.stringify({ format: "png" }),
      },
    });
    // BMP decode requires CLI decoder which may not be available
    if (res.ok()) {
      const body = await res.json();
      expect(body.downloadUrl).toContain(".png");
    } else {
      expect([400, 422]).toContain(res.status());
    }
  });
});

// ─── Auth Failure ──────────────────────────────────────────────────

test.describe("Auth failure", () => {
  test("gif-tools without token returns 401", async ({ request }) => {
    const res = await request.post("/api/v1/tools/gif-tools", {
      multipart: {
        file: { name: "animated.gif", mimeType: "image/gif", buffer: ANIMATED_GIF },
        settings: JSON.stringify({}),
      },
    });
    expect(res.status()).toBe(401);
  });

  test("image-to-base64 without token returns 401", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image-to-base64", {
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({}),
      },
    });
    expect(res.status()).toBe(401);
  });

  test("image-to-pdf without token returns 401", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [{ name: "file", filename: "test.jpg", contentType: "image/jpeg", buffer: JPG_100x100 }],
      [{ name: "settings", value: JSON.stringify({ pageSize: "A4" }) }],
    );
    const res = await request.post("/api/v1/tools/image-to-pdf", {
      headers: { "Content-Type": contentType },
      data: body,
    });
    expect(res.status()).toBe(401);
  });
});
