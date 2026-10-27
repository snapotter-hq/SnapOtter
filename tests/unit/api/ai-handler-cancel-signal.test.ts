import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  blurFaces: vi.fn(),
  colorize: vi.fn(),
  detectFaceLandmarks: vi.fn(),
  detectFaces: vi.fn(),
  enhanceFaces: vi.fn(),
  isMemoryAllocError: vi.fn(),
  noiseRemoval: vi.fn(),
  outpaint: vi.fn(),
  removeBackground: vi.fn(),
  removeRedEye: vi.fn(),
  restorePhoto: vi.fn(),
}));

vi.mock("@snapotter/ai", () => mocks);

vi.mock("../../../apps/api/src/lib/feature-status.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../apps/api/src/lib/feature-status.js")>()),
  isToolInstalled: () => true,
}));

import { runAiToolJob } from "../../../apps/api/src/jobs/ai-handlers.js";
import type { ToolJobData } from "../../../apps/api/src/jobs/types.js";
import { getToolConfig, type ToolProcessCtx } from "../../../apps/api/src/routes/tool-factory.js";
import { registerAiCanvasExpand } from "../../../apps/api/src/routes/tools/ai-canvas-expand.js";
import { registerBlurFaces } from "../../../apps/api/src/routes/tools/blur-faces.js";
import { registerColorize } from "../../../apps/api/src/routes/tools/colorize.js";
import { registerEnhanceFaces } from "../../../apps/api/src/routes/tools/enhance-faces.js";
import { registerImageEnhancement } from "../../../apps/api/src/routes/tools/image-enhancement.js";
import { registerNoiseRemoval } from "../../../apps/api/src/routes/tools/noise-removal.js";
import { registerPassportPhoto } from "../../../apps/api/src/routes/tools/passport-photo.js";
import { registerRedEyeRemoval } from "../../../apps/api/src/routes/tools/red-eye-removal.js";
import { registerRestorePhoto } from "../../../apps/api/src/routes/tools/restore-photo.js";
import { registerSmartCrop } from "../../../apps/api/src/routes/tools/smart-crop.js";
import { registerTransparencyFixer } from "../../../apps/api/src/routes/tools/transparency-fixer.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

const PNG = readFixture(fixtures.image.base.png200);
const SCRATCH_DIR = join(tmpdir(), "snapotter-ai-cancel-signal-test");
const ABORT = Object.assign(new Error("Python script canceled"), { name: "AbortError" });

const fakeApp = { post: vi.fn() } as unknown as FastifyInstance;

let ctx: ToolProcessCtx;

beforeAll(() => {
  registerAiCanvasExpand(fakeApp);
  registerBlurFaces(fakeApp);
  registerColorize(fakeApp);
  registerEnhanceFaces(fakeApp);
  registerImageEnhancement(fakeApp);
  registerNoiseRemoval(fakeApp);
  registerPassportPhoto(fakeApp);
  registerRedEyeRemoval(fakeApp);
  registerRestorePhoto(fakeApp);
  registerSmartCrop(fakeApp);
  registerTransparencyFixer(fakeApp);
});

beforeEach(() => {
  vi.clearAllMocks();
  ctx = {
    signal: new AbortController().signal,
    scratchDir: SCRATCH_DIR,
    report: vi.fn(),
  };
  mocks.isMemoryAllocError.mockReturnValue(false);
  mocks.noiseRemoval.mockResolvedValue({
    buffer: PNG,
    width: 200,
    height: 150,
    format: "png",
    tier: "quality",
  });
});

function job(toolId: string, settings: unknown): ToolJobData {
  return {
    jobId: `job-${toolId}`,
    toolId,
    userId: null,
    pool: "ai",
    inputRefs: [`uploads/job-${toolId}/photo.png`],
    filename: "photo.png",
    settings,
    kind: "ai-tool",
  };
}

