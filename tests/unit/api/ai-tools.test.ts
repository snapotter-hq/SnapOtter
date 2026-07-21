import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock all dependencies BEFORE importing tool modules.
//
// vi.mock factories are hoisted to the top of the file, so they CANNOT
// reference variables declared at module scope. Every mock must be fully
// self-contained inside the factory function. We use vi.hoisted() to
// create shared mock references that are safe to use in both the factories
// and the test bodies.
// ---------------------------------------------------------------------------

const {
  mockRunPythonWithProgress,
  mockParseStdoutJson,
  mockIsGpuAvailable,
  mockSharp,
  mockWriteFile,
  mockReadFile,
  mockUnlink,
  mockRm,
  mockExecFile,
  mockRunOcrRuntime,
  mockRunTesseract,
} = vi.hoisted(() => {
  const mockRunPythonWithProgress = vi.fn();
  const mockParseStdoutJson = vi.fn();
  const mockIsGpuAvailable = vi.fn().mockReturnValue(false);

  function createSharpChain(meta?: Record<string, unknown>) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.png = vi.fn().mockReturnValue(chain);
    chain.jpeg = vi.fn().mockReturnValue(chain);
    chain.resize = vi.fn().mockReturnValue(chain);
    chain.toBuffer = vi.fn().mockResolvedValue(Buffer.from("mock-png"));
    chain.toFile = vi.fn().mockResolvedValue({});
    chain.metadata = vi.fn().mockResolvedValue({
      width: 800,
      height: 600,
      format: "png",
      ...meta,
    });
    return chain;
  }

  const mockSharp = Object.assign(vi.fn().mockReturnValue(createSharpChain()), {
    _createChain: createSharpChain,
  });

  return {
    mockRunPythonWithProgress,
    mockParseStdoutJson,
    mockIsGpuAvailable,
    mockSharp,
    mockWriteFile: vi.fn().mockResolvedValue(undefined),
    mockReadFile: vi.fn().mockResolvedValue(Buffer.from("output-buffer")),
    mockUnlink: vi.fn().mockResolvedValue(undefined),
    mockRm: vi.fn().mockResolvedValue(undefined),
    mockExecFile: vi.fn(),
    mockRunOcrRuntime: vi.fn(),
    mockRunTesseract: vi.fn(),
  };
});

vi.mock("../../../packages/ai/src/bridge.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../packages/ai/src/bridge.js")>()),
  runPythonWithProgress: mockRunPythonWithProgress,
  parseStdoutJson: mockParseStdoutJson,
  isGpuAvailable: mockIsGpuAvailable,
}));

vi.mock("../../../packages/ai/src/ocr-runtime-dispatcher.js", () => ({
  runOcrRuntime: mockRunOcrRuntime,
}));

vi.mock("../../../packages/ai/src/tesseract.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../packages/ai/src/tesseract.js")>();
  return {
    ...actual,
    runAdaptiveTesseract: mockRunTesseract,
    runTesseract: mockRunTesseract,
  };
});

vi.mock("sharp", () => ({ default: mockSharp }));

vi.mock("node:fs/promises", () => ({
  writeFile: mockWriteFile,
  readFile: mockReadFile,
  unlink: mockUnlink,
  rm: mockRm,
}));

vi.mock("node:child_process", () => ({
  execFile: mockExecFile,
  spawn: vi.fn(),
}));

vi.mock("node:util", () => ({
  promisify: () => mockExecFile,
}));

// ---------------------------------------------------------------------------
// Import tool modules (after mocks are in place)
// ---------------------------------------------------------------------------

import { removeBackground } from "../../../packages/ai/src/background-removal.js";
import { colorize } from "../../../packages/ai/src/colorization.js";
import { blurFaces, detectFaces } from "../../../packages/ai/src/face-detection.js";
import { enhanceFaces } from "../../../packages/ai/src/face-enhancement.js";
import { detectFaceLandmarks } from "../../../packages/ai/src/face-landmarks.js";
import { inpaint } from "../../../packages/ai/src/inpainting.js";
import { noiseRemoval } from "../../../packages/ai/src/noise-removal.js";
import { extractText } from "../../../packages/ai/src/ocr.js";
import { removeRedEye } from "../../../packages/ai/src/red-eye-removal.js";
import { restorePhoto } from "../../../packages/ai/src/restoration.js";
import { upscale } from "../../../packages/ai/src/upscaling.js";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function createSharpChain(meta?: Record<string, unknown>) {
  return mockSharp._createChain(meta);
}

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

const INPUT_BUFFER = Buffer.from("test-input");
const OUTPUT_DIR = "/tmp/test-output";

beforeEach(() => {
  vi.clearAllMocks();
  mockSharp.mockReturnValue(createSharpChain());
  mockReadFile.mockResolvedValue(Buffer.from("output-buffer"));
  mockWriteFile.mockResolvedValue(undefined);
  mockRunPythonWithProgress.mockResolvedValue({ stdout: "", stderr: "" });
  mockRunTesseract.mockResolvedValue({
    text: "Sample OCR text",
    engine: "tesseract",
    device: "cpu",
    provider: "native",
  });
  mockRunOcrRuntime.mockResolvedValue({
    result: {
      success: true,
      text: "Accurate OCR text",
      engine: "rapidocr-onnx",
      requestedQuality: "best",
      actualQuality: "best",
      device: "cpu",
      provider: "CPUExecutionProvider",
      degraded: false,
      warnings: [],
    },
    stderr: "",
    runtime: {
      generation: "test",
      artifactVersion: "2.1.0",
      target: "linux-amd64-cpu-py312",
      providers: ["CPUExecutionProvider"],
      models: {},
    },
  });
  mockParseStdoutJson.mockReturnValue({ success: true });
  mockIsGpuAvailable.mockReturnValue(false);
});

// ═══════════════════════════════════════════════════════════════════════════
// removeBackground
// ═══════════════════════════════════════════════════════════════════════════

