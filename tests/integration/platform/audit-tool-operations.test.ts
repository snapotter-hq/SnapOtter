/**
 * Integration tests for TOOL_EXECUTED audit logging.
 *
 * Verifies that the createToolRoute factory emits audit entries when the
 * `auditToolOperations` admin setting is enabled and stays silent when it
 * is disabled (the default).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { waitForJob } from "../../../apps/api/src/jobs/enqueue.js";
import { isToolAuditEnabled } from "../../../apps/api/src/lib/audit.js";
import { recordCompletedToolJob } from "../../../apps/api/src/lib/completed-job.js";
import { logger } from "../../../apps/api/src/lib/logger.js";
import { putObject } from "../../../apps/api/src/lib/object-storage.js";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

const PNG = readFixture(fixtures.image.edge.px1);
const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#ff6600"/></svg>',
);

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
});

afterAll(async () => {
  await testApp.cleanup();
});

beforeEach(async () => {
  await db.delete(schema.auditLog);
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function setSetting(key: string, value: string): Promise<void> {
  const res = await testApp.app.inject({
    method: "PUT",
    url: "/api/v1/settings",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { [key]: value },
  });
  expect(res.statusCode).toBe(200);
}

async function fetchAuditLog(action: string): Promise<{ entries: any[]; total: number }> {
  const res = await testApp.app.inject({
    method: "GET",
    url: `/api/v1/audit-log?action=${action}`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.body);
}

async function processResize(): Promise<number> {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
    { name: "settings", content: JSON.stringify({ width: 1 }) },
  ]);

  const res = await testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/image/resize",
    headers: {
      authorization: `Bearer ${adminToken}`,
      "content-type": contentType,
    },
    body,
  });

  return res.statusCode;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("tool operation audit logging", () => {
  it("does not log TOOL_EXECUTED when auditToolOperations is disabled", async () => {
    await setSetting("auditToolOperations", "false");

    await processResize();

    // Small delay to ensure fire-and-forget audit would have landed
    await new Promise((r) => setTimeout(r, 200));

    const body = await fetchAuditLog("TOOL_EXECUTED");
    expect(body.total).toBe(0);
  });

  it("logs TOOL_EXECUTED when auditToolOperations is enabled", async () => {
    await setSetting("auditToolOperations", "true");

    const statusCode = await processResize();
    expect(statusCode).toBe(200);

    // Small delay for the fire-and-forget audit write to complete
    await new Promise((r) => setTimeout(r, 500));

    const body = await fetchAuditLog("TOOL_EXECUTED");
    expect(body.total).toBe(1);

    const entry = body.entries[0];
    expect(entry.action).toBe("TOOL_EXECUTED");
    expect(entry.targetType).toBe("tool");
    expect(entry.targetId).toBe("resize");
    expect(entry.actorUsername).toBe("admin");
    expect(entry.details.toolId).toBe("resize");
    expect(entry.details.status).toBe("success");
    expect(typeof entry.details.durationMs).toBe("number");
    expect(entry.details.inputFileCount).toBe(1);
    expect(typeof entry.details.totalInputSize).toBe("number");
    expect(entry.details.totalInputSize).toBeGreaterThan(0);
  });

  it("logs TOOL_EXECUTED when a long tool returns 202 and completes in the worker (#3973)", async () => {
    await setSetting("auditToolOperations", "true");

    // to-epub has executionHint: "long" in TOOLS and needs no AI bundle, so
    // createToolRoute skips waitForJob and returns 202 Accepted immediately.
    const toEpubConfig = getToolConfig("to-epub");
    const prevProcessV2 = toEpubConfig?.processV2;
    if (toEpubConfig) {
      toEpubConfig.processV2 = async () => ({
        buffer: Buffer.from("epub-bytes"),
        filename: "note.epub",
        contentType: "application/epub+zip",
      });
    }

    try {
      const { body: reqBody, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: "note.md",
          contentType: "text/markdown",
          content: Buffer.from("# Hello\n"),
        },
        { name: "settings", content: JSON.stringify({}) },
      ]);

      const res = await testApp.app.inject({
        method: "POST",
        url: "/api/v1/tools/files/to-epub",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        body: reqBody,
      });
      expect(res.statusCode).toBe(202);
      const { jobId } = JSON.parse(res.body) as { jobId: string; async: boolean };

      const result = await waitForJob("docs", jobId, 15_000);
      expect(result).toBeTruthy();

      const body = await fetchAuditLog("TOOL_EXECUTED");
      expect(body.total).toBe(1);
      const entry = body.entries[0];
      expect(entry.action).toBe("TOOL_EXECUTED");
      expect(entry.targetType).toBe("tool");
      expect(entry.targetId).toBe("to-epub");
      expect(entry.actorUsername).toBe("admin");
      expect(entry.ipAddress).toBeTruthy();
      expect(entry.requestId).toBeTruthy();
      expect(entry.details).toMatchObject({
        toolId: "to-epub",
        status: "success",
        inputFileCount: 1,
      });
    } finally {
      if (toEpubConfig) {
        toEpubConfig.processV2 = prevProcessV2;
      }
    }
  });

  it("logs TOOL_EXECUTED for custom routes outside createToolRoute and skips helper sub-routes (#3973)", async () => {
    await setSetting("auditToolOperations", "true");

    // 1. Generator custom route (JSON body, no file upload)
    const qrRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: { text: "https://snapotter.com", size: 128 },
    });
    expect(qrRes.statusCode).toBe(200);

    // 2. Reader custom route (multipart, returns JSON metadata)
    const infoPayload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
    ]);
    const infoRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/image/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": infoPayload.contentType,
      },
      body: infoPayload.body,
    });
    expect(infoRes.statusCode).toBe(200);

    // 3. Hijacked ZIP custom route (split)
    const splitPayload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ rows: 1, cols: 1 }) },
    ]);
    const splitRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/image/split",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": splitPayload.contentType,
      },
      body: splitPayload.body,
    });
    expect(splitRes.statusCode).toBe(200);

    // 4. Helper sub-route (/inspect) must NOT emit TOOL_EXECUTED
    const inspectPayload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
    ]);
    const inspectRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/image/strip-metadata/inspect",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": inspectPayload.contentType,
      },
      body: inspectPayload.body,
    });
    expect(inspectRes.statusCode).toBe(200);

    const body = await fetchAuditLog("TOOL_EXECUTED");
    const targetIds = body.entries.map((e) => e.targetId).sort();
    expect(targetIds).toEqual(["info", "qr-generate", "split"]);
    for (const entry of body.entries) {
      expect(entry.targetType).toBe("tool");
      expect(entry.actorUsername).toBe("admin");
      expect(entry.details.status).toBe("success");
    }
  });

  it("logs accurate inputFileCount and totalInputSize for inline custom routes omitting originalSize or inputFileCount (#3990)", async () => {
    await setSetting("auditToolOperations", "true");

    // 1. color-palette (returns { filename, colors, hex, count } without originalSize)
    const palettePayload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
    ]);
    const paletteRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/image/color-palette",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": palettePayload.contentType,
      },
      body: palettePayload.body,
    });
    expect(paletteRes.statusCode).toBe(200);

    // 2. barcode-read (returns { filename, barcodes, annotatedUrl, previewUrl } without originalSize)
    const barcodePayload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
    ]);
    const barcodeRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": barcodePayload.contentType,
      },
      body: barcodePayload.body,
    });
    expect(barcodeRes.statusCode).toBe(200);

    // 3. find-duplicates (multi-file upload, returns { totalImages, duplicateGroups, ... } without originalSize)
    const dupPayload = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
    ]);
    const dupRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/image/find-duplicates",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": dupPayload.contentType,
      },
      body: dupPayload.body,
    });
    expect(dupRes.statusCode).toBe(200);

    // 4. image-to-base64 (multi-file upload, returns { results, errors } without top-level originalSize)
    const b64Payload = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
    ]);
    const b64Res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-base64",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": b64Payload.contentType,
      },
      body: b64Payload.body,
    });
    expect(b64Res.statusCode).toBe(200);

    // 5. collage (multi-file upload, returns { jobId, downloadUrl, originalSize, processedSize } without inputFileCount)
    const collagePayload = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ templateId: "2-h-equal" }) },
    ]);
    const collageRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/image/collage",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": collagePayload.contentType,
      },
      body: collagePayload.body,
    });
    expect(collageRes.statusCode).toBe(200);

    // 6. passport-photo/generate (Phase 2 JSON route reading outputs/<jobId>/<stem>_nobg.png)
    const analyzeJobId = randomUUID();
    const [adminRow] = await db.select().from(schema.users).limit(1);
    const nobgKey = `outputs/${analyzeJobId}/photo_nobg.png`;
    await recordCompletedToolJob({
      jobId: analyzeJobId,
      userId: adminRow?.id ?? null,
      toolId: "passport-photo",
      outputRefs: [nobgKey],
    });
    await putObject(nobgKey, PNG);

    const passportRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/image/passport-photo/generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        jobId: analyzeJobId,
        filename: "photo.png",
        countryCode: "US",
        imageWidth: 200,
        imageHeight: 200,
        landmarks: {
          leftEye: { x: 0.4, y: 0.4 },
          rightEye: { x: 0.6, y: 0.4 },
          eyeCenter: { x: 0.5, y: 0.4 },
          chin: { x: 0.5, y: 0.7 },
          forehead: { x: 0.5, y: 0.25 },
          crown: { x: 0.5, y: 0.2 },
          nose: { x: 0.5, y: 0.5 },
          faceCenterX: 0.5,
        },
      },
    });
    expect(passportRes.statusCode).toBe(200);

    const body = await fetchAuditLog("TOOL_EXECUTED");
    const byTool = new Map(body.entries.map((e) => [e.targetId, e]));

    expect(byTool.get("color-palette")?.details).toMatchObject({
      toolId: "color-palette",
      inputFileCount: 1,
      totalInputSize: PNG.length,
    });
    expect(byTool.get("barcode-read")?.details).toMatchObject({
      toolId: "barcode-read",
      inputFileCount: 1,
      totalInputSize: PNG.length,
    });
    expect(byTool.get("find-duplicates")?.details).toMatchObject({
      toolId: "find-duplicates",
      inputFileCount: 2,
      totalInputSize: PNG.length * 2,
    });
    expect(byTool.get("image-to-base64")?.details).toMatchObject({
      toolId: "image-to-base64",
      inputFileCount: 2,
      totalInputSize: PNG.length * 2,
    });
    expect(byTool.get("collage")?.details).toMatchObject({
      toolId: "collage",
      inputFileCount: 2,
      totalInputSize: PNG.length * 2,
    });
    expect(byTool.get("passport-photo")?.details).toMatchObject({
      toolId: "passport-photo",
      inputFileCount: 1,
      totalInputSize: PNG.length,
    });
  });

  it("logs BATCH_EXECUTED for both generic and custom batch runs without per-child TOOL_EXECUTED (#3973)", async () => {
    await setSetting("auditToolOperations", "true");

    // 1. Generic BullMQ batch route (POST /api/v1/tools/:section/:toolId/batch)
    const batchPayload = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ quality: 80 }) },
    ]);
    const batchRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compress/batch",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": batchPayload.contentType,
      },
      body: batchPayload.body,
    });
    expect(batchRes.statusCode).toBe(200);

    // 2. Custom inline batch route (POST /api/v1/tools/image/svg-to-raster/batch)
    const svgBatchPayload = createMultipartPayload([
      { name: "file", filename: "a.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ outputFormat: "png", dpi: 72 }) },
    ]);
    const svgBatchRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/image/svg-to-raster/batch",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": svgBatchPayload.contentType,
      },
      body: svgBatchPayload.body,
    });
    expect(svgBatchRes.statusCode).toBe(200);

    const batchAudit = await fetchAuditLog("BATCH_EXECUTED");
    expect(batchAudit.total).toBe(2);
    const byTarget = new Map(batchAudit.entries.map((e) => [e.targetId, e]));

    const compressEntry = byTarget.get("compress");
    expect(compressEntry).toBeTruthy();
    expect(compressEntry.targetType).toBe("tool");
    expect(compressEntry.actorUsername).toBe("admin");
    expect(compressEntry.details).toMatchObject({
      toolId: "compress",
      totalFiles: 2,
      completedFiles: 2,
      failedFiles: 0,
      status: "success",
    });

    const svgEntry = byTarget.get("svg-to-raster");
    expect(svgEntry).toBeTruthy();
    expect(svgEntry.targetType).toBe("tool");
    expect(svgEntry.actorUsername).toBe("admin");
    expect(svgEntry.details).toMatchObject({
      toolId: "svg-to-raster",
      totalFiles: 1,
      completedFiles: 1,
      failedFiles: 0,
      status: "success",
    });

    // Batch children must not emit individual TOOL_EXECUTED rows
    const toolAudit = await fetchAuditLog("TOOL_EXECUTED");
    expect(toolAudit.total).toBe(0);
  });

  it("logs PIPELINE_EXECUTED for single-file pipelines and BATCH_EXECUTED for pipeline batches (#3973)", async () => {
    await setSetting("auditToolOperations", "true");

    // 1. Single-file pipeline (POST /api/v1/pipeline/execute)
    const pipePayload = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "pipeline",
        content: JSON.stringify({
          steps: [
            { toolId: "resize", settings: { width: 1 } },
            { toolId: "rotate", settings: { angle: 90 } },
          ],
        }),
      },
    ]);
    const pipeRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/pipeline/execute",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": pipePayload.contentType,
      },
      body: pipePayload.body,
    });
    expect(pipeRes.statusCode).toBe(200);

    const pipeAudit = await fetchAuditLog("PIPELINE_EXECUTED");
    expect(pipeAudit.total).toBe(1);
    const pipeEntry = pipeAudit.entries[0];
    expect(pipeEntry.action).toBe("PIPELINE_EXECUTED");
    expect(pipeEntry.targetType).toBe("tool");
    expect(pipeEntry.targetId).toBe("pipeline");
    expect(pipeEntry.actorUsername).toBe("admin");
    expect(pipeEntry.details).toMatchObject({
      toolId: "pipeline",
      stepCount: 2,
      steps: ["resize", "rotate"],
      inputFileCount: 1,
      status: "success",
    });

    // Pipeline steps must not emit individual TOOL_EXECUTED rows
    const toolAudit = await fetchAuditLog("TOOL_EXECUTED");
    expect(toolAudit.total).toBe(0);

    // 2. Pipeline batch (POST /api/v1/pipeline/batch)
    const pipeBatchPayload = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
      {
        name: "pipeline",
        content: JSON.stringify({
          steps: [{ toolId: "resize", settings: { width: 1 } }],
        }),
      },
    ]);
    const pipeBatchRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/pipeline/batch",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": pipeBatchPayload.contentType,
      },
      body: pipeBatchPayload.body,
    });
    expect(pipeBatchRes.statusCode).toBe(200);

    const batchAudit = await fetchAuditLog("BATCH_EXECUTED");
    expect(batchAudit.total).toBe(1);
    expect(batchAudit.entries[0].targetId).toBe("pipeline-batch");
    expect(batchAudit.entries[0].details).toMatchObject({
      toolId: "pipeline-batch",
      totalFiles: 2,
      completedFiles: 2,
      failedFiles: 0,
      status: "success",
    });

    // Per-file pipeline-finalize children in a pipeline batch must not emit extra PIPELINE_EXECUTED rows
    const pipeAuditAfterBatch = await fetchAuditLog("PIPELINE_EXECUTED");
    expect(pipeAuditAfterBatch.total).toBe(1);
  });

  it("logs a warning and falls back to false when reading auditToolOperations fails (#3238)", async () => {
    const dbError = new Error("connection terminated unexpectedly");
    const selectSpy = vi.spyOn(db, "select").mockImplementationOnce(() => {
      throw dbError;
    });
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    try {
      await expect(isToolAuditEnabled()).resolves.toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        { err: dbError, key: "auditToolOperations" },
        "Failed to read auditToolOperations setting",
      );
    } finally {
      selectSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});
