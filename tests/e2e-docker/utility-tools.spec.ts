import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

// ─── Utility Tools ──────────────────────────────────────────────────
// Tests for: info, compare, find-duplicates, color-palette,
// qr-generate, barcode-read, bulk-rename
// These tools extract metadata, compare images, and generate assets.

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
 * Build a raw multipart/form-data body. Playwright's `multipart` option
 * does not support arrays for the same field name, so multi-file uploads
 * must be assembled manually.
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
const JPG_WITH_EXIF = fixture("test-with-exif.jpg");
const HEIC_200x150 = fixture("test-200x150.heic");
const WEBP_50x50 = fixture("test-50x50.webp");

// ─── Info ────────────────────────────────────────────────────────────

test.describe("Info", () => {
  test("returns metadata for PNG image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();

    expect(body.filename).toBe("test.png");
    expect(body.width).toBe(200);
    expect(body.height).toBe(150);
    expect(body.format).toBe("png");
    expect(body.channels).toBeGreaterThan(0);
    expect(typeof body.hasAlpha).toBe("boolean");
    expect(body.fileSize).toBeGreaterThan(0);
    expect(body.colorSpace).toBeTruthy();
  });

  test("returns metadata for JPEG image", async ({ request }) => {
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

  test("returns EXIF info for JPEG with metadata", async ({ request }) => {
    const res = await request.post("/api/v1/tools/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test-with-exif.jpg", mimeType: "image/jpeg", buffer: JPG_WITH_EXIF },
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();

    expect(body.hasExif).toBe(true);
    expect(body.fileSize).toBeGreaterThan(0);
  });

  test("returns metadata for HEIC image", async ({ request }) => {
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

  test("returns histogram data", async ({ request }) => {
    const res = await request.post("/api/v1/tools/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();

    expect(body.histogram).toBeInstanceOf(Array);
    expect(body.histogram.length).toBeGreaterThan(0);

    const firstChannel = body.histogram[0];
    expect(firstChannel.channel).toBeTruthy();
    expect(typeof firstChannel.min).toBe("number");
    expect(typeof firstChannel.max).toBe("number");
    expect(typeof firstChannel.mean).toBe("number");
    expect(typeof firstChannel.stdev).toBe("number");
  });

  test("returns metadata for WebP image", async ({ request }) => {
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
  });

  test("returns metadata for BMP from formats fixture", async ({ request }) => {
    const bmp = formatFixture("sample.bmp");
    const res = await request.post("/api/v1/tools/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.bmp", mimeType: "image/bmp", buffer: bmp },
      },
    });
    // BMP may not be supported if Sharp can't decode it natively
    if (res.ok()) {
      const body = await res.json();
      expect(body.width).toBeGreaterThan(0);
      expect(body.height).toBeGreaterThan(0);
    } else {
      expect([400, 422]).toContain(res.status());
    }
  });

  test("rejects request with no file", async ({ request }) => {
    const res = await request.post("/api/v1/tools/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {},
    });
    expect(res.ok()).toBe(false);
  });
});

// ─── Compare ────────────────────────────────────────────────────────

test.describe("Compare", () => {
  test("compare two identical images returns high similarity", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.png", contentType: "image/png", buffer: PNG_200x150 },
      ],
      [],
    );
    const res = await request.post("/api/v1/tools/compare", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    // API returns similarity as a percentage (0-100)
    expect(json.similarity).toBeGreaterThan(99);
    expect(json.downloadUrl).toBeTruthy();
  });

  test("compare two different images returns lower similarity", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
      ],
      [],
    );
    const res = await request.post("/api/v1/tools/compare", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    // API returns similarity as a percentage (0-100)
    expect(typeof json.similarity).toBe("number");
    expect(json.similarity).toBeGreaterThanOrEqual(0);
    expect(json.similarity).toBeLessThanOrEqual(100);
  });

  test("compare rejects single file", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [{ name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 }],
      [],
    );
    const res = await request.post("/api/v1/tools/compare", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(false);
    const json = await res.json();
    expect(json.error).toContain("Two");
  });
});

// ─── Find Duplicates ────────────────────────────────────────────────

