/**
 * Concurrent request integration tests for the SnapOtter image API.
 *
 * Tests that the server handles parallel and rapid sequential requests
 * correctly without data corruption, crashes, or race conditions.
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
const JPG_100x100 = readFileSync(join(FIXTURES, "test-100x100.jpg"));

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

/** Helper to build an inject config for a tool request. */
function buildToolRequest(
  toolId: string,
  image: Buffer,
  filename: string,
  settings: Record<string, unknown>,
) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, content: image, contentType: "image/png" },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return {
    method: "POST" as const,
    url: `/api/v1/tools/${toolId}`,
    headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
    body,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PARALLEL UPLOADS TO SAME TOOL
// ═══════════════════════════════════════════════════════════════════════════
describe("Parallel uploads to the same tool", () => {
  it("handles 5 simultaneous resize requests", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        app.inject(
          buildToolRequest("resize", PNG_200x150, `parallel-${i}.png`, { width: 50 + i * 10 }),
        ),
      ),
    );

    for (const res of results) {
      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.jobId).toBeDefined();
      expect(json.downloadUrl).toBeDefined();
    }

    // Each request should get a unique jobId
    const jobIds = results.map((r) => JSON.parse(r.body).jobId);
    const uniqueJobIds = new Set(jobIds);
    expect(uniqueJobIds.size).toBe(5);
  }, 30_000);
});

// ═══════════════════════════════════════════════════════════════════════════
// PARALLEL UPLOADS TO DIFFERENT TOOLS
// ═══════════════════════════════════════════════════════════════════════════
describe("Parallel uploads to different tools", () => {
  it("handles resize + rotate + compress simultaneously", async () => {
    const [resizeRes, rotateRes, compressRes] = await Promise.all([
      app.inject(buildToolRequest("resize", PNG_200x150, "resize.png", { width: 100 })),
      app.inject(buildToolRequest("rotate", PNG_200x150, "rotate.png", { angle: 90 })),
      app.inject(buildToolRequest("compress", PNG_200x150, "compress.png", { quality: 50 })),
    ]);

    expect(resizeRes.statusCode).toBe(200);
    expect(rotateRes.statusCode).toBe(200);
    expect(compressRes.statusCode).toBe(200);

    // Each result should have a distinct jobId
    const ids = [resizeRes, rotateRes, compressRes].map((r) => JSON.parse(r.body).jobId);
    expect(new Set(ids).size).toBe(3);
  }, 30_000);
});

// ═══════════════════════════════════════════════════════════════════════════
// RAPID SEQUENTIAL REQUESTS
// ═══════════════════════════════════════════════════════════════════════════
describe("Rapid sequential requests", () => {
  it("handles 10 requests in quick succession", async () => {
    const results = [];
    for (let i = 0; i < 10; i++) {
      const res = await app.inject(
        buildToolRequest("resize", PNG_200x150, `rapid-${i}.png`, { width: 80 }),
      );
      results.push(res);
    }

    for (const res of results) {
      expect(res.statusCode).toBe(200);
    }

    // All should produce unique job IDs
    const jobIds = results.map((r) => JSON.parse(r.body).jobId);
    expect(new Set(jobIds).size).toBe(10);
  }, 30_000);
});

