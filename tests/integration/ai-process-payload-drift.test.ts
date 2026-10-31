import { registerBlurFaces } from "../../apps/api/src/routes/tools/blur-faces.js";
import { registerColorize } from "../../apps/api/src/routes/tools/colorize.js";
import { registerEnhanceFaces } from "../../apps/api/src/routes/tools/enhance-faces.js";
import { registerNoiseRemoval } from "../../apps/api/src/routes/tools/noise-removal.js";
import { registerOcr } from "../../apps/api/src/routes/tools/ocr.js";
import { registerRedEyeRemoval } from "../../apps/api/src/routes/tools/red-eye-removal.js";
import { registerRemoveGifBackground } from "../../apps/api/src/routes/tools/remove-gif-background.js";
import { registerRestorePhoto } from "../../apps/api/src/routes/tools/restore-photo.js";
import { registerTransparencyFixer } from "../../apps/api/src/routes/tools/transparency-fixer.js";
import { registerUpscale } from "../../apps/api/src/routes/tools/upscale.js";

// Register them
const dummyApp = { post: () => {} } as any;
registerBlurFaces(dummyApp);
registerColorize(dummyApp);
registerEnhanceFaces(dummyApp);
registerNoiseRemoval(dummyApp);
registerOcr(dummyApp);
registerRedEyeRemoval(dummyApp);
registerRemoveGifBackground(dummyApp);
registerRestorePhoto(dummyApp);
registerTransparencyFixer(dummyApp);
registerUpscale(dummyApp);

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { hasAiJobHandler, runAiToolJob } from "../../apps/api/src/jobs/ai-handlers.js";
import { getToolConfig } from "../../apps/api/src/routes/tool-factory.js";

// Mock the AI module which calls Python
vi.mock("@snapotter/ai", () => ({
  blurFaces: vi.fn().mockResolvedValue({
    buffer: Buffer.from("mock"),
    width: 100,
    height: 100,
    format: "png",
    facesDetected: 1,
    faces: [],
  }),
  colorize: vi.fn().mockResolvedValue({
    buffer: Buffer.from("mock"),
    width: 100,
    height: 100,
    format: "png",
    method: "auto",
  }),
  enhanceFaces: vi.fn().mockResolvedValue({
    buffer: Buffer.from("mock"),
    width: 100,
    height: 100,
    format: "png",
    facesDetected: 1,
    faces: [],
    model: "auto",
  }),
  noiseRemoval: vi
    .fn()
    .mockResolvedValue({ buffer: Buffer.from("mock"), width: 100, height: 100, format: "png" }),
  removeRedEye: vi.fn().mockResolvedValue({
    buffer: Buffer.from("mock"),
    width: 100,
    height: 100,
    format: "png",
    facesDetected: 1,
    eyesCorrected: 2,
  }),
  removeBackgroundAnimated: vi
    .fn()
    .mockResolvedValue({ buffer: Buffer.from("mock"), ext: "gif", contentType: "image/gif" }),
  restorePhoto: vi.fn().mockResolvedValue({
    buffer: Buffer.from("mock"),
    width: 100,
    height: 100,
    format: "png",
    steps: 3,
    scratchCoverage: 0.1,
    facesEnhanced: 1,
    isGrayscale: false,
    colorized: false,
  }),
  processTransparencyFix: vi.fn().mockResolvedValue(Buffer.from("mock")),
  upscale: vi.fn().mockResolvedValue({
    buffer: Buffer.from("mock"),
    width: 200,
    height: 200,
    format: "png",
    method: "esrgan",
  }),
  FAST_KOREAN_UNSUPPORTED_REASON: "mock",
  FAST_ARABIC_UNSUPPORTED_REASON: "mock",
  fastLanguageUnsupportedReason: (language?: string) =>
    language === "ko" || language === "ar" ? "mock" : undefined,
  removeBackground: vi.fn().mockImplementation(async (buf) => buf),
  isMemoryAllocError: vi.fn().mockReturnValue(false),
  extractText: vi.fn().mockResolvedValue({ text: "mock", format: "png", width: 100, height: 100 }),
  MAX_OCR_INPUT_PIXELS: 40000000,
  MAX_OCR_INPUT_DIMENSION: 40000,
  MAX_OCR_OUTPUT_BYTES: 1000000,
  getOcrRuntimeCapability: vi
    .fn()
    .mockReturnValue({ available: true, qualities: ["fast", "balanced", "best"] }),
}));

// We also mock ocr runtime check and python call
vi.mock("../../apps/api/src/lib/ocr-capability.js", async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...(mod as any),
    getOcrRuntimeCapability: () => ({ available: true, qualities: ["fast", "balanced", "best"] }),
  };
});
vi.mock("../../apps/api/src/lib/paddleocr-runner.js", () => ({
  runPaddleOcr: vi.fn().mockResolvedValue({ text: "mock", words: 1, languages: ["en"] }),
}));

const AI_TOOLS = [
  "blur-faces",
  "colorize",
  "enhance-faces",
  "noise-removal",
  "ocr",
  "red-eye-removal",
  "remove-gif-background",
  "restore-photo",
  "transparency-fixer",
  "upscale",
];

describe("AI tools process fn and handler payload parity", () => {
  it("every AI tool should return the same resultPayload in handler and process fn", async () => {
    // We'll use a valid test image so the validations pass
    const imgPath = join(process.cwd(), "tests/fixtures/image/valid/test-scene.png");
    let inputBuffer = readFileSync(imgPath);
    const gifPath = join(process.cwd(), "tests/fixtures/image/valid/animated.gif");
    const filename = "test-scene.png";
    const data = {
      jobId: "123",
      toolId: "", // filled in loop
      userId: null,
      pool: "ai",
      inputRefs: [],
      filename,
      settings: {},
      saveMode: "new",
      kind: "ai-tool",
    } as any;

    const ctx = {
      scratchDir: "/tmp",
      signal: new AbortController().signal,
      report: vi.fn(),
    };

    const mismatches = [];

    for (const toolId of AI_TOOLS) {
      if (!hasAiJobHandler(toolId)) continue; // just in case

      const config = getToolConfig(toolId);
      if (!config || !config.process) throw new Error(`Missing config for ${toolId}`);

      data.toolId = toolId;
      if (toolId === "remove-gif-background") {
        inputBuffer = readFileSync(gifPath);
        data.filename = "animated.gif";
      } else {
        inputBuffer = readFileSync(imgPath);
        data.filename = "test-scene.png";
      }

      // Some tools need specific settings
      data.settings = {};
      if (toolId === "transparency-fixer")
        data.settings = { outputFormat: "png", removeWatermark: false };

      // Run handler
      const handlerRes = await runAiToolJob(data, inputBuffer, ctx);

      // Run process fn
      const processRes = await config.process(inputBuffer, data.settings, filename, ctx);

      // Compare resultPayload
      try {
        expect(processRes.resultPayload, `Tool ${toolId} resultPayload mismatch`).toEqual(
          handlerRes.resultPayload,
        );
      } catch (e) {
        mismatches.push(toolId);
      }
    }

    if (mismatches.length > 0) {
      throw new Error(`Mismatched tools: ${mismatches.join(", ")}`);
    }
  });
});
