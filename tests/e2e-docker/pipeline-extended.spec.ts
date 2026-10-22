import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";

// ─── Pipeline Extended ───────────────────────────────────────────
// Advanced pipeline chain tests: 4+ step chains, cross-category
// workflows, exotic format inputs, and pipeline edge cases not
// covered by pipeline-chains.spec.ts.

const FIXTURES = join(process.cwd(), "tests", "fixtures", "image", "valid");
const FORMATS = join(process.cwd(), "tests", "fixtures", "image", "formats");
const CONTENT = FIXTURES;

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
const HEIC_200x150 = fixture("test-200x150.heic");
const JPG_SAMPLE = formatFixture("sample.jpg");
const JPG_WITH_EXIF = fixture("test-with-exif.jpg");
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function readFirstPngPixelRgb(png: Buffer): [number, number, number] {
  if (png.length < 33 || !png.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("Expected a valid PNG buffer");
  }
  const idatChunks: Buffer[] = [];
  let palette: Buffer | null = null;
  let bitDepth = 0;
  let colorType = 0;
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
      bitDepth = png[dataStart + 8];
      colorType = png[dataStart + 9];
      const interlace = png[dataStart + 12];
      const validDirect = bitDepth === 8 && (colorType === 2 || colorType === 6);
      const validIndexed =
        colorType === 3 && (bitDepth === 1 || bitDepth === 2 || bitDepth === 4 || bitDepth === 8);
      if ((!validDirect && !validIndexed) || interlace !== 0) {
        throw new Error(
          `Unsupported PNG layout for first-pixel RGB read: bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace}`,
        );
      }
      sawIhdr = true;
    } else if (type === "PLTE") {
      palette = png.subarray(dataStart, dataEnd);
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
  if (raw.length < 2) {
    throw new Error("Inflated PNG scanline is shorter than 1 pixel");
  }
  if (raw[0] > 4) {
    throw new Error(`Unexpected PNG row 0 filter type: ${raw[0]}`);
  }
  if (colorType === 3) {
    if (!palette) {
      throw new Error("Indexed PNG buffer is missing PLTE chunk");
    }
    const index = (raw[1] >> (8 - bitDepth)) & ((1 << bitDepth) - 1);
    const plteOffset = index * 3;
    if (plteOffset + 3 > palette.length) {
      throw new Error(`Palette index ${index} out of bounds`);
    }
    return [palette[plteOffset], palette[plteOffset + 1], palette[plteOffset + 2]];
  }
  if (raw.length < 4) {
    throw new Error("Inflated PNG scanline is shorter than 1 RGB pixel");
  }
  return [raw[1], raw[2], raw[3]];
}

// ─── 5-Step: Full Photo Preparation ──────────────────────────────

test.describe("5-step full photo preparation", () => {
  test("strip metadata, resize, enhance, watermark, compress", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "strip-metadata", settings: {} },
            { toolId: "resize", settings: { width: 1200, fit: "contain" } },
            { toolId: "image-enhancement", settings: { preset: "auto" } },
            {
              toolId: "watermark-text",
              settings: {
                text: "snapotter.app",
                fontSize: 14,
                color: "#ffffff",
                opacity: 25,
                position: "bottom-right",
              },
            },
            { toolId: "compress", settings: { quality: 80 } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
    expect(body.processedSize).toBeLessThan(body.originalSize);
  });
});

// ─── 4-Step: eCommerce Product Photo ─────────────────────────────

