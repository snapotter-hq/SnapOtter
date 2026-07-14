import { readFile, rm, unlink, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock sharp before any imports that use it
vi.mock("sharp", () => {
  const mockSharp = vi.fn(() => ({
    resize: vi.fn().mockReturnThis(),
    png: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
    toFile: vi.fn().mockResolvedValue({ size: 13 }),
    metadata: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
  }));
  return { default: mockSharp };
});

// Mock fs/promises
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from("mock-output-data")),
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
}));

// Mock the bridge module
vi.mock("../../../packages/ai/src/bridge.js", () => ({
  runPythonWithProgress: vi.fn(),
  parseStdoutJson: vi.fn(),
  isGpuAvailable: vi.fn(() => false),
  shutdownDispatcher: vi.fn(),
}));

vi.mock("../../../packages/ai/src/ocr-runtime-dispatcher.js", () => ({
  runOcrRuntime: vi.fn(),
}));

vi.mock("../../../packages/ai/src/tesseract.js", () => ({
  runAdaptiveTesseract: vi.fn(),
  runTesseract: vi.fn(),
}));

// Import tool functions
import { removeBackground } from "../../../packages/ai/src/background-removal.js";
// Import the mocked bridge functions
import { parseStdoutJson, runPythonWithProgress } from "../../../packages/ai/src/bridge.js";
import { colorize } from "../../../packages/ai/src/colorization.js";
import { blurFaces, detectFaces } from "../../../packages/ai/src/face-detection.js";
import { enhanceFaces } from "../../../packages/ai/src/face-enhancement.js";
import { detectFaceLandmarks } from "../../../packages/ai/src/face-landmarks.js";
import { inpaint } from "../../../packages/ai/src/inpainting.js";
import { noiseRemoval } from "../../../packages/ai/src/noise-removal.js";
import { extractText } from "../../../packages/ai/src/ocr.js";
import { runOcrRuntime } from "../../../packages/ai/src/ocr-runtime-dispatcher.js";
import { removeRedEye } from "../../../packages/ai/src/red-eye-removal.js";
import { restorePhoto } from "../../../packages/ai/src/restoration.js";
import { runAdaptiveTesseract } from "../../../packages/ai/src/tesseract.js";
import { upscale } from "../../../packages/ai/src/upscaling.js";

const FAKE_INPUT = Buffer.from("fake-image-data");
const FAKE_OUTPUT_DIR = "/tmp/test-output";

beforeEach(() => {
  vi.clearAllMocks();

  // Re-establish fs mock defaults after clearAllMocks wipes them
  vi.mocked(readFile).mockResolvedValue(Buffer.from("mock-output-data"));
  vi.mocked(writeFile).mockResolvedValue(undefined);
  vi.mocked(unlink).mockResolvedValue(undefined);
  vi.mocked(rm).mockResolvedValue(undefined);

  // Default: runPythonWithProgress resolves with stdout containing success JSON
  vi.mocked(runPythonWithProgress).mockResolvedValue({
    stdout: '{"success": true}',
    stderr: "",
  });
  vi.mocked(runAdaptiveTesseract).mockResolvedValue({
    text: "Hello World",
    engine: "tesseract",
    device: "cpu",
    provider: "native",
  });
  vi.mocked(runOcrRuntime).mockResolvedValue({
    result: {
      success: true,
      text: "Accurate text",
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
      models: { detection: "digest" },
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── removeBackground ──────────────────────────────────────────────────

describe("removeBackground", () => {
  beforeEach(() => {
    vi.mocked(parseStdoutJson).mockReturnValue({ success: true });
  });

  it("calls runPythonWithProgress with remove_bg.py", async () => {
    await removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR);

    expect(runPythonWithProgress).toHaveBeenCalledWith(
      "remove_bg.py",
      expect.arrayContaining([expect.stringContaining("rembg_in_")]),
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
  });

  it("passes options as JSON string argument", async () => {
    await removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR, { model: "u2net" });

    const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
    const optionsArg = args[2];
    expect(JSON.parse(optionsArg)).toEqual({ model: "u2net" });
  });

  it("returns the output buffer on success", async () => {
    const outputBuf = Buffer.from("result-image");
    vi.mocked(readFile).mockResolvedValueOnce(outputBuf);

    const result = await removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR);
    expect(result).toBe(outputBuf);
  });

  it("throws when Python returns success: false", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: false,
      error: "Model not loaded",
    });

    await expect(removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("Model not loaded");
  });

  it("cleans up temp files on success", async () => {
    await removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR);

    // unlink is called for both input and output temp files
    expect(unlink).toHaveBeenCalledTimes(2);
  });

  it("cleans up temp files on failure", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({ success: false, error: "fail" });

    await expect(removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow();
    expect(unlink).toHaveBeenCalledTimes(2);
  });

  it("passes onProgress callback to runPythonWithProgress", async () => {
    const onProgress = vi.fn();
    await removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR, {}, onProgress);

    expect(runPythonWithProgress).toHaveBeenCalledWith(
      "remove_bg.py",
      expect.any(Array),
      expect.objectContaining({ onProgress }),
    );
  });

  it("uses higher timeout for birefnet models", async () => {
    await removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR, {
      model: "birefnet-general",
    });

    const options = vi.mocked(runPythonWithProgress).mock.calls[0][2];
    // birefnet base timeout is 600000 vs 300000 for others
    expect(options.timeout).toBeGreaterThanOrEqual(600000);
  });
});

// ── upscale ───────────────────────────────────────────────────────────

describe("upscale", () => {
  beforeEach(() => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      width: 1600,
      height: 1200,
      method: "realesrgan",
      format: "png",
    });
  });

  it("calls runPythonWithProgress with upscale.py", async () => {
    await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR);

    expect(runPythonWithProgress).toHaveBeenCalledWith(
      "upscale.py",
      expect.arrayContaining([
        expect.stringContaining("input_upscale.png"),
        expect.stringContaining("output_upscale.png"),
      ]),
      expect.any(Object),
    );
  });

  it("returns UpscaleResult with dimensions and method", async () => {
    const result = await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR);

    expect(result).toEqual({
      buffer: expect.any(Buffer),
      width: 1600,
      height: 1200,
      method: "realesrgan",
      format: "png",
    });
  });

  it("passes scale and model options as JSON", async () => {
    await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, { scale: 4, model: "realesrgan-x4plus" });

    const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
    const optionsArg = args[2];
    expect(JSON.parse(optionsArg)).toEqual({ scale: 4, model: "realesrgan-x4plus" });
  });

  it("throws when Python returns success: false", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: false,
      error: "CUDA error",
    });

    await expect(upscale(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("CUDA error");
  });

  it("reads from output_path when Python provides alternate path", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      width: 1600,
      height: 1200,
      output_path: "/tmp/test-output/output_upscale.webp",
    });

    await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR);

    expect(readFile).toHaveBeenCalledWith("/tmp/test-output/output_upscale.webp");
  });

  it("defaults method and format when not provided by Python", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      width: 800,
      height: 600,
    });

    const result = await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR);
    expect(result.method).toBe("unknown");
    expect(result.format).toBe("png");
  });
});

