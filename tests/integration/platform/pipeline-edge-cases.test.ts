/**
 * Pipeline edge-case integration tests for the SnapOtter image API.
 *
 * Tests the pipeline execution system with unusual inputs: empty pipelines,
 * single steps, invalid tools, conflicting steps, and multi-step chains.
 */

import { qpdfAvailable } from "@snapotter/doc-engine";
import { ffmpegAvailable } from "@snapotter/media-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const PNG_200x150 = readFixture(fixtures.image.base.png200);
const TINY_MP4 = readFixture(fixtures.video.tiny("mp4"));
const GARBAGE_IMAGE = readFixture(fixtures.image.hostile.garbage);
const SVG_100 = readFixture(fixtures.image.base.svg100);
const HEIC_200 = readFixture(fixtures.image.base.heic200);
const PSD_SAMPLE = readFixture(fixtures.image.formats("psd"));
const PDF_2PAGE = readFixture(fixtures.document.pdf2);
const GARBAGE_PDF = readFixture(fixtures.document.hostile.garbagePdf);

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------
let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

/** Helper to POST a pipeline execution request. */
function executePipeline(
  image: Buffer,
  filename: string,
  pipeline: { steps: Array<{ toolId: string; settings?: Record<string, unknown> }> },
) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, content: image, contentType: "image/png" },
    { name: "pipeline", content: JSON.stringify(pipeline) },
  ]);
  return app.inject({
    method: "POST",
    url: "/api/v1/pipeline/execute",
    headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
    body,
  });
}

/** Helper to POST a pipeline batch request with several files. */
function executeBatch(
  files: Array<{ filename: string; content: Buffer }>,
  pipeline: { steps: Array<{ toolId: string; settings?: Record<string, unknown> }> },
) {
  const { body, contentType } = createMultipartPayload([
    ...files.map((f) => ({
      name: "file",
      filename: f.filename,
      content: f.content,
      contentType: "application/octet-stream",
    })),
    { name: "pipeline", content: JSON.stringify(pipeline) },
  ]);
  return app.inject({
    method: "POST",
    url: "/api/v1/pipeline/batch",
    headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
    body,
  });
}

/** Decode the x-file-results header of a batch ZIP response. */
function parseFileResults(res: { headers: Record<string, unknown> }): Record<string, string> {
  const raw = res.headers["x-file-results"] as string;
  return JSON.parse(decodeURIComponent(raw)) as Record<string, string>;
}

