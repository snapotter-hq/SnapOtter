import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

// ─── Pipeline Tools ─────────────────────────────────────────────────
// Tests for the pipeline/automation system:
//   POST /api/v1/pipeline/execute  — run a multi-step pipeline
//   POST /api/v1/pipeline/save     — save a pipeline definition
//   GET  /api/v1/pipeline/list     — list saved pipelines
//   DELETE /api/v1/pipeline/:id    — delete a saved pipeline
//
// Pipelines chain tool steps: the output of step N feeds into step N+1.
// AI tools in a pipeline respect the same FEATURE_NOT_INSTALLED guard.

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

const PNG_200x150 = fixture("test-200x150.png");
const JPG_100x100 = fixture("test-100x100.jpg");
const JPG_SAMPLE = readFileSync(join(FORMATS, "sample.jpg"));

// ─── Pipeline Execution ─────────────────────────────────────────────

test.describe("Pipeline execution", () => {
  test("execute single-step pipeline (resize)", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        pipeline: JSON.stringify({
          steps: [{ toolId: "resize", settings: { width: 100, fit: "contain" } }],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.processedSize).toBeGreaterThan(0);
    expect(body.steps).toBeTruthy();
  });

  test("execute two-step pipeline (resize then compress)", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        pipeline: JSON.stringify({
          steps: [
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
    // The pipeline output should be smaller than the original sample
    expect(body.processedSize).toBeLessThan(body.originalSize);
  });

  test("execute three-step pipeline (resize, rotate, border)", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "resize", settings: { width: 100, fit: "contain" } },
            { toolId: "rotate", settings: { angle: 90 } },
            { toolId: "border", settings: { size: 10, color: "#ff0000" } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("execute pipeline with format conversion", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "resize", settings: { width: 150, fit: "contain" } },
            { toolId: "convert", settings: { format: "webp" } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    // Output should be WebP
    expect(body.downloadUrl).toContain(".webp");
  });

  test("execute pipeline with color adjustments and sharpening", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "adjust-colors", settings: { brightness: 10, contrast: 15 } },
            { toolId: "sharpening", settings: { sigma: 1.5 } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("execute pipeline with watermark and optimize", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        pipeline: JSON.stringify({
          steps: [
            {
              toolId: "watermark-text",
              settings: {
                text: "SAMPLE",
                fontSize: 48,
                color: "#ff0000",
                opacity: 30,
                position: "center",
              },
            },
            { toolId: "optimize-for-web", settings: { maxWidth: 1200, quality: 75 } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});

// ─── Pipeline with AI Tools ─────────────────────────────────────────

test.describe("Pipeline with AI tools", () => {
  test("pipeline with AI tool returns 501 when feature not installed", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "resize", settings: { width: 100 } },
            { toolId: "remove-background", settings: {} },
          ],
        }),
      },
    });

    // Check whether the feature is installed
    const featuresRes = await request.get("/api/v1/features", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const features = await featuresRes.json();
    const bgBundle = features.bundles?.find((b: { id: string }) => b.id === "background-removal");
    const isInstalled = bgBundle?.status === "installed";

    if (!isInstalled) {
      // Pipeline should fail at the AI step with 501
      expect(res.status()).toBe(501);
      const body = await res.json();
      expect(body.code).toBe("FEATURE_NOT_INSTALLED");
    } else {
      expect(res.ok()).toBe(true);
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
    }
  });

  test("mixed pipeline: non-AI steps before AI step", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "resize", settings: { width: 80, fit: "contain" } },
            { toolId: "upscale", settings: { scale: 2, model: "auto" } },
          ],
        }),
      },
    });

    const featuresRes = await request.get("/api/v1/features", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const features = await featuresRes.json();
    const upscaleBundle = features.bundles?.find((b: { id: string }) => b.id === "upscale-enhance");
    const isInstalled = upscaleBundle?.status === "installed";

    if (!isInstalled) {
      expect(res.status()).toBe(501);
    } else {
      expect(res.ok()).toBe(true);
      const body = await res.json();
      expect(body.downloadUrl).toBeTruthy();
    }
  });
});

// ─── Pipeline Validation ────────────────────────────────────────────

