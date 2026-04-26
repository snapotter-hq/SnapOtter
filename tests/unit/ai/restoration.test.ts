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
import { restorePhoto } from "../../../packages/ai/src/restoration.js";

const FAKE_INPUT = Buffer.from("fake-old-photo");
const FAKE_OUTPUT_DIR = "/tmp/test-restore";

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
    width: 800,
    height: 600,
    steps: ["denoise", "face_enhance"],
    scratchCoverage: 0.15,
    facesEnhanced: 2,
    isGrayscale: true,
    colorized: true,
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

describe("restorePhoto", () => {
  describe("request serialization", () => {
    it("calls restore.py with correct file paths", async () => {
      await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "restore.py",
        [`${FAKE_OUTPUT_DIR}/input_restore.png`, `${FAKE_OUTPUT_DIR}/output_restore.png`, "{}"],
        expect.any(Object),
      );
    });

    it("serializes mode option", async () => {
      await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR, { mode: "heavy" });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ mode: "heavy" });
    });

    it("serializes scratchRemoval option", async () => {
      await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR, { scratchRemoval: true });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ scratchRemoval: true });
    });

    it("serializes faceEnhancement option", async () => {
      await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR, { faceEnhancement: true });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ faceEnhancement: true });
    });

    it("serializes fidelity option", async () => {
      await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR, { fidelity: 0.8 });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ fidelity: 0.8 });
    });

    it("serializes denoise and denoiseStrength options", async () => {
      await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR, { denoise: true, denoiseStrength: 0.5 });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ denoise: true, denoiseStrength: 0.5 });
    });

    it("serializes colorize option", async () => {
      await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR, { colorize: true });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ colorize: true });
    });

    it("serializes all options together", async () => {
      const allOptions = {
        mode: "auto",
        scratchRemoval: true,
        faceEnhancement: true,
        fidelity: 0.8,
        denoise: true,
        denoiseStrength: 0.5,
        colorize: true,
      };
      await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR, allOptions);

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual(allOptions);
    });

    it("converts input to PNG before writing", async () => {
      await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(sharp).toHaveBeenCalledWith(FAKE_INPUT);
    });
  });

  describe("response parsing", () => {
    it("returns RestorePhotoResult with all fields populated", async () => {
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

    it("reads from default output path", async () => {
      await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(readFile).toHaveBeenCalledWith(`${FAKE_OUTPUT_DIR}/output_restore.png`);
    });

    it("reads from alternate output_path when provided", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 800,
        height: 600,
        output_path: "/tmp/alt-restore.webp",
      });

      await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(readFile).toHaveBeenCalledWith("/tmp/alt-restore.webp");
    });

    it("defaults steps to empty array when absent", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 400,
        height: 300,
      });

      const result = await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.steps).toEqual([]);
    });

    it("defaults scratchCoverage to 0 when absent", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 400,
        height: 300,
      });

      const result = await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.scratchCoverage).toBe(0);
    });

    it("defaults facesEnhanced to 0 when absent", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 400,
        height: 300,
      });

      const result = await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.facesEnhanced).toBe(0);
    });

    it("defaults isGrayscale to false when absent", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 400,
        height: 300,
      });

      const result = await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.isGrayscale).toBe(false);
    });

    it("defaults colorized to false when absent", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 400,
        height: 300,
      });

      const result = await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.colorized).toBe(false);
    });

    it("preserves multi-step restoration pipeline info", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 800,
        height: 600,
        steps: ["scratch_removal", "denoise", "face_enhance", "colorize"],
        scratchCoverage: 0.3,
        facesEnhanced: 4,
        isGrayscale: true,
        colorized: true,
      });

      const result = await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.steps).toHaveLength(4);
      expect(result.scratchCoverage).toBe(0.3);
      expect(result.facesEnhanced).toBe(4);
    });
  });

  describe("error handling", () => {
    it("throws with custom error from Python", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: false,
        error: "CodeFormer model weights not found",
      });

      await expect(restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
        "CodeFormer model weights not found",
      );
    });

    it("throws fallback error when success: false without error string", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

      await expect(restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
        "Photo restoration failed",
      );
    });

    it("propagates bridge timeout", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(new Error("Python script timed out"));

      await expect(restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("timed out");
    });

    it("propagates OOM errors", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(
        new Error("Process killed (out of memory)"),
      );

      await expect(restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("out of memory");
    });
  });

  describe("onProgress forwarding", () => {
    it("passes onProgress to bridge", async () => {
      const onProgress = vi.fn();
      await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR, {}, onProgress);

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "restore.py",
        expect.any(Array),
        expect.objectContaining({ onProgress }),
      );
    });
  });
});
