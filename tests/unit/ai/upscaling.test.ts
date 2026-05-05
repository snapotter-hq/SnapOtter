import { readFile, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sharp", () => {
  const mockSharp = vi.fn(() => ({
    png: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
    metadata: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
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
  isGpuAvailable: vi.fn().mockReturnValue(false),
}));

import sharp from "sharp";
import {
  isGpuAvailable,
  parseStdoutJson,
  runPythonWithProgress,
} from "../../../packages/ai/src/bridge.js";
import { upscale } from "../../../packages/ai/src/upscaling.js";

const FAKE_INPUT = Buffer.from("fake-small-image");
const FAKE_OUTPUT_DIR = "/tmp/test-upscale";

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
    width: 1600,
    height: 1200,
    method: "realesrgan",
    format: "png",
  });
  vi.mocked(sharp).mockImplementation(
    () =>
      ({
        png: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
        metadata: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
      }) as unknown as ReturnType<typeof sharp>,
  );
  vi.mocked(isGpuAvailable).mockReturnValue(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("upscale", () => {
  describe("request serialization", () => {
    it("calls upscale.py with correct file paths", async () => {
      await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "upscale.py",
        [`${FAKE_OUTPUT_DIR}/input_upscale.png`, `${FAKE_OUTPUT_DIR}/output_upscale.png`, "{}"],
        expect.any(Object),
      );
    });

    it("serializes scale option", async () => {
      await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, { scale: 4 });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ scale: 4 });
    });

    it("serializes model option", async () => {
      await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, { model: "realesrgan-x4plus-anime" });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ model: "realesrgan-x4plus-anime" });
    });

    it("serializes faceEnhance option", async () => {
      await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, { faceEnhance: true });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ faceEnhance: true });
    });

    it("serializes denoise option", async () => {
      await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, { denoise: 0.5 });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ denoise: 0.5 });
    });

    it("serializes format and quality options", async () => {
      await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, { format: "webp", quality: 90 });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ format: "webp", quality: 90 });
    });

    it("serializes all options together", async () => {
      const allOptions = {
        scale: 2,
        model: "realesrgan-x4plus",
        faceEnhance: true,
        denoise: 0.3,
        format: "jpeg",
        quality: 85,
      };
      await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, allOptions);

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual(allOptions);
    });

    it("converts input to PNG before writing", async () => {
      await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(sharp).toHaveBeenCalledWith(FAKE_INPUT);
      expect(writeFile).toHaveBeenCalledWith(
        `${FAKE_OUTPUT_DIR}/input_upscale.png`,
        Buffer.from("mock-png-data"),
      );
    });
  });

  describe("response parsing", () => {
    it("returns UpscaleResult with all fields", async () => {
      const result = await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(result).toEqual({
        buffer: expect.any(Buffer),
        width: 1600,
        height: 1200,
        method: "realesrgan",
        format: "png",
      });
    });

    it("reads from default output path", async () => {
      await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(readFile).toHaveBeenCalledWith(`${FAKE_OUTPUT_DIR}/output_upscale.png`);
    });

    it("reads from alternate output_path when provided", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 1600,
        height: 1200,
        output_path: "/tmp/alt-upscale.webp",
      });

      await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(readFile).toHaveBeenCalledWith("/tmp/alt-upscale.webp");
    });

    it("defaults method to 'unknown' when absent", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 1600,
        height: 1200,
      });

      const result = await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.method).toBe("unknown");
    });

    it("defaults format to 'png' when absent", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 1600,
        height: 1200,
      });

      const result = await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.format).toBe("png");
    });

    it("returns correct dimensions for 4x upscale", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 3200,
        height: 2400,
        method: "realesrgan",
        format: "png",
      });

      const result = await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, { scale: 4 });
      expect(result.width).toBe(3200);
      expect(result.height).toBe(2400);
    });
  });

  describe("error handling", () => {
    it("throws with custom error from Python", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: false,
        error: "RealESRGAN model file not found",
      });

      await expect(upscale(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
        "RealESRGAN model file not found",
      );
    });

    it("throws fallback error when success: false without error string", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

      await expect(upscale(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("Upscaling failed");
    });

    it("propagates bridge timeout", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(new Error("Python script timed out"));

      await expect(upscale(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("timed out");
    });

    it("propagates OOM errors", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(
        new Error("Process killed (out of memory)"),
      );

      await expect(upscale(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("out of memory");
    });

    it("propagates parseStdoutJson errors", async () => {
      vi.mocked(parseStdoutJson).mockImplementation(() => {
        throw new Error("No JSON response from Python script");
      });

      await expect(upscale(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
        "No JSON response from Python script",
      );
    });
  });

  describe("onProgress forwarding", () => {
    it("passes onProgress to bridge", async () => {
      const onProgress = vi.fn();
      await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, {}, onProgress);

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "upscale.py",
        expect.any(Array),
        expect.objectContaining({ onProgress }),
      );
    });

    it("omits onProgress when not provided", async () => {
      await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR);

      const options = vi.mocked(runPythonWithProgress).mock.calls[0][2];
      expect(options.onProgress).toBeUndefined();
    });
  });

  describe("timeout calculation", () => {
    it("passes a timeout to runPythonWithProgress", async () => {
      await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR);

      const options = vi.mocked(runPythonWithProgress).mock.calls[0][2];
      expect(options.timeout).toBeTypeOf("number");
      expect(options.timeout).toBeGreaterThan(0);
    });

    it("uses minimum timeout of 600s for small images", async () => {
      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
            metadata: vi.fn().mockResolvedValue({ width: 100, height: 100 }),
          }) as unknown as ReturnType<typeof sharp>,
      );

      await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, { scale: 2 });

      const options = vi.mocked(runPythonWithProgress).mock.calls[0][2];
      expect(options.timeout).toBe(600_000);
    });

    it("scales timeout with image megapixels", async () => {
      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
            metadata: vi.fn().mockResolvedValue({ width: 2000, height: 1500 }),
          }) as unknown as ReturnType<typeof sharp>,
      );

      await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, { scale: 2 });
      const timeout2x = vi.mocked(runPythonWithProgress).mock.calls[0][2].timeout!;

      vi.mocked(runPythonWithProgress).mockClear();
      await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, { scale: 4 });
      const timeout4x = vi.mocked(runPythonWithProgress).mock.calls[0][2].timeout!;

      expect(timeout4x).toBeGreaterThan(timeout2x);
    });

    it("scales timeout with scale factor squared", async () => {
      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
            metadata: vi.fn().mockResolvedValue({ width: 1000, height: 1000 }),
          }) as unknown as ReturnType<typeof sharp>,
      );

      await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, { scale: 2 });
      const timeout2x = vi.mocked(runPythonWithProgress).mock.calls[0][2].timeout!;

      vi.mocked(runPythonWithProgress).mockClear();
      await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, { scale: 4 });
      const timeout4x = vi.mocked(runPythonWithProgress).mock.calls[0][2].timeout!;

      // 4x scale has 4x the effective megapixels vs 2x scale (16/4 = 4)
      expect(timeout4x / timeout2x).toBe(4);
    });

    it("uses shorter timeout when GPU is available", async () => {
      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
            metadata: vi.fn().mockResolvedValue({ width: 2000, height: 1500 }),
          }) as unknown as ReturnType<typeof sharp>,
      );

      vi.mocked(isGpuAvailable).mockReturnValue(false);
      await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, { scale: 4 });
      const cpuTimeout = vi.mocked(runPythonWithProgress).mock.calls[0][2].timeout!;

      vi.mocked(runPythonWithProgress).mockClear();
      vi.mocked(isGpuAvailable).mockReturnValue(true);
      await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, { scale: 4 });
      const gpuTimeout = vi.mocked(runPythonWithProgress).mock.calls[0][2].timeout!;

      expect(gpuTimeout).toBeLessThan(cpuTimeout);
    });

    it("provides generous timeout for CPU upscale at high scale", async () => {
      // Simulates user scenario: ~2MP image at 4x on CPU (Synology NAS)
      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
            metadata: vi.fn().mockResolvedValue({ width: 1600, height: 1200 }),
          }) as unknown as ReturnType<typeof sharp>,
      );
      vi.mocked(isGpuAvailable).mockReturnValue(false);

      await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, { scale: 4 });
      const options = vi.mocked(runPythonWithProgress).mock.calls[0][2];

      // ~1.92MP * 16 (4^2) * 180_000ms = ~55 minutes. Must be well above 10 min.
      expect(options.timeout).toBeGreaterThan(10 * 60 * 1000);
    });

    it("defaults scale to 2 when not provided", async () => {
      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
            metadata: vi.fn().mockResolvedValue({ width: 2000, height: 2000 }),
          }) as unknown as ReturnType<typeof sharp>,
      );

      await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR);
      const options = vi.mocked(runPythonWithProgress).mock.calls[0][2];

      // 4MP * 4 (2^2) * 180_000 = 2_880_000ms
      expect(options.timeout).toBe(2_880_000);
    });
  });
});
