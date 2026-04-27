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
import { noiseRemoval } from "../../../packages/ai/src/noise-removal.js";

const FAKE_INPUT = Buffer.from("fake-noisy-image");
const FAKE_OUTPUT_DIR = "/tmp/test-denoise";

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
    format: "png",
    tier: "balanced",
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

describe("noiseRemoval", () => {
  describe("request serialization", () => {
    it("calls noise_removal.py with correct file paths", async () => {
      await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "noise_removal.py",
        [`${FAKE_OUTPUT_DIR}/input_denoise.png`, `${FAKE_OUTPUT_DIR}/output_denoise.png`, "{}"],
        expect.any(Object),
      );
    });

    it("serializes tier option", async () => {
      await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR, { tier: "aggressive" });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ tier: "aggressive" });
    });

    it("serializes strength option", async () => {
      await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR, { strength: 0.8 });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ strength: 0.8 });
    });

    it("serializes detailPreservation option", async () => {
      await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR, { detailPreservation: 0.6 });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ detailPreservation: 0.6 });
    });

    it("serializes colorNoise option", async () => {
      await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR, { colorNoise: 0.4 });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ colorNoise: 0.4 });
    });

    it("serializes format and quality options", async () => {
      await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR, { format: "webp", quality: 90 });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ format: "webp", quality: 90 });
    });

    it("serializes all options together", async () => {
      const allOptions = {
        tier: "aggressive",
        strength: 0.9,
        detailPreservation: 0.5,
        colorNoise: 0.3,
        format: "jpeg",
        quality: 85,
      };
      await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR, allOptions);

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual(allOptions);
    });

    it("converts input to PNG before writing", async () => {
      await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(sharp).toHaveBeenCalledWith(FAKE_INPUT);
    });
  });

  describe("response parsing", () => {
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

    it("reads from default output path when output_path not in response", async () => {
      await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(readFile).toHaveBeenCalledWith(`${FAKE_OUTPUT_DIR}/output_denoise.png`);
    });

    it("reads from alternate output_path when provided", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 800,
        height: 600,
        output_path: "/tmp/alt-denoise.webp",
      });

      await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(readFile).toHaveBeenCalledWith("/tmp/alt-denoise.webp");
    });

    it("defaults format to 'png' when absent from response", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 800,
        height: 600,
      });

      const result = await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.format).toBe("png");
    });

    it("defaults tier from Python response when present", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 800,
        height: 600,
        tier: "gentle",
      });

      const result = await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.tier).toBe("gentle");
    });

    it("falls back to options tier when Python omits it", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 800,
        height: 600,
      });

      const result = await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR, { tier: "aggressive" });
      expect(result.tier).toBe("aggressive");
    });

    it("falls back to 'balanced' when both Python and options omit tier", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 800,
        height: 600,
      });

      const result = await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.tier).toBe("balanced");
    });
  });

  describe("error handling", () => {
    it("throws with custom error from Python", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: false,
        error: "NAFNet model loading failed",
      });

      await expect(noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
        "NAFNet model loading failed",
      );
    });

    it("throws fallback error when success: false without error string", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

      await expect(noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
        "Noise removal failed",
      );
    });

    it("propagates bridge timeout", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(new Error("Python script timed out"));

      await expect(noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("timed out");
    });

    it("propagates OOM errors from bridge", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(
        new Error("Process killed (out of memory)"),
      );

      await expect(noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("out of memory");
    });
  });

  describe("onProgress forwarding", () => {
    it("passes onProgress to bridge", async () => {
      const onProgress = vi.fn();
      await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR, {}, onProgress);

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "noise_removal.py",
        expect.any(Array),
        expect.objectContaining({ onProgress }),
      );
    });
  });
});
