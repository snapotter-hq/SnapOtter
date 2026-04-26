import { readFile, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sharp", () => {
  const mockSharp = vi.fn(() => ({
    png: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
  }));
  return { default: mockSharp };
});

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from("mock-output-data")),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../packages/ai/src/bridge.js", () => ({
  runPythonWithProgress: vi.fn(),
  parseStdoutJson: vi.fn(),
}));

import sharp from "sharp";
import { parseStdoutJson, runPythonWithProgress } from "../../../packages/ai/src/bridge.js";
import { removeRedEye } from "../../../packages/ai/src/red-eye-removal.js";

const FAKE_INPUT = Buffer.from("fake-redeye-image");
const FAKE_OUTPUT_DIR = "/tmp/test-redeye";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readFile).mockResolvedValue(Buffer.from("mock-output-data"));
  vi.mocked(writeFile).mockResolvedValue(undefined);
  vi.mocked(runPythonWithProgress).mockResolvedValue({
    stdout: '{"success": true}',
    stderr: "",
  });
  vi.mocked(parseStdoutJson).mockReturnValue({
    success: true,
    facesDetected: 1,
    eyesCorrected: 2,
    width: 800,
    height: 600,
    format: "png",
  });
  vi.mocked(sharp).mockImplementation(
    () =>
      ({
        png: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
      }) as unknown as ReturnType<typeof sharp>,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("removeRedEye", () => {
  describe("request serialization", () => {
    it("calls red_eye_removal.py with correct file paths", async () => {
      await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "red_eye_removal.py",
        [`${FAKE_OUTPUT_DIR}/input_redeye.png`, `${FAKE_OUTPUT_DIR}/output_redeye.png`, "{}"],
        expect.any(Object),
      );
    });

    it("serializes sensitivity option", async () => {
      await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR, { sensitivity: 0.8 });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ sensitivity: 0.8 });
    });

    it("serializes strength option", async () => {
      await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR, { strength: 0.6 });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ strength: 0.6 });
    });

    it("serializes format and quality options", async () => {
      await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR, { format: "webp", quality: 90 });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ format: "webp", quality: 90 });
    });

    it("serializes all options together", async () => {
      const allOptions = {
        sensitivity: 0.9,
        strength: 0.7,
        format: "jpeg",
        quality: 85,
      };
      await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR, allOptions);

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual(allOptions);
    });

    it("converts input to PNG before writing", async () => {
      await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(sharp).toHaveBeenCalledWith(FAKE_INPUT);
    });
  });

  describe("response parsing", () => {
    it("returns RedEyeRemovalResult with all fields", async () => {
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

    it("reads from default output path", async () => {
      await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(readFile).toHaveBeenCalledWith(`${FAKE_OUTPUT_DIR}/output_redeye.png`);
    });

    it("reads from alternate output_path when provided", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 800,
        height: 600,
        output_path: "/tmp/alt-redeye.webp",
      });

      await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(readFile).toHaveBeenCalledWith("/tmp/alt-redeye.webp");
    });

    it("defaults facesDetected to 0 when absent", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 800,
        height: 600,
      });

      const result = await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.facesDetected).toBe(0);
    });

    it("defaults eyesCorrected to 0 when absent", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 800,
        height: 600,
      });

      const result = await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.eyesCorrected).toBe(0);
    });

    it("defaults format to 'png' when absent", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 800,
        height: 600,
      });

      const result = await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.format).toBe("png");
    });

    it("reports zero corrections when no red eyes found", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        facesDetected: 1,
        eyesCorrected: 0,
        width: 800,
        height: 600,
        format: "png",
      });

      const result = await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.facesDetected).toBe(1);
      expect(result.eyesCorrected).toBe(0);
    });

    it("handles multiple faces with multiple corrections", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        facesDetected: 3,
        eyesCorrected: 5,
        width: 1920,
        height: 1080,
        format: "png",
      });

      const result = await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.facesDetected).toBe(3);
      expect(result.eyesCorrected).toBe(5);
    });
  });

  describe("error handling", () => {
    it("throws with custom error from Python", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: false,
        error: "Face detection model not available",
      });

      await expect(removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
        "Face detection model not available",
      );
    });

    it("throws fallback error when success: false without error string", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

      await expect(removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
        "Red eye removal failed",
      );
    });

    it("propagates bridge timeout", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(new Error("Python script timed out"));

      await expect(removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("timed out");
    });

    it("propagates bridge segfault", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(
        new Error("Process crashed (segmentation fault)"),
      );

      await expect(removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("segmentation fault");
    });
  });

  describe("onProgress forwarding", () => {
    it("passes onProgress to bridge", async () => {
      const onProgress = vi.fn();
      await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR, {}, onProgress);

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "red_eye_removal.py",
        expect.any(Array),
        expect.objectContaining({ onProgress }),
      );
    });
  });
});
