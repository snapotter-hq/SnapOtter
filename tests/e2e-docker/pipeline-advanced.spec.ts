import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

// ─── Pipeline Advanced ────────────────────────────────────────────
// Multi-step pipeline chain tests with 3+ steps. Covers complex
// real-world workflows, duplicate steps, format changes mid-chain,
// and deep pipelines (5+ steps).

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
const HEIC_200x150 = fixture("test-200x150.heic");
const JPG_SAMPLE = formatFixture("sample.jpg");
const JPG_WITH_EXIF = fixture("test-with-exif.jpg");
const WEBP_50x50 = fixture("test-50x50.webp");

// ─── 3-Step: Resize -> Compress -> Convert (JPEG to WebP) ────────

test.describe("3-step: resize -> compress -> convert", () => {
  test("resize, compress, then convert JPEG to WebP", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "resize", settings: { width: 640, fit: "contain" } },
            { toolId: "compress", settings: { quality: 60 } },
            { toolId: "convert", settings: { format: "webp" } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.downloadUrl).toContain(".webp");
    expect(body.processedSize).toBeGreaterThan(0);
    expect(body.processedSize).toBeLessThan(body.originalSize);
  });

  test("resize, compress, then convert PNG to AVIF", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "resize", settings: { width: 100, fit: "contain" } },
            { toolId: "compress", settings: { quality: 50 } },
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

// ─── 4-Step: Rotate -> Resize -> Sharpening -> Compress ──────────