// ── extractText (OCR) ─────────────────────────────────────────────────

describe("extractText (OCR)", () => {
  it("uses built-in Tesseract for Fast without entering the Python bridge", async () => {
    await extractText(FAKE_INPUT, FAKE_OUTPUT_DIR);

    expect(runAdaptiveTesseract).toHaveBeenCalledWith(
      expect.stringContaining("input_ocr.png"),
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );
    expect(runPythonWithProgress).not.toHaveBeenCalled();
  });

  it("returns truthful complete Fast metadata", async () => {
    const result = await extractText(FAKE_INPUT, FAKE_OUTPUT_DIR);

    expect(result).toMatchObject({
      text: "Hello World",
      engine: "tesseract",
      requestedQuality: "fast",
      actualQuality: "fast",
      device: "cpu",
      provider: "native",
      degraded: false,
    });
  });

  it("passes Best and language options to the isolated runtime", async () => {
    await extractText(FAKE_INPUT, FAKE_OUTPUT_DIR, {
      quality: "best",
      language: "en",
    });

    const [, args] = vi.mocked(runOcrRuntime).mock.calls[0];
    const optionsArg = args[1];
    expect(JSON.parse(optionsArg)).toEqual({
      quality: "best",
      language: "en",
      enhance: true,
    });
  });

  it("propagates Tesseract failures", async () => {
    vi.mocked(runAdaptiveTesseract).mockRejectedValueOnce(new Error("Tesseract failed"));

    await expect(extractText(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("Tesseract failed");
  });

  it("rejects an accurate runtime failure without falling back", async () => {
    vi.mocked(runOcrRuntime).mockResolvedValueOnce({
      result: { success: false, error: "Accurate OCR failed" },
      stderr: "",
      runtime: {
        generation: "test",
        artifactVersion: "2.1.0",
        target: "linux-amd64-cpu-py312",
        providers: ["CPUExecutionProvider"],
        models: {},
      },
    });

    await expect(extractText(FAKE_INPUT, FAKE_OUTPUT_DIR, { quality: "best" })).rejects.toThrow(
      "Accurate OCR failed",
    );
    expect(runAdaptiveTesseract).not.toHaveBeenCalled();
  });
});

// ── colorize ──────────────────────────────────────────────────────────

describe("colorize", () => {
  beforeEach(() => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      width: 800,
      height: 600,
      method: "deoldify",
    });
  });

  it("calls runPythonWithProgress with colorize.py", async () => {
    await colorize(FAKE_INPUT, FAKE_OUTPUT_DIR);

    expect(runPythonWithProgress).toHaveBeenCalledWith(
      "colorize.py",
      expect.arrayContaining([
        expect.stringContaining("input_colorize.png"),
        expect.stringContaining("output_colorize.png"),
      ]),
      expect.any(Object),
    );
  });

  it("returns ColorizeResult with buffer and metadata", async () => {
    const result = await colorize(FAKE_INPUT, FAKE_OUTPUT_DIR);

    expect(result).toEqual({
      buffer: expect.any(Buffer),
      width: 800,
      height: 600,
      method: "deoldify",
    });
  });

  it("passes intensity option", async () => {
    await colorize(FAKE_INPUT, FAKE_OUTPUT_DIR, { intensity: 0.8 });

    const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
    expect(JSON.parse(args[2])).toEqual({ intensity: 0.8 });
  });

  it("throws when colorization fails", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

    await expect(colorize(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("Colorization failed");
  });

  it("reads from alternate output_path when provided", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      width: 800,
      height: 600,
      output_path: "/tmp/alt-output.png",
    });

    await colorize(FAKE_INPUT, FAKE_OUTPUT_DIR);
    expect(readFile).toHaveBeenCalledWith("/tmp/alt-output.png");
  });
});

// ── blurFaces ─────────────────────────────────────────────────────────

describe("blurFaces", () => {
  beforeEach(() => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      facesDetected: 2,
      faces: [
        { x: 10, y: 20, w: 50, h: 60 },
        { x: 100, y: 120, w: 55, h: 65 },
      ],
    });
  });

  it("calls runPythonWithProgress with detect_faces.py", async () => {
    await blurFaces(FAKE_INPUT, FAKE_OUTPUT_DIR);

    expect(runPythonWithProgress).toHaveBeenCalledWith(
      "detect_faces.py",
      expect.arrayContaining([
        expect.stringContaining("input_faces.png"),
        expect.stringContaining("output_faces.png"),
      ]),
      expect.any(Object),
    );
  });

  it("returns BlurFacesResult with face regions", async () => {
    const result = await blurFaces(FAKE_INPUT, FAKE_OUTPUT_DIR);

    expect(result.facesDetected).toBe(2);
    expect(result.faces).toHaveLength(2);
    expect(result.faces[0]).toEqual({ x: 10, y: 20, w: 50, h: 60 });
    expect(result.buffer).toBeInstanceOf(Buffer);
  });

  it("passes blur options", async () => {
    await blurFaces(FAKE_INPUT, FAKE_OUTPUT_DIR, {
      blurRadius: 20,
      sensitivity: 0.5,
    });

    const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
    expect(JSON.parse(args[2])).toEqual({ blurRadius: 20, sensitivity: 0.5 });
  });

  it("returns empty faces array when none detected", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      facesDetected: 0,
    });

    const result = await blurFaces(FAKE_INPUT, FAKE_OUTPUT_DIR);
    expect(result.facesDetected).toBe(0);
    expect(result.faces).toEqual([]);
  });

  it("throws when detection fails", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

    await expect(blurFaces(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("Face detection failed");
  });
});

// ── detectFaces ───────────────────────────────────────────────────────

describe("detectFaces", () => {
  beforeEach(() => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      facesDetected: 1,
      faces: [{ x: 50, y: 50, w: 100, h: 100 }],
    });
  });

  it("calls runPythonWithProgress with detectOnly option", async () => {
    await detectFaces(FAKE_INPUT);

    const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
    const optionsArg = JSON.parse(args[2]);
    expect(optionsArg.detectOnly).toBe(true);
  });

  it("returns DetectFacesResult without buffer", async () => {
    const result = await detectFaces(FAKE_INPUT);

    expect(result).toEqual({
      facesDetected: 1,
      faces: [{ x: 50, y: 50, w: 100, h: 100 }],
    });
    // detectFaces does not return a buffer (unlike blurFaces)
    expect(result).not.toHaveProperty("buffer");
  });

  it("cleans up temp input file after success", async () => {
    await detectFaces(FAKE_INPUT);
    expect(unlink).toHaveBeenCalled();
  });

  it("cleans up temp input file after failure", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

    await expect(detectFaces(FAKE_INPUT)).rejects.toThrow();
    expect(unlink).toHaveBeenCalled();
  });
});