describe("AI job handlers forward the worker cancel signal (#2142)", () => {
  // A user cancel or worker timeout aborts ctx.signal. Without forwarding it,
  // the Python sidecar keeps running the whole inference for a dead job.
  it("ai-canvas-expand forwards ctx.signal to outpaint", async () => {
    mocks.outpaint.mockRejectedValue(ABORT);

    await expect(runAiToolJob(job("ai-canvas-expand", {}), PNG, ctx)).rejects.toBe(ABORT);

    expect(mocks.outpaint).toHaveBeenCalledWith(
      PNG,
      expect.objectContaining({ signal: ctx.signal }),
      SCRATCH_DIR,
      expect.any(Function),
    );
  });

  it("blur-faces forwards ctx.signal to blurFaces", async () => {
    mocks.blurFaces.mockRejectedValue(ABORT);

    await expect(runAiToolJob(job("blur-faces", {}), PNG, ctx)).rejects.toBe(ABORT);

    expect(mocks.blurFaces).toHaveBeenCalledWith(
      PNG,
      SCRATCH_DIR,
      expect.objectContaining({ signal: ctx.signal }),
      expect.any(Function),
    );
  });

  it("colorize forwards ctx.signal to colorize", async () => {
    mocks.colorize.mockRejectedValue(ABORT);

    await expect(runAiToolJob(job("colorize", {}), PNG, ctx)).rejects.toBe(ABORT);

    expect(mocks.colorize).toHaveBeenCalledWith(
      PNG,
      SCRATCH_DIR,
      expect.objectContaining({ signal: ctx.signal }),
      expect.any(Function),
    );
  });

  it("enhance-faces forwards ctx.signal to enhanceFaces", async () => {
    mocks.enhanceFaces.mockRejectedValue(ABORT);

    await expect(runAiToolJob(job("enhance-faces", {}), PNG, ctx)).rejects.toBe(ABORT);

    expect(mocks.enhanceFaces).toHaveBeenCalledWith(
      PNG,
      SCRATCH_DIR,
      expect.objectContaining({ signal: ctx.signal }),
      expect.any(Function),
    );
  });

  it("noise-removal forwards ctx.signal to noiseRemoval", async () => {
    mocks.noiseRemoval.mockRejectedValue(ABORT);

    await expect(runAiToolJob(job("noise-removal", {}), PNG, ctx)).rejects.toBe(ABORT);

    expect(mocks.noiseRemoval).toHaveBeenCalledWith(
      PNG,
      SCRATCH_DIR,
      expect.objectContaining({ signal: ctx.signal }),
      expect.any(Function),
    );
  });

  it("red-eye-removal forwards ctx.signal to removeRedEye", async () => {
    mocks.removeRedEye.mockRejectedValue(ABORT);

    await expect(runAiToolJob(job("red-eye-removal", {}), PNG, ctx)).rejects.toBe(ABORT);

    expect(mocks.removeRedEye).toHaveBeenCalledWith(
      PNG,
      SCRATCH_DIR,
      expect.objectContaining({ signal: ctx.signal }),
      expect.any(Function),
    );
  });

  it("restore-photo forwards ctx.signal to restorePhoto", async () => {
    mocks.restorePhoto.mockRejectedValue(ABORT);

    await expect(runAiToolJob(job("restore-photo", {}), PNG, ctx)).rejects.toBe(ABORT);

    expect(mocks.restorePhoto).toHaveBeenCalledWith(
      PNG,
      SCRATCH_DIR,
      expect.objectContaining({ signal: ctx.signal }),
      expect.any(Function),
    );
  });

  it("transparency-fixer forwards ctx.signal to removeBackground", async () => {
    mocks.removeBackground.mockRejectedValue(ABORT);

    await expect(runAiToolJob(job("transparency-fixer", {}), PNG, ctx)).rejects.toBe(ABORT);

    expect(mocks.removeBackground).toHaveBeenCalledWith(
      PNG,
      SCRATCH_DIR,
      expect.objectContaining({ signal: ctx.signal }),
      expect.any(Function),
    );
  });
});