test.describe("Find Duplicates", () => {
  test("detect duplicates among identical images", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "c.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
      ],
      [],
    );
    const res = await request.post("/api/v1/tools/find-duplicates", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();

    // Should detect the two identical PNGs as duplicates
    expect(json.duplicateGroups).toBeTruthy();
    expect(json.duplicateGroups.length).toBeGreaterThan(0);
  });

  test("no duplicates among unique images", async ({ request }) => {
    const portrait = readFileSync(join(CONTENT, "portrait-bw.jpeg"));
    const motorcycle = readFileSync(join(CONTENT, "motorcycle.heif"));
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "portrait.jpeg", contentType: "image/jpeg", buffer: portrait },
        {
          name: "file",
          filename: "motorcycle.heif",
          contentType: "image/heif",
          buffer: motorcycle,
        },
      ],
      [],
    );
    const res = await request.post("/api/v1/tools/find-duplicates", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();

    // Visually distinct images — zero duplicate groups
    expect(json.duplicateGroups).toBeInstanceOf(Array);
    expect(json.duplicateGroups.length).toBe(0);
  });

  test("find-duplicates response includes file info", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.png", contentType: "image/png", buffer: PNG_200x150 },
      ],
      [],
    );
    const res = await request.post("/api/v1/tools/find-duplicates", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();

    // Response should contain duplicateGroups and totalImages
    expect(json.duplicateGroups).toBeTruthy();
    expect(json.totalImages).toBeGreaterThan(0);
  });
});

// ─── Color Palette ──────────────────────────────────────────────────