test.describe("4-step eCommerce product workflow", () => {
  test("crop, enhance, border, optimize for web", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "crop", settings: { left: 20, top: 20, width: 300, height: 300 } },
            { toolId: "image-enhancement", settings: { preset: "vivid" } },
            { toolId: "border", settings: { size: 5, color: "#ffffff" } },
            { toolId: "optimize-for-web", settings: { maxWidth: 800, quality: 85 } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── 4-Step: Grayscale Print Preparation ─────────────────────────

test.describe("4-step grayscale print preparation", () => {
  test("grayscale, sharpen, border, convert to TIFF", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "adjust-colors", settings: { grayscale: true } },
            { toolId: "sharpening", settings: { sigma: 1.5 } },
            { toolId: "border", settings: { size: 30, color: "#ffffff" } },
            { toolId: "convert", settings: { format: "tiff" } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.downloadUrl).toContain(".tiff");
  });
});

// ─── 5-Step: Color Correction Workflow ───────────────────────────

test.describe("5-step color correction workflow", () => {
  test("adjust colors, replace color, enhance, text overlay, compress", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "adjust-colors", settings: { brightness: 10, saturation: 15 } },
            {
              toolId: "replace-color",
              settings: {
                sourceColor: "#ff6432",
                targetColor: "#f5f5f5",
                tolerance: 10,
              },
            },
            { toolId: "image-enhancement", settings: { preset: "soft" } },
            {
              toolId: "text-overlay",
              settings: {
                text: "Corrected",
                fontSize: 16,
                color: "#333333",
                position: "bottom",
              },
            },
            { toolId: "compress", settings: { quality: 90 } },
          ],
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
    const [r, g, b] = readFirstPngPixelRgb(Buffer.from(await dlRes.body()));
    expect(r).toBeGreaterThan(240);
    expect(g).toBeGreaterThan(180);
    expect(g).toBeLessThan(215);
    expect(b).toBeGreaterThan(155);
    expect(b).toBeLessThan(190);
  });
});

// ─── HEIC 4-Step Pipeline ────────────────────────────────────────

test.describe("HEIC 4-step pipeline", () => {
  test("HEIC: strip metadata, rotate, sharpen, convert to WebP", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "strip-metadata", settings: {} },
            { toolId: "rotate", settings: { angle: 180 } },
            { toolId: "sharpening", settings: { sigma: 1.0 } },
            { toolId: "convert", settings: { format: "webp" } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.downloadUrl).toContain(".webp");
  });
});

// ─── 6-Step: Blog Post Hero Image ────────────────────────────────

test.describe("6-step blog post hero image", () => {
  test("strip, resize, enhance, adjust colors, watermark, convert to AVIF", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "strip-metadata", settings: {} },
            { toolId: "resize", settings: { width: 1280, fit: "contain" } },
            { toolId: "image-enhancement", settings: { preset: "vivid" } },
            { toolId: "adjust-colors", settings: { contrast: 5, saturation: 10 } },
            {
              toolId: "watermark-text",
              settings: {
                text: "snapotter.app",
                fontSize: 12,
                color: "#808080",
                opacity: 15,
                position: "bottom-right",
              },
            },
            { toolId: "convert", settings: { format: "avif" } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.downloadUrl).toContain(".avif");
  });
});

// ─── 4-Step: Archival Workflow ────────────────────────────────────

test.describe("4-step archival workflow", () => {
  test("edit metadata, resize, strip exif selectively, convert to TIFF", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "photo.jpg", mimeType: "image/jpeg", buffer: JPG_WITH_EXIF },
        pipeline: JSON.stringify({
          steps: [
            {
              toolId: "edit-metadata",
              settings: {
                artist: "Archive Dept",
                copyright: "Public Domain",
                title: "Archived Document",
              },
            },
            { toolId: "resize", settings: { width: 2000, fit: "inside" } },
            { toolId: "sharpening", settings: { sigma: 0.8 } },
            { toolId: "convert", settings: { format: "tiff" } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.downloadUrl).toContain(".tiff");
  });
});

// ─── 5-Step: Avatar Generation ───────────────────────────────────

test.describe("5-step avatar generation", () => {
  test("crop square, resize, enhance, border, convert to PNG", async ({ request }) => {
    const portrait = contentFixture("portrait-color.jpg");
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "portrait.jpg", mimeType: "image/jpeg", buffer: portrait },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "crop", settings: { left: 50, top: 50, width: 200, height: 200 } },
            { toolId: "resize", settings: { width: 128, height: 128, fit: "cover" } },
            { toolId: "image-enhancement", settings: { preset: "portrait" } },
            { toolId: "border", settings: { size: 3, color: "#cccccc" } },
            { toolId: "convert", settings: { format: "png" } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.downloadUrl).toContain(".png");
  });
});

// ─── 3-Step: Color Blindness Accessible Version ──────────────────

