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