// ═══════════════════════════════════════════════════════════════════════════
// INTERLEAVED UPLOADS
// ═══════════════════════════════════════════════════════════════════════════
describe("Interleaved uploads", () => {
  it("processes two resize requests started nearly simultaneously", async () => {
    // Start both at the same time — both should complete independently
    const [first, second] = await Promise.all([
      app.inject(buildToolRequest("resize", PNG_200x150, "interleave-a.png", { width: 120 })),
      app.inject(buildToolRequest("resize", JPG_100x100, "interleave-b.jpg", { width: 60 })),
    ]);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);

    const firstBody = JSON.parse(first.body);
    const secondBody = JSON.parse(second.body);

    // Each should get its own job ID and download URL
    expect(firstBody.jobId).not.toBe(secondBody.jobId);
    expect(firstBody.downloadUrl).not.toBe(secondBody.downloadUrl);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CONCURRENT MIX OF VALID AND INVALID REQUESTS
// ═══════════════════════════════════════════════════════════════════════════
describe("Concurrent mix of valid and invalid requests", () => {
  it("handles a mix of valid and invalid requests without cross-contamination", async () => {
    const corruptedJpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.from("garbage data that is not a real image"),
    ]);

    const [validRes, invalidRes, anotherValidRes] = await Promise.all([
      app.inject(buildToolRequest("resize", PNG_200x150, "valid.png", { width: 100 })),
      app.inject(buildToolRequest("resize", corruptedJpeg, "invalid.jpg", { width: 100 })),
      app.inject(buildToolRequest("rotate", PNG_200x150, "also-valid.png", { angle: 45 })),
    ]);

    // Valid requests should succeed
    expect(validRes.statusCode).toBe(200);
    expect(anotherValidRes.statusCode).toBe(200);

    // Invalid request should fail gracefully
    expect([400, 422]).toContain(invalidRes.statusCode);

    // The invalid request should not affect the valid ones
    expect(JSON.parse(validRes.body).jobId).toBeDefined();
    expect(JSON.parse(anotherValidRes.body).jobId).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10 SIMULTANEOUS UPLOADS TO SAME ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════
describe("10 simultaneous uploads to the same tool", () => {
  it("handles 10 concurrent resize requests with distinct widths", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        app.inject(
          buildToolRequest("resize", PNG_200x150, `concurrent-${i}.png`, { width: 20 + i * 10 }),
        ),
      ),
    );

    for (const res of results) {
      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.jobId).toBeDefined();
      expect(json.downloadUrl).toBeDefined();
    }

    // All 10 must produce unique job IDs
    const jobIds = results.map((r) => JSON.parse(r.body).jobId);
    expect(new Set(jobIds).size).toBe(10);
  }, 60_000);
});

// ═══════════════════════════════════════════════════════════════════════════
// MIXED TOOL REQUESTS IN PARALLEL — VERIFY NO RESPONSE CORRUPTION
// ═══════════════════════════════════════════════════════════════════════════
describe("Mixed tool requests in parallel with result verification", () => {
  it("resize + crop + rotate + compress simultaneously produce correct results", async () => {
    const [resizeRes, cropRes, rotateRes, compressRes] = await Promise.all([
      app.inject(buildToolRequest("resize", PNG_200x150, "mix-resize.png", { width: 50 })),
      app.inject(
        buildToolRequest("crop", PNG_200x150, "mix-crop.png", {
          left: 0,
          top: 0,
          width: 100,
          height: 100,
        }),
      ),
      app.inject(buildToolRequest("rotate", PNG_200x150, "mix-rotate.png", { angle: 180 })),
      app.inject(buildToolRequest("compress", PNG_200x150, "mix-compress.png", { quality: 30 })),
    ]);

    // All must succeed
    expect(resizeRes.statusCode).toBe(200);
    expect(cropRes.statusCode).toBe(200);
    expect(rotateRes.statusCode).toBe(200);
    expect(compressRes.statusCode).toBe(200);

    // All must have unique job IDs
    const ids = [resizeRes, cropRes, rotateRes, compressRes].map((r) => JSON.parse(r.body).jobId);
    expect(new Set(ids).size).toBe(4);

    // Resize output should be smaller than original
    const resizeBody = JSON.parse(resizeRes.body);
    expect(resizeBody.processedSize).toBeLessThan(resizeBody.originalSize);

    // Crop output should be smaller than original
    const cropBody = JSON.parse(cropRes.body);
    expect(cropBody.processedSize).toBeLessThan(cropBody.originalSize);

    // Download URLs must reference the correct tool suffix
    expect(resizeBody.downloadUrl).toContain("resize");
    expect(cropBody.downloadUrl).toContain("crop");
    expect(JSON.parse(rotateRes.body).downloadUrl).toContain("rotate");
    expect(JSON.parse(compressRes.body).downloadUrl).toContain("compress");
  }, 30_000);
});

// ═══════════════════════════════════════════════════════════════════════════
// CONCURRENT REQUESTS WITH DIFFERENT IMAGE FORMATS
// ═══════════════════════════════════════════════════════════════════════════
describe("Concurrent requests with different image formats", () => {
  it("processes PNG and JPEG simultaneously without cross-format contamination", async () => {
    const results = await Promise.all([
      app.inject(buildToolRequest("resize", PNG_200x150, "format-a.png", { width: 80 })),
      app.inject(buildToolRequest("resize", JPG_100x100, "format-b.jpg", { width: 50 })),
      app.inject(buildToolRequest("resize", PNG_200x150, "format-c.png", { width: 60 })),
      app.inject(buildToolRequest("resize", JPG_100x100, "format-d.jpg", { width: 40 })),
    ]);

    for (const res of results) {
      expect(res.statusCode).toBe(200);
    }

    // All unique job IDs
    const ids = results.map((r) => JSON.parse(r.body).jobId);
    expect(new Set(ids).size).toBe(4);
  }, 30_000);
});

// ═══════════════════════════════════════════════════════════════════════════
// 10 CONCURRENT COMPRESS REQUESTS
// ═══════════════════════════════════════════════════════════════════════════
describe("10 concurrent compress requests", () => {
  it("fires 10 simultaneous compress requests — all succeed with unique job IDs", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        app.inject(
          buildToolRequest("compress", PNG_200x150, `compress-${i}.png`, {
            quality: 30 + i * 5,
          }),
        ),
      ),
    );

    for (const res of results) {
      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.jobId).toBeDefined();
      expect(json.downloadUrl).toBeDefined();
    }

    const jobIds = results.map((r) => JSON.parse(r.body).jobId);
    expect(new Set(jobIds).size).toBe(10);
  }, 60_000);
});

