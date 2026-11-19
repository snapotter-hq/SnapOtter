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
  upscale,
} from "@snapotter/ai";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runAiToolJob } from "../../../apps/api/src/jobs/ai-handlers.js";
import type { ToolJobData } from "../../../apps/api/src/jobs/types.js";
import type { ToolProcessCtx } from "../../../apps/api/src/routes/tool-factory.js";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerColorize } from "../../../apps/api/src/routes/tools/colorize.js";
import { registerEnhanceFaces } from "../../../apps/api/src/routes/tools/enhance-faces.js";
import { registerNoiseRemoval } from "../../../apps/api/src/routes/tools/noise-removal.js";
import { registerRedEyeRemoval } from "../../../apps/api/src/routes/tools/red-eye-removal.js";
import { registerRemoveBackground } from "../../../apps/api/src/routes/tools/remove-background.js";
import { registerRestorePhoto } from "../../../apps/api/src/routes/tools/restore-photo.js";
import { registerTransparencyFixer } from "../../../apps/api/src/routes/tools/transparency-fixer.js";
import { registerUpscale } from "../../../apps/api/src/routes/tools/upscale.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

const aiMocks = vi.hoisted(() => ({
  colorize: vi.fn(),
  enhanceFaces: vi.fn(),
  isMemoryAllocError: vi.fn(),
  noiseRemoval: vi.fn(),
  removeBackground: vi.fn(),
  removeRedEye: vi.fn(),
  restorePhoto: vi.fn(),
  upscale: vi.fn(),
}));

vi.mock("../../../apps/api/src/lib/hq-memory-gate.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../apps/api/src/lib/hq-memory-gate.js")>()),
  // Host memory is not what these tests exercise; the gate has its own tests.
  availableMemoryBytes: () => 64 * 1024 ** 3,
}));

// A JPEG XL codestream starts with FF 0A. The encoder shells out to cjxl, which
// is not what these tests exercise, so stand in for it with a tagged buffer.
const FAKE_JXL = Buffer.from([0xff, 0x0a, 0x4a, 0x58, 0x4c]);
const encoderMocks = vi.hoisted(() => ({ encodeJxl: vi.fn() }));

vi.mock("../../../apps/api/src/lib/format-encoders.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../apps/api/src/lib/format-encoders.js")>()),
  encodeJxl: encoderMocks.encodeJxl,
}));