describe("removeBackground", () => {
  it("calls runPythonWithProgress with remove_bg.py", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true });

    await removeBackground(INPUT_BUFFER, OUTPUT_DIR);

    expect(mockRunPythonWithProgress).toHaveBeenCalledTimes(1);
    const [script] = mockRunPythonWithProgress.mock.calls[0];
    expect(script).toBe("remove_bg.py");
  });

  it("passes options as JSON in args", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true });

    await removeBackground(INPUT_BUFFER, OUTPUT_DIR, { model: "birefnet" });

    const [, args] = mockRunPythonWithProgress.mock.calls[0];
    const optsArg = JSON.parse(args[2]);
    expect(optsArg.model).toBe("birefnet");
  });

  it("writes input as PNG before processing", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true });

    await removeBackground(INPUT_BUFFER, OUTPUT_DIR);

    expect(mockWriteFile).toHaveBeenCalled();
    const writtenBuffer = mockWriteFile.mock.calls[0][1];
    expect(Buffer.isBuffer(writtenBuffer)).toBe(true);
  });

  it("returns the output file buffer", async () => {
    const expected = Buffer.from("mask-output");
    mockReadFile.mockResolvedValue(expected);
    mockParseStdoutJson.mockReturnValue({ success: true });

    const result = await removeBackground(INPUT_BUFFER, OUTPUT_DIR);

    expect(result).toBe(expected);
  });

  it("throws when Python reports failure", async () => {
    mockParseStdoutJson.mockReturnValue({
      success: false,
      error: "No model available",
    });

    await expect(removeBackground(INPUT_BUFFER, OUTPUT_DIR)).rejects.toThrow("No model available");
  });

  it("provides fallback error message when error field is empty", async () => {
    mockParseStdoutJson.mockReturnValue({ success: false });

    await expect(removeBackground(INPUT_BUFFER, OUTPUT_DIR)).rejects.toThrow(
      "Background removal failed",
    );
  });

  it("passes onProgress callback through to bridge", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true });

    const onProgress = vi.fn();
    await removeBackground(INPUT_BUFFER, OUTPUT_DIR, {}, onProgress);

    const [, , opts] = mockRunPythonWithProgress.mock.calls[0];
    expect(opts.onProgress).toBe(onProgress);
  });

  it("cleans up temp files in finally block", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true });

    await removeBackground(INPUT_BUFFER, OUTPUT_DIR);

    // unlink called for input and output paths
    expect(mockUnlink).toHaveBeenCalledTimes(2);
  });

  it("cleans up temp files even on failure", async () => {
    mockRunPythonWithProgress.mockRejectedValue(new Error("crash"));

    await expect(removeBackground(INPUT_BUFFER, OUTPUT_DIR)).rejects.toThrow("crash");
    expect(mockUnlink).toHaveBeenCalledTimes(2);
  });

  it("retries with u2net fallback on OOM error", async () => {
    // First call fails with OOM, second succeeds
    mockRunPythonWithProgress
      .mockRejectedValueOnce(new Error("Process killed (out of memory)"))
      .mockResolvedValueOnce({ stdout: "", stderr: "" });

    mockParseStdoutJson.mockReturnValue({ success: true });

    await removeBackground(INPUT_BUFFER, OUTPUT_DIR, { model: "birefnet" });

    expect(mockRunPythonWithProgress).toHaveBeenCalledTimes(2);
    // Second call should use u2net
    const secondArgs = mockRunPythonWithProgress.mock.calls[1][1];
    const secondOpts = JSON.parse(secondArgs[2]);
    expect(secondOpts.model).toBe("u2net");
  });

  it("does not retry OOM if already using u2net", async () => {
    mockRunPythonWithProgress.mockRejectedValue(new Error("Process killed (out of memory)"));

    await expect(removeBackground(INPUT_BUFFER, OUTPUT_DIR, { model: "u2net" })).rejects.toThrow(
      "out of memory",
    );

    expect(mockRunPythonWithProgress).toHaveBeenCalledTimes(1);
  });

  it("calculates timeout based on megapixels", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true });

    await removeBackground(INPUT_BUFFER, OUTPUT_DIR);

    const [, , opts] = mockRunPythonWithProgress.mock.calls[0];
    expect(opts.timeout).toBeGreaterThan(0);
  });

  it("uses longer base timeout for birefnet model", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true });

    await removeBackground(INPUT_BUFFER, OUTPUT_DIR, { model: "birefnet-large" });

    const [, , opts] = mockRunPythonWithProgress.mock.calls[0];
    // birefnet gets 600000 base timeout
    expect(opts.timeout).toBeGreaterThanOrEqual(600000);
  });

  it("downscales large images and upscales mask back", async () => {
    // Simulate a 4000x3000 image (larger than MAX_REMBG_PX=2048)
    const largeChain = createSharpChain({ width: 4000, height: 3000 });
    mockSharp.mockReturnValue(largeChain);
    mockParseStdoutJson.mockReturnValue({ success: true });

    await removeBackground(INPUT_BUFFER, OUTPUT_DIR);

    // resize should have been called for downscaling
    expect(largeChain.resize).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// colorize
// ═══════════════════════════════════════════════════════════════════════════

describe("colorize", () => {
  it("calls runPythonWithProgress with colorize.py", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true, width: 800, height: 600 });

    await colorize(INPUT_BUFFER, OUTPUT_DIR);

    const [script] = mockRunPythonWithProgress.mock.calls[0];
    expect(script).toBe("colorize.py");
  });

  it("passes options as JSON in args", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true, width: 800, height: 600 });

    await colorize(INPUT_BUFFER, OUTPUT_DIR, { intensity: 0.8, model: "eccv16" });

    const [, args] = mockRunPythonWithProgress.mock.calls[0];
    const optsArg = JSON.parse(args[2]);
    expect(optsArg.intensity).toBe(0.8);
    expect(optsArg.model).toBe("eccv16");
  });

  it("returns structured result with buffer, dimensions, and method", async () => {
    mockParseStdoutJson.mockReturnValue({
      success: true,
      width: 800,
      height: 600,
      method: "eccv16",
    });

    const result = await colorize(INPUT_BUFFER, OUTPUT_DIR);

    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
    expect(result.method).toBe("eccv16");
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
  });

  it("defaults method to 'unknown' when not provided", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true, width: 100, height: 100 });

    const result = await colorize(INPUT_BUFFER, OUTPUT_DIR);

    expect(result.method).toBe("unknown");
  });

  it("throws on failure", async () => {
    mockParseStdoutJson.mockReturnValue({ success: false, error: "Model missing" });

    await expect(colorize(INPUT_BUFFER, OUTPUT_DIR)).rejects.toThrow("Model missing");
  });

  it("uses output_path from result when available", async () => {
    mockParseStdoutJson.mockReturnValue({
      success: true,
      width: 100,
      height: 100,
      output_path: "/custom/path.png",
    });

    await colorize(INPUT_BUFFER, OUTPUT_DIR);

    expect(mockReadFile).toHaveBeenCalledWith("/custom/path.png");
  });

  it("forwards onProgress callback", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true, width: 100, height: 100 });

    const onProgress = vi.fn();
    await colorize(INPUT_BUFFER, OUTPUT_DIR, {}, onProgress);

    const [, , opts] = mockRunPythonWithProgress.mock.calls[0];
    expect(opts.onProgress).toBe(onProgress);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// blurFaces