describe("AI pipeline processors forward the worker cancel signal (#2142)", () => {
  async function process(toolId: string, settings: unknown): Promise<unknown> {
    const config = getToolConfig(toolId);
    if (!config) throw new Error(`No tool config for ${toolId}`);
    const parsed = config.settingsSchema.parse(settings);
    return config.process(PNG, parsed, "photo.png", ctx);
  }

  it("ai-canvas-expand pipeline processor forwards ctx.signal to outpaint", async () => {
    mocks.outpaint.mockRejectedValue(ABORT);

    await expect(process("ai-canvas-expand", {})).rejects.toBe(ABORT);

    expect(mocks.outpaint).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ signal: ctx.signal }),
      SCRATCH_DIR,
    );
  });

  it("blur-faces pipeline processor forwards ctx.signal to blurFaces", async () => {
    mocks.blurFaces.mockRejectedValue(ABORT);

    await expect(process("blur-faces", {})).rejects.toBe(ABORT);

    expect(mocks.blurFaces).toHaveBeenCalledWith(
      expect.any(Buffer),
      SCRATCH_DIR,
      expect.objectContaining({ signal: ctx.signal }),
      expect.any(Function),
    );
  });

  it("colorize pipeline processor forwards ctx.signal to colorize", async () => {
    mocks.colorize.mockRejectedValue(ABORT);

    await expect(process("colorize", {})).rejects.toBe(ABORT);

    expect(mocks.colorize).toHaveBeenCalledWith(
      expect.any(Buffer),
      SCRATCH_DIR,
      expect.objectContaining({ signal: ctx.signal }),
      expect.any(Function),
    );
  });

  it("enhance-faces pipeline processor forwards ctx.signal to enhanceFaces", async () => {
    mocks.enhanceFaces.mockRejectedValue(ABORT);

    await expect(process("enhance-faces", {})).rejects.toBe(ABORT);

    expect(mocks.enhanceFaces).toHaveBeenCalledWith(
      expect.any(Buffer),
      SCRATCH_DIR,
      expect.objectContaining({ signal: ctx.signal }),
      expect.any(Function),
    );
  });

  it("noise-removal pipeline processor forwards ctx.signal to noiseRemoval", async () => {
    mocks.noiseRemoval.mockRejectedValue(ABORT);

    await expect(process("noise-removal", {})).rejects.toBe(ABORT);

    expect(mocks.noiseRemoval).toHaveBeenCalledWith(
      expect.any(Buffer),
      SCRATCH_DIR,
      expect.objectContaining({ signal: ctx.signal }),
      expect.any(Function),
    );
  });

  it("red-eye-removal pipeline processor forwards ctx.signal to removeRedEye", async () => {
    mocks.removeRedEye.mockRejectedValue(ABORT);

    await expect(process("red-eye-removal", {})).rejects.toBe(ABORT);

    expect(mocks.removeRedEye).toHaveBeenCalledWith(
      expect.any(Buffer),
      SCRATCH_DIR,
      expect.objectContaining({ signal: ctx.signal }),
      expect.any(Function),
    );
  });

  it("restore-photo pipeline processor forwards ctx.signal to restorePhoto", async () => {
    mocks.restorePhoto.mockRejectedValue(ABORT);

    await expect(process("restore-photo", {})).rejects.toBe(ABORT);

    expect(mocks.restorePhoto).toHaveBeenCalledWith(
      expect.any(Buffer),
      SCRATCH_DIR,
      expect.objectContaining({ signal: ctx.signal }),
      expect.any(Function),
    );
  });

  it("transparency-fixer pipeline processor forwards ctx.signal to removeBackground", async () => {
    mocks.removeBackground.mockRejectedValue(ABORT);

    await expect(process("transparency-fixer", {})).rejects.toBe(ABORT);

    expect(mocks.removeBackground).toHaveBeenCalledWith(
      expect.any(Buffer),
      SCRATCH_DIR,
      expect.objectContaining({ signal: ctx.signal }),
      expect.any(Function),
    );
  });

  it("smart-crop pipeline processor forwards ctx.signal to detectFaces", async () => {
    mocks.detectFaces.mockRejectedValue(ABORT);

    await expect(process("smart-crop", { mode: "face" })).rejects.toBe(ABORT);

    expect(mocks.detectFaces).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ signal: ctx.signal, toolId: "smart-crop" }),
    );
  });

  it("passport-photo pipeline processor forwards ctx.signal to detectFaceLandmarks", async () => {
    mocks.detectFaceLandmarks.mockRejectedValue(ABORT);

    await expect(process("passport-photo", { countryCode: "US" })).rejects.toBe(ABORT);

    expect(mocks.detectFaceLandmarks).toHaveBeenCalledWith(expect.any(Buffer), undefined, {
      toolId: "passport-photo",
      signal: ctx.signal,
    });
  });

  it("passport-photo pipeline processor forwards ctx.signal to removeBackground", async () => {
    mocks.detectFaceLandmarks.mockResolvedValue({
      faceDetected: true,
      landmarks: {
        leftEye: { x: 10, y: 10 },
        rightEye: { x: 20, y: 10 },
        eyeCenter: { x: 15, y: 10 },
        chin: { x: 15, y: 40 },
        forehead: { x: 15, y: 2 },
        crown: { x: 15, y: 0 },
        nose: { x: 15, y: 25 },
        faceCenterX: 15,
      },
      imageWidth: 200,
      imageHeight: 150,
    });
    mocks.removeBackground.mockRejectedValue(ABORT);

    await expect(process("passport-photo", { countryCode: "US" })).rejects.toBe(ABORT);

    expect(mocks.removeBackground).toHaveBeenCalledWith(expect.any(Buffer), expect.any(String), {
      model: "birefnet-portrait",
      toolId: "passport-photo",
      signal: ctx.signal,
    });
  });

  it("image-enhancement deep enhance forwards ctx.signal to noiseRemoval", async () => {
    await expect(process("image-enhancement", { deepEnhance: true })).resolves.toBeDefined();

    expect(mocks.noiseRemoval).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.any(String),
      expect.objectContaining({ signal: ctx.signal, toolId: "image-enhancement" }),
    );
  });

  it("image-enhancement propagates a cancel instead of degrading to the Sharp-only result", async () => {
    const controller = new AbortController();
    ctx = { ...ctx, signal: controller.signal };
    mocks.noiseRemoval.mockImplementation(async () => {
      controller.abort();
      throw ABORT;
    });

    await expect(process("image-enhancement", { deepEnhance: true })).rejects.toBe(ABORT);
  });

  it("image-enhancement still degrades when a real failure races a cancel", async () => {
    const controller = new AbortController();
    ctx = { ...ctx, signal: controller.signal };
    mocks.noiseRemoval.mockImplementation(async () => {
      controller.abort();
      throw new Error("SCUNet boom");
    });

    await expect(process("image-enhancement", { deepEnhance: true })).resolves.toBeDefined();
  });
});