test.describe("Pipeline validation", () => {
  test("reject pipeline with no steps", async ({ request }) => {
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

  test("reject pipeline with unknown tool", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        pipeline: JSON.stringify({
          steps: [{ toolId: "nonexistent-tool", settings: {} }],
        }),
      },
    });
    expect(res.ok()).toBe(false);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test("reject pipeline with no file", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        pipeline: JSON.stringify({
          steps: [{ toolId: "resize", settings: { width: 100 } }],
        }),
      },
    });
    expect(res.ok()).toBe(false);
  });

  test("reject pipeline with invalid JSON", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        pipeline: "not valid json {{{",
      },
    });
    expect(res.ok()).toBe(false);
  });

  test("reject pipeline with invalid tool settings", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        pipeline: JSON.stringify({
          steps: [{ toolId: "resize", settings: { width: -100 } }],
        }),
      },
    });
    expect(res.ok()).toBe(false);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ─── Pipeline Save / List / Delete ──────────────────────────────────

test.describe("Pipeline CRUD", () => {
  test("save a pipeline definition", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/save", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: "E2E Test Pipeline",
        description: "Resize then compress for web optimization",
        steps: [
          { toolId: "resize", settings: { width: 800, fit: "contain" } },
          { toolId: "compress", settings: { quality: 75 } },
        ],
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.id).toBeTruthy();
  });

  test("list saved pipelines", async ({ request }) => {
    const res = await request.get("/api/v1/pipeline/list", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.pipelines || body).toBeInstanceOf(Array);
  });

  test("delete a saved pipeline", async ({ request }) => {
    // First save one to ensure we have something to delete
    const saveRes = await request.post("/api/v1/pipeline/save", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: "Temp Pipeline for Deletion",
        steps: [{ toolId: "resize", settings: { width: 100 } }],
      },
    });
    expect(saveRes.ok()).toBe(true);
    const { id } = await saveRes.json();

    // Delete it
    const deleteRes = await request.delete(`/api/v1/pipeline/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(deleteRes.ok()).toBe(true);

    // Verify it's gone from the list
    const listRes = await request.get("/api/v1/pipeline/list", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(listRes.ok()).toBe(true);
    const listBody = await listRes.json();
    const pipelines = listBody.pipelines ?? listBody;
    const found = pipelines.find((p: { id: string }) => p.id === id);
    expect(found).toBeUndefined();
  });

  test("save pipeline rejects empty name", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/save", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: "",
        steps: [{ toolId: "resize", settings: { width: 100 } }],
      },
    });
    expect(res.ok()).toBe(false);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test("save pipeline rejects empty steps", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/save", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: "Empty Pipeline",
        steps: [],
      },
    });
    expect(res.ok()).toBe(false);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test("delete nonexistent pipeline returns 404", async ({ request }) => {
    const res = await request.delete("/api/v1/pipeline/00000000-0000-0000-0000-000000000000", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(404);
  });
});

// ─── Pipeline Execution Edge Cases ──────────────────────────────────

test.describe("Pipeline edge cases", () => {
  test("HEIC input is decoded before first step", async ({ request }) => {
    const heic = fixture("test-200x150.heic");
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: heic },
        pipeline: JSON.stringify({
          steps: [{ toolId: "resize", settings: { width: 100, fit: "contain" } }],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("strip-metadata then convert pipeline", async ({ request }) => {
    const jpgExif = fixture("test-with-exif.jpg");
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "photo.jpg", mimeType: "image/jpeg", buffer: jpgExif },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "strip-metadata", settings: {} },
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

  test("text-overlay then border pipeline", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        pipeline: JSON.stringify({
          steps: [
            {
              toolId: "text-overlay",
              settings: {
                text: "Pipeline Test",
                fontSize: 24,
                color: "#FFFFFF",
                position: "center",
              },
            },
            { toolId: "border", settings: { size: 5, color: "#000000" } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("full processing pipeline: resize, enhance, sharpen, watermark, compress", async ({
    request,
  }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "resize", settings: { width: 600, fit: "contain" } },
            { toolId: "image-enhancement", settings: { preset: "auto" } },
            { toolId: "sharpening", settings: { sigma: 1.0 } },
            {
              toolId: "watermark-text",
              settings: {
                text: "snapotter",
                fontSize: 20,
                color: "#808080",
                opacity: 20,
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
    // Full pipeline should produce a smaller file than original
    expect(body.processedSize).toBeLessThan(body.originalSize);
  });
});

// ─── Batch Pipeline Execution ──────────────────────────────────────

test.describe("Batch pipeline execution", () => {
  test("batch pipeline resize+compress on 3 images", async ({ request }) => {
    const boundary = `----PlaywrightBoundary${Date.now()}`;
    const files = [
      { filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
      { filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
      { filename: "c.jpg", contentType: "image/jpeg", buffer: JPG_SAMPLE },
    ];
    const parts: Buffer[] = [];
    for (const file of files) {
      parts.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
        ),
      );
      parts.push(file.buffer);
      parts.push(Buffer.from("\r\n"));
    }
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="pipeline"\r\n\r\n${JSON.stringify({
          steps: [
            { toolId: "resize", settings: { width: 100, fit: "contain" } },
            { toolId: "compress", settings: { quality: 60 } },
          ],
        })}\r\n`,
      ),
    );
    parts.push(Buffer.from(`--${boundary}--\r\n`));

    const res = await request.post("/api/v1/pipeline/execute", {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      data: Buffer.concat(parts),
    });
    // Batch pipeline may return ZIP or JSON depending on implementation
    if (res.ok()) {
      const ct = res.headers()["content-type"] ?? "";
      if (ct.includes("application/json")) {
        const body = await res.json();
        expect(body.downloadUrl || body.results).toBeTruthy();
      } else {
        const buffer = Buffer.from(await res.body());
        expect(buffer.length).toBeGreaterThan(0);
      }
    } else {
      // Batch pipeline may not be supported — single-file only
      // Verify the error is coherent, not a crash
      const body = await res.json();
      expect(body.error).toBeDefined();
    }
  });
});

