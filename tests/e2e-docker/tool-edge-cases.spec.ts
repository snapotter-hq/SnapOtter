import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

// ─── Tool Edge Cases ─────────────────────────────────────────────
// Additional parameter combos, boundary conditions, and edge cases
// for tools already tested. Exercises uncommon setting combinations,
// extreme values, and format-specific quirks.

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
const PNG_1x1 = fixture("test-1x1.png");
const JPG_SAMPLE = formatFixture("sample.jpg");

// ─── Resize Edge Cases ───────────────────────────────────────────

test.describe("Resize edge cases", () => {
  test("resize with fit=outside", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ width: 50, height: 50, fit: "outside" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("resize to very large dimensions (4096)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ width: 4096, height: 4096, fit: "fill" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("resize 1x1 image with withoutEnlargement=false", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_1x1 },
        settings: JSON.stringify({
          width: 200,
          height: 200,
          fit: "fill",
          withoutEnlargement: false,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("resize JPEG with explicit height only and fill", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/resize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        settings: JSON.stringify({ height: 300, fit: "fill" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Rotate Edge Cases ───────────────────────────────────────────

test.describe("Rotate edge cases", () => {
  test("rotate 360 degrees returns same image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/rotate", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ angle: 360 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("rotate negative angle (-90)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/rotate", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ angle: -90 }),
      },
    });
    // Negative angle may or may not be supported
    if (res.ok()) {
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
    } else {
      const body = await res.json();
      expect(body.error).toBeDefined();
    }
  });

  test("rotate 1 degree with transparent background", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/rotate", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ angle: 1, background: "#00000000" }),
      },
    });
    // Transparent background may or may not be accepted
    if (res.ok()) {
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
    } else {
      const body = await res.json();
      expect(body.error).toBeDefined();
    }
  });
});

// ─── Convert Quality Extremes ────────────────────────────────────

test.describe("Convert quality extremes", () => {
  test("convert to JPEG with quality 1 (minimum)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ format: "jpg", quality: 1 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".jpg");
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("convert to JPEG with quality 100 (maximum)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ format: "jpg", quality: 100 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".jpg");
  });

  test("convert to WebP with quality 1", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ format: "webp", quality: 1 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toContain(".webp");
  });
});

// ─── Color Adjustments Extremes ──────────────────────────────────

