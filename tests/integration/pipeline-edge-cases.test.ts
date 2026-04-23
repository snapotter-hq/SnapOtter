/**
 * Pipeline edge-case integration tests for the ashim image API.
 *
 * Tests the pipeline execution system with unusual inputs: empty pipelines,
 * single steps, invalid tools, conflicting steps, and multi-step chains.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const FIXTURES = join(__dirname, "..", "fixtures");
const PNG_200x150 = readFileSync(join(FIXTURES, "test-200x150.png"));

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
    expect(json.error).toMatch(/no image/i);
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
