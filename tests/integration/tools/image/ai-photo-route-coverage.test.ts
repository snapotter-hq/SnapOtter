/**
 * Sidecar-free route coverage for async AI photo tools.
 *
 * These routes perform their own multipart parsing, image validation, settings
 * parsing, object storage writes, and AI queue enqueueing before Python runs.
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
    "blur-background",
    "colorize",
    "enhance-faces",
    "noise-removal",
    "red-eye-removal",
    "restore-photo",
    "transparency-fixer",
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

function postTool(
  toolId: string,
  fields: Parameters<typeof createMultipartPayload>[0],
  modality = "image",
) {
  const { body, contentType } = createMultipartPayload(fields);
  return app.inject({
    method: "POST",
    url: `/api/v1/tools/${modality}/${toolId}`,
    headers: {
      authorization: `Bearer ${adminToken}`,
      "content-type": contentType,
    },
    body,
  });
}

function imageField(filename = "photo.png") {
  return { name: "file", filename, contentType: "image/png", content: PNG };
}

async function postValid(toolId: string, settings: Record<string, unknown>, clientJobId?: string) {
  return postTool(toolId, [
    imageField(),
    { name: "settings", content: JSON.stringify(settings) },
    ...(clientJobId ? [{ name: "clientJobId", content: clientJobId }] : []),
    { name: "fileId", content: `file-${toolId}` },
  ]);
}

function expectEnqueued(toolId: string, settings: Record<string, unknown>) {
  expect(mocks.enqueueToolJob).toHaveBeenCalledWith(
    expect.objectContaining({
      toolId,
      pool: "ai",
      filename: "photo.png",
      inputRefs: [expect.stringContaining("photo.png")],
      settings: expect.objectContaining(settings),
      fileId: `file-${toolId}`,
      kind: "ai-tool",
    }),
  );
}

describe("async AI photo routes", () => {
  it("colorize validates JSON settings and enqueues colorization jobs", async () => {
    const malformed = await postTool("colorize", [
      imageField(),
      { name: "settings", content: "{bad json" },
    ]);
    expect(malformed.statusCode).toBe(400);
    expect(JSON.parse(malformed.body)).toMatchObject({ error: "Settings must be valid JSON" });

    const clientJobId = "55555555-5555-4555-8555-555555555555";
    const res = await postValid("colorize", { intensity: 0.45, model: "opencv" }, clientJobId);
    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.body)).toEqual({ jobId: clientJobId, async: true });
    expectEnqueued("colorize", { intensity: 0.45, model: "opencv" });
  });

  it("noise-removal rejects invalid tiers and coerces numeric settings", async () => {
    const invalid = await postValid("noise-removal", { tier: "ultra" });
    expect(invalid.statusCode).toBe(400);
    expect(JSON.parse(invalid.body)).toMatchObject({ error: "Invalid settings" });
    expect(mocks.enqueueToolJob).not.toHaveBeenCalled();

    const res = await postValid("noise-removal", {
      tier: "quality",
      strength: "42",
      detailPreservation: "66",
      colorNoise: "18",
      format: "webp",
      quality: "82",
    });
    expect(res.statusCode).toBe(202);
    expectEnqueued("noise-removal", {
      tier: "quality",
      strength: 42,
      detailPreservation: 66,
      colorNoise: 18,
      format: "webp",
      quality: 82,
    });
  });

  it("restore-photo enforces bounded restoration settings before enqueueing", async () => {
    const invalid = await postValid("restore-photo", { fidelity: 1.5 });
    expect(invalid.statusCode).toBe(400);
    expect(JSON.parse(invalid.body)).toMatchObject({ error: "Invalid settings" });
    expect(mocks.enqueueToolJob).not.toHaveBeenCalled();

    const res = await postValid("restore-photo", {
      scratchRemoval: false,
      faceEnhancement: true,
      fidelity: 0.6,
      denoise: true,
      denoiseStrength: 35,
      colorize: true,
      colorizeStrength: 75,
    });
    expect(res.statusCode).toBe(202);
    expectEnqueued("restore-photo", {
      scratchRemoval: false,
      faceEnhancement: true,
      fidelity: 0.6,
      denoise: true,
      denoiseStrength: 35,
      colorize: true,
      colorizeStrength: 75,
    });
  });

  it("enhance-faces validates model settings and preserves client file metadata", async () => {
    const invalid = await postValid("enhance-faces", { strength: 2 });
    expect(invalid.statusCode).toBe(400);
    expect(JSON.parse(invalid.body)).toMatchObject({ error: "Invalid settings" });
    expect(mocks.enqueueToolJob).not.toHaveBeenCalled();

    const res = await postValid("enhance-faces", {
      model: "codeformer",
      strength: 0.6,
      onlyCenterFace: true,
      sensitivity: 0.7,
    });
    expect(res.statusCode).toBe(202);
    expectEnqueued("enhance-faces", {
      model: "codeformer",
      strength: 0.6,
      onlyCenterFace: true,
      sensitivity: 0.7,
    });
  });

  it("red-eye-removal validates quality and enqueues correction settings", async () => {
    const invalid = await postValid("red-eye-removal", { quality: 101 });
    expect(invalid.statusCode).toBe(400);
    expect(JSON.parse(invalid.body)).toMatchObject({ error: "Invalid settings" });
    expect(mocks.enqueueToolJob).not.toHaveBeenCalled();

    const res = await postValid("red-eye-removal", {
      sensitivity: 40,
      strength: 80,
      format: "webp",
      quality: 75,
    });
    expect(res.statusCode).toBe(202);
    expectEnqueued("red-eye-removal", {
      sensitivity: 40,
      strength: 80,
      format: "webp",
      quality: 75,
    });
  });

  it("blur-background rejects invalid output settings and enqueues valid blur jobs", async () => {
    const invalid = await postValid("blur-background", { intensity: 0, format: "jpeg" });
    expect(invalid.statusCode).toBe(400);
    expect(JSON.parse(invalid.body)).toMatchObject({ error: "Invalid settings" });
    expect(mocks.enqueueToolJob).not.toHaveBeenCalled();

    const res = await postValid("blur-background", {
      intensity: 65,
      feather: 5,
      format: "webp",
    });
    expect(res.statusCode).toBe(202);
    expectEnqueued("blur-background", {
      intensity: 65,
      feather: 5,
      format: "webp",
    });
  });

  it("transparency-fixer validates output format and enqueues defringe settings", async () => {
    const invalid = await postValid("transparency-fixer", { outputFormat: "jpg" });
    expect(invalid.statusCode).toBe(400);
    expect(JSON.parse(invalid.body)).toMatchObject({ error: "Invalid settings" });
    expect(mocks.enqueueToolJob).not.toHaveBeenCalled();

    const res = await postValid("transparency-fixer", {
      defringe: 45,
      outputFormat: "webp",
      removeWatermark: true,
    });
    expect(res.statusCode).toBe(202);
    expectEnqueued("transparency-fixer", {
      defringe: 45,
      outputFormat: "webp",
      removeWatermark: true,
    });
  });

  it("shared multipart guard rejects missing files before enqueueing", async () => {
    const res = await postTool("enhance-faces", [
      { name: "settings", content: JSON.stringify({}) },
    ]);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: "No image file provided" });
    expect(mocks.enqueueToolJob).not.toHaveBeenCalled();
  });
});