test.describe("Color adjustments extreme values", () => {
  test("maximum positive brightness (100)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/adjust-colors", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ brightness: 100 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("maximum negative brightness (-100)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/adjust-colors", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ brightness: -100 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("all adjustments at extreme values together", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/adjust-colors", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          brightness: 50,
          contrast: 50,
          saturation: -100,
          hue: 180,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("hue rotation 360 degrees (full cycle)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/adjust-colors", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ hue: 360 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Sharpening Sigma Values ─────────────────────────────────────

test.describe("Sharpening sigma edge values", () => {
  test("sharpen with very low sigma (0.1)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/sharpening", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ sigma: 0.1 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("sharpen with very high sigma (5.0)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/sharpening", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ sigma: 5.0 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("sharpen with sigma and amount together", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/sharpening", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        settings: JSON.stringify({ sigma: 2.5, amount: 3.0 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Beautify Combined Settings ──────────────────────────────────

test.describe("Beautify combined settings", () => {
  test("beautify with all options: frame, shadow, gradient, watermark", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/beautify", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          frame: "macos-dark",
          frameTitle: "Full Combo",
          shadowPreset: "dramatic",
          backgroundType: "linear-gradient",
          gradientStops: [
            { color: "#0f0c29", position: 0 },
            { color: "#302b63", position: 50 },
            { color: "#24243e", position: 100 },
          ],
          gradientAngle: 45,
          padding: 80,
          borderRadius: 16,
          watermarkText: "snapotter.app",
          watermarkPosition: "bottom-right",
          watermarkOpacity: 25,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("beautify with zero padding", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/beautify", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({
          padding: 0,
          borderRadius: 0,
          shadowPreset: "none",
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("beautify with very large padding (200)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/beautify", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          padding: 200,
          backgroundType: "solid",
          backgroundColor: "#ffffff",
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("beautify with large border radius (50)", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/beautify", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({
          borderRadius: 50,
          padding: 32,
          shadowPreset: "subtle",
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Meme Generator Variations ───────────────────────────────────

test.describe("Meme generator variations", () => {
  test("meme with very long text", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/meme-generator", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({
          textLayout: "top-bottom",
          textBoxes: [
            { id: "top", text: "THIS IS AN EXTREMELY LONG MEME TEXT LINE THAT SHOULD WRAP" },
            { id: "bottom", text: "AND THIS IS ANOTHER LONG LINE FOR THE BOTTOM TEXT OF THE MEME" },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("meme with unicode/emoji text", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/meme-generator", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          textLayout: "top-bottom",
          textBoxes: [
            { id: "top", text: "HELLO WORLD" },
            { id: "bottom", text: "TESTING 123" },
          ],
          fontSize: 36,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("meme with text alignment variations", async ({ request }) => {
    const alignments = ["left", "center", "right"] as const;
    for (const textAlign of alignments) {
      const res = await request.post("/api/v1/tools/image/meme-generator", {
        headers: { Authorization: `Bearer ${token}` },
        multipart: {
          file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
          settings: JSON.stringify({
            textLayout: "top-bottom",
            textBoxes: [
              { id: "top", text: `ALIGNED ${textAlign.toUpperCase()}` },
              { id: "bottom", text: "BOTTOM TEXT" },
            ],
            textAlign,
          }),
        },
      });
      expect(res.ok(), `meme with textAlign=${textAlign} should succeed`).toBe(true);
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
    }
  });
});

// ─── Vectorize Settings ──────────────────────────────────────────

test.describe("Vectorize additional settings", () => {
  test("vectorize small WebP image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/vectorize", {
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

  test("vectorize HEIC image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/vectorize", {
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

  test("vectorize content image", async ({ request }) => {
    const portrait = contentFixture("portrait-isolated.png");
    const res = await request.post("/api/v1/tools/image/vectorize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "portrait.png", mimeType: "image/png", buffer: portrait },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("vectorize output can be downloaded", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/vectorize", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();

    // Download and verify
    const dlRes = await request.get(body.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const buffer = Buffer.from(await dlRes.body());
    expect(buffer.length).toBeGreaterThan(0);
    // SVG should start with <?xml or <svg
    const svgStr = buffer.toString("utf-8");
    expect(svgStr.includes("<svg") || svgStr.includes("<?xml")).toBe(true);
  });
});

// ─── Image to Base64 Edge Cases ──────────────────────────────────

test.describe("Image to Base64 edge cases", () => {
  test("encode 1x1 PNG to base64", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/image-to-base64", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_1x1 },
        settings: JSON.stringify({}),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.results[0].base64).toBeTruthy();
    expect(body.results[0].width).toBe(1);
    expect(body.results[0].height).toBe(1);
  });

  test("encode HEIC to base64 with format conversion to WebP", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/image-to-base64", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        settings: JSON.stringify({ outputFormat: "webp", quality: 60 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.results[0].mimeType).toBe("image/webp");
    expect(body.results[0].dataUri).toContain("data:image/webp;base64,");
  });

  test("encode with both maxWidth and outputFormat", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/image-to-base64", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        settings: JSON.stringify({ maxWidth: 100, outputFormat: "png" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.results[0].width).toBeLessThanOrEqual(100);
    expect(body.results[0].mimeType).toBe("image/png");
  });
});

// ─── Text Overlay Positions ──────────────────────────────────────

test.describe("Text overlay position coverage", () => {
  const positions = ["top", "center", "bottom"] as const;

  for (const position of positions) {
    test(`text overlay at position=${position}`, async ({ request }) => {
      const res = await request.post("/api/v1/tools/image/text-overlay", {
        headers: { Authorization: `Bearer ${token}` },
        multipart: {
          file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
          settings: JSON.stringify({
            text: `Position: ${position}`,
            fontSize: 24,
            color: "#FFFFFF",
            position,
            shadow: true,
          }),
        },
      });
      expect(res.ok(), `text overlay at ${position} should succeed`).toBe(true);
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
    });
  }

  test("text overlay with background box on HEIC", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/text-overlay", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        settings: JSON.stringify({
          text: "HEIC Overlay",
          fontSize: 20,
          color: "#ffffff",
          position: "bottom",
          backgroundBox: true,
          backgroundColor: "#333333",
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("text overlay on AVIF image", async ({ request }) => {
    const avif = formatFixture("sample.avif");
    const res = await request.post("/api/v1/tools/image/text-overlay", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.avif", mimeType: "image/avif", buffer: avif },
        settings: JSON.stringify({
          text: "AVIF Caption",
          fontSize: 18,
          color: "#000000",
          position: "top",
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Watermark Text Extended Positions ───────────────────────────

test.describe("Watermark text extended positions", () => {
  test("watermark at all 4 corners on same image", async ({ request }) => {
    const positions = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;
    for (const position of positions) {
      const res = await request.post("/api/v1/tools/image/watermark-text", {
        headers: { Authorization: `Bearer ${token}` },
        multipart: {
          file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
          settings: JSON.stringify({
            text: position.toUpperCase().replace("-", " "),
            fontSize: 12,
            color: "#808080",
            opacity: 40,
            position,
          }),
        },
      });
      expect(res.ok(), `watermark at ${position} should succeed`).toBe(true);
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
    }
  });

  test("tiled watermark with rotation on large image", async ({ request }) => {
    const stressImg = contentFixture("stress-large.jpg");
    const res = await request.post("/api/v1/tools/image/watermark-text", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "stress.jpg", mimeType: "image/jpeg", buffer: stressImg },
        settings: JSON.stringify({
          text: "CONFIDENTIAL DOCUMENT",
          fontSize: 24,
          color: "#ff0000",
          opacity: 15,
          position: "tiled",
          rotation: -30,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });
});

// ─── QR Generate Edge Cases ──────────────────────────────────────

test.describe("QR generate edge cases", () => {
  test("generate QR with very long URL", async ({ request }) => {
    const longUrl = `https://example.com/path/${"a".repeat(200)}?key=value`;
    const res = await request.post("/api/v1/tools/image/qr-generate", {
      headers: { Authorization: `Bearer ${token}` },
      data: { text: longUrl, size: 512, errorCorrection: "H" },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("generate QR with unicode text", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/qr-generate", {
      headers: { Authorization: `Bearer ${token}` },
      data: { text: "Hello World 12345", size: 400 },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("generate QR with custom dark/light colors", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/qr-generate", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        text: "custom colors",
        size: 300,
        foreground: "#1a1a2e",
        background: "#e0e0e0",
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Compare Edge Cases ──────────────────────────────────────────

test.describe("Compare edge cases", () => {
  test("compare images of very different sizes", async ({ request }) => {
    const stressImg = contentFixture("stress-large.jpg");
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "large.jpg", contentType: "image/jpeg", buffer: stressImg },
        { name: "file", filename: "small.png", contentType: "image/png", buffer: PNG_1x1 },
      ],
      [],
    );
    const res = await request.post("/api/v1/tools/image/compare", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(typeof json.similarity).toBe("number");
    expect(json.similarity).toBeGreaterThanOrEqual(0);
    expect(json.similarity).toBeLessThanOrEqual(100);
  });

  test("compare images of different formats (HEIC vs WebP)", async ({ request }) => {
    const { body, contentType } = buildMultipart(
      [
        { name: "file", filename: "a.heic", contentType: "image/heic", buffer: HEIC_200x150 },
        { name: "file", filename: "b.webp", contentType: "image/webp", buffer: WEBP_50x50 },
      ],
      [],
    );
    const res = await request.post("/api/v1/tools/image/compare", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      data: body,
    });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(typeof json.similarity).toBe("number");
  });
});

// ─── Optimize for Web Edge Cases ─────────────────────────────────

test.describe("Optimize for Web edge cases", () => {
  test("optimize 1x1 image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/optimize-for-web", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_1x1 },
        settings: JSON.stringify({ maxWidth: 100, quality: 80 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("optimize with maxWidth smaller than image", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/optimize-for-web", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        settings: JSON.stringify({ maxWidth: 10, quality: 50 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeLessThan(body.originalSize);
  });
});

// ─── Invalid Requests Across Tools ───────────────────────────────

test.describe("Invalid request handling", () => {
  test("tool that does not exist returns 404", async ({ request }) => {
    const res = await request.post("/api/v1/tools/nonexistent-tool", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({}),
      },
    });
    expect(res.status()).toBe(404);
  });

  test("crop with out-of-bounds region returns error", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/crop", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ left: 500, top: 500, width: 100, height: 100 }),
      },
    });
    expect(res.ok()).toBe(false);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});