test.describe("4-step: rotate -> resize -> sharpening -> compress", () => {
  test("full 4-step image preparation pipeline", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "rotate", settings: { angle: 90 } },
            { toolId: "resize", settings: { width: 500, fit: "contain" } },
            { toolId: "sharpening", settings: { sigma: 1.5 } },
            { toolId: "compress", settings: { quality: 70 } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("rotate 180 -> resize -> sharpen -> compress on PNG", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "rotate", settings: { angle: 180 } },
            { toolId: "resize", settings: { width: 150, height: 100, fit: "fill" } },
            { toolId: "sharpening", settings: { sigma: 2.0 } },
            { toolId: "compress", settings: { quality: 80 } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── 5-Step: Strip Metadata -> Resize -> Adjust Colors -> Compress -> Convert ─

test.describe("5-step: strip-metadata -> resize -> adjust-colors -> compress -> convert", () => {
  test("full 5-step processing pipeline on JPEG with EXIF", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "photo.jpg", mimeType: "image/jpeg", buffer: JPG_WITH_EXIF },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "strip-metadata", settings: {} },
            { toolId: "resize", settings: { width: 800, fit: "contain" } },
            { toolId: "adjust-colors", settings: { brightness: 10, contrast: 15, saturation: 5 } },
            { toolId: "compress", settings: { quality: 75 } },
            { toolId: "convert", settings: { format: "webp" } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.downloadUrl).toContain(".webp");
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("full 5-step pipeline on high-res sample image", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "strip-metadata", settings: {} },
            { toolId: "resize", settings: { width: 1200, fit: "contain" } },
            { toolId: "adjust-colors", settings: { brightness: -5, contrast: 10 } },
            { toolId: "compress", settings: { quality: 65 } },
            { toolId: "convert", settings: { format: "avif" } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.downloadUrl).toContain(".avif");
    expect(body.processedSize).toBeLessThan(body.originalSize);
  });
});

// ─── Pipeline with Same Step Twice: Resize -> Resize ─────────────

test.describe("Pipeline with same step twice", () => {
  test("resize 200->100, then resize 100->50 (two sequential resizes)", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "resize", settings: { width: 100, fit: "contain" } },
            { toolId: "resize", settings: { width: 50, fit: "contain" } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  test("resize with different fits: cover then fill", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "resize", settings: { width: 300, height: 300, fit: "cover" } },
            { toolId: "resize", settings: { width: 200, height: 150, fit: "fill" } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("double compress with decreasing quality", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "compress", settings: { quality: 80 } },
            { toolId: "compress", settings: { quality: 30 } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeLessThan(body.originalSize);
  });

  test("double sharpen with different sigma values", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "sharpening", settings: { sigma: 0.5 } },
            { toolId: "sharpening", settings: { sigma: 2.0 } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Pipeline with Format Change Mid-Chain ────────────────────────

test.describe("Pipeline with format change mid-chain", () => {
  test("convert JPEG to PNG, resize, then convert to WebP", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "convert", settings: { format: "png" } },
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

  test("convert PNG to JPEG, enhance, then convert to AVIF", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "convert", settings: { format: "jpg", quality: 90 } },
            { toolId: "image-enhancement", settings: { preset: "auto" } },
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

  test("convert to TIFF mid-chain then back to WebP", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "convert", settings: { format: "tiff" } },
            { toolId: "resize", settings: { width: 80, fit: "contain" } },
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

// ─── HEIC Input Through Multi-Step Pipelines ──────────────────────

test.describe("HEIC input through multi-step pipelines", () => {
  test("HEIC: 3-step resize -> sharpen -> convert to PNG", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "resize", settings: { width: 100, fit: "contain" } },
            { toolId: "sharpening", settings: { sigma: 1.0 } },
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

  test("HEIC: 4-step adjust-colors -> resize -> border -> compress", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "adjust-colors", settings: { brightness: 15, contrast: 10 } },
            { toolId: "resize", settings: { width: 150, fit: "contain" } },
            { toolId: "border", settings: { size: 5, color: "#000000" } },
            { toolId: "compress", settings: { quality: 70 } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });
});

// ─── Deep Pipeline: 6+ Steps ──────────────────────────────────────

test.describe("Deep pipelines (6+ steps)", () => {
  test("7-step full processing pipeline", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "strip-metadata", settings: {} },
            { toolId: "rotate", settings: { angle: 90 } },
            { toolId: "resize", settings: { width: 800, fit: "contain" } },
            { toolId: "adjust-colors", settings: { brightness: 5, contrast: 10, saturation: -5 } },
            { toolId: "sharpening", settings: { sigma: 1.0 } },
            {
              toolId: "watermark-text",
              settings: {
                text: "DEEP PIPELINE",
                fontSize: 14,
                color: "#808080",
                opacity: 20,
                position: "bottom-right",
              },
            },
            { toolId: "compress", settings: { quality: 70 } },
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

  test("6-step pipeline with format change at the end", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "photo.jpg", mimeType: "image/jpeg", buffer: JPG_WITH_EXIF },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "strip-metadata", settings: {} },
            { toolId: "resize", settings: { width: 600, fit: "contain" } },
            { toolId: "adjust-colors", settings: { grayscale: true } },
            { toolId: "sharpening", settings: { sigma: 1.5 } },
            { toolId: "border", settings: { size: 8, color: "#ffffff" } },
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

// ─── Workflow: E-commerce Product Pipeline ────────────────────────

test.describe("Workflow: e-commerce product pipeline", () => {
  test("crop -> resize -> enhance -> watermark -> compress -> convert", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "crop", settings: { left: 50, top: 50, width: 400, height: 400 } },
            { toolId: "resize", settings: { width: 800, height: 800, fit: "contain" } },
            { toolId: "image-enhancement", settings: { preset: "vivid" } },
            {
              toolId: "watermark-text",
              settings: {
                text: "SAMPLE",
                fontSize: 20,
                color: "#cccccc",
                opacity: 25,
                position: "center",
              },
            },
            { toolId: "compress", settings: { quality: 85 } },
            { toolId: "convert", settings: { format: "webp" } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.downloadUrl).toContain(".webp");
    expect(body.processedSize).toBeGreaterThan(0);
  });
});

// ─── Workflow: Blog Post Image Pipeline ───────────────────────────

test.describe("Workflow: blog post image pipeline", () => {
  test("strip-metadata -> resize -> text-overlay -> optimize-for-web", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "photo.jpg", mimeType: "image/jpeg", buffer: JPG_WITH_EXIF },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "strip-metadata", settings: {} },
            { toolId: "resize", settings: { width: 1200, fit: "contain" } },
            {
              toolId: "text-overlay",
              settings: {
                text: "Blog Header Image",
                fontSize: 36,
                color: "#ffffff",
                position: "bottom",
                backgroundBox: true,
                backgroundColor: "#333333",
              },
            },
            { toolId: "optimize-for-web", settings: { maxWidth: 1200, quality: 80 } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });
});

// ─── Workflow: Archive Preparation Pipeline ───────────────────────

test.describe("Workflow: archive preparation pipeline", () => {
  test("strip-metadata -> adjust-colors -> resize -> convert to TIFF", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "strip-metadata", settings: {} },
            { toolId: "adjust-colors", settings: { brightness: 0, contrast: 5 } },
            { toolId: "resize", settings: { width: 2000, fit: "contain" } },
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

// ─── Pipeline Step Metadata Validation ────────────────────────────

test.describe("Pipeline step metadata validation", () => {
  test("3-step pipeline returns step metadata if available", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "resize", settings: { width: 100, fit: "contain" } },
            { toolId: "sharpening", settings: { sigma: 1.0 } },
            { toolId: "compress", settings: { quality: 60 } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    if (body.steps) {
      expect(body.steps).toBeInstanceOf(Array);
      expect(body.steps.length).toBe(3);
    }
  });

  test("5-step pipeline returns step metadata if available", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "strip-metadata", settings: {} },
            { toolId: "resize", settings: { width: 500, fit: "contain" } },
            { toolId: "adjust-colors", settings: { brightness: 10 } },
            { toolId: "sharpening", settings: { sigma: 0.8 } },
            { toolId: "compress", settings: { quality: 70 } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    if (body.steps) {
      expect(body.steps).toBeInstanceOf(Array);
      expect(body.steps.length).toBe(5);
    }
  });
});

// ─── WebP Input Through Multi-Step Pipelines ──────────────────────

test.describe("WebP input through multi-step pipelines", () => {
  test("WebP: 3-step resize -> adjust-colors -> convert to PNG", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.webp", mimeType: "image/webp", buffer: WEBP_50x50 },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "resize", settings: { width: 100, height: 100, fit: "fill" } },
            { toolId: "adjust-colors", settings: { brightness: 20, saturation: 15 } },
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

// ─── Pipeline with Enhancement + Border + Convert ─────────────────

test.describe("Enhancement + Border + Convert pipeline", () => {
  test("3-step enhance -> border -> convert to WebP", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "image-enhancement", settings: { preset: "auto" } },
            { toolId: "border", settings: { size: 10, color: "#333333" } },
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

// ─── Pipeline with Multiple Color Operations ──────────────────────

test.describe("Pipeline with multiple color operations", () => {
  test("adjust-colors -> replace-color -> adjust-colors (grayscale)", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "adjust-colors", settings: { brightness: 20, contrast: 10 } },
            {
              toolId: "replace-color",
              settings: {
                targetColor: "#ffffff",
                replacementColor: "#f0f0e0",
                tolerance: 25,
              },
            },
            { toolId: "adjust-colors", settings: { grayscale: true } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Pipeline with Crop After Rotate ──────────────────────────────

test.describe("Pipeline with crop after rotate", () => {
  test("rotate 90 -> crop center -> resize -> compress", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "rotate", settings: { angle: 90 } },
            { toolId: "crop", settings: { left: 20, top: 20, width: 200, height: 200 } },
            { toolId: "resize", settings: { width: 100, fit: "contain" } },
            { toolId: "compress", settings: { quality: 60 } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
  });
});