// ── enhanceFaces ──────────────────────────────────────────────────────

describe("enhanceFaces", () => {
  beforeEach(() => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      facesDetected: 1,
      faces: [{ x: 10, y: 20, w: 80, h: 90 }],
      model: "gfpgan",
    });
  });

  it("calls runPythonWithProgress with enhance_faces.py", async () => {
    await enhanceFaces(FAKE_INPUT, FAKE_OUTPUT_DIR);

    expect(runPythonWithProgress).toHaveBeenCalledWith(
      "enhance_faces.py",
      expect.arrayContaining([
        expect.stringContaining("input_enhance_faces.png"),
        expect.stringContaining("output_enhance_faces.png"),
      ]),
      expect.any(Object),
    );
  });

  it("returns EnhanceFacesResult with model info", async () => {
    const result = await enhanceFaces(FAKE_INPUT, FAKE_OUTPUT_DIR);

    expect(result).toEqual({
      buffer: expect.any(Buffer),
      facesDetected: 1,
      faces: [{ x: 10, y: 20, w: 80, h: 90 }],
      model: "gfpgan",
    });
  });

  it("passes enhancement options", async () => {
    await enhanceFaces(FAKE_INPUT, FAKE_OUTPUT_DIR, {
      model: "codeformer",
      strength: 0.7,
      onlyCenterFace: true,
    });

    const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
    expect(JSON.parse(args[2])).toEqual({
      model: "codeformer",
      strength: 0.7,
      onlyCenterFace: true,
    });
  });

  it("throws when enhancement fails", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: false,
      error: "No faces found",
    });

    await expect(enhanceFaces(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("No faces found");
  });

  it("defaults model to unknown when not provided by Python", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      facesDetected: 0,
    });

    const result = await enhanceFaces(FAKE_INPUT, FAKE_OUTPUT_DIR);
    expect(result.model).toBe("unknown");
    expect(result.faces).toEqual([]);
  });
});

// ── detectFaceLandmarks ───────────────────────────────────────────────

describe("detectFaceLandmarks", () => {
  beforeEach(() => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      faceDetected: true,
      landmarks: {
        leftEye: { x: 100, y: 150 },
        rightEye: { x: 200, y: 150 },
        eyeCenter: { x: 150, y: 150 },
        chin: { x: 150, y: 300 },
        forehead: { x: 150, y: 80 },
        crown: { x: 150, y: 50 },
        nose: { x: 150, y: 200 },
        faceCenterX: 150,
      },
      imageWidth: 800,
      imageHeight: 600,
    });
  });

  it("calls runPythonWithProgress with face_landmarks.py", async () => {
    await detectFaceLandmarks(FAKE_INPUT);

    expect(runPythonWithProgress).toHaveBeenCalledWith(
      "face_landmarks.py",
      expect.arrayContaining([expect.stringContaining("face_landmarks_"), "unused", "{}"]),
      expect.any(Object),
    );
  });

  it("returns FaceLandmarksResult with all landmark points", async () => {
    const result = await detectFaceLandmarks(FAKE_INPUT);

    expect(result.faceDetected).toBe(true);
    expect(result.landmarks).toBeDefined();
    expect(result.landmarks?.leftEye).toEqual({ x: 100, y: 150 });
    expect(result.landmarks?.rightEye).toEqual({ x: 200, y: 150 });
    expect(result.imageWidth).toBe(800);
    expect(result.imageHeight).toBe(600);
  });

  it("returns null landmarks when no face detected", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      faceDetected: false,
      imageWidth: 800,
      imageHeight: 600,
    });

    const result = await detectFaceLandmarks(FAKE_INPUT);
    expect(result.faceDetected).toBe(false);
    expect(result.landmarks).toBeNull();
  });

  it("converts input buffer to PNG before writing", async () => {
    await detectFaceLandmarks(FAKE_INPUT);

    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining("face_landmarks_"),
      Buffer.from("mock-png-data"),
    );
  });

  it("cleans up temp file in finally block", async () => {
    await detectFaceLandmarks(FAKE_INPUT);
    expect(unlink).toHaveBeenCalled();
  });

  it("cleans up temp file even on failure", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

    await expect(detectFaceLandmarks(FAKE_INPUT)).rejects.toThrow();
    expect(unlink).toHaveBeenCalled();
  });
});

// ── inpaint ───────────────────────────────────────────────────────────

describe("inpaint", () => {
  beforeEach(() => {
    vi.mocked(parseStdoutJson).mockReturnValue({ success: true });
  });

  it("calls runPythonWithProgress with inpaint.py", async () => {
    const maskBuffer = Buffer.from("fake-mask");
    await inpaint(FAKE_INPUT, maskBuffer, FAKE_OUTPUT_DIR);

    expect(runPythonWithProgress).toHaveBeenCalledWith(
      "inpaint.py",
      expect.arrayContaining([
        expect.stringContaining("input_inpaint.png"),
        expect.stringContaining("mask_inpaint.png"),
        expect.stringContaining("output_inpaint.png"),
      ]),
      expect.any(Object),
    );
  });

  it("writes both input and mask files", async () => {
    const maskBuffer = Buffer.from("fake-mask");
    await inpaint(FAKE_INPUT, maskBuffer, FAKE_OUTPUT_DIR);

    // writeFile called for input and mask
    expect(writeFile).toHaveBeenCalledTimes(2);
  });

  it("returns the output buffer", async () => {
    const maskBuffer = Buffer.from("fake-mask");
    const outputBuf = Buffer.from("inpainted-result");
    vi.mocked(readFile).mockResolvedValueOnce(outputBuf);

    const result = await inpaint(FAKE_INPUT, maskBuffer, FAKE_OUTPUT_DIR);
    expect(result).toBe(outputBuf);
  });

  it("throws when inpainting fails", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: false,
      error: "Mask is empty",
    });

    const maskBuffer = Buffer.from("fake-mask");
    await expect(inpaint(FAKE_INPUT, maskBuffer, FAKE_OUTPUT_DIR)).rejects.toThrow("Mask is empty");
  });

  it("uses fallback error message when no error string", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

    const maskBuffer = Buffer.from("fake-mask");
    await expect(inpaint(FAKE_INPUT, maskBuffer, FAKE_OUTPUT_DIR)).rejects.toThrow(
      "Inpainting failed",
    );
  });
});

// ── noiseRemoval ──────────────────────────────────────────────────────