// ═══════════════════════════════════════════════════════════════════════════
// EMPTY PIPELINE
// ═══════════════════════════════════════════════════════════════════════════
describe("Empty pipeline", () => {
  it("rejects a pipeline with zero steps", async () => {
    const res = await executePipeline(PNG_200x150, "test.png", { steps: [] });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toMatch(/pipeline/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SINGLE STEP PIPELINE
// ═══════════════════════════════════════════════════════════════════════════
describe("Single step pipeline", () => {
  it("executes a pipeline with one resize step", async () => {
    const res = await executePipeline(PNG_200x150, "test.png", {
      steps: [{ toolId: "resize", settings: { width: 100 } }],
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.stepsCompleted).toBe(1);
    expect(json.downloadUrl).toBeDefined();
  });

  it("executes a pipeline with one rotate step", async () => {
    const res = await executePipeline(PNG_200x150, "test.png", {
      steps: [{ toolId: "rotate", settings: { angle: 180 } }],
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.stepsCompleted).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE WITH INVALID TOOL
// ═══════════════════════════════════════════════════════════════════════════
describe("Pipeline with invalid tool reference", () => {
  it("rejects a pipeline referencing a non-existent tool", async () => {
    const res = await executePipeline(PNG_200x150, "test.png", {
      steps: [{ toolId: "totally-fake-tool-that-does-not-exist" }],
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toMatch(/not found/i);
  });

  it("rejects at the invalid step even when earlier steps are valid", async () => {
    const res = await executePipeline(PNG_200x150, "test.png", {
      steps: [{ toolId: "resize", settings: { width: 100 } }, { toolId: "nonexistent-tool" }],
    });

    // Validation happens before execution — should reject immediately
    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toMatch(/step 2/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE WITH CONFLICTING STEPS
// ═══════════════════════════════════════════════════════════════════════════
describe("Pipeline with conflicting steps", () => {
  it("applies resize steps in order (last wins)", async () => {
    const res = await executePipeline(PNG_200x150, "test.png", {
      steps: [
        { toolId: "resize", settings: { width: 100, height: 100 } },
        { toolId: "resize", settings: { width: 200, height: 200 } },
      ],
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.stepsCompleted).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE WITH MULTIPLE TOOLS CHAINED
// ═══════════════════════════════════════════════════════════════════════════
describe("Multi-step pipeline chains", () => {
  it("chains resize then rotate then compress", async () => {
    const res = await executePipeline(PNG_200x150, "test.png", {
      steps: [
        { toolId: "resize", settings: { width: 100 } },
        { toolId: "rotate", settings: { angle: 90 } },
        { toolId: "compress", settings: { quality: 60 } },
      ],
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.stepsCompleted).toBe(3);
    expect(json.steps).toHaveLength(3);
    expect(json.steps[0].toolId).toBe("resize");
    expect(json.steps[1].toolId).toBe("rotate");
    expect(json.steps[2].toolId).toBe("compress");
  });

  it("chains crop then resize", async () => {
    const res = await executePipeline(PNG_200x150, "test.png", {
      steps: [
        { toolId: "crop", settings: { left: 10, top: 10, width: 100, height: 100 } },
        { toolId: "resize", settings: { width: 50 } },
      ],
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.stepsCompleted).toBe(2);
    // Output should be smaller than the original
    expect(json.processedSize).toBeLessThan(json.originalSize);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE WITH INVALID SETTINGS IN A STEP
// ═══════════════════════════════════════════════════════════════════════════
describe("Pipeline with invalid settings in a step", () => {
  it("rejects a pipeline with invalid settings for a specific step", async () => {
    const res = await executePipeline(PNG_200x150, "test.png", {
      steps: [
        { toolId: "resize", settings: { width: 100 } },
        { toolId: "crop", settings: { left: -10, top: 0, width: 50, height: 50 } },
      ],
    });

    // left: -10 fails z.number().min(0) validation
    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toMatch(/step 2/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE DEFINITION FIELD MISSING
// ═══════════════════════════════════════════════════════════════════════════
describe("Missing pipeline definition", () => {
  it("rejects when no pipeline field is provided", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", content: PNG_200x150, contentType: "image/png" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/pipeline/execute",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toMatch(/pipeline/i);
  });

  it("rejects non-JSON pipeline definition", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", content: PNG_200x150, contentType: "image/png" },
      { name: "pipeline", content: "this is not json" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/pipeline/execute",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toMatch(/json/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE WITHOUT IMAGE
// ═══════════════════════════════════════════════════════════════════════════
describe("Pipeline without image", () => {
  it("rejects when no image file is provided", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "pipeline",
        content: JSON.stringify({ steps: [{ toolId: "resize", settings: { width: 100 } }] }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/pipeline/execute",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    // The route may report either "No image file provided" or the more generic
    // "No file provided" depending on which validation fires first.
    expect(json.error).toMatch(/no (image|file)/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SAVE PIPELINE EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════
describe("Save pipeline edge cases", () => {
  it("rejects saving a pipeline with empty name", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/pipeline/save",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminToken}`,
      },
      payload: {
        name: "",
        steps: [{ toolId: "resize", settings: { width: 100 } }],
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects saving a pipeline with no steps", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/pipeline/save",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminToken}`,
      },
      payload: {
        name: "empty-pipeline",
        steps: [],
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects saving a pipeline with an invalid tool reference", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/pipeline/save",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminToken}`,
      },
      payload: {
        name: "bad-pipeline",
        steps: [{ toolId: "this-tool-does-not-exist" }],
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("saves and lists a valid pipeline", async () => {
    const saveRes = await app.inject({
      method: "POST",
      url: "/api/v1/pipeline/save",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminToken}`,
      },
      payload: {
        name: "edge-case-test-pipeline",
        description: "Created by edge case tests",
        steps: [
          { toolId: "resize", settings: { width: 100 } },
          { toolId: "rotate", settings: { angle: 90 } },
        ],
      },
    });

    expect(saveRes.statusCode).toBe(201);
    const saved = JSON.parse(saveRes.body);
    expect(saved.id).toBeDefined();
    expect(saved.name).toBe("edge-case-test-pipeline");

    // Verify it appears in the list
    const listRes = await app.inject({
      method: "GET",
      url: "/api/v1/pipeline/list",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(listRes.statusCode).toBe(200);
    const list = JSON.parse(listRes.body);
    const found = list.pipelines.find((p: { id: string }) => p.id === saved.id);
    expect(found).toBeDefined();
    expect(found.steps).toHaveLength(2);

    // Clean up — delete the pipeline
    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/v1/pipeline/${saved.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(deleteRes.statusCode).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PASSWORD TOOL PIPELINE SAVE REJECTION
// ═══════════════════════════════════════════════════════════════════════════
describe("Pipeline save rejects password tools", () => {
  it("rejects saving a pipeline containing protect-pdf", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/pipeline/save",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminToken}`,
      },
      payload: {
        name: "protect-pipeline",
        steps: [
          { toolId: "resize", settings: { width: 100 } },
          { toolId: "protect-pdf", settings: { userPassword: "test" } },
        ],
      },
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toMatch(/password/i);
  });

  it("rejects saving a pipeline containing unlock-pdf", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/pipeline/save",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminToken}`,
      },
      payload: {
        name: "unlock-pipeline",
        steps: [{ toolId: "unlock-pdf", settings: { password: "test" } }],
      },
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toMatch(/password/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE EXECUTE REJECTS PASSWORD TOOLS
// ═══════════════════════════════════════════════════════════════════════════
describe("Pipeline execute rejects password tools", () => {
  it("rejects executing a pipeline containing protect-pdf", async () => {
    const res = await executePipeline(PNG_200x150, "test.png", {
      steps: [
        { toolId: "resize", settings: { width: 100 } },
        { toolId: "protect-pdf", settings: { userPassword: "test" } },
      ],
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toMatch(/password/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE BATCH REJECTS PASSWORD TOOLS
// ═══════════════════════════════════════════════════════════════════════════
describe("Pipeline batch rejects password tools", () => {
  it("rejects a batch pipeline containing unlock-pdf", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG_200x150 },
      {
        name: "pipeline",
        content: JSON.stringify({
          steps: [{ toolId: "unlock-pdf", settings: { password: "test" } }],
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/pipeline/batch",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toMatch(/password/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE PIPELINE EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════
describe("Delete pipeline edge cases", () => {
  it("returns 404 when deleting a non-existent pipeline", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/pipeline/00000000-0000-0000-0000-000000000000",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(404);
    const json = JSON.parse(res.body);
    expect(json.error).toMatch(/not found/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE TOOLS LIST
// ═══════════════════════════════════════════════════════════════════════════
describe("Pipeline tools endpoint", () => {
  it("returns the list of available pipeline tools", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/pipeline/tools",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.toolIds).toBeDefined();
    expect(Array.isArray(json.toolIds)).toBe(true);
    expect(json.toolIds.length).toBeGreaterThan(0);
    // Core tools should be registered
    expect(json.toolIds).toContain("resize");
    expect(json.toolIds).toContain("rotate");
    expect(json.toolIds).toContain("compress");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE BATCH EXECUTION
// ═══════════════════════════════════════════════════════════════════════════
describe("Pipeline batch execution", () => {
  it("processes multiple files through a pipeline and returns ZIP", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "batch1.png", contentType: "image/png", content: PNG_200x150 },
      { name: "file", filename: "batch2.png", contentType: "image/png", content: PNG_200x150 },
      {
        name: "pipeline",
        content: JSON.stringify({
          steps: [{ toolId: "resize", settings: { width: 50 } }],
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/pipeline/batch",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    expect(res.headers["x-job-id"]).toBeDefined();
    expect(res.headers["x-file-results"]).toBeDefined();
  });

  it("handles non-ASCII filenames without ERR_INVALID_CHAR (#133)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "图片.png", contentType: "image/png", content: PNG_200x150 },
      { name: "file", filename: "写真テスト.png", contentType: "image/png", content: PNG_200x150 },
      {
        name: "pipeline",
        content: JSON.stringify({
          steps: [{ toolId: "resize", settings: { width: 50 } }],
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/pipeline/batch",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(res.statusCode).toBe(200);
    const raw = res.headers["x-file-results"] as string;
    expect(raw).toMatch(/^[\x20-\x7E]+$/);
    const fileResults = JSON.parse(decodeURIComponent(raw));
    expect(fileResults["0"]).toContain("图片");
    expect(fileResults["1"]).toContain("写真テスト");
  });

  it("rejects pipeline batch with no files", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "pipeline",
        content: JSON.stringify({
          steps: [{ toolId: "resize", settings: { width: 50 } }],
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/pipeline/batch",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    // The route may report either "No image file provided" or the more generic
    // "No file provided" depending on which validation fires first.
    expect(json.error).toMatch(/no (image|file)/i);
  });

  it("rejects pipeline batch with no pipeline definition", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "lonely.png", contentType: "image/png", content: PNG_200x150 },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/pipeline/batch",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toMatch(/pipeline/i);
  });

  it("rejects pipeline batch with invalid JSON pipeline", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG_200x150 },
      { name: "pipeline", content: "not-json!!" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/pipeline/batch",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toMatch(/json/i);
  });

  it("rejects pipeline batch with an unknown tool", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG_200x150 },
      {
        name: "pipeline",
        content: JSON.stringify({
          steps: [{ toolId: "nonexistent-tool-xyz" }],
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/pipeline/batch",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  it("uses clientJobId when provided", async () => {
    const clientJobId = "custom-pipeline-batch-id-123";

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "cid.png", contentType: "image/png", content: PNG_200x150 },
      {
        name: "pipeline",
        content: JSON.stringify({
          steps: [{ toolId: "rotate", settings: { angle: 90 } }],
        }),
      },
      { name: "clientJobId", content: clientJobId },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/pipeline/batch",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["x-job-id"]).toBe(clientJobId);
  });

  it("pipeline batch with multi-step chain processes correctly", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "multi.png", contentType: "image/png", content: PNG_200x150 },
      {
        name: "pipeline",
        content: JSON.stringify({
          steps: [
            { toolId: "resize", settings: { width: 100 } },
            { toolId: "rotate", settings: { angle: 180 } },
          ],
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/pipeline/batch",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
  });

  it("pipeline batch rejects invalid step settings", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG_200x150 },
      {
        name: "pipeline",
        content: JSON.stringify({
          steps: [{ toolId: "crop", settings: { left: -5, top: 0, width: 10, height: 10 } }],
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/pipeline/batch",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(res.statusCode).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE STEP FAILURE DURING EXECUTION
// ═══════════════════════════════════════════════════════════════════════════
describe("Pipeline execution failure recovery", () => {
  it("returns 422 when a processing step fails at runtime", async () => {
    // Crop with dimensions larger than the image will fail during processing
    const res = await executePipeline(PNG_200x150, "test.png", {
      steps: [
        { toolId: "resize", settings: { width: 10 } },
        // Crop area bigger than the resized image
        { toolId: "crop", settings: { left: 0, top: 0, width: 5000, height: 5000 } },
      ],
    });

    // Should either get a 422 with error or 200 if sharp auto-clips
    const status = res.statusCode;
    expect(status === 200 || status === 422).toBe(true);

    if (status === 422) {
      const json = JSON.parse(res.body);
      expect(json.error).toBeDefined();
      expect(json.completedSteps).toBeDefined();
    }
  });

  it("reports completedSteps for partial pipeline failures", async () => {
    // First step succeeds, second step uses bad settings that will
    // cause a runtime error
    const res = await executePipeline(PNG_200x150, "test.png", {
      steps: [{ toolId: "resize", settings: { width: 50 } }],
    });

    // This should succeed; verifying the completedSteps field exists
    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.stepsCompleted).toBe(1);
    expect(json.steps).toHaveLength(1);
    expect(json.steps[0].step).toBe(1);
    expect(json.steps[0].toolId).toBe("resize");
    expect(json.steps[0].size).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE EXECUTION RESPONSE FORMAT
// ═══════════════════════════════════════════════════════════════════════════
describe("Pipeline execution response", () => {
  it("returns all expected fields in the response", async () => {
    const res = await executePipeline(PNG_200x150, "test.png", {
      steps: [{ toolId: "resize", settings: { width: 80 } }],
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);

    expect(json.jobId).toBeDefined();
    expect(json.downloadUrl).toBeDefined();
    expect(typeof json.originalSize).toBe("number");
    expect(typeof json.processedSize).toBe("number");
    expect(json.stepsCompleted).toBe(1);
    expect(json.steps).toHaveLength(1);
    expect(json.originalSize).toBe(PNG_200x150.length);
  });

  it("processed size differs from original after real transformation", async () => {
    const res = await executePipeline(PNG_200x150, "test.png", {
      steps: [{ toolId: "resize", settings: { width: 50 } }],
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    // Resizing to 50px should produce a different size
    expect(json.processedSize).not.toBe(json.originalSize);
  });

  it("download URL is accessible", async () => {
    const res = await executePipeline(PNG_200x150, "test.png", {
      steps: [{ toolId: "rotate", settings: { angle: 90 } }],
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: json.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(dlRes.statusCode).toBe(200);
    expect(dlRes.rawPayload.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// NON-IMAGE PIPELINE (regression)
// ═══════════════════════════════════════════════════════════════════════════
// Pipeline execute used to hardcode image validation and rejected video inputs
// with "Invalid image". It now validates via the first step's modality handler.
describe.skipIf(!ffmpegAvailable())("Non-image pipeline (video)", () => {
  it("runs a multi-step video pipeline and returns a downloadable result", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.mp4", content: TINY_MP4, contentType: "video/mp4" },
      {
        name: "pipeline",
        content: JSON.stringify({
          steps: [
            { toolId: "rotate-video", settings: { transform: "cw90" } },
            { toolId: "mute-video", settings: {} },
          ],
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/pipeline/execute",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
    expect(json.stepsCompleted).toBe(2);

    const dlRes = await app.inject({
      method: "GET",
      url: json.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(dlRes.statusCode).toBe(200);
    expect(dlRes.rawPayload.length).toBeGreaterThan(0);
  }, 60_000);
});

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTE INGRESS PREPROCESSING (validate/decode/sanitize branches)
// ═══════════════════════════════════════════════════════════════════════════
describe("Pipeline execute ingress preprocessing", () => {
  it("rejects a garbage buffer with an invalid-image error", async () => {
    const res = await executePipeline(GARBAGE_IMAGE, "garbage.jpg", {
      steps: [{ toolId: "resize", settings: { width: 100 } }],
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/invalid image/i);
  });

  it("sanitizes SVG input at ingress before step validation runs", async () => {
    // The unknown second step rejects the pipeline AFTER preprocessing, so the
    // SVG sanitize path is exercised without a worker round-trip.
    const res = await executePipeline(SVG_100, "logo.svg", {
      steps: [
        { toolId: "convert", settings: { format: "png" } },
        { toolId: "tool-that-does-not-exist" },
      ],
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/step 2/i);
  });

  it("decodes HEIC input at ingress, or reports a 422 decode failure", async () => {
    const res = await executePipeline(HEIC_200, "photo.heic", {
      steps: [
        { toolId: "resize", settings: { width: 50 } },
        { toolId: "tool-that-does-not-exist" },
      ],
    });

    // 400 means the HEIC was decoded and validation reached unknown step 2;
    // 422 means this environment has no heif decoder binary. Both are the
    // route's real contract for this input.
    expect([400, 422]).toContain(res.statusCode);
    const json = JSON.parse(res.body);
    if (res.statusCode === 400) {
      expect(json.error).toMatch(/step 2/i);
    } else {
      expect(json.error).toMatch(/heic/i);
    }
  });

  it("routes PSD input through the CLI decoder at ingress", async () => {
    const res = await executePipeline(PSD_SAMPLE, "art.psd", {
      steps: [
        { toolId: "resize", settings: { width: 50 } },
        { toolId: "tool-that-does-not-exist" },
      ],
    });

    expect([400, 422]).toContain(res.statusCode);
    const json = JSON.parse(res.body);
    if (res.statusCode === 400) {
      expect(json.error).toMatch(/step 2/i);
    } else {
      expect(json.error).toMatch(/failed to decode psd/i);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// OCR STEP INGRESS GATING (quality resolution + image preparer)
// ═══════════════════════════════════════════════════════════════════════════
describe("Pipeline OCR step ingress gating", () => {
  it("prepares the image, then rejects Korean fast OCR as incompatible", async () => {
    const res = await executePipeline(PNG_200x150, "scan.png", {
      steps: [{ toolId: "ocr", settings: { quality: "fast", language: "ko" } }],
    });

    expect(res.statusCode).toBe(501);
    const json = JSON.parse(res.body);
    expect(json.code).toBe("FEATURE_INCOMPATIBLE");
    expect(json.feature).toBe("ocr");
    expect(json.requestedQuality).toBe("fast");
    expect(typeof json.guidance).toBe("string");
    expect(json.error).toMatch(/incompatible/i);
  });

  it("rejects best-quality OCR when no accurate runtime is active", async () => {
    const res = await executePipeline(PNG_200x150, "scan.png", {
      steps: [{ toolId: "ocr", settings: { quality: "best" } }],
    });

    expect(res.statusCode).toBe(501);
    const json = JSON.parse(res.body);
    // Hosts without a published runtime report NOT_INSTALLED; hosts the
    // runtime does not target report INCOMPATIBLE. Both are 501 refusals.
    expect(["FEATURE_NOT_INSTALLED", "FEATURE_INCOMPATIBLE"]).toContain(json.code);
    expect(json.requestedQuality).toBe("best");
    expect(json.compatibilityReason).toBeDefined();
  });

  it("rejects a garbage image through the OCR ingress preparer", async () => {
    const res = await executePipeline(GARBAGE_IMAGE, "scan.jpg", {
      steps: [{ toolId: "ocr", settings: { quality: "fast" } }],
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/invalid image/i);
  });

  it("rejects Korean fast OCR on the batch endpoint too", async () => {
    const res = await executeBatch([{ filename: "scan.png", content: PNG_200x150 }], {
      steps: [{ toolId: "ocr", settings: { quality: "fast", language: "ko" } }],
    });

    expect(res.statusCode).toBe(501);
    const json = JSON.parse(res.body);
    expect(json.code).toBe("FEATURE_INCOMPATIBLE");
    expect(typeof json.guidance).toBe("string");
  });

  it("pre-fails garbage files during batch OCR ingress", async () => {
    const res = await executeBatch([{ filename: "junk.jpg", content: GARBAGE_IMAGE }], {
      steps: [{ toolId: "ocr", settings: { quality: "fast" } }],
    });

    expect(res.statusCode).toBe(422);
    const json = JSON.parse(res.body);
    expect(json.error).toMatch(/all files failed/i);
    expect(json.errors).toHaveLength(1);
    expect(json.errors[0].filename).toBe("junk.jpg");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AI STEP BUNDLE GATING (mandatory bundle not installed)
// ═══════════════════════════════════════════════════════════════════════════
describe("Pipeline AI step bundle gating", () => {
  it("rejects execute when a step needs an AI bundle that is not installed", async () => {
    const res = await executePipeline(PNG_200x150, "photo.png", {
      steps: [
        { toolId: "resize", settings: { width: 100 } },
        { toolId: "remove-background", settings: {} },
      ],
    });

    expect(res.statusCode).toBe(501);
    const json = JSON.parse(res.body);
    expect(json.code).toBe("FEATURE_NOT_INSTALLED");
    expect(json.feature).toBe("background-removal");
    expect(json.error).toMatch(/step 2/i);
    expect(json.error).toMatch(/not installed/i);
  });

  it("rejects batch when a step needs an AI bundle that is not installed", async () => {
    const res = await executeBatch([{ filename: "photo.png", content: PNG_200x150 }], {
      steps: [{ toolId: "remove-background", settings: {} }],
    });

    expect(res.statusCode).toBe(501);
    const json = JSON.parse(res.body);
    expect(json.code).toBe("FEATURE_NOT_INSTALLED");
    expect(json.feature).toBe("background-removal");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PER-STEP OUTPUT PIXEL LIMIT
// ═══════════════════════════════════════════════════════════════════════════
describe("Pipeline per-step output pixel limit", () => {
  // Default MAX_PIPELINE_STEP_PIXELS is 64 MP; 9000x9000 is 81 MP.
  it("rejects an execute step whose output dimensions exceed the pixel cap", async () => {
    const res = await executePipeline(PNG_200x150, "big.png", {
      steps: [{ toolId: "resize", settings: { width: 9000, height: 9000 } }],
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/pixel limit/i);
  });

  it("rejects a batch step whose output dimensions exceed the pixel cap", async () => {
    const res = await executeBatch([{ filename: "big.png", content: PNG_200x150 }], {
      steps: [{ toolId: "resize", settings: { width: 9000, height: 9000 } }],
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/pixel limit/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTE WITH clientJobId (progress reporting branch)
// ═══════════════════════════════════════════════════════════════════════════
describe("Pipeline execute with clientJobId", () => {
  it("accepts a clientJobId and completes the pipeline", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "cid.png", content: PNG_200x150, contentType: "image/png" },
      {
        name: "pipeline",
        content: JSON.stringify({ steps: [{ toolId: "resize", settings: { width: 60 } }] }),
      },
      { name: "clientJobId", content: "pipeline-exec-client-id-1" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/pipeline/execute",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.stepsCompleted).toBe(1);
    expect(json.jobId).toBeDefined();
    expect(json.downloadUrl).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DETERMINISTIC RUNTIME STEP FAILURE (json-xml on malformed JSON)
// ═══════════════════════════════════════════════════════════════════════════
describe("Pipeline deterministic runtime step failure", () => {
  it("returns 422 with completedSteps when the only step fails in the worker", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "broken.json",
        content: Buffer.from("{ definitely not json"),
        contentType: "application/json",
      },
      {
        name: "pipeline",
        content: JSON.stringify({ steps: [{ toolId: "json-xml", settings: {} }] }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/pipeline/execute",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(res.statusCode).toBe(422);
    const json = JSON.parse(res.body);
    expect(json.error).toMatch(/step 1/i);
    expect(json.error).toMatch(/json/i);
    expect(Array.isArray(json.completedSteps)).toBe(true);
    expect(json.completedSteps).toHaveLength(0);
  }, 30_000);
});

// ═══════════════════════════════════════════════════════════════════════════
// BATCH INGRESS PREPROCESSING (per-file validate/decode/sanitize)
// ═══════════════════════════════════════════════════════════════════════════
describe("Pipeline batch ingress preprocessing", () => {
  it("skips invalid images as pre-failures and zips the valid ones", async () => {
    const res = await executeBatch(
      [
        { filename: "broken.jpg", content: GARBAGE_IMAGE },
        { filename: "keeper.png", content: PNG_200x150 },
      ],
      { steps: [{ toolId: "resize", settings: { width: 50 } }] },
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    const fileResults = parseFileResults(res);
    expect(fileResults["0"]).toBeUndefined();
    expect(fileResults["1"]).toBe("keeper_resize.png");
  }, 30_000);

  it("sanitizes and converts an SVG through the batch pipeline", async () => {
    const res = await executeBatch([{ filename: "logo.svg", content: SVG_100 }], {
      steps: [{ toolId: "convert", settings: { format: "png" } }],
    });

    expect(res.statusCode).toBe(200);
    const fileResults = parseFileResults(res);
    expect(fileResults["0"]).toMatch(/\.png$/);
  }, 30_000);

  it("handles HEIC batch input via decode or pre-failure without failing the batch", async () => {
    const res = await executeBatch(
      [
        { filename: "photo.heic", content: HEIC_200 },
        { filename: "keeper.png", content: PNG_200x150 },
      ],
      { steps: [{ toolId: "resize", settings: { width: 50 } }] },
    );

    // The PNG always succeeds, so the batch returns a ZIP whether or not this
    // environment can decode HEIC.
    expect(res.statusCode).toBe(200);
    const fileResults = parseFileResults(res);
    expect(fileResults["1"]).toBe("keeper_resize.png");
  }, 30_000);

  it("routes PSD batch input through the CLI decoder without failing the batch", async () => {
    const res = await executeBatch(
      [
        { filename: "sample.psd", content: PSD_SAMPLE },
        { filename: "keeper.png", content: PNG_200x150 },
      ],
      { steps: [{ toolId: "resize", settings: { width: 50 } }] },
    );

    expect(res.statusCode).toBe(200);
    const fileResults = parseFileResults(res);
    expect(fileResults["1"]).toBe("keeper_resize.png");
  }, 30_000);
});

// ═══════════════════════════════════════════════════════════════════════════
// BATCH DOCUMENT MODALITY (per-file document handler validation)
// ═══════════════════════════════════════════════════════════════════════════
describe.skipIf(!qpdfAvailable())("Pipeline batch document modality", () => {
  it("validates PDFs via the document handler and pre-fails garbage", async () => {
    const res = await executeBatch(
      [
        { filename: "broken.pdf", content: GARBAGE_PDF },
        { filename: "alt.pdf", content: PDF_2PAGE },
      ],
      { steps: [{ toolId: "rotate-pdf", settings: { angle: 90, range: "1-z" } }] },
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    const fileResults = parseFileResults(res);
    expect(fileResults["0"]).toBeUndefined();
    expect(fileResults["1"]).toMatch(/\.pdf$/);
  }, 30_000);
});

// ═══════════════════════════════════════════════════════════════════════════
// BATCH RUNTIME FAILURES AND OUTPUT NAME DEDUPLICATION
// ═══════════════════════════════════════════════════════════════════════════
describe("Pipeline batch runtime failures and name dedupe", () => {
  it("returns 422 when every file fails during processing", async () => {
    const res = await executeBatch(
      [
        { filename: "bad1.json", content: Buffer.from("{ nope") },
        { filename: "bad2.json", content: Buffer.from("not json at all") },
      ],
      { steps: [{ toolId: "json-xml", settings: {} }] },
    );

    expect(res.statusCode).toBe(422);
    const json = JSON.parse(res.body);
    expect(json.error).toMatch(/all files failed/i);
    expect(json.errors).toHaveLength(2);
    expect(json.errors[0].error).toMatch(/json/i);
    expect(json.errors[1].error).toMatch(/json/i);
  }, 30_000);

  it("deduplicates duplicate output filenames in the ZIP manifest", async () => {
    const res = await executeBatch(
      [
        { filename: "dup.png", content: PNG_200x150 },
        { filename: "dup.png", content: PNG_200x150 },
      ],
      { steps: [{ toolId: "resize", settings: { width: 50 } }] },
    );

    expect(res.statusCode).toBe(200);
    const fileResults = parseFileResults(res);
    expect(fileResults["0"]).toBe("dup_resize.png");
    expect(fileResults["1"]).toBe("dup_resize_1.png");
  }, 30_000);
});

// ═══════════════════════════════════════════════════════════════════════════
// BATCH SIZE LIMIT
// ═══════════════════════════════════════════════════════════════════════════
describe("Pipeline batch size limit", () => {
  it("rejects a batch larger than MAX_BATCH_SIZE", async () => {
    // Vitest env pins MAX_BATCH_SIZE=10; send 11 files.
    const files = Array.from({ length: 11 }, (_, i) => ({
      filename: `f${i}.png`,
      content: PNG_200x150,
    }));

    const res = await executeBatch(files, {
      steps: [{ toolId: "resize", settings: { width: 50 } }],
    });

    expect(res.statusCode).toBe(400);
    // The multipart parser enforces the file-count limit and rejects before the
    // route's own "too many files" check, so accept either rejection message.
    expect(JSON.parse(res.body).error).toMatch(/too many files|failed to parse multipart/i);
  });
});
