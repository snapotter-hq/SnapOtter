import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  colorize,
  enhanceFaces,
  isMemoryAllocError,
  noiseRemoval,
  removeBackground,
  removeRedEye,
  restorePhoto,
} from "@snapotter/ai";
import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runAiToolJob } from "../../../apps/api/src/jobs/ai-handlers.js";
import type { ToolJobData } from "../../../apps/api/src/jobs/types.js";
import type { ToolProcessCtx } from "../../../apps/api/src/routes/tool-factory.js";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerColorize } from "../../../apps/api/src/routes/tools/colorize.js";
import { registerEnhanceFaces } from "../../../apps/api/src/routes/tools/enhance-faces.js";
import { registerNoiseRemoval } from "../../../apps/api/src/routes/tools/noise-removal.js";
import { registerRedEyeRemoval } from "../../../apps/api/src/routes/tools/red-eye-removal.js";
import { registerRestorePhoto } from "../../../apps/api/src/routes/tools/restore-photo.js";
import { registerTransparencyFixer } from "../../../apps/api/src/routes/tools/transparency-fixer.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

const aiMocks = vi.hoisted(() => ({
  colorize: vi.fn(),
  enhanceFaces: vi.fn(),
  isMemoryAllocError: vi.fn(),
  noiseRemoval: vi.fn(),
  removeBackground: vi.fn(),
  removeRedEye: vi.fn(),
  restorePhoto: vi.fn(),
}));

vi.mock("@snapotter/ai", () => ({
  colorize: aiMocks.colorize,
  enhanceFaces: aiMocks.enhanceFaces,
  isMemoryAllocError: aiMocks.isMemoryAllocError,
  noiseRemoval: aiMocks.noiseRemoval,
  removeBackground: aiMocks.removeBackground,
  removeRedEye: aiMocks.removeRedEye,
  restorePhoto: aiMocks.restorePhoto,
}));

const PNG = readFixture(fixtures.image.base.png200);
const SCRATCH_DIR = join(tmpdir(), "snapotter-ai-handler-test");

const ctx: ToolProcessCtx = {
  signal: new AbortController().signal,
  scratchDir: SCRATCH_DIR,
  report: vi.fn(),
};

const fakeApp = {
  post: vi.fn(),
} as unknown as FastifyInstance;

function job(toolId: string, settings: unknown, filename = "photo.png"): ToolJobData {
  return {
    jobId: `job-${toolId}`,
    toolId,
    userId: null,
    pool: "ai",
    inputRefs: [`uploads/job-${toolId}/${filename}`],
    filename,
    settings,
    kind: "ai-tool",
  };
}

function resetAiMocks() {
  vi.mocked(colorize).mockResolvedValue({
    buffer: PNG,
    width: 200,
    height: 150,
    method: "mock-colorizer",
  });
  vi.mocked(noiseRemoval).mockResolvedValue({
    buffer: PNG,
    format: "jpeg",
  });
  vi.mocked(restorePhoto).mockResolvedValue({
    buffer: PNG,
    width: 200,
    height: 150,
    steps: ["denoise"],
    scratchCoverage: 0.12,
    facesEnhanced: 1,
    isGrayscale: false,
    colorized: true,
  });
  vi.mocked(enhanceFaces).mockResolvedValue({
    buffer: PNG,
    facesDetected: 2,
    faces: [{ x: 1, y: 2, width: 20, height: 30 }],
    model: "codeformer",
  });
  vi.mocked(removeRedEye).mockResolvedValue({
    buffer: PNG,
    facesDetected: 1,
    eyesCorrected: 2,
  });
  vi.mocked(removeBackground).mockResolvedValue(PNG);
  vi.mocked(isMemoryAllocError).mockReturnValue(false);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAiMocks();
  ctx.report = vi.fn();
});