// ─── Pipeline with Crop Dimensions ─────────────────────────────────

test.describe("Pipeline with various tools", () => {
  test("crop then border then compress pipeline", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "crop", settings: { left: 0, top: 0, width: 200, height: 200 } },
            { toolId: "border", settings: { size: 10, color: "#ff0000" } },
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

  test("replace-color then resize pipeline", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        pipeline: JSON.stringify({
          steps: [
            {
              toolId: "replace-color",
              settings: {
                targetColor: "#ffffff",
                replacementColor: "#f0f0f0",
                tolerance: 20,
              },
            },
            { toolId: "resize", settings: { width: 100, fit: "contain" } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("edit-metadata then strip-metadata roundtrip", async ({ request }) => {
    const jpgExif = fixture("test-with-exif.jpg");
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "photo.jpg", mimeType: "image/jpeg", buffer: jpgExif },
        pipeline: JSON.stringify({
          steps: [
            {
              toolId: "edit-metadata",
              settings: { artist: "Pipeline Author", copyright: "CC0" },
            },
            { toolId: "strip-metadata", settings: {} },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("color-blindness then resize pipeline", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        pipeline: JSON.stringify({
          steps: [
            {
              toolId: "color-blindness",
              settings: { simulationType: "deuteranopia" },
            },
            { toolId: "resize", settings: { width: 100, fit: "contain" } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("meme-generator then compress pipeline", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        pipeline: JSON.stringify({
          steps: [
            {
              toolId: "meme-generator",
              settings: {
                textLayout: "top-bottom",
                textBoxes: [
                  { id: "top", text: "PIPELINE" },
                  { id: "bottom", text: "MEMES" },
                ],
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

  test("beautify then convert pipeline", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        pipeline: JSON.stringify({
          steps: [
            {
              toolId: "beautify",
              settings: {
                backgroundType: "solid",
                backgroundColor: "#1a1a2e",
                padding: 32,
                borderRadius: 8,
                shadowPreset: "none",
                frame: "none",
              },
            },
            { toolId: "convert", settings: { format: "webp" } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
  });

  test("four-step pipeline: resize, adjust-colors, border, compress", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "resize", settings: { width: 500, fit: "contain" } },
            { toolId: "adjust-colors", settings: { brightness: 5, contrast: 10 } },
            { toolId: "border", settings: { size: 5, color: "#333333" } },
            { toolId: "compress", settings: { quality: 75 } },
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

// ─── Pipeline: Resize -> Compress -> Convert Chain ─────────────

test.describe("Pipeline: resize -> compress -> convert chain", () => {
  test("three-step chain: resize, compress, convert to WebP", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "resize", settings: { width: 400, fit: "contain" } },
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

  test("three-step chain: resize, compress, convert to AVIF", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "resize", settings: { width: 300, fit: "contain" } },
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

// ─── Pipeline: Output Download Verification ───────────────────────

test.describe("Pipeline output verification", () => {
  test("pipeline output can be downloaded and is valid", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "resize", settings: { width: 80, fit: "contain" } },
            { toolId: "border", settings: { size: 5, color: "#FF0000" } },
          ],
        }),
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
  });

  test("pipeline output dimensions match expected", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        pipeline: JSON.stringify({
          steps: [{ toolId: "resize", settings: { width: 100, height: 75, fit: "fill" } }],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();

    const dlRes = await request.get(body.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.ok()).toBe(true);
    const buffer = Buffer.from(await dlRes.body());

    // Verify dimensions via info
    const infoRes = await request.post("/api/v1/tools/image/info", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "output.png", mimeType: "image/png", buffer: buffer },
      },
    });
    expect(infoRes.ok()).toBe(true);
    const infoBody = await infoRes.json();
    expect(infoBody.width).toBe(100);
    expect(infoBody.height).toBe(75);
  });
});

// ─── Pipeline: 4+ Step Chains ─────────────────────────────────────

test.describe("Pipeline: 4+ step chains", () => {
  test("five-step pipeline: resize, adjust-colors, sharpening, watermark, convert", async ({
    request,
  }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "resize", settings: { width: 500, fit: "contain" } },
            { toolId: "adjust-colors", settings: { brightness: 5, contrast: 10, saturation: 5 } },
            { toolId: "sharpening", settings: { sigma: 1.0 } },
            {
              toolId: "watermark-text",
              settings: {
                text: "SnapOtter",
                fontSize: 16,
                color: "#808080",
                opacity: 15,
                position: "bottom-right",
              },
            },
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

  test("four-step pipeline: crop, rotate, border, compress", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "crop", settings: { left: 0, top: 0, width: 100, height: 100 } },
            { toolId: "rotate", settings: { angle: 45, background: "#000000" } },
            { toolId: "border", settings: { size: 10, color: "#FFFFFF" } },
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

  test("six-step pipeline: full web optimization workflow", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "sample.jpg", mimeType: "image/jpeg", buffer: JPG_SAMPLE },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "resize", settings: { width: 800, fit: "contain" } },
            { toolId: "image-enhancement", settings: { preset: "auto" } },
            { toolId: "adjust-colors", settings: { brightness: 3, contrast: 5 } },
            { toolId: "sharpening", settings: { sigma: 0.5 } },
            { toolId: "strip-metadata", settings: {} },
            { toolId: "compress", settings: { quality: 75 } },
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

// ─── Pipeline: HEIC Input Through Chain ───────────────────────────

test.describe("Pipeline: HEIC input through chain", () => {
  test("HEIC through resize, watermark, convert chain", async ({ request }) => {
    const heic = fixture("test-200x150.heic");
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.heic", mimeType: "image/heic", buffer: heic },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "resize", settings: { width: 150, fit: "contain" } },
            {
              toolId: "watermark-text",
              settings: {
                text: "HEIC",
                fontSize: 20,
                color: "#FF0000",
                opacity: 50,
                position: "center",
              },
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

// ─── Pipeline: Save and Execute Saved ─────────────────────────────

test.describe("Pipeline: save and execute", () => {
  test("save pipeline then list and verify it exists", async ({ request }) => {
    // Save
    const saveRes = await request.post("/api/v1/pipeline/save", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: "Web Optimization Pipeline",
        description: "Resize, compress, convert for web",
        steps: [
          { toolId: "resize", settings: { width: 800, fit: "contain" } },
          { toolId: "compress", settings: { quality: 75 } },
          { toolId: "convert", settings: { format: "webp" } },
        ],
      },
    });
    expect(saveRes.ok()).toBe(true);
    const { id } = await saveRes.json();
    expect(id).toBeTruthy();

    // List and verify
    const listRes = await request.get("/api/v1/pipeline/list", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(listRes.ok()).toBe(true);
    const listBody = await listRes.json();
    const pipelines = listBody.pipelines ?? listBody;
    const saved = pipelines.find((p: { id: string }) => p.id === id);
    expect(saved).toBeTruthy();
    expect(saved.name).toBe("Web Optimization Pipeline");

    // Clean up
    const delRes = await request.delete(`/api/v1/pipeline/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(delRes.ok()).toBe(true);
  });

  test("save pipeline with all field variations", async ({ request }) => {
    const saveRes = await request.post("/api/v1/pipeline/save", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: "Full Field Pipeline",
        description: "Pipeline with diverse tools",
        steps: [
          { toolId: "resize", settings: { width: 600, fit: "inside" } },
          { toolId: "adjust-colors", settings: { brightness: 10, contrast: 5 } },
          { toolId: "sharpening", settings: { sigma: 1.5 } },
          { toolId: "border", settings: { size: 5, color: "#333333" } },
          { toolId: "compress", settings: { quality: 80 } },
        ],
      },
    });
    expect(saveRes.ok()).toBe(true);
    const { id } = await saveRes.json();
    expect(id).toBeTruthy();

    // Clean up
    await request.delete(`/api/v1/pipeline/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  });
});

// ─── Pipeline: Batch + Pipeline Combo ─────────────────────────────

test.describe("Pipeline: batch + pipeline combo", () => {
  test("batch pipeline on 4 images (resize + compress)", async ({ request }) => {
    const boundary = `----PlaywrightBoundary${Date.now()}`;
    const files = [
      { filename: "a.png", contentType: "image/png", buffer: PNG_200x150 },
      { filename: "b.jpg", contentType: "image/jpeg", buffer: JPG_100x100 },
      {
        filename: "c.jpg",
        contentType: "image/jpeg",
        buffer: JPG_SAMPLE,
      },
      {
        filename: "d.heic",
        contentType: "image/heic",
        buffer: fixture("test-200x150.heic"),
      },
    ];
    const parts: Buffer[] = [];
    for (const file of files) {
      parts.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
        ),
      );
      parts.push(file.buffer);
      parts.push(Buffer.from("\r\n"));
    }
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="pipeline"\r\n\r\n${JSON.stringify({
          steps: [
            { toolId: "resize", settings: { width: 80, fit: "contain" } },
            { toolId: "compress", settings: { quality: 50 } },
          ],
        })}\r\n`,
      ),
    );
    parts.push(Buffer.from(`--${boundary}--\r\n`));

    const res = await request.post("/api/v1/pipeline/execute", {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      data: Buffer.concat(parts),
    });
    if (res.ok()) {
      const ct = res.headers()["content-type"] ?? "";
      if (ct.includes("application/json")) {
        const body = await res.json();
        expect(body.downloadUrl || body.results).toBeTruthy();
      } else {
        const buffer = Buffer.from(await res.body());
        expect(buffer.length).toBeGreaterThan(0);
      }
    } else {
      // Batch pipeline may only accept single file
      const body = await res.json();
      expect(body.error).toBeDefined();
    }
  });
});

// ─── Pipeline: Replace-Color + Resize + Convert ──────────────────

test.describe("Pipeline: tool combination chains", () => {
  test("replace-color, resize, convert to PNG pipeline", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.jpg", mimeType: "image/jpeg", buffer: JPG_100x100 },
        pipeline: JSON.stringify({
          steps: [
            {
              toolId: "replace-color",
              settings: {
                targetColor: "#FFFFFF",
                replacementColor: "#FFFF00",
                tolerance: 30,
              },
            },
            { toolId: "resize", settings: { width: 200, fit: "fill" } },
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

  test("text-overlay, border, compress, convert pipeline", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "test.png", mimeType: "image/png", buffer: PNG_200x150 },
        pipeline: JSON.stringify({
          steps: [
            {
              toolId: "text-overlay",
              settings: {
                text: "TEST",
                fontSize: 24,
                color: "#FFFFFF",
                position: "center",
              },
            },
            { toolId: "border", settings: { size: 10, color: "#333333" } },
            { toolId: "compress", settings: { quality: 70 } },
            { toolId: "convert", settings: { format: "jpg" } },
          ],
        }),
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.downloadUrl).toBeTruthy();
    expect(body.downloadUrl).toContain(".jpg");
  });

  test("strip-metadata, resize, border, convert pipeline", async ({ request }) => {
    const jpgExif = fixture("test-with-exif.jpg");
    const res = await request.post("/api/v1/pipeline/execute", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "photo.jpg", mimeType: "image/jpeg", buffer: jpgExif },
        pipeline: JSON.stringify({
          steps: [
            { toolId: "strip-metadata", settings: {} },
            { toolId: "resize", settings: { width: 300, fit: "contain" } },
            { toolId: "border", settings: { size: 5, color: "#FFFFFF" } },
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

// ─── Pipeline Auth Failure ──────────────────────────────────────

test.describe("Pipeline auth failure", () => {
  test("pipeline execution without token returns 401", async ({ request }) => {
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

  test("pipeline save without token returns 401", async ({ request }) => {
    const res = await request.post("/api/v1/pipeline/save", {
      data: {
        name: "Unauthorized Pipeline",
        steps: [{ toolId: "resize", settings: { width: 100 } }],
      },
    });
    expect(res.status()).toBe(401);
  });

  test("pipeline list without token returns 401", async ({ request }) => {
    const res = await request.get("/api/v1/pipeline/list");
    expect(res.status()).toBe(401);
  });
});