// ═══════════════════════════════════════════════════════════════════════════

describe("blurFaces", () => {
  it("calls runPythonWithProgress with detect_faces.py", async () => {
    mockParseStdoutJson.mockReturnValue({
      success: true,
      facesDetected: 2,
      faces: [
        { x: 10, y: 20, w: 50, h: 50 },
        { x: 100, y: 200, w: 60, h: 60 },
      ],
    });

    await blurFaces(INPUT_BUFFER, OUTPUT_DIR);

    const [script] = mockRunPythonWithProgress.mock.calls[0];
    expect(script).toBe("detect_faces.py");
  });

  it("passes blur options in args", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true, facesDetected: 0, faces: [] });

    await blurFaces(INPUT_BUFFER, OUTPUT_DIR, { blurRadius: 30, sensitivity: 0.5 });

    const [, args] = mockRunPythonWithProgress.mock.calls[0];
    const optsArg = JSON.parse(args[2]);
    expect(optsArg.blurRadius).toBe(30);
    expect(optsArg.sensitivity).toBe(0.5);
  });

  it("returns buffer, facesDetected, and faces array", async () => {
    const faces = [{ x: 10, y: 20, w: 50, h: 50 }];
    mockParseStdoutJson.mockReturnValue({ success: true, facesDetected: 1, faces });

    const result = await blurFaces(INPUT_BUFFER, OUTPUT_DIR);

    expect(result.facesDetected).toBe(1);
    expect(result.faces).toEqual(faces);
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
  });

  it("defaults faces to empty array when absent", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true, facesDetected: 0 });

    const result = await blurFaces(INPUT_BUFFER, OUTPUT_DIR);

    expect(result.faces).toEqual([]);
  });

  it("throws on failure", async () => {
    mockParseStdoutJson.mockReturnValue({ success: false, error: "No face detector" });

    await expect(blurFaces(INPUT_BUFFER, OUTPUT_DIR)).rejects.toThrow("No face detector");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// detectFaces (detect-only mode)
// ═══════════════════════════════════════════════════════════════════════════

describe("detectFaces", () => {
  it("passes detectOnly: true in options", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true, facesDetected: 0, faces: [] });

    await detectFaces(INPUT_BUFFER);

    const [, args] = mockRunPythonWithProgress.mock.calls[0];
    const optsArg = JSON.parse(args[2]);
    expect(optsArg.detectOnly).toBe(true);
  });

  it("passes 'unused' as outputPath arg", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true, facesDetected: 0, faces: [] });

    await detectFaces(INPUT_BUFFER);

    const [, args] = mockRunPythonWithProgress.mock.calls[0];
    expect(args[1]).toBe("unused");
  });

  it("returns facesDetected and faces without a buffer", async () => {
    const faces = [{ x: 5, y: 10, w: 30, h: 30 }];
    mockParseStdoutJson.mockReturnValue({ success: true, facesDetected: 1, faces });

    const result = await detectFaces(INPUT_BUFFER);

    expect(result.facesDetected).toBe(1);
    expect(result.faces).toEqual(faces);
    expect((result as Record<string, unknown>).buffer).toBeUndefined();
  });

  it("cleans up temp input file", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true, facesDetected: 0, faces: [] });

    await detectFaces(INPUT_BUFFER);

    expect(mockUnlink).toHaveBeenCalledTimes(1);
  });

  it("cleans up temp file even on error", async () => {
    mockRunPythonWithProgress.mockRejectedValue(new Error("fail"));

    await expect(detectFaces(INPUT_BUFFER)).rejects.toThrow("fail");
    expect(mockUnlink).toHaveBeenCalledTimes(1);
  });

  it("merges sensitivity option", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true, facesDetected: 0, faces: [] });

    await detectFaces(INPUT_BUFFER, { sensitivity: 0.3 });

    const [, args] = mockRunPythonWithProgress.mock.calls[0];
    const optsArg = JSON.parse(args[2]);
    expect(optsArg.sensitivity).toBe(0.3);
    expect(optsArg.detectOnly).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// enhanceFaces
// ═══════════════════════════════════════════════════════════════════════════