describe("AI image job handlers", () => {
  it("runs colorize jobs with parsed settings and output metadata", async () => {
    vi.mocked(colorize).mockImplementation(async (_input, _scratch, _settings, report) => {
      report?.(40, "colorizing");
      return { buffer: PNG, width: 200, height: 150, method: "mock-colorizer" };
    });

    const result = await runAiToolJob(
      job("colorize", { intensity: 0.5, model: "opencv" }),
      PNG,
      ctx,
    );

    expect(colorize).toHaveBeenCalledWith(
      PNG,
      SCRATCH_DIR,
      { intensity: 0.5, model: "opencv" },
      expect.any(Function),
    );
    expect(ctx.report).toHaveBeenCalledWith(40, "colorizing");
    expect(result).toMatchObject({
      filename: "photo_colorized.png",
      contentType: "image/png",
      resultPayload: { width: 200, height: 150, method: "mock-colorizer" },
    });
  });

  it("runs denoise jobs and maps jpeg outputs to jpg filenames", async () => {
    const result = await runAiToolJob(
      job("noise-removal", {
        tier: "quality",
        strength: "60",
        detailPreservation: 70,
        colorNoise: 10,
        format: "jpeg",
        quality: 82,
      }),
      PNG,
      ctx,
    );

    expect(noiseRemoval).toHaveBeenCalledWith(
      PNG,
      SCRATCH_DIR,
      {
        tier: "quality",
        strength: 60,
        detailPreservation: 70,
        colorNoise: 10,
        format: "jpeg",
        quality: 82,
      },
      expect.any(Function),
    );
    expect(result).toMatchObject({
      filename: "photo_denoised.jpg",
      contentType: "image/jpeg",
    });
  });

  it("runs restoration jobs and returns worker result payload details", async () => {
    const result = await runAiToolJob(
      job("restore-photo", {
        scratchRemoval: true,
        faceEnhancement: true,
        fidelity: 0.75,
        denoise: true,
        denoiseStrength: 35,
        colorize: true,
        colorizeStrength: 80,
      }),
      PNG,
      ctx,
    );

    expect(restorePhoto).toHaveBeenCalledWith(
      PNG,
      SCRATCH_DIR,
      {
        scratchRemoval: true,
        faceEnhancement: true,
        fidelity: 0.75,
        denoise: true,
        denoiseStrength: 35,
        colorize: true,
        colorizeStrength: 80,
      },
      expect.any(Function),
    );
    expect(result).toMatchObject({
      filename: "photo_restored.png",
      contentType: "image/png",
      resultPayload: {
        steps: ["denoise"],
        scratchCoverage: 0.12,
        facesEnhanced: 1,
        isGrayscale: false,
        colorized: true,
      },
    });
  });

  it("runs face enhancement and red-eye handlers with AI result payloads", async () => {
    const enhanced = await runAiToolJob(
      job("enhance-faces", {
        model: "codeformer",
        strength: 0.65,
        onlyCenterFace: true,
        sensitivity: 0.7,
      }),
      PNG,
      ctx,
    );
    const redEye = await runAiToolJob(
      job("red-eye-removal", {
        sensitivity: 45,
        strength: 80,
        format: "png",
        quality: 90,
      }),
      PNG,
      ctx,
    );

    expect(enhanceFaces).toHaveBeenCalledWith(
      PNG,
      SCRATCH_DIR,
      { model: "codeformer", strength: 0.65, onlyCenterFace: true, sensitivity: 0.7 },
      expect.any(Function),
    );
    expect(enhanced).toMatchObject({
      filename: "photo_enhanced.png",
      contentType: "image/png",
      resultPayload: { facesDetected: 2, model: "codeformer" },
    });
    expect(removeRedEye).toHaveBeenCalledWith(
      PNG,
      SCRATCH_DIR,
      { sensitivity: 45, strength: 80, format: "png", quality: 90 },
      expect.any(Function),
    );
    expect(redEye).toMatchObject({
      filename: "photo_redeye_fixed.png",
      contentType: "image/png",
      resultPayload: { facesDetected: 1, eyesCorrected: 2 },
    });
  });

  it("falls back to the lower-memory transparency model on OOM", async () => {
    vi.mocked(removeBackground)
      .mockRejectedValueOnce(new Error("out of memory"))
      .mockResolvedValueOnce(PNG);
    vi.mocked(isMemoryAllocError).mockReturnValue(true);

    const result = await runAiToolJob(
      job("transparency-fixer", {
        defringe: 0,
        outputFormat: "png",
        removeWatermark: false,
      }),
      PNG,
      ctx,
    );

    expect(removeBackground).toHaveBeenNthCalledWith(
      1,
      PNG,
      SCRATCH_DIR,
      { model: "birefnet-hr-matting" },
      expect.any(Function),
    );
    expect(removeBackground).toHaveBeenNthCalledWith(
      2,
      PNG,
      SCRATCH_DIR,
      { model: "birefnet-general" },
      expect.any(Function),
    );
    expect(ctx.report).toHaveBeenCalledWith(5, "Retrying with fallback model (birefnet-general)");
    expect(result).toMatchObject({
      filename: "photo_fixed.png",
      contentType: "image/png",
      resultPayload: { filename: "photo.png" },
    });
  });
});

