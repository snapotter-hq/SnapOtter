import { readFile, rm, unlink, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock sharp before any imports that use it
vi.mock("sharp", () => {
  const mockSharp = vi.fn(() => ({
    png: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
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
import { removeRedEye } from "../../../packages/ai/src/red-eye-removal.js";
import { restorePhoto } from "../../../packages/ai/src/restoration.js";
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
  beforeEach(() => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: true,
      text: "Hello World",
      engine: "paddleocr",
    });
  });

  it("calls runPythonWithProgress with ocr.py", async () => {
    await extractText(FAKE_INPUT, FAKE_OUTPUT_DIR);

    expect(runPythonWithProgress).toHaveBeenCalledWith(
      "ocr.py",
      expect.arrayContaining([expect.stringContaining("input_ocr.png")]),
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
  });

  it("returns OcrResult with text and engine", async () => {
    const result = await extractText(FAKE_INPUT, FAKE_OUTPUT_DIR);

    expect(result).toEqual({
      text: "Hello World",
      engine: "paddleocr",
    });
  });

  it("passes quality and language options", async () => {
    await extractText(FAKE_INPUT, FAKE_OUTPUT_DIR, {
      quality: "best",
      language: "en",
    });

    const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
    const optionsArg = args[1];
    expect(JSON.parse(optionsArg)).toEqual({ quality: "best", language: "en" });
  });

  it("throws when OCR fails", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: false,
      error: "No text detected",
    });

    await expect(extractText(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("No text detected");
  });

  it("uses fallback error message when no error string provided", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

    await expect(extractText(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("OCR failed");
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
    expect(result.landmarks!.leftEye).toEqual({ x: 100, y: 150 });
    expect(result.landmarks!.rightEye).toEqual({ x: 200, y: 150 });
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

  it("does not use sharp to convert to PNG (writes buffer directly)", async () => {
    await detectFaceLandmarks(FAKE_INPUT);

    // face-landmarks writes inputBuffer directly, no sharp conversion
    expect(writeFile).toHaveBeenCalledWith(expect.stringContaining("face_landmarks_"), FAKE_INPUT);
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
  it("propagates bridge rejection through tool functions", async () => {
    vi.mocked(runPythonWithProgress).mockRejectedValue(new Error("Python script timed out"));

    await expect(extractText(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
      "Python script timed out",
    );
  });

  it("propagates OOM errors through tool functions", async () => {
    vi.mocked(runPythonWithProgress).mockRejectedValue(
      new Error("Process killed (out of memory) -- try a lighter model or smaller image"),
    );

    await expect(colorize(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("out of memory");
  });
});
