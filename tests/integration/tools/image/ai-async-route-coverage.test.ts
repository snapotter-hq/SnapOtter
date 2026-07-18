/**
 * Sidecar-free route coverage for custom async AI image tools.
 *
 * These routes hand-roll multipart parsing and enqueue AI jobs directly, so the
 * standard generated matrix mostly stops at the local bundle gate. This file
 * forces only these gates open and mocks enqueueing so validation and job
 * payload branches are covered without running Python models.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const mocks = vi.hoisted(() => ({
  enqueueToolJob: vi.fn(),
  forcedInstalledTools: new Set([
    "ai-canvas-expand",
    "background-replace",
    "erase-object",
    "upscale",
  ]),
}));

vi.mock("../../../../apps/api/src/lib/feature-status.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../../apps/api/src/lib/feature-status.js")>();
  return {
    ...actual,
    isToolInstalled: (toolId: string) =>
      mocks.forcedInstalledTools.has(toolId) ? true : actual.isToolInstalled(toolId),
  };
});

vi.mock("../../../../apps/api/src/jobs/enqueue.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../apps/api/src/jobs/enqueue.js")>();
  return {
    ...actual,
    enqueueToolJob: mocks.enqueueToolJob,
  };
});

const PNG = readFixture(fixtures.image.base.png200);
const MASK = PNG;

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

beforeEach(() => {
  mocks.enqueueToolJob.mockReset();
  mocks.enqueueToolJob.mockResolvedValue(undefined);
});

function postMultipart(url: string, fields: Parameters<typeof createMultipartPayload>[0]) {
  const { body, contentType } = createMultipartPayload(fields);
  return app.inject({
    method: "POST",
    url,
    headers: {
      authorization: `Bearer ${adminToken}`,
      "content-type": contentType,
    },
    body,
  });
}

function expectAsyncAccepted(body: string, clientJobId: string) {
  const artifactJobId = mocks.enqueueToolJob.mock.calls.at(-1)?.[0].jobId;
  expect(artifactJobId).toBeDefined();
  expect(JSON.parse(body)).toEqual({
    jobId: clientJobId,
    progressJobId: clientJobId,
    artifactJobId,
    async: true,
  });
}

describe("custom async AI image routes", () => {
  it("upscale validates input, coerces settings, and enqueues an AI job", async () => {
    const clientJobId = "22222222-2222-4222-8222-222222222222";
    const res = await postMultipart("/api/v1/tools/image/upscale", [
      { name: "file", filename: "photo.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ scale: "4", model: "auto", faceEnhance: true, denoise: "3" }),
      },
      { name: "clientJobId", content: clientJobId },
      { name: "fileId", content: "file-upscale" },
    ]);

    expect(res.statusCode).toBe(202);
    expectAsyncAccepted(res.body, clientJobId);
    expect(mocks.enqueueToolJob).toHaveBeenCalledWith(
      expect.objectContaining({
        toolId: "upscale",
        pool: "ai",
        filename: "photo.png",
        settings: expect.objectContaining({
          scale: 4,
          model: "auto",
          faceEnhance: true,
          denoise: 3,
        }),
        fileId: "file-upscale",
        kind: "ai-tool",
      }),
    );
  });

  it("upscale rejects missing files and malformed settings before enqueueing", async () => {
    const noFile = await postMultipart("/api/v1/tools/image/upscale", [
      { name: "settings", content: JSON.stringify({}) },
    ]);
    expect(noFile.statusCode).toBe(400);
    expect(JSON.parse(noFile.body)).toMatchObject({ error: "No image file provided" });

    const malformedSettings = await postMultipart("/api/v1/tools/image/upscale", [
      { name: "file", filename: "photo.png", contentType: "image/png", content: PNG },
      { name: "settings", content: "{bad json" },
    ]);
    expect(malformedSettings.statusCode).toBe(400);
    expect(JSON.parse(malformedSettings.body)).toMatchObject({
      error: "Settings must be valid JSON",
    });
    expect(mocks.enqueueToolJob).not.toHaveBeenCalled();
  });

  it("ai-canvas-expand validates directions before enqueueing", async () => {
    const noDirection = await postMultipart("/api/v1/tools/image/ai-canvas-expand", [
      { name: "file", filename: "canvas.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    expect(noDirection.statusCode).toBe(400);
    expect(JSON.parse(noDirection.body)).toMatchObject({
      error: "At least one extend direction must be greater than 0",
    });

    const invalidTier = await postMultipart("/api/v1/tools/image/ai-canvas-expand", [
      { name: "file", filename: "canvas.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ extendLeft: 20, tier: "ultra" }) },
    ]);
    expect(invalidTier.statusCode).toBe(400);
    expect(JSON.parse(invalidTier.body)).toMatchObject({ error: "Invalid settings" });

    expect(mocks.enqueueToolJob).not.toHaveBeenCalled();
  });

  it("ai-canvas-expand enqueues valid extension requests with client job metadata", async () => {
    const clientJobId = "33333333-3333-4333-8333-333333333333";
    const res = await postMultipart("/api/v1/tools/image/ai-canvas-expand", [
      { name: "file", filename: "canvas.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          extendTop: 12,
          extendRight: 24,
          tier: "fast",
          format: "webp",
          quality: 80,
        }),
      },
      { name: "clientJobId", content: clientJobId },
      { name: "fileId", content: "file-canvas" },
    ]);

    expect(res.statusCode).toBe(202);
    expectAsyncAccepted(res.body, clientJobId);
    expect(mocks.enqueueToolJob).toHaveBeenCalledWith(
      expect.objectContaining({
        toolId: "ai-canvas-expand",
        pool: "ai",
        filename: "canvas.png",
        settings: expect.objectContaining({
          extendTop: 12,
          extendRight: 24,
          tier: "fast",
          format: "webp",
          quality: 80,
        }),
        fileId: "file-canvas",
        kind: "ai-tool",
      }),
    );
  });

  it("background-replace validates color settings and enqueues gradient jobs", async () => {
    const invalidColor = await postMultipart("/api/v1/tools/image/background-replace", [
      { name: "file", filename: "subject.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ color: "red" }) },
    ]);
    expect(invalidColor.statusCode).toBe(400);
    expect(JSON.parse(invalidColor.body)).toMatchObject({ error: "Invalid settings" });
    expect(mocks.enqueueToolJob).not.toHaveBeenCalled();

    const res = await postMultipart("/api/v1/tools/image/background-replace", [
      { name: "file", filename: "subject.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          backgroundType: "gradient",
          gradientColor1: "#000000",
          gradientColor2: "#ffffff",
          gradientAngle: 45,
          feather: 4,
          format: "webp",
        }),
      },
    ]);

    expect(res.statusCode).toBe(202);
    expect(mocks.enqueueToolJob).toHaveBeenCalledWith(
      expect.objectContaining({
        toolId: "background-replace",
        pool: "ai",
        filename: "subject.png",
        settings: {
          backgroundType: "gradient",
          color: "#ffffff",
          gradientColor1: "#000000",
          gradientColor2: "#ffffff",
          gradientAngle: 45,
          feather: 4,
          format: "webp",
        },
        kind: "ai-tool",
      }),
    );
  });

  it("erase-object validates the required mask and output settings", async () => {
    const missingMask = await postMultipart("/api/v1/tools/image/erase-object", [
      { name: "file", filename: "subject.png", contentType: "image/png", content: PNG },
    ]);
    expect(missingMask.statusCode).toBe(400);
    expect(JSON.parse(missingMask.body)).toMatchObject({
      error: "No mask image provided. Upload a mask as a second file with fieldname 'mask'",
    });

    const invalidFormat = await postMultipart("/api/v1/tools/image/erase-object", [
      { name: "file", filename: "subject.png", contentType: "image/png", content: PNG },
      { name: "mask", filename: "mask.png", contentType: "image/png", content: MASK },
      { name: "format", content: "bmp" },
    ]);
    expect(invalidFormat.statusCode).toBe(400);
    expect(JSON.parse(invalidFormat.body)).toMatchObject({ error: "Invalid settings" });

    expect(mocks.enqueueToolJob).not.toHaveBeenCalled();
  });

  it("erase-object enqueues image and mask references for valid requests", async () => {
    const clientJobId = "44444444-4444-4444-8444-444444444444";
    const res = await postMultipart("/api/v1/tools/image/erase-object", [
      { name: "file", filename: "subject.png", contentType: "image/png", content: PNG },
      { name: "mask", filename: "mask.png", contentType: "image/png", content: MASK },
      { name: "format", content: "webp" },
      { name: "quality", content: "72" },
      { name: "clientJobId", content: clientJobId },
    ]);

    expect(res.statusCode).toBe(202);
    expectAsyncAccepted(res.body, clientJobId);
    expect(mocks.enqueueToolJob).toHaveBeenCalledWith(
      expect.objectContaining({
        toolId: "erase-object",
        pool: "ai",
        filename: "subject.png",
        inputRefs: expect.arrayContaining([
          expect.stringContaining("subject.png"),
          expect.stringContaining("mask.png"),
        ]),
        settings: { format: "webp", quality: 72, qualityMode: "fast" },
        kind: "ai-tool",
      }),
    );
  });
});