describe("noiseRemoval", () => {
  beforeEach(() => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      width: 800,
      height: 600,
      format: "png",
      tier: "balanced",
    });
  });

  it("calls runPythonWithProgress with noise_removal.py", async () => {
    await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR);

    expect(runPythonWithProgress).toHaveBeenCalledWith(
      "noise_removal.py",
      expect.arrayContaining([
        expect.stringContaining("input_denoise.png"),
        expect.stringContaining("output_denoise.png"),
      ]),
      expect.any(Object),
    );
  });

  it("returns NoiseRemovalResult with all fields", async () => {
    const result = await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR);

    expect(result).toEqual({
      buffer: expect.any(Buffer),
      width: 800,
      height: 600,
      format: "png",
      tier: "balanced",
    });
  });

  it("passes strength and tier options", async () => {
    await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR, {
      tier: "aggressive",
      strength: 0.9,
    });

    const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
    expect(JSON.parse(args[2])).toEqual({ tier: "aggressive", strength: 0.9 });
  });

  it("defaults tier from options when Python omits it", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      width: 800,
      height: 600,
    });

    const result = await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR, { tier: "aggressive" });
    expect(result.tier).toBe("aggressive");
    expect(result.format).toBe("png");
  });

  it("throws on failure", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

    await expect(noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("Noise removal failed");
  });
});

// ── removeRedEye ──────────────────────────────────────────────────────

describe("removeRedEye", () => {
  beforeEach(() => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      facesDetected: 1,
      eyesCorrected: 2,
      width: 800,
      height: 600,
      format: "png",
    });
  });

  it("calls runPythonWithProgress with red_eye_removal.py", async () => {
    await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR);

    expect(runPythonWithProgress).toHaveBeenCalledWith(
      "red_eye_removal.py",
      expect.arrayContaining([
        expect.stringContaining("input_redeye.png"),
        expect.stringContaining("output_redeye.png"),
      ]),
      expect.any(Object),
    );
  });

  it("returns RedEyeRemovalResult with correction counts", async () => {
    const result = await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR);

    expect(result).toEqual({
      buffer: expect.any(Buffer),
      facesDetected: 1,
      eyesCorrected: 2,
      width: 800,
      height: 600,
      format: "png",
    });
  });

  it("defaults facesDetected and eyesCorrected to 0", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      width: 800,
      height: 600,
    });

    const result = await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR);
    expect(result.facesDetected).toBe(0);
    expect(result.eyesCorrected).toBe(0);
  });

  it("passes sensitivity and strength options", async () => {
    await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR, {
      sensitivity: 0.8,
      strength: 0.6,
    });

    const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
    expect(JSON.parse(args[2])).toEqual({ sensitivity: 0.8, strength: 0.6 });
  });

  it("throws on failure", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

    await expect(removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
      "Red eye removal failed",
    );
  });
});

// ── restorePhoto ──────────────────────────────────────────────────────

describe("restorePhoto", () => {
  beforeEach(() => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      width: 800,
      height: 600,
      steps: ["denoise", "face_enhance"],
      scratchCoverage: 0.15,
      facesEnhanced: 2,
      isGrayscale: true,
      colorized: true,
    });
  });

  it("calls runPythonWithProgress with restore.py", async () => {
    await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR);

    expect(runPythonWithProgress).toHaveBeenCalledWith(
      "restore.py",
      expect.arrayContaining([
        expect.stringContaining("input_restore.png"),
        expect.stringContaining("output_restore.png"),
      ]),
      expect.any(Object),
    );
  });

  it("returns RestorePhotoResult with all metadata", async () => {
    const result = await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR);

    expect(result).toEqual({
      buffer: expect.any(Buffer),
      width: 800,
      height: 600,
      steps: ["denoise", "face_enhance"],
      scratchCoverage: 0.15,
      facesEnhanced: 2,
      isGrayscale: true,
      colorized: true,
    });
  });

  it("passes restoration options including scratch and colorize", async () => {
    await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR, {
      scratchRemoval: true,
      faceEnhancement: true,
      colorize: true,
    });

    const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
    expect(JSON.parse(args[2])).toEqual({
      scratchRemoval: true,
      faceEnhancement: true,
      colorize: true,
    });
  });

  it("defaults optional fields when Python omits them", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      width: 400,
      height: 300,
    });

    const result = await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR);
    expect(result.steps).toEqual([]);
    expect(result.scratchCoverage).toBe(0);
    expect(result.facesEnhanced).toBe(0);
    expect(result.isGrayscale).toBe(false);
    expect(result.colorized).toBe(false);
  });

  it("throws on failure", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

    await expect(restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
      "Photo restoration failed",
    );
  });
});

// ── error propagation from runPythonWithProgress ──────────────────────

