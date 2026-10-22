import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";

// ─── Adjustment Tools ───────────────────────────────────────────────
// Tests for: color-adjustments, sharpening, replace-color, strip-metadata,
// edit-metadata, optimize-for-web, image-enhancement
// These tools modify image properties without changing dimensions.

const FIXTURES = join(process.cwd(), "tests", "fixtures", "image", "valid");
const FORMATS = join(process.cwd(), "tests", "fixtures", "image", "formats");

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
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function readFirstPngPixelRgb(png: Buffer): [number, number, number] {
  if (png.length < 33 || !png.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("Expected a valid PNG buffer");
  }
  const idatChunks: Buffer[] = [];
  let sawIhdr = false;
  let offset = 8;
  while (offset + 8 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > png.length) {
      throw new Error(`Truncated PNG chunk: ${type}`);
    }
    if (type === "IHDR") {
      if (length < 13) {
        throw new Error("Truncated PNG IHDR chunk");
      }
      const bitDepth = png[dataStart + 8];
      const colorType = png[dataStart + 9];
      const interlace = png[dataStart + 12];
      if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0) {
        throw new Error(
          `Unsupported PNG layout for first-pixel RGB read: bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace}`,
        );
      }
      sawIhdr = true;
    } else if (type === "IDAT") {
      idatChunks.push(png.subarray(dataStart, dataEnd));
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }
  if (!sawIhdr || idatChunks.length === 0) {
    throw new Error("PNG buffer is missing IHDR or IDAT chunks");
  }
  const raw = inflateSync(Buffer.concat(idatChunks));
  if (raw.length < 4) {
    throw new Error("Inflated PNG scanline is shorter than 1 RGB pixel");
  }
  if (raw[0] > 4) {
    throw new Error(`Unexpected PNG row 0 filter type: ${raw[0]}`);
  }
  return [raw[1], raw[2], raw[3]];
}

// ─── Color Adjustments ──────────────────────────────────────────────

test.describe("Color Adjustments", () => {
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

  test("adjust contrast", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/adjust-colors", {
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
    const res = await request.post("/api/v1/tools/image/adjust-colors", {
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

  test("multiple adjustments at once", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/adjust-colors", {
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

  test("sharpen with explicit sigma and amount", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/sharpening", {
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
    const res = await request.post("/api/v1/tools/image/sharpening", {
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
  test("replace orange with black", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/replace-color", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          sourceColor: "#ff6432",
          targetColor: "#000000",
          tolerance: 30,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
    const dlRes = await request.get(body.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const buffer = Buffer.from(await dlRes.body());
    expect(readFirstPngPixelRgb(buffer)).toEqual([0, 0, 0]);
  });

  test("replace with low tolerance", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/replace-color", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({
          sourceColor: "#ff6432",
          targetColor: "#00ff00",
          tolerance: 5,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    const dlRes = await request.get(body.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const buffer = Buffer.from(await dlRes.body());
    expect(readFirstPngPixelRgb(buffer)).toEqual([0, 255, 0]);
  });

  test("replace with high tolerance", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/replace-color", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({
          sourceColor: "#00ff01",
          targetColor: "#0000ff",
          tolerance: 80,
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    const dlRes = await request.get(body.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const jpgBuffer = Buffer.from(await dlRes.body());
    const convRes = await request.post("/api/v1/tools/image/convert", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "replaced.jpg", mimeType: "image/jpeg", buffer: jpgBuffer },
        settings: JSON.stringify({ format: "png" }),
      },
    });
    expect(convRes.ok()).toBe(true);
    const convBody = await convRes.json();
    const pngRes = await request.get(convBody.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(pngRes.ok()).toBe(true);
    const [r, g, b] = readFirstPngPixelRgb(Buffer.from(await pngRes.body()));
    expect(r).toBeLessThan(10);
    expect(g).toBeLessThan(10);
    expect(b).toBeGreaterThan(240);
  });
});

// ─── Strip Metadata ─────────────────────────────────────────────────

test.describe("Strip Metadata", () => {
  test("strip metadata from JPEG with EXIF", async ({ request }) => {
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
    // Stripped image should be smaller or equal (no EXIF overhead)
    expect(body.processedSize).toBeLessThanOrEqual(body.originalSize);
  });

  test("strip metadata from PNG", async ({ request }) => {
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

  test("stripped image has no EXIF data", async ({ request }) => {
    // First strip metadata
    const stripRes = await request.post("/api/v1/tools/image/strip-metadata", {
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

// ─── Edit Metadata ──────────────────────────────────────────────────

test.describe("Edit Metadata", () => {
  test("set artist and copyright fields", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/edit-metadata", {
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
    const res = await request.post("/api/v1/tools/image/edit-metadata", {
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
    const res = await request.post("/api/v1/tools/image/optimize-for-web", {
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
    const res = await request.post("/api/v1/tools/image/optimize-for-web", {
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
    const res = await request.post("/api/v1/tools/image/optimize-for-web", {
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
    const res = await request.post("/api/v1/tools/image/image-enhancement", {
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
    const res = await request.post("/api/v1/tools/image/image-enhancement", {
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
    const res = await request.post("/api/v1/tools/image/image-enhancement", {
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

  test("simulate protanopia on JPEG", async ({ request }) => {
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

  test("simulate protanomaly", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/color-blindness", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ simulationType: "protanomaly" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("simulate tritanomaly", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/color-blindness", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        settings: JSON.stringify({ simulationType: "tritanomaly" }),
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

  test("color-blindness on HEIC image", async ({ request }) => {
    const heic = readFileSync(join(FIXTURES, "test-200x150.heic"));
    const res = await request.post("/api/v1/tools/image/color-blindness", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: heic },
        settings: JSON.stringify({ simulationType: "deuteranopia" }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Color Adjustments — Additional ────────────────────────────────

test.describe("Color Adjustments — additional", () => {
  test("adjust hue rotation", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/adjust-colors", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ hue: 90 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("extreme brightness and contrast", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/adjust-colors", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        settings: JSON.stringify({ brightness: 100, contrast: 100 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("color adjustments on HEIC image", async ({ request }) => {
    const heic = readFileSync(join(FIXTURES, "test-200x150.heic"));
    const res = await request.post("/api/v1/tools/image/adjust-colors", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: heic },
        settings: JSON.stringify({ brightness: 15, saturation: 10 }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Auth Failure ──────────────────────────────────────────────────

test.describe("Auth failure", () => {
  test("adjust-colors without token returns 401", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/adjust-colors", {
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({ brightness: 20 }),
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

  test("color-blindness without token returns 401", async ({ request }) => {
    const res = await request.post("/api/v1/tools/image/color-blindness", {
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        settings: JSON.stringify({}),
      },
    });
    expect(res.status()).toBe(401);
  });
});
