import { unlink, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sharp", () => {
  const mockSharp = vi.fn(() => ({
    png: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
  }));
  return { default: mockSharp };
});

vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../packages/ai/src/bridge.js", () => ({
  runPythonWithProgress: vi.fn(),
  parseStdoutJson: vi.fn(),
}));

import { parseStdoutJson, runPythonWithProgress } from "../../../packages/ai/src/bridge.js";
import { detectFaceLandmarks } from "../../../packages/ai/src/face-landmarks.js";

const FAKE_INPUT = Buffer.from("fake-image-data");

const FULL_LANDMARKS = {
  leftEye: { x: 100, y: 150 },
  rightEye: { x: 200, y: 150 },
  eyeCenter: { x: 150, y: 150 },
  chin: { x: 150, y: 300 },
  forehead: { x: 150, y: 80 },
  crown: { x: 150, y: 50 },
  nose: { x: 150, y: 200 },
  faceCenterX: 150,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(writeFile).mockResolvedValue(undefined);
  vi.mocked(unlink).mockResolvedValue(undefined);
  vi.mocked(runPythonWithProgress).mockResolvedValue({
    stdout: '{"success": true}',
    stderr: "",
  });
  vi.mocked(parseStdoutJson).mockReturnValue({
    success: true,
    faceDetected: true,
    landmarks: FULL_LANDMARKS,
    imageWidth: 800,
    imageHeight: 600,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("detectFaceLandmarks", () => {
  describe("request serialization", () => {
    it("calls face_landmarks.py with input path, 'unused', and '{}'", async () => {
      await detectFaceLandmarks(FAKE_INPUT);

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "face_landmarks.py",
        [expect.stringContaining("face_landmarks_"), "unused", "{}"],
        expect.any(Object),
      );
    });

    it("writes input buffer directly without sharp conversion", async () => {
      await detectFaceLandmarks(FAKE_INPUT);

      // face-landmarks.ts does NOT use sharp -- it writes inputBuffer directly
      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining("face_landmarks_"),
        FAKE_INPUT,
      );
    });

    it("writes to system tmpdir", async () => {
      await detectFaceLandmarks(FAKE_INPUT);

      const writePath = vi.mocked(writeFile).mock.calls[0][0] as string;
      expect(writePath).toContain("face_landmarks_");
    });
  });

  describe("response parsing", () => {
    it("returns all landmark points when face is detected", async () => {
      const result = await detectFaceLandmarks(FAKE_INPUT);

      expect(result.faceDetected).toBe(true);
      expect(result.landmarks).toEqual(FULL_LANDMARKS);
    });

    it("returns individual landmark points correctly", async () => {
      const result = await detectFaceLandmarks(FAKE_INPUT);

      expect(result.landmarks!.leftEye).toEqual({ x: 100, y: 150 });
      expect(result.landmarks!.rightEye).toEqual({ x: 200, y: 150 });
      expect(result.landmarks!.eyeCenter).toEqual({ x: 150, y: 150 });
      expect(result.landmarks!.chin).toEqual({ x: 150, y: 300 });
      expect(result.landmarks!.forehead).toEqual({ x: 150, y: 80 });
      expect(result.landmarks!.crown).toEqual({ x: 150, y: 50 });
      expect(result.landmarks!.nose).toEqual({ x: 150, y: 200 });
      expect(result.landmarks!.faceCenterX).toBe(150);
    });

    it("returns imageWidth and imageHeight from response", async () => {
      const result = await detectFaceLandmarks(FAKE_INPUT);

      expect(result.imageWidth).toBe(800);
      expect(result.imageHeight).toBe(600);
    });

    it("returns null landmarks when no face detected", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        faceDetected: false,
        imageWidth: 1024,
        imageHeight: 768,
      });

      const result = await detectFaceLandmarks(FAKE_INPUT);

      expect(result.faceDetected).toBe(false);
      expect(result.landmarks).toBeNull();
    });

    it("defaults landmarks to null when field is absent", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        faceDetected: true,
        imageWidth: 800,
        imageHeight: 600,
      });

      const result = await detectFaceLandmarks(FAKE_INPUT);
      expect(result.landmarks).toBeNull();
    });

    it("defaults imageWidth to 0 when absent", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        faceDetected: false,
      });

      const result = await detectFaceLandmarks(FAKE_INPUT);
      expect(result.imageWidth).toBe(0);
    });

    it("defaults imageHeight to 0 when absent", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        faceDetected: false,
      });

      const result = await detectFaceLandmarks(FAKE_INPUT);
      expect(result.imageHeight).toBe(0);
    });

    it("returns both dimensions as 0 when both absent", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        faceDetected: true,
        landmarks: FULL_LANDMARKS,
      });

      const result = await detectFaceLandmarks(FAKE_INPUT);
      expect(result.imageWidth).toBe(0);
      expect(result.imageHeight).toBe(0);
    });
  });

  describe("error handling", () => {
    it("throws with custom error from Python", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: false,
        error: "MediaPipe model not found",
      });

      await expect(detectFaceLandmarks(FAKE_INPUT)).rejects.toThrow("MediaPipe model not found");
    });

    it("throws fallback error when success: false without error string", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

      await expect(detectFaceLandmarks(FAKE_INPUT)).rejects.toThrow(
        "Face landmark detection failed",
      );
    });

    it("propagates bridge timeout", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(new Error("Python script timed out"));

      await expect(detectFaceLandmarks(FAKE_INPUT)).rejects.toThrow("timed out");
    });

    it("propagates OOM errors", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(
        new Error("Process killed (out of memory)"),
      );

      await expect(detectFaceLandmarks(FAKE_INPUT)).rejects.toThrow("out of memory");
    });

    it("propagates parseStdoutJson errors", async () => {
      vi.mocked(parseStdoutJson).mockImplementation(() => {
        throw new Error("No JSON response from Python script");
      });

      await expect(detectFaceLandmarks(FAKE_INPUT)).rejects.toThrow(
        "No JSON response from Python script",
      );
    });
  });

  describe("temp file cleanup", () => {
    it("cleans up temp input file after success", async () => {
      await detectFaceLandmarks(FAKE_INPUT);

      expect(unlink).toHaveBeenCalledWith(expect.stringContaining("face_landmarks_"));
    });

    it("cleans up temp input file when Python returns failure", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

      await expect(detectFaceLandmarks(FAKE_INPUT)).rejects.toThrow();
      expect(unlink).toHaveBeenCalled();
    });

    it("cleans up temp input file when bridge rejects", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(new Error("crash"));

      await expect(detectFaceLandmarks(FAKE_INPUT)).rejects.toThrow();
      expect(unlink).toHaveBeenCalled();
    });

    it("does not throw if unlink fails", async () => {
      vi.mocked(unlink).mockRejectedValue(new Error("ENOENT"));

      await expect(detectFaceLandmarks(FAKE_INPUT)).resolves.toBeDefined();
    });
  });

  describe("onProgress forwarding", () => {
    it("passes onProgress to bridge", async () => {
      const onProgress = vi.fn();
      await detectFaceLandmarks(FAKE_INPUT, onProgress);

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "face_landmarks.py",
        expect.any(Array),
        expect.objectContaining({ onProgress }),
      );
    });

    it("omits onProgress when not provided", async () => {
      await detectFaceLandmarks(FAKE_INPUT);

      const options = vi.mocked(runPythonWithProgress).mock.calls[0][2];
      expect(options.onProgress).toBeUndefined();
    });
  });
});