describe("error propagation from bridge", () => {
  it("propagates isolated OCR runtime transport rejection", async () => {
    vi.mocked(runOcrRuntime).mockRejectedValue(new Error("OCR runtime timed out"));

    await expect(extractText(FAKE_INPUT, FAKE_OUTPUT_DIR, { quality: "balanced" })).rejects.toThrow(
      "OCR runtime timed out",
    );
  });

  it("propagates OOM errors through tool functions", async () => {
    vi.mocked(runPythonWithProgress).mockRejectedValue(
      new Error("Process killed (out of memory) -- try a lighter model or smaller image"),
    );

    await expect(colorize(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("out of memory");
  });

  it("propagates timeout through removeBackground", async () => {
    vi.mocked(runPythonWithProgress).mockRejectedValue(new Error("Python script timed out"));

    await expect(removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
      "Python script timed out",
    );
  });

  it("propagates timeout through blurFaces", async () => {
    vi.mocked(runPythonWithProgress).mockRejectedValue(new Error("Python script timed out"));

    await expect(blurFaces(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("Python script timed out");
  });

  it("propagates timeout through enhanceFaces", async () => {
    vi.mocked(runPythonWithProgress).mockRejectedValue(new Error("Python script timed out"));

    await expect(enhanceFaces(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
      "Python script timed out",
    );
  });

  it("propagates timeout through detectFaceLandmarks", async () => {
    vi.mocked(runPythonWithProgress).mockRejectedValue(new Error("Python script timed out"));

    await expect(detectFaceLandmarks(FAKE_INPUT)).rejects.toThrow("Python script timed out");
  });

  it("propagates timeout through inpaint", async () => {
    vi.mocked(runPythonWithProgress).mockRejectedValue(new Error("Python script timed out"));
    const maskBuffer = Buffer.from("fake-mask");

    await expect(inpaint(FAKE_INPUT, maskBuffer, FAKE_OUTPUT_DIR)).rejects.toThrow(
      "Python script timed out",
    );
  });

  it("propagates timeout through noiseRemoval", async () => {
    vi.mocked(runPythonWithProgress).mockRejectedValue(new Error("Python script timed out"));

    await expect(noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
      "Python script timed out",
    );
  });

  it("propagates timeout through removeRedEye", async () => {
    vi.mocked(runPythonWithProgress).mockRejectedValue(new Error("Python script timed out"));

    await expect(removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
      "Python script timed out",
    );
  });

  it("propagates timeout through restorePhoto", async () => {
    vi.mocked(runPythonWithProgress).mockRejectedValue(new Error("Python script timed out"));

    await expect(restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
      "Python script timed out",
    );
  });

  it("propagates timeout through upscale", async () => {
    vi.mocked(runPythonWithProgress).mockRejectedValue(new Error("Python script timed out"));

    await expect(upscale(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("Python script timed out");
  });

  it("propagates segfault through detectFaces", async () => {
    vi.mocked(runPythonWithProgress).mockRejectedValue(
      new Error("Process crashed (segmentation fault)"),
    );

    await expect(detectFaces(FAKE_INPUT)).rejects.toThrow("segmentation fault");
  });
});

// ── onProgress forwarding ────────────────────────────────────────────

describe("onProgress forwarding", () => {
  beforeEach(() => {
    vi.mocked(parseStdoutJson).mockReturnValue({ success: true });
  });

  it("colorize forwards onProgress", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      width: 800,
      height: 600,
      method: "deoldify",
    });
    const onProgress = vi.fn();
    await colorize(FAKE_INPUT, FAKE_OUTPUT_DIR, {}, onProgress);

    expect(runPythonWithProgress).toHaveBeenCalledWith(
      "colorize.py",
      expect.any(Array),
      expect.objectContaining({ onProgress }),
    );
  });

  it("blurFaces forwards onProgress", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      facesDetected: 0,
    });
    const onProgress = vi.fn();
    await blurFaces(FAKE_INPUT, FAKE_OUTPUT_DIR, {}, onProgress);

    expect(runPythonWithProgress).toHaveBeenCalledWith(
      "detect_faces.py",
      expect.any(Array),
      expect.objectContaining({ onProgress }),
    );
  });

  it("detectFaces forwards onProgress", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      facesDetected: 0,
    });
    const onProgress = vi.fn();
    await detectFaces(FAKE_INPUT, {}, onProgress);

    expect(runPythonWithProgress).toHaveBeenCalledWith(
      "detect_faces.py",
      expect.any(Array),
      expect.objectContaining({ onProgress }),
    );
  });

  it("enhanceFaces forwards onProgress", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      facesDetected: 0,
    });
    const onProgress = vi.fn();
    await enhanceFaces(FAKE_INPUT, FAKE_OUTPUT_DIR, {}, onProgress);

    expect(runPythonWithProgress).toHaveBeenCalledWith(
      "enhance_faces.py",
      expect.any(Array),
      expect.objectContaining({ onProgress }),
    );
  });

  it("detectFaceLandmarks forwards onProgress", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      faceDetected: false,
      imageWidth: 800,
      imageHeight: 600,
    });
    const onProgress = vi.fn();
    await detectFaceLandmarks(FAKE_INPUT, onProgress);

    expect(runPythonWithProgress).toHaveBeenCalledWith(
      "face_landmarks.py",
      expect.any(Array),
      expect.objectContaining({ onProgress }),
    );
  });

  it("inpaint forwards onProgress", async () => {
    const maskBuffer = Buffer.from("fake-mask");
    const onProgress = vi.fn();
    await inpaint(FAKE_INPUT, maskBuffer, FAKE_OUTPUT_DIR, onProgress);

    expect(runPythonWithProgress).toHaveBeenCalledWith(
      "inpaint.py",
      expect.any(Array),
      expect.objectContaining({ onProgress }),
    );
  });

  it("noiseRemoval forwards onProgress", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      width: 800,
      height: 600,
    });
    const onProgress = vi.fn();
    await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR, {}, onProgress);

    expect(runPythonWithProgress).toHaveBeenCalledWith(
      "noise_removal.py",
      expect.any(Array),
      expect.objectContaining({ onProgress }),
    );
  });

  it("removeRedEye forwards onProgress", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      width: 800,
      height: 600,
    });
    const onProgress = vi.fn();
    await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR, {}, onProgress);

    expect(runPythonWithProgress).toHaveBeenCalledWith(
      "red_eye_removal.py",
      expect.any(Array),
      expect.objectContaining({ onProgress }),
    );
  });

  it("restorePhoto forwards onProgress", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      width: 800,
      height: 600,
    });
    const onProgress = vi.fn();
    await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR, {}, onProgress);

    expect(runPythonWithProgress).toHaveBeenCalledWith(
      "restore.py",
      expect.any(Array),
      expect.objectContaining({ onProgress }),
    );
  });

  it("upscale forwards onProgress", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      width: 1600,
      height: 1200,
    });
    const onProgress = vi.fn();
    await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, {}, onProgress);

    expect(runPythonWithProgress).toHaveBeenCalledWith(
      "upscale.py",
      expect.any(Array),
      expect.objectContaining({ onProgress }),
    );
  });
});

// ── alternate output_path handling ───────────────────────────────────

describe("alternate output_path from Python", () => {
  it("noiseRemoval reads from alternate output_path", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      width: 800,
      height: 600,
      output_path: "/tmp/alt-denoise.webp",
    });

    await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR);
    expect(readFile).toHaveBeenCalledWith("/tmp/alt-denoise.webp");
  });

  it("removeRedEye reads from alternate output_path", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      width: 800,
      height: 600,
      output_path: "/tmp/alt-redeye.webp",
    });

    await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR);
    expect(readFile).toHaveBeenCalledWith("/tmp/alt-redeye.webp");
  });

  it("restorePhoto reads from alternate output_path", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      width: 800,
      height: 600,
      output_path: "/tmp/alt-restore.webp",
    });

    await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR);
    expect(readFile).toHaveBeenCalledWith("/tmp/alt-restore.webp");
  });

  it("upscale reads from alternate output_path", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      width: 1600,
      height: 1200,
      output_path: "/tmp/alt-upscale.webp",
    });

    await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR);
    expect(readFile).toHaveBeenCalledWith("/tmp/alt-upscale.webp");
  });
});

// ── fallback error messages ──────────────────────────────────────────

describe("fallback error messages when error string is absent", () => {
  it("removeBackground uses fallback message", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

    await expect(removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
      "Background removal failed",
    );
  });

  it("colorize uses fallback message", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

    await expect(colorize(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("Colorization failed");
  });

  it("blurFaces uses fallback message", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

    await expect(blurFaces(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("Face detection failed");
  });

  it("detectFaces uses fallback message", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

    await expect(detectFaces(FAKE_INPUT)).rejects.toThrow("Face detection failed");
  });

  it("enhanceFaces uses fallback message", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

    await expect(enhanceFaces(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
      "Face enhancement failed",
    );
  });

  it("detectFaceLandmarks uses fallback message", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

    await expect(detectFaceLandmarks(FAKE_INPUT)).rejects.toThrow("Face landmark detection failed");
  });

  it("noiseRemoval uses fallback message", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

    await expect(noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("Noise removal failed");
  });

  it("removeRedEye uses fallback message", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

    await expect(removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
      "Red eye removal failed",
    );
  });

  it("restorePhoto uses fallback message", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

    await expect(restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
      "Photo restoration failed",
    );
  });

  it("upscale uses fallback message", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

    await expect(upscale(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("Upscaling failed");
  });
});