test.describe("3-step accessibility workflow", () => {
  test("color-blindness simulation, text overlay, optimize for web", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "adjust-colors", settings: { contrast: 20, saturation: -15 } },
            {
              toolId: "text-overlay",
              settings: {
                text: "High Contrast",
                fontSize: 20,
                color: "#000000",
                position: "top",
                backgroundBox: true,
                backgroundColor: "#ffff00",
              },
            },
            { toolId: "optimize-for-web", settings: { maxWidth: 800, quality: 80 } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Pipeline with Exotic Format Input ───────────────────────────

test.describe("Pipeline with exotic format input", () => {
  test("TIFF input: resize then convert to WebP", async ({ request }) => {
    const tiff = formatFixture("sample.tiff");
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.tiff", mimeType: "image/tiff", buffer: tiff },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "resize", settings: { width: 400, fit: "contain" } },
            { toolId: "convert", settings: { format: "webp" } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.downloadUrl).toContain(".webp");
  });

  test("AVIF input: enhance then border then compress", async ({ request }) => {
    const avif = formatFixture("sample.avif");
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.avif", mimeType: "image/avif", buffer: avif },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "image-enhancement", settings: { preset: "auto" } },
            { toolId: "border", settings: { size: 10, color: "#1a1a1a" } },
            { toolId: "compress", settings: { quality: 70 } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("WebP input: sharpen, watermark, rotate, convert to JPEG", async ({ request }) => {
    const webp = fixture("test-50x50.webp");
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.webp", mimeType: "image/webp", buffer: webp },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "sharpening", settings: { sigma: 1.0 } },
            {
              toolId: "watermark-text",
              settings: {
                text: "WebP",
                fontSize: 12,
                color: "#ffffff",
                opacity: 50,
                position: "center",
              },
            },
            { toolId: "rotate", settings: { angle: 90 } },
            { toolId: "convert", settings: { format: "jpg", quality: 90 } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.downloadUrl).toContain(".jpg");
  });
});

// ─── Pipeline Error Cases ────────────────────────────────────────

test.describe("Pipeline error cases", () => {
  test("empty steps array returns error", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        pipeline: JSON.stringify({ steps: [] }),
      },
    });
    expect(res.ok()).toBe(false);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test("invalid tool ID in pipeline returns error", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        pipeline: JSON.stringify({
          steps: [{ toolId: "nonexistent-tool-xyz", settings: {} }],
        }),
      },
    });
    expect(res.ok()).toBe(false);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test("pipeline without token returns 401", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        pipeline: JSON.stringify({
          steps: [{ toolId: "resize", settings: { width: 100 } }],
        }),
      },
    });
    expect(res.status()).toBe(401);
  });
});

// ─── Pipeline Output Verification ────────────────────────────────

test.describe("Pipeline output verification", () => {
  test("pipeline output can be downloaded and verified via info", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "resize", settings: { width: 80, fit: "contain" } },
            { toolId: "border", settings: { size: 10, color: "#ff0000" } },
            { toolId: "convert", settings: { format: "png" } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();

    // Download the pipeline output
    const dlRes = await request.get(body.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const buffer = Buffer.from(await dlRes.body());
    expect(buffer.length).toBeGreaterThan(0);

    // Verify dimensions via info
    const infoRes = await request.post("/api/v1/tools/image/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "pipeline-output.png", mimeType: "image/png", buffer: buffer },
      },
    });
    expect(infoRes.ok()).toBe(true);
    const infoBody = await infoRes.json();
    // 80px resize + 10px border on each side = 100
    expect(infoBody.width).toBe(100);
  });

  test("6-step pipeline output is smaller than original", async ({ request }) => {
    const stressImg = contentFixture("stress-large.jpg");
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "stress.jpg", mimeType: "image/jpeg", buffer: stressImg },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "strip-metadata", settings: {} },
            { toolId: "resize", settings: { width: 640, fit: "contain" } },
            { toolId: "adjust-colors", settings: { brightness: 5 } },
            { toolId: "sharpening", settings: { sigma: 0.5 } },
            { toolId: "convert", settings: { format: "webp" } },
            { toolId: "compress", settings: { quality: 60 } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
    // 640px WebP at q60 from a large JPEG should be much smaller
    expect(body.processedSize).toBeLessThan(body.originalSize);
  });
});