describe("enhanceFaces", () => {
  it("calls enhance_faces.py", async () => {
    mockParseStdoutJson.mockReturnValue({
      success: true,
      facesDetected: 1,
      faces: [],
      model: "gfpgan",
    });

    await enhanceFaces(INPUT_BUFFER, OUTPUT_DIR);

    const [script] = mockRunPythonWithProgress.mock.calls[0];
    expect(script).toBe("enhance_faces.py");
  });

  it("passes all options through", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true, facesDetected: 0, faces: [] });

    await enhanceFaces(INPUT_BUFFER, OUTPUT_DIR, {
      model: "codeformer",
      strength: 0.7,
      onlyCenterFace: true,
      sensitivity: 0.4,
    });

    const [, args] = mockRunPythonWithProgress.mock.calls[0];
    const optsArg = JSON.parse(args[2]);
    expect(optsArg.model).toBe("codeformer");
    expect(optsArg.strength).toBe(0.7);
    expect(optsArg.onlyCenterFace).toBe(true);
  });

  it("returns result with buffer, facesDetected, faces, and model", async () => {
    mockParseStdoutJson.mockReturnValue({
      success: true,
      facesDetected: 2,
      faces: [{ x: 1, y: 2, w: 3, h: 4 }],
      model: "codeformer",
    });

    const result = await enhanceFaces(INPUT_BUFFER, OUTPUT_DIR);

    expect(result.facesDetected).toBe(2);
    expect(result.model).toBe("codeformer");
    expect(result.faces).toHaveLength(1);
  });

  it("defaults model to 'unknown'", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true, facesDetected: 0 });

    const result = await enhanceFaces(INPUT_BUFFER, OUTPUT_DIR);

    expect(result.model).toBe("unknown");
  });

  it("throws on failure with specific error", async () => {
    mockParseStdoutJson.mockReturnValue({ success: false, error: "GFPGAN not installed" });

    await expect(enhanceFaces(INPUT_BUFFER, OUTPUT_DIR)).rejects.toThrow("GFPGAN not installed");
  });

  it("provides fallback error message", async () => {
    mockParseStdoutJson.mockReturnValue({ success: false });

    await expect(enhanceFaces(INPUT_BUFFER, OUTPUT_DIR)).rejects.toThrow("Face enhancement failed");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// detectFaceLandmarks
// ═══════════════════════════════════════════════════════════════════════════

describe("detectFaceLandmarks", () => {
  it("calls face_landmarks.py", async () => {
    mockParseStdoutJson.mockReturnValue({
      success: true,
      faceDetected: true,
      landmarks: null,
    });

    await detectFaceLandmarks(INPUT_BUFFER);

    const [script] = mockRunPythonWithProgress.mock.calls[0];
    expect(script).toBe("face_landmarks.py");
  });

  it("passes 'unused' as output path and empty JSON options", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true, faceDetected: false });

    await detectFaceLandmarks(INPUT_BUFFER);

    const [, args] = mockRunPythonWithProgress.mock.calls[0];
    expect(args[1]).toBe("unused");
    expect(args[2]).toBe("{}");
  });

  it("returns landmarks result", async () => {
    const landmarks = {
      leftEye: { x: 100, y: 100 },
      rightEye: { x: 200, y: 100 },
      eyeCenter: { x: 150, y: 100 },
      chin: { x: 150, y: 250 },
      forehead: { x: 150, y: 50 },
      crown: { x: 150, y: 30 },
      nose: { x: 150, y: 150 },
      faceCenterX: 150,
    };
    mockParseStdoutJson.mockReturnValue({
      success: true,
      faceDetected: true,
      landmarks,
      imageWidth: 800,
      imageHeight: 600,
    });

    const result = await detectFaceLandmarks(INPUT_BUFFER);

    expect(result.faceDetected).toBe(true);
    expect(result.landmarks).toEqual(landmarks);
    expect(result.imageWidth).toBe(800);
    expect(result.imageHeight).toBe(600);
  });

  it("returns null landmarks when no face found", async () => {
    mockParseStdoutJson.mockReturnValue({
      success: true,
      faceDetected: false,
    });

    const result = await detectFaceLandmarks(INPUT_BUFFER);

    expect(result.faceDetected).toBe(false);
    expect(result.landmarks).toBeNull();
  });

  it("defaults dimensions to 0 when absent", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true, faceDetected: false });

    const result = await detectFaceLandmarks(INPUT_BUFFER);

    expect(result.imageWidth).toBe(0);
    expect(result.imageHeight).toBe(0);
  });

  it("cleans up temp file", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true, faceDetected: false });

    await detectFaceLandmarks(INPUT_BUFFER);

    expect(mockUnlink).toHaveBeenCalledTimes(1);
  });

  it("throws on failure", async () => {
    mockParseStdoutJson.mockReturnValue({ success: false, error: "MediaPipe not found" });

    await expect(detectFaceLandmarks(INPUT_BUFFER)).rejects.toThrow("MediaPipe not found");
  });

  it("converts input buffer to PNG before writing", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true, faceDetected: false });

    await detectFaceLandmarks(INPUT_BUFFER);

    expect(mockSharp).toHaveBeenCalledWith(INPUT_BUFFER);
    expect(mockWriteFile).toHaveBeenCalledWith(expect.any(String), Buffer.from("mock-png"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// inpaint
// ═══════════════════════════════════════════════════════════════════════════

describe("inpaint", () => {
  const MASK_BUFFER = Buffer.from("mask-data");

  it("calls inpaint.py with input, mask, and output paths", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true });

    await inpaint(INPUT_BUFFER, MASK_BUFFER, OUTPUT_DIR);

    const [script, args] = mockRunPythonWithProgress.mock.calls[0];
    expect(script).toBe("inpaint.py");
    expect(args).toHaveLength(3);
    expect(args[0]).toContain("input_inpaint.png");
    expect(args[1]).toContain("mask_inpaint.png");
    expect(args[2]).toContain("output_inpaint.png");
  });

  it("converts both input and mask to PNG", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true });

    await inpaint(INPUT_BUFFER, MASK_BUFFER, OUTPUT_DIR);

    // sharp is called for both input and mask
    expect(mockSharp).toHaveBeenCalledTimes(2);
  });

  it("writes both input and mask files", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true });

    await inpaint(INPUT_BUFFER, MASK_BUFFER, OUTPUT_DIR);

    expect(mockWriteFile).toHaveBeenCalledTimes(2);
  });

  it("returns the output buffer", async () => {
    const outputBuf = Buffer.from("inpainted");
    mockReadFile.mockResolvedValue(outputBuf);
    mockParseStdoutJson.mockReturnValue({ success: true });

    const result = await inpaint(INPUT_BUFFER, MASK_BUFFER, OUTPUT_DIR);

    expect(result).toBe(outputBuf);
  });

  it("throws on failure", async () => {
    mockParseStdoutJson.mockReturnValue({ success: false, error: "LaMa model not found" });

    await expect(inpaint(INPUT_BUFFER, MASK_BUFFER, OUTPUT_DIR)).rejects.toThrow(
      "LaMa model not found",
    );
  });

  it("provides fallback error message", async () => {
    mockParseStdoutJson.mockReturnValue({ success: false });

    await expect(inpaint(INPUT_BUFFER, MASK_BUFFER, OUTPUT_DIR)).rejects.toThrow(
      "Inpainting failed",
    );
  });

  it("forwards onProgress", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true });

    const onProgress = vi.fn();
    await inpaint(INPUT_BUFFER, MASK_BUFFER, OUTPUT_DIR, onProgress);

    const [, , opts] = mockRunPythonWithProgress.mock.calls[0];
    expect(opts.onProgress).toBe(onProgress);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// noiseRemoval