// ── custom error messages from Python ────────────────────────────────

describe("custom error messages from Python result", () => {
  it("removeBackground surfaces Python error string", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: false,
      error: "CUDA out of memory",
    });

    await expect(removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
      "CUDA out of memory",
    );
  });

  it("blurFaces surfaces Python error string", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: false,
      error: "Invalid image format",
    });

    await expect(blurFaces(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("Invalid image format");
  });

  it("detectFaceLandmarks surfaces Python error string", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: false,
      error: "MediaPipe model not found",
    });

    await expect(detectFaceLandmarks(FAKE_INPUT)).rejects.toThrow("MediaPipe model not found");
  });

  it("noiseRemoval surfaces Python error string", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: false,
      error: "Denoising model error",
    });

    await expect(noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
      "Denoising model error",
    );
  });

  it("removeRedEye surfaces Python error string", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: false,
      error: "No red eyes found",
    });

    await expect(removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("No red eyes found");
  });

  it("restorePhoto surfaces Python error string", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: false,
      error: "Restoration pipeline crashed",
    });

    await expect(restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
      "Restoration pipeline crashed",
    );
  });

  it("upscale surfaces Python error string", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: false,
      error: "Model weights corrupted",
    });

    await expect(upscale(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("Model weights corrupted");
  });
});

// ── default values for optional Python response fields ───────────────

describe("default values for optional response fields", () => {
  it("colorize defaults method to unknown", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      width: 800,
      height: 600,
    });

    const result = await colorize(FAKE_INPUT, FAKE_OUTPUT_DIR);
    expect(result.method).toBe("unknown");
  });

  it("noiseRemoval defaults format and tier from options", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      width: 800,
      height: 600,
    });

    const result = await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR);
    expect(result.format).toBe("png");
    expect(result.tier).toBe("balanced");
  });

  it("removeRedEye defaults format to png", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      width: 800,
      height: 600,
    });

    const result = await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR);
    expect(result.format).toBe("png");
  });

  it("detectFaceLandmarks defaults imageWidth and imageHeight to 0", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      faceDetected: true,
      landmarks: {
        leftEye: { x: 100, y: 150 },
        rightEye: { x: 200, y: 150 },
        eyeCenter: { x: 150, y: 150 },
        chin: { x: 150, y: 300 },
        forehead: { x: 150, y: 80 },
        crown: { x: 150, y: 50 },
        nose: { x: 150, y: 200 },
        faceCenterX: 150,
      },
    });

    const result = await detectFaceLandmarks(FAKE_INPUT);
    expect(result.imageWidth).toBe(0);
    expect(result.imageHeight).toBe(0);
  });

  it("blurFaces defaults faces to empty array", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      facesDetected: 0,
    });

    const result = await blurFaces(FAKE_INPUT, FAKE_OUTPUT_DIR);
    expect(result.faces).toEqual([]);
  });

  it("enhanceFaces defaults faces to empty array and model to unknown", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      facesDetected: 0,
    });

    const result = await enhanceFaces(FAKE_INPUT, FAKE_OUTPUT_DIR);
    expect(result.faces).toEqual([]);
    expect(result.model).toBe("unknown");
  });
});

// ── temp file cleanup on bridge rejection ────────────────────────────

describe("temp file cleanup on bridge rejection", () => {
  it("removeBackground cleans up when bridge rejects", async () => {
    vi.mocked(runPythonWithProgress).mockRejectedValue(new Error("bridge error"));

    await expect(removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("bridge error");
    // unlink called in finally block for both input and output temp files
    expect(unlink).toHaveBeenCalledTimes(2);
  });

  it("detectFaces cleans up temp file when bridge rejects", async () => {
    vi.mocked(runPythonWithProgress).mockRejectedValue(new Error("bridge error"));

    await expect(detectFaces(FAKE_INPUT)).rejects.toThrow("bridge error");
    expect(unlink).toHaveBeenCalled();
  });

  it("detectFaceLandmarks cleans up temp file when bridge rejects", async () => {
    vi.mocked(runPythonWithProgress).mockRejectedValue(new Error("bridge error"));

    await expect(detectFaceLandmarks(FAKE_INPUT)).rejects.toThrow("bridge error");
    expect(unlink).toHaveBeenCalled();
  });
});

// ── option serialization edge cases ──────────────────────────────────

describe("option serialization", () => {
  beforeEach(() => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      width: 800,
      height: 600,
    });
  });

  it("removeBackground passes empty options as empty JSON object", async () => {
    await removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR);

    const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
    expect(JSON.parse(args[2])).toEqual({});
  });

  it("detectFaces merges user options with detectOnly flag", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      facesDetected: 0,
    });

    await detectFaces(FAKE_INPUT, { sensitivity: 0.3 });

    const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
    const parsed = JSON.parse(args[2]);
    expect(parsed.detectOnly).toBe(true);
    expect(parsed.sensitivity).toBe(0.3);
  });

  it("blurFaces passes empty options as empty JSON object", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      facesDetected: 0,
    });

    await blurFaces(FAKE_INPUT, FAKE_OUTPUT_DIR);

    const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
    expect(JSON.parse(args[2])).toEqual({});
  });

  it("upscale passes empty options as empty JSON object", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      width: 1600,
      height: 1200,
    });

    await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR);

    const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
    expect(JSON.parse(args[2])).toEqual({});
  });

  it("noiseRemoval passes all option fields", async () => {
    await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR, {
      tier: "aggressive",
      strength: 0.9,
      detailPreservation: 0.5,
      colorNoise: 0.3,
    });

    const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
    expect(JSON.parse(args[2])).toEqual({
      tier: "aggressive",
      strength: 0.9,
      detailPreservation: 0.5,
      colorNoise: 0.3,
    });
  });

  it("restorePhoto passes all option fields", async () => {
    await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR, {
      mode: "auto",
      scratchRemoval: true,
      faceEnhancement: true,
      fidelity: 0.8,
      denoise: true,
      denoiseStrength: 0.5,
      colorize: true,
    });

    const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
    expect(JSON.parse(args[2])).toEqual({
      mode: "auto",
      scratchRemoval: true,
      faceEnhancement: true,
      fidelity: 0.8,
      denoise: true,
      denoiseStrength: 0.5,
      colorize: true,
    });
  });

  it("removeRedEye passes format and quality options", async () => {
    await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR, {
      sensitivity: 0.8,
      strength: 0.6,
      format: "webp",
      quality: 90,
    });

    const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
    expect(JSON.parse(args[2])).toEqual({
      sensitivity: 0.8,
      strength: 0.6,
      format: "webp",
      quality: 90,
    });
  });

  it("upscale passes all option fields", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      width: 3200,
      height: 2400,
    });

    await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, {
      scale: 4,
      model: "realesrgan-x4plus",
      faceEnhance: true,
      denoise: 0.5,
      format: "webp",
      quality: 85,
    });

    const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
    expect(JSON.parse(args[2])).toEqual({
      scale: 4,
      model: "realesrgan-x4plus",
      faceEnhance: true,
      denoise: 0.5,
      format: "webp",
      quality: 85,
    });
  });

  it("detectFaceLandmarks passes fixed unused and empty options args", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      faceDetected: false,
      imageWidth: 800,
      imageHeight: 600,
    });

    await detectFaceLandmarks(FAKE_INPUT);

    const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
    expect(args[1]).toBe("unused");
    expect(args[2]).toBe("{}");
  });
});

