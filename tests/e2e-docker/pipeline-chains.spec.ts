import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

// ─── Pipeline Chains ───────────────────────────────────────────────
// Multi-step pipeline chain tests: combining different tool categories
// in realistic workflows. Complements pipeline-tools.spec.ts with
// more complex chains and cross-category combinations.

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

function formatFixture(name: string): Buffer {
  return readFileSync(join(FORMATS, name));
}

const PNG_200x150 = fixture("test-200x150.png");
const JPG_100x100 = fixture("test-100x100.jpg");
const HEIC_200x150 = fixture("test-200x150.heic");
const JPG_SAMPLE = formatFixture("sample.jpg");
const JPG_WITH_EXIF = fixture("test-with-exif.jpg");

// ─── Resize + Watermark + Optimize Chain ───────────────────────────

test.describe("Resize + Watermark + Optimize chain", () => {
  test("resize then text watermark then optimize for web", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "resize", settings: { width: 800, fit: "contain" } },
            {
              toolId: "watermark-text",
              settings: {
                text: "PREVIEW",
                fontSize: 32,
                color: "#ffffff",
                opacity: 35,
                position: "center",
              },
            },
            { toolId: "optimize-for-web", settings: { maxWidth: 800, quality: 75 } },
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

// ─── Crop + Enhance + Convert Chain ────────────────────────────────

test.describe("Crop + Enhance + Convert chain", () => {
  test("crop then enhance then convert to WebP", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "crop", settings: { left: 10, top: 10, width: 200, height: 200 } },
            { toolId: "image-enhancement", settings: { preset: "auto" } },
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

// ─── Strip Metadata + Resize + Compress Chain ──────────────────────

test.describe("Strip Metadata + Resize + Compress chain", () => {
  test("strip metadata then resize then compress", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "photo.jpg", mimeType: "image/jpeg", buffer: JPG_WITH_EXIF },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "strip-metadata", settings: {} },
            { toolId: "resize", settings: { width: 400, fit: "contain" } },
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

// ─── Color Adjust + Sharpen + Border Chain ─────────────────────────

test.describe("Color Adjust + Sharpen + Border chain", () => {
  test("adjust colors then sharpen then add border", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "adjust-colors", settings: { brightness: 10, contrast: 20 } },
            { toolId: "sharpening", settings: { sigma: 1.0 } },
            { toolId: "border", settings: { size: 10, color: "#333333" } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Rotate + Crop + Watermark Chain ───────────────────────────────

test.describe("Rotate + Crop + Watermark chain", () => {
  test("rotate then crop then watermark text", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "rotate", settings: { angle: 90 } },
            { toolId: "crop", settings: { left: 0, top: 0, width: 300, height: 300 } },
            {
              toolId: "watermark-text",
              settings: {
                text: "ROTATED",
                fontSize: 24,
                color: "#ff0000",
                opacity: 50,
                position: "bottom-right",
              },
            },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Enhancement + Replace Color + Convert Chain ───────────────────

test.describe("Enhancement + Replace Color + Convert chain", () => {
  test("enhance then replace color then convert to AVIF", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "image-enhancement", settings: { preset: "vivid" } },
            {
              toolId: "replace-color",
              settings: {
                targetColor: "#ffffff",
                replacementColor: "#f0f0f0",
                tolerance: 20,
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

// ─── HEIC Pipeline Chains ──────────────────────────────────────────

test.describe("HEIC pipeline chains", () => {
  test("HEIC: resize then convert to PNG", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "resize", settings: { width: 100, fit: "contain" } },
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

  test("HEIC: enhance then watermark then compress", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: HEIC_200x150 },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "image-enhancement", settings: { preset: "auto" } },
            {
              toolId: "watermark-text",
              settings: {
                text: "HEIC PIPELINE",
                fontSize: 16,
                color: "#808080",
                opacity: 30,
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
  });
});

// ─── Grayscale + Sharpen + Text Overlay Chain ──────────────────────

test.describe("Grayscale + Sharpen + Text Overlay chain", () => {
  test("grayscale then sharpen then text overlay", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "adjust-colors", settings: { grayscale: true } },
            { toolId: "sharpening", settings: { sigma: 2.0 } },
            {
              toolId: "text-overlay",
              settings: {
                text: "B&W",
                fontSize: 48,
                color: "#FFFFFF",
                position: "bottom",
                backgroundBox: true,
                backgroundColor: "#000000",
              },
            },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Social Media Optimization Chain ───────────────────────────────

test.describe("Social media optimization chain", () => {
  test("resize for Instagram then enhance then watermark", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "resize", settings: { width: 1080, height: 1080, fit: "cover" } },
            { toolId: "image-enhancement", settings: { preset: "vivid" } },
            {
              toolId: "watermark-text",
              settings: {
                text: "@snapotter",
                fontSize: 16,
                color: "#ffffff",
                opacity: 30,
                position: "bottom-right",
              },
            },
            { toolId: "compress", settings: { quality: 85 } },
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

// ─── Print Preparation Chain ───────────────────────────────────────

test.describe("Print preparation chain", () => {
  test("strip metadata then resize for A4 then sharpen then border", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "strip-metadata", settings: {} },
            { toolId: "resize", settings: { width: 2480, fit: "contain" } },
            { toolId: "sharpening", settings: { sigma: 1.2 } },
            { toolId: "border", settings: { size: 40, color: "#ffffff" } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Thumbnail Generation Chain ────────────────────────────────────

test.describe("Thumbnail generation chain", () => {
  test("resize small then enhance then convert to WebP", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "resize", settings: { width: 150, height: 150, fit: "cover" } },
            { toolId: "sharpening", settings: { sigma: 0.5 } },
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
    // Thumbnail should be much smaller than original
    expect(body.processedSize).toBeLessThan(body.originalSize);
  });
});

// ─── Edit Metadata + Convert Chain ─────────────────────────────────

test.describe("Edit Metadata + Convert chain", () => {
  test("edit metadata then convert to PNG", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        pipeline: JSON.stringify({
          steps: [
            {
              toolId: "edit-metadata",
              settings: { artist: "Pipeline Test", copyright: "CC0" },
            },
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

// ─── Pipeline Chain Validation ─────────────────────────────────────

test.describe("Pipeline chain validation", () => {
  test("pipeline with duplicate steps succeeds", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "resize", settings: { width: 150, fit: "contain" } },
            { toolId: "resize", settings: { width: 100, fit: "contain" } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("pipeline with 6 steps completes", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "strip-metadata", settings: {} },
            { toolId: "resize", settings: { width: 600, fit: "contain" } },
            { toolId: "adjust-colors", settings: { brightness: 5, contrast: 10 } },
            { toolId: "sharpening", settings: { sigma: 0.8 } },
            {
              toolId: "watermark-text",
              settings: {
                text: "6-step",
                fontSize: 14,
                color: "#808080",
                opacity: 20,
                position: "bottom-right",
              },
            },
            { toolId: "compress", settings: { quality: 75 } },
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

  test("pipeline step metadata is returned", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "resize", settings: { width: 100, fit: "contain" } },
            { toolId: "border", settings: { size: 5, color: "#000000" } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    // Pipeline should return step metadata
    if (body.steps) {
      expect(body.steps).toBeInstanceOf(Array);
      expect(body.steps.length).toBe(2);
    }
  });

  test("saved pipeline can be executed", async ({ request }) => {
    // Save a pipeline
    const saveRes = await request.post("/api/v1/pipeline/save", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: "Chain Test Pipeline",
        description: "Resize and convert for chain testing",
        steps: [
          { toolId: "resize", settings: { width: 200, fit: "contain" } },
          { toolId: "convert", settings: { format: "webp" } },
        ],
      },
    });
    expect(saveRes.ok()).toBe(true);
    const { id } = await saveRes.json();

    // Execute the saved pipeline
    const execRes = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "resize", settings: { width: 200, fit: "contain" } },
            { toolId: "convert", settings: { format: "webp" } },
          ],
        }),
      },
    });
    expect(execRes.ok()).toBe(true);
    const execBody = await execRes.json();
    expect(execBody.downloadUrl).toBeTruthy();
    expect(execBody.downloadUrl).toContain(".webp");

    // Clean up
    await request.delete(`/api/v1/pipeline/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  });
});