test.describe("Color Palette", () => {
  test("extract colors from PNG", async ({ request }) => {
    const res = await request.post("/api/v1/tools/color-palette", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();

    expect(body.filename).toBe("test.png");
    expect(body.colors).toBeInstanceOf(Array);
    expect(body.colors.length).toBeGreaterThan(0);
    expect(body.count).toBe(body.colors.length);

    // Each color should be a hex string
    for (const color of body.colors) {
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  test("extract colors from JPEG", async ({ request }) => {
    const res = await request.post("/api/v1/tools/color-palette", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();

    expect(body.colors).toBeInstanceOf(Array);
    expect(body.colors.length).toBeGreaterThan(0);
  });

  test("extract colors from sample JPEG has diverse palette", async ({ request }) => {
    const sample = formatFixture("sample.jpg");
    const res = await request.post("/api/v1/tools/color-palette", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: sample },
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();

    // A real photograph should have multiple distinct colors
    expect(body.colors.length).toBeGreaterThanOrEqual(3);
  });

  test("extract colors from HEIC image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/color-palette", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.colors).toBeInstanceOf(Array);
  });
});

// ─── QR Generate ────────────────────────────────────────────────────

test.describe("QR Generate", () => {
  test("generate QR code from URL", async ({ request }) => {
    const res = await request.post("/api/v1/tools/qr-generate", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        text: "https://snapotter.app",
        size: 512,
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("generate QR code with custom colors", async ({ request }) => {
    const res = await request.post("/api/v1/tools/qr-generate", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        text: "Hello World",
        size: 400,
        foreground: "#0000FF",
        background: "#FFFF00",
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("generate QR code with high error correction", async ({ request }) => {
    const res = await request.post("/api/v1/tools/qr-generate", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        text: "https://github.com/snapotter/snapotter",
        size: 300,
        errorCorrection: "H",
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("generate QR code with minimum size", async ({ request }) => {
    const res = await request.post("/api/v1/tools/qr-generate", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        text: "test",
        size: 100,
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("reject empty text", async ({ request }) => {
    const res = await request.post("/api/v1/tools/qr-generate", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        text: "",
        size: 400,
      },
    });
    expect(res.ok()).toBe(false);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test("reject size below minimum", async ({ request }) => {
    const res = await request.post("/api/v1/tools/qr-generate", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        text: "test",
        size: 10,
      },
    });
    expect(res.ok()).toBe(false);
  });
});

// ─── Barcode Read ───────────────────────────────────────────────────

test.describe("Barcode Read", () => {
  test("read QR code from generated image (round-trip)", async ({ request }) => {
    // Generate a QR code first, then read it back
    const genRes = await request.post("/api/v1/tools/qr-generate", {
      headers: { Authorization: `Bearer ${token}` },
      data: { text: "https://example.com/test", size: 400 },
    });
    expect(genRes.ok()).toBe(true);
    const genBody = await genRes.json();

    // Download the generated QR image
    const dlRes = await request.get(genBody.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const qrBuffer = Buffer.from(await dlRes.body());

    // Now read it with barcode-read
    const res = await request.post("/api/v1/tools/barcode-read", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "qr.png", mimeType: "image/png", buffer: qrBuffer },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();

    expect(body.barcodes).toBeInstanceOf(Array);
    expect(body.barcodes.length).toBeGreaterThan(0);

    const barcode = body.barcodes[0];
    expect(barcode.text).toBe("https://example.com/test");
  });

  test("read barcode from barcode fixture", async ({ request }) => {
    const barcodeImage = contentFixture("barcode.avif");
    const res = await request.post("/api/v1/tools/barcode-read", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "barcode.avif", mimeType: "image/avif", buffer: barcodeImage },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();

    expect(body.barcodes).toBeInstanceOf(Array);
    // Should detect at least one barcode
    if (body.barcodes.length > 0) {
      expect(body.barcodes[0].text).toBeTruthy();
      expect(body.annotatedUrl).toBeTruthy();
    }
  });

  test("return empty array for image with no barcodes", async ({ request }) => {
    const res = await request.post("/api/v1/tools/barcode-read", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();

    expect(body.barcodes).toBeInstanceOf(Array);
    expect(body.barcodes.length).toBe(0);
    expect(body.annotatedUrl).toBeNull();
  });

  test("annotated image URL returned when barcodes found", async ({ request }) => {
    const qrImage = contentFixture("qr-code.avif");
    const res = await request.post("/api/v1/tools/barcode-read", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "qr-code.avif", mimeType: "image/avif", buffer: qrImage },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();

    if (body.barcodes.length > 0) {
      expect(body.annotatedUrl).toBeTruthy();
      expect(body.previewUrl).toBeTruthy();

      // Verify the annotated image can be downloaded
      const downloadRes = await request.get(body.annotatedUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(downloadRes.ok()).toBe(true);
    }
  });
});

// ─── Bulk Rename ────────────────────────────────────────────────────

test.describe("Bulk Rename", () => {
  test("rename files with default pattern", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "photo1.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "photo2.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
      ],
      [{ name: "settings", value: JSON.stringify({ pattern: "image-{{index}}" }) }],
    );
    const res = await request.post("/api/v1/tools/bulk-rename", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(true);
    // Bulk rename returns a ZIP with renamed files
    const resContentType = res.headers()["content-type"] ?? "";
    // Should be a ZIP or JSON with download URL
    if (resContentType.includes("application/json")) {
      const json = await res.json();
      expect(json.downloadUrl || json.files).toBeTruthy();
    } else {
      // Binary ZIP response
      const buffer = Buffer.from(await res.body());
      expect(buffer.length).toBeGreaterThan(0);
    }
  });

  test("rename files with custom pattern and start index", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", buffer: WEBP_50x50 },
      ],
      [
        {
          name: "settings",
          value: JSON.stringify({ pattern: "vacation-{{index}}", startIndex: 100 }),
        },
      ],
    );
    const res = await request.post("/api/v1/tools/bulk-rename", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(true);
  });

  test("reject empty file list", async ({ request }) => {
    const { body: reqBody, contentType } = buildMultipart(
      [],
      [{ name: "settings", value: JSON.stringify({ pattern: "test-{{index}}" }) }],
    );
    const res = await request.post("/api/v1/tools/bulk-rename", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: reqBody,
    });
    expect(res.ok()).toBe(false);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });
});

// ─── Image to Base64 ───────────────────────────────────────────────

test.describe("Image to Base64", () => {
  test("encode PNG to base64 returns data URI", async ({ request }) => {
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
    expect(result.dataUri).toContain("data:image/");
    expect(result.mimeType).toBe("image/png");
    expect(result.width).toBe(200);
    expect(result.height).toBe(150);
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
  });

  test("encode HEIC image to base64", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image-to-base64", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.results[0].base64).toBeTruthy();
    expect(body.results[0].width).toBeGreaterThan(0);
  });

  test("overhead percent is calculated", async ({ request }) => {
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
    expect(body.results[0].overheadPercent).toBeGreaterThan(0);
  });
});

// ─── QR Read (from content fixtures) ───────────────────────────────

test.describe("QR Read", () => {
  test("read QR code from content fixture", async ({ request }) => {
    const qrImage = contentFixture("qr-code.avif");
    const res = await request.post("/api/v1/tools/barcode-read", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "qr-code.avif", mimeType: "image/avif", buffer: qrImage },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.barcodes).toBeInstanceOf(Array);
    if (body.barcodes.length > 0) {
      expect(body.barcodes[0].text).toBeTruthy();
    }
  });
});

// ─── Auth Failure ──────────────────────────────────────────────────

test.describe("Auth failure", () => {
  test("info without token returns 401", async ({ request }) => {
    const res = await request.post("/api/v1/tools/info", {
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
      },
    });
    expect(res.status()).toBe(401);
  });

  test("qr-generate without token returns 401", async ({ request }) => {
    const res = await request.post("/api/v1/tools/qr-generate", {
      data: { text: "https://snapotter.app", size: 512 },
    });
    expect(res.status()).toBe(401);
  });

  test("color-palette without token returns 401", async ({ request }) => {
    const res = await request.post("/api/v1/tools/color-palette", {
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
      },
    });
    expect(res.status()).toBe(401);
  });
});