// ── OCR dynamic timeout ─────────────────────────────────────────────

describe("OCR dynamic timeout", () => {
  it("uses megapixel-based timeout for large images", async () => {
    await extractText(FAKE_INPUT, FAKE_OUTPUT_DIR);

    // sharp metadata returns 800x600 = 0.48MP
    // timeout = max(600_000, 0.48 * 30 * 1000) = 600_000
    const options = vi.mocked(runAdaptiveTesseract).mock.calls[0][1];
    expect(options.timeoutMs).toBeGreaterThanOrEqual(600_000);
  });
});

// ── removeBackground dynamic timeout ────────────────────────────────

describe("removeBackground dynamic timeout", () => {
  it("uses megapixel-based timeout for large images", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({ success: true });

    await removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR);

    // sharp metadata returns 800x600 = 0.48MP
    // baseTimeout = 300000, timeout = max(300000, 0.48 * 30 * 1000) = 300000
    const options = vi.mocked(runPythonWithProgress).mock.calls[0][2];
    expect(options.timeout).toBe(300000);
  });
});

// ── parseStdoutJson failure in tool pipeline ─────────────────────────

describe("parseStdoutJson throws in tool pipeline", () => {
  it("propagates parse error through removeBackground", async () => {
    vi.mocked(parseStdoutJson).mockImplementation(() => {
      throw new Error("No JSON response from Python script");
    });

    await expect(removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
      "No JSON response from Python script",
    );
  });

  it("rejects malformed isolated OCR runtime metadata", async () => {
    vi.mocked(runOcrRuntime).mockResolvedValueOnce({
      result: "malformed",
      stderr: "",
      runtime: {
        generation: "test",
        artifactVersion: "2.1.0",
        target: "linux-amd64-cpu-py312",
        providers: ["CPUExecutionProvider"],
        models: {},
      },
    });

    await expect(extractText(FAKE_INPUT, FAKE_OUTPUT_DIR, { quality: "balanced" })).rejects.toThrow(
      "invalid metadata",
    );
  });

  it("propagates parse error through upscale", async () => {
    vi.mocked(parseStdoutJson).mockImplementation(() => {
      throw new Error("No JSON response from Python script");
    });

    await expect(upscale(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
      "No JSON response from Python script",
    );
  });

  it("propagates parse error through colorize", async () => {
    vi.mocked(parseStdoutJson).mockImplementation(() => {
      throw new Error("No JSON response from Python script");
    });

    await expect(colorize(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
      "No JSON response from Python script",
    );
  });

  it("propagates parse error through blurFaces", async () => {
    vi.mocked(parseStdoutJson).mockImplementation(() => {
      throw new Error("No JSON response from Python script");
    });

    await expect(blurFaces(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
      "No JSON response from Python script",
    );
  });

  it("propagates parse error through detectFaces", async () => {
    vi.mocked(parseStdoutJson).mockImplementation(() => {
      throw new Error("No JSON response from Python script");
    });

    await expect(detectFaces(FAKE_INPUT)).rejects.toThrow("No JSON response from Python script");
  });

  it("propagates parse error through enhanceFaces", async () => {
    vi.mocked(parseStdoutJson).mockImplementation(() => {
      throw new Error("No JSON response from Python script");
    });

    await expect(enhanceFaces(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
      "No JSON response from Python script",
    );
  });

  it("propagates parse error through noiseRemoval", async () => {
    vi.mocked(parseStdoutJson).mockImplementation(() => {
      throw new Error("No JSON response from Python script");
    });

    await expect(noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
      "No JSON response from Python script",
    );
  });

  it("propagates parse error through removeRedEye", async () => {
    vi.mocked(parseStdoutJson).mockImplementation(() => {
      throw new Error("No JSON response from Python script");
    });

    await expect(removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
      "No JSON response from Python script",
    );
  });

  it("propagates parse error through restorePhoto", async () => {
    vi.mocked(parseStdoutJson).mockImplementation(() => {
      throw new Error("No JSON response from Python script");
    });

    await expect(restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
      "No JSON response from Python script",
    );
  });

  it("propagates parse error through inpaint", async () => {
    vi.mocked(parseStdoutJson).mockImplementation(() => {
      throw new Error("No JSON response from Python script");
    });

    const maskBuffer = Buffer.from("fake-mask");
    await expect(inpaint(FAKE_INPUT, maskBuffer, FAKE_OUTPUT_DIR)).rejects.toThrow(
      "No JSON response from Python script",
    );
  });

  it("propagates parse error through detectFaceLandmarks", async () => {
    vi.mocked(parseStdoutJson).mockImplementation(() => {
      throw new Error("No JSON response from Python script");
    });

    await expect(detectFaceLandmarks(FAKE_INPUT)).rejects.toThrow(
      "No JSON response from Python script",
    );
  });
});

// ── readFile errors after successful Python run ────────────────────────

describe("readFile errors after successful Python run", () => {
  beforeEach(() => {
    vi.mocked(parseStdoutJson).mockReturnValue({ success: true, width: 800, height: 600 });
  });

  it("colorize propagates readFile error", async () => {
    vi.mocked(readFile).mockRejectedValueOnce(new Error("ENOENT: output file missing"));
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      width: 800,
      height: 600,
      method: "deoldify",
    });

    await expect(colorize(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("output file missing");
  });

  it("blurFaces propagates readFile error", async () => {
    vi.mocked(readFile).mockRejectedValueOnce(new Error("ENOENT: output file missing"));
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      facesDetected: 1,
      faces: [{ x: 0, y: 0, w: 50, h: 50 }],
    });

    await expect(blurFaces(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("output file missing");
  });

  it("enhanceFaces propagates readFile error", async () => {
    vi.mocked(readFile).mockRejectedValueOnce(new Error("ENOENT: output file missing"));
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      facesDetected: 1,
      faces: [],
      model: "gfpgan",
    });

    await expect(enhanceFaces(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("output file missing");
  });

  it("noiseRemoval propagates readFile error", async () => {
    vi.mocked(readFile).mockRejectedValueOnce(new Error("ENOENT: output file missing"));

    await expect(noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("output file missing");
  });

  it("removeRedEye propagates readFile error", async () => {
    vi.mocked(readFile).mockRejectedValueOnce(new Error("ENOENT: output file missing"));

    await expect(removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("output file missing");
  });

  it("restorePhoto propagates readFile error", async () => {
    vi.mocked(readFile).mockRejectedValueOnce(new Error("ENOENT: output file missing"));

    await expect(restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("output file missing");
  });

  it("upscale propagates readFile error", async () => {
    vi.mocked(readFile).mockRejectedValueOnce(new Error("ENOENT: output file missing"));
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      width: 1600,
      height: 1200,
    });

    await expect(upscale(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("output file missing");
  });

  it("inpaint propagates readFile error", async () => {
    vi.mocked(readFile).mockRejectedValueOnce(new Error("ENOENT: output file missing"));

    const mask = Buffer.from("mask");
    await expect(inpaint(FAKE_INPUT, mask, FAKE_OUTPUT_DIR)).rejects.toThrow("output file missing");
  });
});

// ── writeFile errors before Python run ─────────────────────────────────

describe("writeFile errors before Python run", () => {
  it("colorize propagates writeFile error", async () => {
    vi.mocked(writeFile).mockRejectedValueOnce(new Error("ENOSPC: no space left"));

    await expect(colorize(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("no space left");
  });

  it("blurFaces propagates writeFile error", async () => {
    vi.mocked(writeFile).mockRejectedValueOnce(new Error("ENOSPC: no space left"));

    await expect(blurFaces(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("no space left");
  });

  it("enhanceFaces propagates writeFile error", async () => {
    vi.mocked(writeFile).mockRejectedValueOnce(new Error("ENOSPC: no space left"));

    await expect(enhanceFaces(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("no space left");
  });

  it("noiseRemoval propagates writeFile error", async () => {
    vi.mocked(writeFile).mockRejectedValueOnce(new Error("ENOSPC: no space left"));

    await expect(noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("no space left");
  });

  it("removeRedEye propagates writeFile error", async () => {
    vi.mocked(writeFile).mockRejectedValueOnce(new Error("ENOSPC: no space left"));

    await expect(removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("no space left");
  });

  it("restorePhoto propagates writeFile error", async () => {
    vi.mocked(writeFile).mockRejectedValueOnce(new Error("ENOSPC: no space left"));

    await expect(restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("no space left");
  });

  it("upscale propagates writeFile error", async () => {
    vi.mocked(writeFile).mockRejectedValueOnce(new Error("ENOSPC: no space left"));

    await expect(upscale(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("no space left");
  });

  it("inpaint propagates writeFile error on input", async () => {
    vi.mocked(writeFile).mockRejectedValueOnce(new Error("ENOSPC: no space left"));

    const mask = Buffer.from("mask");
    await expect(inpaint(FAKE_INPUT, mask, FAKE_OUTPUT_DIR)).rejects.toThrow("no space left");
  });

  it("detectFaceLandmarks propagates writeFile error", async () => {
    vi.mocked(writeFile).mockRejectedValueOnce(new Error("ENOSPC: no space left"));

    await expect(detectFaceLandmarks(FAKE_INPUT)).rejects.toThrow("no space left");
  });

  it("detectFaces propagates writeFile error", async () => {
    vi.mocked(writeFile).mockRejectedValueOnce(new Error("ENOSPC: no space left"));

    await expect(detectFaces(FAKE_INPUT)).rejects.toThrow("no space left");
  });
});

// ── Segfault propagation through all tools ─────────────────────────────

describe("segfault propagation through all tools", () => {
  beforeEach(() => {
    vi.mocked(runPythonWithProgress).mockRejectedValue(
      new Error("Process crashed (segmentation fault)"),
    );
  });

  it("propagates segfault through colorize", async () => {
    await expect(colorize(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("segmentation fault");
  });

  it("propagates segfault through blurFaces", async () => {
    await expect(blurFaces(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("segmentation fault");
  });

  it("propagates segfault through enhanceFaces", async () => {
    await expect(enhanceFaces(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("segmentation fault");
  });

  it("propagates segfault through detectFaceLandmarks", async () => {
    await expect(detectFaceLandmarks(FAKE_INPUT)).rejects.toThrow("segmentation fault");
  });

  it("propagates segfault through inpaint", async () => {
    const mask = Buffer.from("mask");
    await expect(inpaint(FAKE_INPUT, mask, FAKE_OUTPUT_DIR)).rejects.toThrow("segmentation fault");
  });

  it("propagates segfault through noiseRemoval", async () => {
    await expect(noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("segmentation fault");
  });

  it("propagates segfault through removeRedEye", async () => {
    await expect(removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("segmentation fault");
  });

  it("propagates segfault through restorePhoto", async () => {
    await expect(restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("segmentation fault");
  });

  it("propagates segfault through removeBackground", async () => {
    await expect(removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
      "segmentation fault",
    );
  });

  it("propagates segfault through upscale", async () => {
    await expect(upscale(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("segmentation fault");
  });
});

// ── OOM propagation through all tools ──────────────────────────────────

describe("OOM propagation through all tools", () => {
  beforeEach(() => {
    vi.mocked(runPythonWithProgress).mockRejectedValue(
      new Error("Process killed (out of memory) -- try a lighter model or smaller image"),
    );
  });

  it("propagates OOM through colorize", async () => {
    await expect(colorize(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("out of memory");
  });

  it("propagates OOM through blurFaces", async () => {
    await expect(blurFaces(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("out of memory");
  });

  it("propagates OOM through enhanceFaces", async () => {
    await expect(enhanceFaces(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("out of memory");
  });

  it("propagates OOM through detectFaceLandmarks", async () => {
    await expect(detectFaceLandmarks(FAKE_INPUT)).rejects.toThrow("out of memory");
  });

  it("propagates OOM through inpaint", async () => {
    const mask = Buffer.from("mask");
    await expect(inpaint(FAKE_INPUT, mask, FAKE_OUTPUT_DIR)).rejects.toThrow("out of memory");
  });

  it("propagates OOM through noiseRemoval", async () => {
    await expect(noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("out of memory");
  });

  it("propagates OOM through removeRedEye", async () => {
    await expect(removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("out of memory");
  });

  it("propagates OOM through restorePhoto", async () => {
    await expect(restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("out of memory");
  });

  it("propagates OOM through detectFaces", async () => {
    await expect(detectFaces(FAKE_INPUT)).rejects.toThrow("out of memory");
  });
});