describe("AI image pipeline process registrations", () => {
  beforeEach(() => {
    registerColorize(fakeApp);
    registerNoiseRemoval(fakeApp);
    registerRestorePhoto(fakeApp);
    registerEnhanceFaces(fakeApp);
    registerRedEyeRemoval(fakeApp);
    registerTransparencyFixer(fakeApp);
  });

  it("registers pipeline processors for custom AI photo routes", async () => {
    const colorizeConfig = getToolConfig("colorize");
    const noiseConfig = getToolConfig("noise-removal");
    const restoreConfig = getToolConfig("restore-photo");
    const enhanceConfig = getToolConfig("enhance-faces");
    const redEyeConfig = getToolConfig("red-eye-removal");
    const transparencyConfig = getToolConfig("transparency-fixer");

    expect(colorizeConfig).toBeDefined();
    expect(noiseConfig).toBeDefined();
    expect(restoreConfig).toBeDefined();
    expect(enhanceConfig).toBeDefined();
    expect(redEyeConfig).toBeDefined();
    expect(transparencyConfig).toBeDefined();

    await expect(
      colorizeConfig?.process(PNG, { intensity: 0.9, model: "opencv" }, "photo.png", ctx),
    ).resolves.toMatchObject({ filename: "photo_colorized.png", contentType: "image/png" });
    await expect(
      noiseConfig?.process(
        PNG,
        {
          tier: "balanced",
          strength: 50,
          detailPreservation: 40,
          colorNoise: 20,
          format: "jpeg",
          quality: 90,
        },
        "photo.png",
        ctx,
      ),
    ).resolves.toMatchObject({ filename: "photo_denoised.jpg", contentType: "image/jpeg" });
    await expect(
      restoreConfig?.process(PNG, { fidelity: 0.7 }, "photo.png", ctx),
    ).resolves.toMatchObject({ filename: "photo_restored.png", contentType: "image/png" });
    await expect(
      enhanceConfig?.process(PNG, { model: "auto" }, "photo.png", ctx),
    ).resolves.toMatchObject({ filename: "photo_enhanced.png", contentType: "image/png" });
    await expect(
      redEyeConfig?.process(PNG, { sensitivity: 50 }, "photo.png", ctx),
    ).resolves.toMatchObject({ filename: "photo_redeye_fixed.png", contentType: "image/png" });
    await expect(
      transparencyConfig?.process(
        PNG,
        { defringe: 0, outputFormat: "png", removeWatermark: false },
        "photo.png",
        ctx,
      ),
    ).resolves.toMatchObject({ filename: "photo_fixed.png", contentType: "image/png" });
  });
});