vi.mock("@snapotter/ai", () => ({
  colorize: aiMocks.colorize,
  enhanceFaces: aiMocks.enhanceFaces,
  gpuMayBeAvailable: vi.fn(() => false),
  isGpuAvailable: vi.fn(() => false),
  isMemoryAllocError: aiMocks.isMemoryAllocError,
  noiseRemoval: aiMocks.noiseRemoval,
  removeBackground: aiMocks.removeBackground,
  removeRedEye: aiMocks.removeRedEye,
  restorePhoto: aiMocks.restorePhoto,
  upscale: aiMocks.upscale,
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
    width: 200,
    height: 150,
    format: "jpeg",
    tier: "mock",
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
    faces: [{ x: 1, y: 2, w: 20, h: 30 }],
    model: "codeformer",
  });
  vi.mocked(removeRedEye).mockResolvedValue({
    buffer: PNG,
    facesDetected: 1,
    eyesCorrected: 2,
    width: 200,
    height: 150,
    format: "png",
  });
  vi.mocked(removeBackground).mockResolvedValue(PNG);
  vi.mocked(upscale).mockResolvedValue({
    buffer: PNG,
    width: 400,
    height: 300,
    method: "realesrgan",
    format: "png",
  });
  vi.mocked(isMemoryAllocError).mockReturnValue(false);
  encoderMocks.encodeJxl.mockResolvedValue(FAKE_JXL);
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
      { intensity: 0.5, model: "opencv", signal: ctx.signal },
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
        signal: ctx.signal,
      },
      expect.any(Function),
    );
    expect(result).toMatchObject({
      filename: "photo_denoised.jpg",
      contentType: "image/jpeg",
    });
  });

  // The sidecar has no AVIF or JPEG XL encoder: it writes PNG bytes and echoes
  // the requested format back (#4468). Node must ask for PNG and encode itself.
  it("encodes avif denoise output in Node instead of passing sidecar PNG bytes through", async () => {
    vi.mocked(noiseRemoval).mockImplementation(async (_input, _scratch, options) => ({
      buffer: PNG,
      width: 200,
      height: 150,
      format: options?.format ?? "png",
      tier: "quick",
    }));

    const result = await runAiToolJob(
      job("noise-removal", { tier: "quick", format: "avif", quality: 70 }),
      PNG,
      ctx,
    );

    expect(noiseRemoval).toHaveBeenCalledWith(
      PNG,
      SCRATCH_DIR,
      expect.objectContaining({ format: "png" }),
      expect.any(Function),
    );
    expect(result).toMatchObject({ filename: "photo_denoised.avif", contentType: "image/avif" });
    const meta = await sharp(result.buffer).metadata();
    expect(meta.format).toBe("heif");
    expect(meta.compression).toBe("av1");
  });

  it("encodes jxl denoise output in Node with the requested quality", async () => {
    vi.mocked(noiseRemoval).mockImplementation(async (_input, _scratch, options) => ({
      buffer: PNG,
      width: 200,
      height: 150,
      format: options?.format ?? "png",
      tier: "balanced",
    }));

    const result = await runAiToolJob(
      job("noise-removal", { tier: "balanced", format: "jxl", quality: 65 }),
      PNG,
      ctx,
    );

    expect(noiseRemoval).toHaveBeenCalledWith(
      PNG,
      SCRATCH_DIR,
      expect.objectContaining({ format: "png" }),
      expect.any(Function),
    );
    expect(encoderMocks.encodeJxl).toHaveBeenCalledWith(PNG, 65);
    expect(result).toMatchObject({
      buffer: FAKE_JXL,
      filename: "photo_denoised.jxl",
      contentType: "image/jxl",
    });
  });

  it("passes sidecar-native denoise formats straight through without re-encoding", async () => {
    vi.mocked(noiseRemoval).mockResolvedValue({
      buffer: PNG,
      width: 200,
      height: 150,
      format: "webp",
      tier: "quick",
    });

    const result = await runAiToolJob(
      job("noise-removal", { tier: "quick", format: "webp" }),
      PNG,
      ctx,
    );

    expect(noiseRemoval).toHaveBeenCalledWith(
      PNG,
      SCRATCH_DIR,
      expect.objectContaining({ format: "webp" }),
      expect.any(Function),
    );
    expect(encoderMocks.encodeJxl).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      buffer: PNG,
      filename: "photo_denoised.webp",
      contentType: "image/webp",
    });
  });

  // The bridge converts every input to PNG before the sidecar sees it, so the
  // sidecar's own "original" always meant PNG (#4469). Node resolves it first.
  it.each([
    { input: "jpeg", sidecar: "jpeg", ext: "jpg", contentType: "image/jpeg" },
    { input: "png", sidecar: "png", ext: "png", contentType: "image/png" },
    { input: "webp", sidecar: "webp", ext: "webp", contentType: "image/webp" },
    { input: "gif", sidecar: "gif", ext: "gif", contentType: "image/gif" },
    { input: "tiff", sidecar: "tiff", ext: "tiff", contentType: "image/tiff" },
    { input: "avif", sidecar: "png", ext: "avif", contentType: "image/avif" },
  ] as const)("keeps a $input input's format when denoise format is original", async (c) => {
    vi.mocked(noiseRemoval).mockImplementation(async (_input, _scratch, options) => ({
      buffer: PNG,
      width: 200,
      height: 150,
      format: options?.format ?? "png",
      tier: "quick",
    }));
    const input = await sharp(PNG).toFormat(c.input).toBuffer();

    const result = await runAiToolJob(
      job("noise-removal", { tier: "quick", format: "original" }, `photo.${c.ext}`),
      input,
      ctx,
    );

    expect(noiseRemoval).toHaveBeenCalledWith(
      input,
      SCRATCH_DIR,
      expect.objectContaining({ format: c.sidecar }),
      expect.any(Function),
    );
    expect(result).toMatchObject({
      filename: `photo_denoised.${c.ext}`,
      contentType: c.contentType,
    });
  });

  it("falls back to png when an original-format input has no encoder", async () => {
    vi.mocked(noiseRemoval).mockImplementation(async (_input, _scratch, options) => ({
      buffer: PNG,
      width: 200,
      height: 150,
      format: options?.format ?? "png",
      tier: "quick",
    }));
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>');

    const result = await runAiToolJob(
      job("noise-removal", { tier: "quick", format: "original" }, "photo.svg"),
      svg,
      ctx,
    );

    expect(noiseRemoval).toHaveBeenCalledWith(
      svg,
      SCRATCH_DIR,
      expect.objectContaining({ format: "png" }),
      expect.any(Function),
    );
    expect(result).toMatchObject({ filename: "photo_denoised.png", contentType: "image/png" });
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
        signal: ctx.signal,
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
      {
        model: "codeformer",
        strength: 0.65,
        onlyCenterFace: true,
        sensitivity: 0.7,
        signal: ctx.signal,
      },
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
      { sensitivity: 45, strength: 80, format: "png", quality: 90, signal: ctx.signal },
      expect.any(Function),
    );
    expect(redEye).toMatchObject({
      filename: "photo_redeye_fixed.png",
      contentType: "image/png",
      resultPayload: { facesDetected: 1, eyesCorrected: 2 },
    });
  });

  // The route used to name every result *_redeye_fixed.png with image/png, and
  // the sidecar only knows "jpeg", so "jpg" fell through to PNG (#4363).
  it.each([
    { format: "jpg", sidecar: "jpeg", ext: "jpg", contentType: "image/jpeg" },
    { format: "jpeg", sidecar: "jpeg", ext: "jpg", contentType: "image/jpeg" },
    { format: "webp", sidecar: "webp", ext: "webp", contentType: "image/webp" },
    { format: "png", sidecar: "png", ext: "png", contentType: "image/png" },
  ] as const)("honours red-eye format $format", async (c) => {
    const result = await runAiToolJob(
      job("red-eye-removal", { format: c.format, quality: 60 }, "sample.webp"),
      PNG,
      ctx,
    );

    expect(removeRedEye).toHaveBeenCalledWith(
      PNG,
      SCRATCH_DIR,
      expect.objectContaining({ format: c.sidecar, quality: 60 }),
      expect.any(Function),
    );
    expect(result).toMatchObject({
      filename: `sample_redeye_fixed.${c.ext}`,
      contentType: c.contentType,
    });
  });

  it("encodes avif and jxl red-eye output in Node from sidecar PNG", async () => {
    const avif = await runAiToolJob(
      job("red-eye-removal", { format: "avif", quality: 70 }),
      PNG,
      ctx,
    );
    expect(avif).toMatchObject({ filename: "photo_redeye_fixed.avif", contentType: "image/avif" });
    expect((await sharp(avif.buffer).metadata()).compression).toBe("av1");

    const jxl = await runAiToolJob(
      job("red-eye-removal", { format: "jxl", quality: 65 }),
      PNG,
      ctx,
    );
    expect(encoderMocks.encodeJxl).toHaveBeenCalledWith(PNG, 65);
    expect(jxl).toMatchObject({
      buffer: FAKE_JXL,
      filename: "photo_redeye_fixed.jxl",
      contentType: "image/jxl",
    });
    for (const call of vi.mocked(removeRedEye).mock.calls) {
      expect(call[2]).toMatchObject({ format: "png" });
    }
  });

  it.each([
    { input: "jpeg", sidecar: "jpeg", ext: "jpg", contentType: "image/jpeg" },
    { input: "webp", sidecar: "webp", ext: "webp", contentType: "image/webp" },
    { input: "gif", sidecar: "png", ext: "gif", contentType: "image/gif" },
    { input: "tiff", sidecar: "png", ext: "tiff", contentType: "image/tiff" },
  ] as const)("keeps a $input input's format when red-eye format is original", async (c) => {
    const input = await sharp(PNG).toFormat(c.input).toBuffer();

    const result = await runAiToolJob(
      job("red-eye-removal", { format: "original" }, `photo.${c.ext}`),
      input,
      ctx,
    );

    expect(vi.mocked(removeRedEye).mock.calls[0]?.[2]).toMatchObject({ format: c.sidecar });
    expect(result).toMatchObject({
      filename: `photo_redeye_fixed.${c.ext}`,
      contentType: c.contentType,
    });
    expect((await sharp(result.buffer).metadata()).format).toBe(
      c.sidecar === "png" ? c.input : "png",
    );
  });

  it("rejects an unknown red-eye format instead of silently writing PNG", async () => {
    await expect(
      runAiToolJob(job("red-eye-removal", { format: "bmp" }), PNG, ctx),
    ).rejects.toThrow();
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
      {
        model: "birefnet-hr-matting",
        oomFallbackModel: false,
        toolId: "transparency-fixer",
        signal: ctx.signal,
      },
      expect.any(Function),
    );
    expect(removeBackground).toHaveBeenNthCalledWith(
      2,
      PNG,
      SCRATCH_DIR,
      { model: "birefnet-general", toolId: "transparency-fixer", signal: ctx.signal },
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

describe("worker abort signal pass-through", () => {
  // A worker timeout or user cancel aborts ctx.signal; without forwarding it,
  // the Python inference keeps burning CPU after the job is already dead.
  it("remove-background forwards ctx.signal to the sidecar call", async () => {
    registerRemoveBackground(fakeApp);

    await runAiToolJob(job("remove-background", { model: "u2net" }), PNG, ctx);

    expect(removeBackground).toHaveBeenCalledWith(
      PNG,
      SCRATCH_DIR,
      expect.objectContaining({ model: "u2net", signal: ctx.signal }),
      expect.any(Function),
    );
  });

  it("remove-background reports the model an out-of-memory retry switched to (#4753)", async () => {
    registerRemoveBackground(fakeApp);
    vi.mocked(removeBackground).mockImplementationOnce(async (_input, _dir, options) => {
      options?.onFallbackModel?.("birefnet-general");
      return PNG;
    });

    const result = await runAiToolJob(
      job("remove-background", { model: "birefnet-hr-matting" }),
      PNG,
      ctx,
    );

    expect(result.resultPayload).toMatchObject({ model: "birefnet-general" });
  });

  it("upscale forwards ctx.signal to the sidecar call", async () => {
    registerUpscale(fakeApp);

    await runAiToolJob(job("upscale", { scale: 2, format: "png" }), PNG, ctx);

    expect(upscale).toHaveBeenCalledWith(
      PNG,
      SCRATCH_DIR,
      expect.objectContaining({ scale: 2, signal: ctx.signal }),
      expect.any(Function),
    );
  });

  it("remove-background pipeline processor forwards ctx.signal", async () => {
    registerRemoveBackground(fakeApp);

    const config = getToolConfig("remove-background");
    expect(config).toBeDefined();
    await config?.process(PNG, { model: "u2net" }, "photo.png", ctx);

    expect(removeBackground).toHaveBeenCalledWith(
      expect.any(Buffer),
      SCRATCH_DIR,
      expect.objectContaining({ model: "u2net", signal: ctx.signal }),
    );
  });

  it("upscale pipeline processor forwards ctx.signal", async () => {
    registerUpscale(fakeApp);

    const config = getToolConfig("upscale");
    expect(config).toBeDefined();
    await config?.process(PNG, { scale: 2 }, "photo.png", ctx);

    expect(upscale).toHaveBeenCalledWith(
      expect.any(Buffer),
      SCRATCH_DIR,
      expect.objectContaining({ scale: 2, signal: ctx.signal }),
      expect.any(Function),
    );
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

  it("encodes avif and jxl in the noise-removal pipeline processor (#4468)", async () => {
    vi.mocked(noiseRemoval).mockImplementation(async (_input, _scratch, options) => ({
      buffer: PNG,
      width: 200,
      height: 150,
      format: options?.format ?? "png",
      tier: "quick",
    }));
    const noiseConfig = getToolConfig("noise-removal");

    const avif = await noiseConfig?.process(
      PNG,
      { tier: "quick", format: "avif", quality: 70 },
      "photo.png",
      ctx,
    );
    expect(avif).toMatchObject({ filename: "photo_denoised.avif", contentType: "image/avif" });
    expect((await sharp(avif?.buffer).metadata()).compression).toBe("av1");

    const jxl = await noiseConfig?.process(
      PNG,
      { tier: "quick", format: "jxl", quality: 60 },
      "photo.png",
      ctx,
    );
    expect(jxl).toMatchObject({
      buffer: FAKE_JXL,
      filename: "photo_denoised.jxl",
      contentType: "image/jxl",
    });
    expect(encoderMocks.encodeJxl).toHaveBeenCalledWith(PNG, 60);
    for (const call of vi.mocked(noiseRemoval).mock.calls) {
      expect(call[2]).toMatchObject({ format: "png" });
    }
  });

  it("honours format in the red-eye pipeline processor (#4363)", async () => {
    const jpeg = await sharp(PNG).jpeg().toBuffer();
    const redEyeConfig = getToolConfig("red-eye-removal");

    const original = await redEyeConfig?.process(jpeg, { format: "original" }, "photo.jpg", ctx);
    expect(vi.mocked(removeRedEye).mock.calls[0]?.[2]).toMatchObject({ format: "jpeg" });
    expect(original).toMatchObject({
      filename: "photo_redeye_fixed.jpg",
      contentType: "image/jpeg",
      resultPayload: { facesDetected: 1, eyesCorrected: 2 },
    });

    const avif = await redEyeConfig?.process(
      PNG,
      { format: "avif", quality: 50 },
      "photo.png",
      ctx,
    );
    expect(vi.mocked(removeRedEye).mock.calls[1]?.[2]).toMatchObject({ format: "png" });
    expect(avif).toMatchObject({ filename: "photo_redeye_fixed.avif", contentType: "image/avif" });
    expect((await sharp(avif?.buffer).metadata()).compression).toBe("av1");
  });

  it("keeps a JPEG input's format in the noise-removal pipeline processor (#4469)", async () => {
    vi.mocked(noiseRemoval).mockImplementation(async (_input, _scratch, options) => ({
      buffer: PNG,
      width: 200,
      height: 150,
      format: options?.format ?? "png",
      tier: "quick",
    }));
    const jpeg = await sharp(PNG).jpeg().toBuffer();

    const result = await getToolConfig("noise-removal")?.process(
      jpeg,
      { tier: "quick", format: "original" },
      "photo.jpg",
      ctx,
    );

    expect(vi.mocked(noiseRemoval).mock.calls[0]?.[2]).toMatchObject({ format: "jpeg" });
    expect(result).toMatchObject({ filename: "photo_denoised.jpg", contentType: "image/jpeg" });
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

  it("upscale pipeline registration preserves model, faceEnhance, denoise, format, and quality (#2362)", async () => {
    registerUpscale(fakeApp);
    const upscaleConfig = getToolConfig("upscale");
    expect(upscaleConfig).toBeDefined();

    const rawSettings = {
      scale: 2,
      model: "realesrgan-x4plus",
      faceEnhance: true,
      denoise: 15,
      format: "webp",
      quality: 85,
    };

    const parsed = upscaleConfig?.settingsSchema.parse(rawSettings);
    expect(parsed).toEqual(rawSettings);

    vi.mocked(upscale).mockResolvedValueOnce({
      buffer: PNG,
      width: 400,
      height: 300,
      method: "realesrgan",
      format: "webp",
    });

    const out = await upscaleConfig?.process(PNG, parsed, "photo.png", ctx);
    expect(upscale).toHaveBeenCalledWith(
      expect.any(Buffer),
      SCRATCH_DIR,
      {
        scale: 2,
        model: "realesrgan-x4plus",
        faceEnhance: true,
        denoise: 15,
        format: "webp",
        quality: 85,
        signal: ctx.signal,
      },
      expect.any(Function),
    );
    expect(out).toMatchObject({
      filename: "photo_2x.webp",
      contentType: "image/webp",
      resultPayload: {
        width: 400,
        height: 300,
        method: "realesrgan",
      },
    });
  });

  it("upscale pipeline processor converts Node-handled output formats like avif (#2362)", async () => {
    registerUpscale(fakeApp);
    const upscaleConfig = getToolConfig("upscale");
    expect(upscaleConfig).toBeDefined();

    const parsed = upscaleConfig?.settingsSchema.parse({
      scale: 2,
      format: "avif",
      quality: 80,
    });

    const out = await upscaleConfig?.process(PNG, parsed, "photo.png", ctx);
    expect(upscale).toHaveBeenCalledWith(
      expect.any(Buffer),
      SCRATCH_DIR,
      expect.objectContaining({
        scale: 2,
        format: "png",
        quality: 80,
      }),
      expect.any(Function),
    );
    expect(out).toMatchObject({
      filename: "photo_2x.avif",
      contentType: "image/avif",
    });
  });
});