// ═══════════════════════════════════════════════════════════════════════════
// SIMULTANEOUS BATCH + SINGLE REQUESTS
// ═══════════════════════════════════════════════════════════════════════════
describe("Simultaneous batch + single requests — no corruption", () => {
  it("runs a batch resize and a single resize at the same time", async () => {
    // Build batch request
    const batchPayload = createMultipartPayload([
      { name: "file", filename: "batch-a.png", content: PNG_200x150, contentType: "image/png" },
      { name: "file", filename: "batch-b.png", content: PNG_200x150, contentType: "image/png" },
      { name: "file", filename: "batch-c.jpg", content: JPG_100x100, contentType: "image/jpeg" },
      { name: "settings", content: JSON.stringify({ width: 60 }) },
    ]);

    const [batchRes, singleRes] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/api/v1/tools/resize/batch",
        headers: {
          "content-type": batchPayload.contentType,
          authorization: `Bearer ${adminToken}`,
        },
        body: batchPayload.body,
      }),
      app.inject(buildToolRequest("resize", PNG_200x150, "single.png", { width: 40 })),
    ]);

    // Single request must succeed
    expect(singleRes.statusCode).toBe(200);
    const singleBody = JSON.parse(singleRes.body);
    expect(singleBody.jobId).toBeDefined();
    expect(singleBody.downloadUrl).toContain("resize");

    // Batch request must succeed
    expect(batchRes.statusCode).toBe(200);
    expect(batchRes.headers["content-type"]).toBe("application/zip");
  }, 60_000);

  it("runs a batch compress and a single rotate at the same time — no cross-contamination", async () => {
    const batchPayload = createMultipartPayload([
      { name: "file", filename: "b1.png", content: PNG_200x150, contentType: "image/png" },
      { name: "file", filename: "b2.jpg", content: JPG_100x100, contentType: "image/jpeg" },
      { name: "settings", content: JSON.stringify({ quality: 50 }) },
    ]);

    const [batchRes, rotateRes] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/api/v1/tools/compress/batch",
        headers: {
          "content-type": batchPayload.contentType,
          authorization: `Bearer ${adminToken}`,
        },
        body: batchPayload.body,
      }),
      app.inject(buildToolRequest("rotate", PNG_200x150, "rotate-single.png", { angle: 270 })),
    ]);

    expect(rotateRes.statusCode).toBe(200);
    const rotateBody = JSON.parse(rotateRes.body);
    expect(rotateBody.downloadUrl).toContain("rotate");

    expect(batchRes.statusCode).toBe(200);
    expect(batchRes.headers["content-type"]).toBe("application/zip");
  }, 60_000);
});

// ═══════════════════════════════════════════════════════════════════════════
// CONCURRENT PIPELINE EXECUTIONS
// ═══════════════════════════════════════════════════════════════════════════
describe("Concurrent pipeline executions", () => {
  it("fires 5 simultaneous pipeline requests — all succeed", async () => {
    const pipelineDef = {
      steps: [
        { toolId: "resize", settings: { width: 80 } },
        { toolId: "compress", settings: { quality: 60 } },
      ],
    };

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => {
        const payload = createMultipartPayload([
          {
            name: "file",
            filename: `pipe-${i}.png`,
            content: PNG_200x150,
            contentType: "image/png",
          },
          { name: "pipeline", content: JSON.stringify(pipelineDef) },
        ]);
        return app.inject({
          method: "POST",
          url: "/api/v1/pipeline/execute",
          headers: {
            "content-type": payload.contentType,
            authorization: `Bearer ${adminToken}`,
          },
          body: payload.body,
        });
      }),
    );

    for (const res of results) {
      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.jobId).toBeDefined();
      expect(json.stepsCompleted).toBe(2);
    }

    const jobIds = results.map((r) => JSON.parse(r.body).jobId);
    expect(new Set(jobIds).size).toBe(5);
  }, 120_000);
});