// ═══════════════════════════════════════════════════════════════════════════

describe("noiseRemoval", () => {
  it("calls noise_removal.py", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true, width: 800, height: 600 });

    await noiseRemoval(INPUT_BUFFER, OUTPUT_DIR);

    const [script] = mockRunPythonWithProgress.mock.calls[0];
    expect(script).toBe("noise_removal.py");
  });

  it("passes options as JSON", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true, width: 800, height: 600 });

    await noiseRemoval(INPUT_BUFFER, OUTPUT_DIR, {
      tier: "quality",
      strength: 0.8,
      detailPreservation: 0.5,
    });

    const [, args] = mockRunPythonWithProgress.mock.calls[0];
    const optsArg = JSON.parse(args[2]);
    expect(optsArg.tier).toBe("quality");
    expect(optsArg.strength).toBe(0.8);
    expect(optsArg.detailPreservation).toBe(0.5);
  });

  it("returns structured result", async () => {
    mockParseStdoutJson.mockReturnValue({
      success: true,
      width: 1920,
      height: 1080,
      format: "png",
      tier: "quality",
    });

    const result = await noiseRemoval(INPUT_BUFFER, OUTPUT_DIR);

    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(result.format).toBe("png");
    expect(result.tier).toBe("quality");
  });

  it("defaults format and tier", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true, width: 100, height: 100 });

    const result = await noiseRemoval(INPUT_BUFFER, OUTPUT_DIR);

    expect(result.format).toBe("png");
    expect(result.tier).toBe("balanced");
  });

  it("prefers tier from result over options", async () => {
    mockParseStdoutJson.mockReturnValue({
      success: true,
      width: 100,
      height: 100,
      tier: "fast",
    });

    const result = await noiseRemoval(INPUT_BUFFER, OUTPUT_DIR, { tier: "quality" });

    expect(result.tier).toBe("fast");
  });

  it("calculates timeout based on megapixels", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true, width: 100, height: 100 });

    await noiseRemoval(INPUT_BUFFER, OUTPUT_DIR);

    const [, , opts] = mockRunPythonWithProgress.mock.calls[0];
    expect(opts.timeout).toBeGreaterThanOrEqual(300_000);
  });

  it("throws on failure", async () => {
    mockParseStdoutJson.mockReturnValue({ success: false, error: "Denoiser unavailable" });

    await expect(noiseRemoval(INPUT_BUFFER, OUTPUT_DIR)).rejects.toThrow("Denoiser unavailable");
  });

  it("uses output_path from result when available", async () => {
    mockParseStdoutJson.mockReturnValue({
      success: true,
      width: 100,
      height: 100,
      output_path: "/custom/denoise.png",
    });

    await noiseRemoval(INPUT_BUFFER, OUTPUT_DIR);

    expect(mockReadFile).toHaveBeenCalledWith("/custom/denoise.png");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// extractText (OCR)
// ═══════════════════════════════════════════════════════════════════════════

describe("extractText (OCR)", () => {
  it("uses built-in Tesseract for the default Fast tier", async () => {
    await extractText(INPUT_BUFFER, OUTPUT_DIR);

    expect(mockRunTesseract).toHaveBeenCalledWith(
      expect.stringContaining("input_ocr.png"),
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );
    expect(mockRunPythonWithProgress).not.toHaveBeenCalled();
  });

  it("passes accurate options to the isolated runtime", async () => {
    await extractText(INPUT_BUFFER, OUTPUT_DIR, { quality: "best", language: "en" });

    const [, args] = mockRunOcrRuntime.mock.calls[0];
    const optsArg = JSON.parse(args[1]);
    expect(optsArg.quality).toBe("best");
    expect(optsArg.language).toBe("en");
  });

  it("returns text and truthful engine metadata", async () => {
    const result = await extractText(INPUT_BUFFER, OUTPUT_DIR);

    expect(result.text).toBe("Sample OCR text");
    expect(result.engine).toBe("tesseract");
    expect(result.actualQuality).toBe("fast");
  });

  it("preserves source resolution", async () => {
    const chain = createSharpChain();
    mockSharp.mockReturnValue(chain);

    await extractText(INPUT_BUFFER, OUTPUT_DIR);

    expect(chain.resize).not.toHaveBeenCalled();
  });

  it("throws on Fast failure", async () => {
    mockRunTesseract.mockRejectedValueOnce(new Error("Tesseract failed"));

    await expect(extractText(INPUT_BUFFER, OUTPUT_DIR)).rejects.toThrow("Tesseract failed");
  });

  it("rejects incomplete accurate metadata without falling back", async () => {
    mockRunOcrRuntime.mockResolvedValueOnce({
      result: { success: true, text: "incomplete" },
      stderr: "",
      runtime: {
        generation: "test",
        artifactVersion: "2.1.0",
        target: "linux-amd64-cpu-py312",
        providers: ["CPUExecutionProvider"],
        models: {},
      },
    });

    await expect(extractText(INPUT_BUFFER, OUTPUT_DIR, { quality: "best" })).rejects.toThrow(
      "invalid metadata",
    );
    expect(mockRunTesseract).not.toHaveBeenCalled();
  });

  it("calculates timeout based on megapixels", async () => {
    await extractText(INPUT_BUFFER, OUTPUT_DIR);

    const [, opts] = mockRunTesseract.mock.calls[0];
    expect(opts.timeoutMs).toBeGreaterThanOrEqual(600_000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// removeRedEye
// ═══════════════════════════════════════════════════════════════════════════

describe("removeRedEye", () => {
  it("calls red_eye_removal.py", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true, width: 800, height: 600 });

    await removeRedEye(INPUT_BUFFER, OUTPUT_DIR);

    const [script] = mockRunPythonWithProgress.mock.calls[0];
    expect(script).toBe("red_eye_removal.py");
  });

  it("passes options as JSON", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true, width: 800, height: 600 });

    await removeRedEye(INPUT_BUFFER, OUTPUT_DIR, { sensitivity: 0.6, strength: 0.9 });

    const [, args] = mockRunPythonWithProgress.mock.calls[0];
    const optsArg = JSON.parse(args[2]);
    expect(optsArg.sensitivity).toBe(0.6);
    expect(optsArg.strength).toBe(0.9);
  });

  it("returns structured result", async () => {
    mockParseStdoutJson.mockReturnValue({
      success: true,
      facesDetected: 2,
      eyesCorrected: 3,
      width: 1920,
      height: 1080,
      format: "png",
    });

    const result = await removeRedEye(INPUT_BUFFER, OUTPUT_DIR);

    expect(result.facesDetected).toBe(2);
    expect(result.eyesCorrected).toBe(3);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(result.format).toBe("png");
  });

  it("defaults optional fields", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true, width: 100, height: 100 });

    const result = await removeRedEye(INPUT_BUFFER, OUTPUT_DIR);

    expect(result.facesDetected).toBe(0);
    expect(result.eyesCorrected).toBe(0);
    expect(result.format).toBe("png");
  });

  it("throws on failure", async () => {
    mockParseStdoutJson.mockReturnValue({ success: false, error: "Eye detector failed" });

    await expect(removeRedEye(INPUT_BUFFER, OUTPUT_DIR)).rejects.toThrow("Eye detector failed");
  });

  it("provides fallback error message", async () => {
    mockParseStdoutJson.mockReturnValue({ success: false });

    await expect(removeRedEye(INPUT_BUFFER, OUTPUT_DIR)).rejects.toThrow("Red eye removal failed");
  });

  it("uses output_path from result when available", async () => {
    mockParseStdoutJson.mockReturnValue({
      success: true,
      width: 100,
      height: 100,
      output_path: "/alt/redeye.png",
    });

    await removeRedEye(INPUT_BUFFER, OUTPUT_DIR);

    expect(mockReadFile).toHaveBeenCalledWith("/alt/redeye.png");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// restorePhoto
// ═══════════════════════════════════════════════════════════════════════════

describe("restorePhoto", () => {
  it("calls restore.py", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true, width: 800, height: 600 });

    await restorePhoto(INPUT_BUFFER, OUTPUT_DIR);

    const [script] = mockRunPythonWithProgress.mock.calls[0];
    expect(script).toBe("restore.py");
  });

  it("passes options as JSON", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true, width: 800, height: 600 });

    await restorePhoto(INPUT_BUFFER, OUTPUT_DIR, {
      mode: "heavy",
      scratchRemoval: true,
      faceEnhancement: true,
      fidelity: 0.5,
      denoise: true,
      denoiseStrength: 0.3,
      colorize: true,
    });

    const [, args] = mockRunPythonWithProgress.mock.calls[0];
    const optsArg = JSON.parse(args[2]);
    expect(optsArg.mode).toBe("heavy");
    expect(optsArg.scratchRemoval).toBe(true);
    expect(optsArg.colorize).toBe(true);
  });

  it("returns full restoration result", async () => {
    mockParseStdoutJson.mockReturnValue({
      success: true,
      width: 2000,
      height: 1500,
      steps: ["denoise", "scratch_removal", "colorize"],
      scratchCoverage: 15.5,
      facesEnhanced: 2,
      isGrayscale: true,
      colorized: true,
    });

    const result = await restorePhoto(INPUT_BUFFER, OUTPUT_DIR);

    expect(result.width).toBe(2000);
    expect(result.height).toBe(1500);
    expect(result.steps).toEqual(["denoise", "scratch_removal", "colorize"]);
    expect(result.scratchCoverage).toBe(15.5);
    expect(result.facesEnhanced).toBe(2);
    expect(result.isGrayscale).toBe(true);
    expect(result.colorized).toBe(true);
  });

  it("defaults optional result fields", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true, width: 100, height: 100 });

    const result = await restorePhoto(INPUT_BUFFER, OUTPUT_DIR);

    expect(result.steps).toEqual([]);
    expect(result.scratchCoverage).toBe(0);
    expect(result.facesEnhanced).toBe(0);
    expect(result.isGrayscale).toBe(false);
    expect(result.colorized).toBe(false);
  });

  it("throws on failure", async () => {
    mockParseStdoutJson.mockReturnValue({ success: false, error: "Restoration model missing" });

    await expect(restorePhoto(INPUT_BUFFER, OUTPUT_DIR)).rejects.toThrow(
      "Restoration model missing",
    );
  });

  it("provides fallback error message", async () => {
    mockParseStdoutJson.mockReturnValue({ success: false });

    await expect(restorePhoto(INPUT_BUFFER, OUTPUT_DIR)).rejects.toThrow(
      "Photo restoration failed",
    );
  });

  it("uses output_path from result when available", async () => {
    mockParseStdoutJson.mockReturnValue({
      success: true,
      width: 100,
      height: 100,
      output_path: "/restored/out.png",
    });

    await restorePhoto(INPUT_BUFFER, OUTPUT_DIR);

    expect(mockReadFile).toHaveBeenCalledWith("/restored/out.png");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// upscale
// ═══════════════════════════════════════════════════════════════════════════

describe("upscale", () => {
  it("calls upscale.py", async () => {
    mockParseStdoutJson.mockReturnValue({
      success: true,
      width: 1600,
      height: 1200,
      method: "realesrgan",
    });

    await upscale(INPUT_BUFFER, OUTPUT_DIR);

    const [script] = mockRunPythonWithProgress.mock.calls[0];
    expect(script).toBe("upscale.py");
  });

  it("passes options as JSON", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true, width: 3200, height: 2400 });

    await upscale(INPUT_BUFFER, OUTPUT_DIR, {
      scale: 4,
      model: "realesrgan-x4plus",
      faceEnhance: true,
      denoise: 0.5,
    });

    const [, args] = mockRunPythonWithProgress.mock.calls[0];
    const optsArg = JSON.parse(args[2]);
    expect(optsArg.scale).toBe(4);
    expect(optsArg.model).toBe("realesrgan-x4plus");
    expect(optsArg.faceEnhance).toBe(true);
    expect(optsArg.denoise).toBe(0.5);
  });

  it("returns structured result", async () => {
    mockParseStdoutJson.mockReturnValue({
      success: true,
      width: 3200,
      height: 2400,
      method: "realesrgan",
      format: "png",
    });

    const result = await upscale(INPUT_BUFFER, OUTPUT_DIR);

    expect(result.width).toBe(3200);
    expect(result.height).toBe(2400);
    expect(result.method).toBe("realesrgan");
    expect(result.format).toBe("png");
  });

  it("defaults method and format", async () => {
    mockParseStdoutJson.mockReturnValue({ success: true, width: 100, height: 100 });

    const result = await upscale(INPUT_BUFFER, OUTPUT_DIR);

    expect(result.method).toBe("unknown");
    expect(result.format).toBe("png");
  });

  it("calculates timeout with GPU rate when GPU available", async () => {
    mockIsGpuAvailable.mockReturnValue(true);
    mockParseStdoutJson.mockReturnValue({ success: true, width: 100, height: 100 });

    await upscale(INPUT_BUFFER, OUTPUT_DIR, { scale: 2 });

    const [, , opts] = mockRunPythonWithProgress.mock.calls[0];
    // GPU rate is 30_000 per MP, CPU rate is 180_000
    // With GPU, timeout should be lower than CPU
    expect(opts.timeout).toBeGreaterThanOrEqual(600_000);
  });

  it("calculates higher timeout for CPU mode", async () => {
    mockIsGpuAvailable.mockReturnValue(false);
    mockParseStdoutJson.mockReturnValue({ success: true, width: 100, height: 100 });

    await upscale(INPUT_BUFFER, OUTPUT_DIR, { scale: 4 });

    const [, , opts] = mockRunPythonWithProgress.mock.calls[0];
    expect(opts.timeout).toBeGreaterThanOrEqual(600_000);
  });

  it("throws on failure", async () => {
    mockParseStdoutJson.mockReturnValue({ success: false, error: "RealESRGAN OOM" });

    await expect(upscale(INPUT_BUFFER, OUTPUT_DIR)).rejects.toThrow("RealESRGAN OOM");
  });

  it("provides fallback error message", async () => {
    mockParseStdoutJson.mockReturnValue({ success: false });

    await expect(upscale(INPUT_BUFFER, OUTPUT_DIR)).rejects.toThrow("Upscaling failed");
  });

  it("uses output_path from result when available", async () => {
    mockParseStdoutJson.mockReturnValue({
      success: true,
      width: 100,
      height: 100,
      output_path: "/custom/upscaled.webp",
    });

    await upscale(INPUT_BUFFER, OUTPUT_DIR);

    expect(mockReadFile).toHaveBeenCalledWith("/custom/upscaled.webp");
  });

  it("defaults scale to 2 for timeout calculation", async () => {
    mockIsGpuAvailable.mockReturnValue(false);
    mockParseStdoutJson.mockReturnValue({ success: true, width: 100, height: 100 });

    await upscale(INPUT_BUFFER, OUTPUT_DIR); // no scale option

    const [, , opts] = mockRunPythonWithProgress.mock.calls[0];
    // scale defaults to 2, effectiveMp = mp * 4
    expect(opts.timeout).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// seamCarve (uses caire binary, not Python bridge)
// ═══════════════════════════════════════════════════════════════════════════

describe("seamCarve", () => {
  beforeEach(() => {
    // Mock execFile for findCaire -- the -help call and the actual carve call
    mockExecFile.mockResolvedValue({ stdout: "", stderr: "" });
    mockReadFile.mockResolvedValue(Buffer.from("carved-output"));
  });

  it("writes input as JPEG", async () => {
    const chain = createSharpChain();
    mockSharp.mockReturnValue(chain);

    await seamCarve(INPUT_BUFFER, OUTPUT_DIR, { width: 600 });

    expect(chain.jpeg).toHaveBeenCalledWith({ quality: 95 });
  });

  it("passes -width and -height flags", async () => {
    await seamCarve(INPUT_BUFFER, OUTPUT_DIR, { width: 600, height: 400 });

    // The actual carve call (second call -- first is -help for findCaire)
    const carveCall = mockExecFile.mock.calls.find(
      (c) => Array.isArray(c[1]) && c[1].includes("-width"),
    );
    expect(carveCall).toBeDefined();
    const args = carveCall?.[1] as string[];
    expect(args).toContain("-width");
    expect(args).toContain("600");
    expect(args).toContain("-height");
    expect(args).toContain("400");
  });

  it("passes -face flag when protectFaces is true", async () => {
    await seamCarve(INPUT_BUFFER, OUTPUT_DIR, { width: 600, protectFaces: true });

    const carveCall = mockExecFile.mock.calls.find(
      (c) => Array.isArray(c[1]) && c[1].includes("-face"),
    );
    expect(carveCall).toBeDefined();
  });

  it("passes -square flag with shortest dimension", async () => {
    await seamCarve(INPUT_BUFFER, OUTPUT_DIR, { square: true });

    const carveCall = mockExecFile.mock.calls.find(
      (c) => Array.isArray(c[1]) && c[1].includes("-square"),
    );
    expect(carveCall).toBeDefined();
    const args = carveCall?.[1] as string[];
    // For 800x600 image, shortest = 600
    expect(args).toContain("-width");
    expect(args).toContain("600");
  });

  it("passes blur and sobel options", async () => {
    await seamCarve(INPUT_BUFFER, OUTPUT_DIR, {
      width: 600,
      blurRadius: 3,
      sobelThreshold: 5,
    });

    const carveCall = mockExecFile.mock.calls.find(
      (c) => Array.isArray(c[1]) && c[1].includes("-blur"),
    );
    expect(carveCall).toBeDefined();
    const args = carveCall?.[1] as string[];
    expect(args).toContain("-blur");
    expect(args).toContain("3");
    expect(args).toContain("-sobel");
    expect(args).toContain("5");
  });

  it("returns buffer with dimensions", async () => {
    const outChain = createSharpChain({ width: 600, height: 600 });
    // First call for input, second for output metadata
    let callIdx = 0;
    mockSharp.mockImplementation(() => {
      callIdx++;
      if (callIdx >= 3) return outChain;
      return createSharpChain();
    });

    const result = await seamCarve(INPUT_BUFFER, OUTPUT_DIR, { width: 600 });

    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    expect(typeof result.width).toBe("number");
    expect(typeof result.height).toBe("number");
  });

  it("cleans up temp files in finally block", async () => {
    await seamCarve(INPUT_BUFFER, OUTPUT_DIR, { width: 600 });

    expect(mockRm).toHaveBeenCalledTimes(2);
  });

  it("cleans up temp files even on error", async () => {
    // findCaire caches the path after the first successful call, so only
    // the actual carve invocation needs to be mocked here.
    mockExecFile.mockRejectedValueOnce(new Error("caire crashed"));

    await expect(seamCarve(INPUT_BUFFER, OUTPUT_DIR, { width: 600 })).rejects.toThrow(
      "caire crashed",
    );
    expect(mockRm).toHaveBeenCalledTimes(2);
  });

  it("rejects images larger than 25 MP", async () => {
    // 6000 x 5000 = 30 MP
    mockSharp.mockReturnValue(createSharpChain({ width: 6000, height: 5000 }));

    await expect(seamCarve(INPUT_BUFFER, OUTPUT_DIR, { width: 5000 })).rejects.toThrow(
      "too large for content-aware resize",
    );
  });

  it("pre-resizes when reduction exceeds 75% instead of rejecting", async () => {
    // 800x600, requesting width: 100 => ratio 0.125 < 0.25
    // Should succeed by pre-resizing to bring within 75% limit
    await expect(seamCarve(INPUT_BUFFER, OUTPUT_DIR, { width: 100 })).resolves.toBeDefined();
  });

  it("uses original dimensions when width/height not specified", async () => {
    await seamCarve(INPUT_BUFFER, OUTPUT_DIR);

    // Should not throw -- target equals original (800x600)
    const carveCall = mockExecFile.mock.calls.find(
      (c) => Array.isArray(c[1]) && c[1].includes("-in"),
    );
    expect(carveCall).toBeDefined();
  });

  it("calculates timeout based on megapixels", async () => {
    await seamCarve(INPUT_BUFFER, OUTPUT_DIR, { width: 600 });

    const carveCall = mockExecFile.mock.calls.find(
      (c) => Array.isArray(c[1]) && c[1].includes("-in"),
    );
    expect(carveCall).toBeDefined();
    const opts = carveCall?.[2] as { timeout: number };
    expect(opts.timeout).toBeGreaterThanOrEqual(120_000);
  });

  it("passes -preview=false", async () => {
    await seamCarve(INPUT_BUFFER, OUTPUT_DIR, { width: 600 });

    const carveCall = mockExecFile.mock.calls.find(
      (c) => Array.isArray(c[1]) && c[1].includes("-preview=false"),
    );
    expect(carveCall).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Cross-cutting: all Python-based tools share common patterns
// ═══════════════════════════════════════════════════════════════════════════

describe("cross-cutting tool patterns", () => {
  it("all Python tools call parseStdoutJson on the result", async () => {
    mockParseStdoutJson.mockReturnValue({
      success: true,
      width: 100,
      height: 100,
      text: "",
      facesDetected: 0,
      faces: [],
      faceDetected: false,
    });

    // Run each tool
    await colorize(INPUT_BUFFER, OUTPUT_DIR);
    await blurFaces(INPUT_BUFFER, OUTPUT_DIR);
    await enhanceFaces(INPUT_BUFFER, OUTPUT_DIR);
    await noiseRemoval(INPUT_BUFFER, OUTPUT_DIR);
    await removeRedEye(INPUT_BUFFER, OUTPUT_DIR);
    await restorePhoto(INPUT_BUFFER, OUTPUT_DIR);

    // Each tool calls parseStdoutJson exactly once
    expect(mockParseStdoutJson).toHaveBeenCalledTimes(6);
  });

  it("all Python tools propagate runPythonWithProgress errors", async () => {
    mockRunPythonWithProgress.mockRejectedValue(new Error("Python script timed out"));

    await expect(colorize(INPUT_BUFFER, OUTPUT_DIR)).rejects.toThrow("timed out");
    await expect(blurFaces(INPUT_BUFFER, OUTPUT_DIR)).rejects.toThrow("timed out");
    await expect(enhanceFaces(INPUT_BUFFER, OUTPUT_DIR)).rejects.toThrow("timed out");
    await expect(noiseRemoval(INPUT_BUFFER, OUTPUT_DIR)).rejects.toThrow("timed out");
    await expect(removeRedEye(INPUT_BUFFER, OUTPUT_DIR)).rejects.toThrow("timed out");
    await expect(restorePhoto(INPUT_BUFFER, OUTPUT_DIR)).rejects.toThrow("timed out");
    await expect(upscale(INPUT_BUFFER, OUTPUT_DIR)).rejects.toThrow("timed out");

    mockRunOcrRuntime.mockRejectedValueOnce(new Error("OCR runtime timed out"));
    await expect(extractText(INPUT_BUFFER, OUTPUT_DIR, { quality: "balanced" })).rejects.toThrow(
      "timed out",
    );
  });

  it("all Python tools convert input to PNG via sharp", async () => {
    mockParseStdoutJson.mockReturnValue({
      success: true,
      width: 100,
      height: 100,
      text: "",
      facesDetected: 0,
      faces: [],
    });

    const chain = createSharpChain();
    mockSharp.mockReturnValue(chain);

    await colorize(INPUT_BUFFER, OUTPUT_DIR);
    expect(chain.png).toHaveBeenCalled();

    chain.png.mockClear();
    await blurFaces(INPUT_BUFFER, OUTPUT_DIR);
    expect(chain.png).toHaveBeenCalled();
  });

  it("all Python tools accept default empty options", async () => {
    mockParseStdoutJson.mockReturnValue({
      success: true,
      width: 100,
      height: 100,
      text: "",
      facesDetected: 0,
      faces: [],
      faceDetected: false,
    });

    // These should not throw due to missing options
    await colorize(INPUT_BUFFER, OUTPUT_DIR);
    await blurFaces(INPUT_BUFFER, OUTPUT_DIR);
    await enhanceFaces(INPUT_BUFFER, OUTPUT_DIR);
    await noiseRemoval(INPUT_BUFFER, OUTPUT_DIR);
    await removeRedEye(INPUT_BUFFER, OUTPUT_DIR);
    await restorePhoto(INPUT_BUFFER, OUTPUT_DIR);
    await upscale(INPUT_BUFFER, OUTPUT_DIR);
    await extractText(INPUT_BUFFER, OUTPUT_DIR);
    await detectFaceLandmarks(INPUT_BUFFER);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// seamCarve (imported separately since it uses caire, not Python bridge)
// ═══════════════════════════════════════════════════════════════════════════

import { seamCarve } from "../../../packages/ai/src/seam-carving.js";
