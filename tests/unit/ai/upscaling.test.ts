import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasPython, pythonBin } from "../../helpers/python-gate.js";

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

vi.mock("../../../packages/ai/src/bridge.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../packages/ai/src/bridge.js")>()),
  runPythonWithProgress: vi.fn(),
  parseStdoutJson: vi.fn(),
  isGpuAvailable: vi.fn().mockReturnValue(false),
}));

import { isToolInputError } from "@snapotter/shared";
import sharp from "sharp";
import {
  isGpuAvailable,
  parseStdoutJson,
  runPythonWithProgress,
} from "../../../packages/ai/src/bridge.js";
import {
  MAX_CPU_UPSCALE_MP,
  MAX_CPU_UPSCALE_OUTPUT_MP,
  upscale,
} from "../../../packages/ai/src/upscaling.js";

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

    it("forwards AbortSignal to the bridge without serializing it into the args JSON", async () => {
      const controller = new AbortController();

      await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, { scale: 2, signal: controller.signal });

      const [, args, bridgeOptions] = vi.mocked(runPythonWithProgress).mock.calls[0];
      expect(JSON.parse(args[2])).toEqual({ scale: 2 });
      expect(bridgeOptions).toEqual(expect.objectContaining({ signal: controller.signal }));
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

    it("handles zero dimensions from metadata gracefully", async () => {
      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
            metadata: vi.fn().mockResolvedValue({ width: undefined, height: undefined }),
          }) as unknown as ReturnType<typeof sharp>,
      );

      await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR);
      const options = vi.mocked(runPythonWithProgress).mock.calls[0][2];
      // 0 MP: timeout = max(600_000, 0) = 600_000
      expect(options.timeout).toBe(600_000);
    });
  });

  describe("sharp conversion errors", () => {
    it("propagates sharp toBuffer error", async () => {
      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            toBuffer: vi.fn().mockRejectedValue(new Error("Input buffer is empty")),
            metadata: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
          }) as unknown as ReturnType<typeof sharp>,
      );

      await expect(upscale(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("Input buffer is empty");
    });
  });

  describe("edge cases", () => {
    it("propagates writeFile error", async () => {
      vi.mocked(writeFile).mockRejectedValueOnce(new Error("ENOSPC: disk full"));

      await expect(upscale(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("disk full");
    });

    it("propagates readFile error after successful Python run", async () => {
      vi.mocked(readFile).mockRejectedValueOnce(new Error("ENOENT: output missing"));

      await expect(upscale(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("output missing");
    });

    it("passes empty options as empty JSON object", async () => {
      await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR);

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({});
    });

    it("propagates segfault from bridge", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(
        new Error("Process crashed (segmentation fault)"),
      );

      await expect(upscale(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("segmentation fault");
    });
  });

  describe("CPU pixel limits (issue #2513)", () => {
    afterEach(() => {
      delete process.env.MAX_CPU_UPSCALE_MP;
    });

    it("exports MAX_CPU_UPSCALE_MP=4 and MAX_CPU_UPSCALE_OUTPUT_MP=64", () => {
      expect(MAX_CPU_UPSCALE_MP).toBe(4);
      expect(MAX_CPU_UPSCALE_OUTPUT_MP).toBe(64);
    });

    it("rejects a 12 MP (4000x3000) input on CPU before writing input_upscale.png or spawning Python", async () => {
      const toBuffer = vi.fn().mockResolvedValue(Buffer.from("mock-png-data"));
      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            toBuffer,
            metadata: vi.fn().mockResolvedValue({ width: 4000, height: 3000 }),
          }) as unknown as ReturnType<typeof sharp>,
      );
      vi.mocked(isGpuAvailable).mockReturnValue(false);

      let caught: unknown;
      try {
        await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, { scale: 4 });
      } catch (err) {
        caught = err;
      }

      expect(isToolInputError(caught)).toBe(true);
      expect((caught as Error).message).toMatch(/12\.0 MP.*max 4 MP on CPU/i);
      expect(toBuffer).not.toHaveBeenCalled();
      expect(writeFile).not.toHaveBeenCalled();
      expect(runPythonWithProgress).not.toHaveBeenCalled();
    });

    it("queries isGpuAvailable('torch') so ONNX-only GPU does not bypass the 4 MP CPU ceiling or use the GPU timeout (issue #2576)", async () => {
      const toBuffer = vi.fn().mockResolvedValue(Buffer.from("mock-png-data"));
      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            toBuffer,
            metadata: vi.fn().mockResolvedValue({ width: 4000, height: 3000 }),
          }) as unknown as ReturnType<typeof sharp>,
      );
      // Simulate ONNX-only GPU: unscoped isGpuAvailable() and isGpuAvailable("onnx") return true,
      // but isGpuAvailable("torch") returns false.
      vi.mocked(isGpuAvailable).mockImplementation((framework?: string) => framework !== "torch");

      await expect(upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, { scale: 4 })).rejects.toThrow(
        /12\.0 MP.*max 4 MP on CPU/i,
      );
      expect(isGpuAvailable).toHaveBeenCalledWith("torch");
      expect(runPythonWithProgress).not.toHaveBeenCalled();

      // For a 2 MP input at 2x (8 MP effective), CPU rate (180s/MP -> 1,440,000ms) is used instead of GPU rate (600,000ms floor).
      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            toBuffer,
            metadata: vi.fn().mockResolvedValue({ width: 2000, height: 1000 }),
          }) as unknown as ReturnType<typeof sharp>,
      );
      await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, { scale: 2 });
      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "upscale.py",
        expect.any(Array),
        expect.objectContaining({ timeout: 8 * 180_000 }),
      );
    });

    it("allows a 12 MP (4000x3000) input when a GPU is available", async () => {
      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
            metadata: vi.fn().mockResolvedValue({ width: 4000, height: 3000 }),
          }) as unknown as ReturnType<typeof sharp>,
      );
      vi.mocked(isGpuAvailable).mockReturnValue(true);

      await expect(upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, { scale: 4 })).resolves.toMatchObject({
        width: 1600,
        height: 1200,
      });
      expect(runPythonWithProgress).toHaveBeenCalledTimes(1);
    });

    it("rejects CPU upscale when output megapixels exceed MAX_CPU_UPSCALE_OUTPUT_MP (e.g. 3 MP at 8x = 192 MP)", async () => {
      const toBuffer = vi.fn().mockResolvedValue(Buffer.from("mock-png-data"));
      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            toBuffer,
            metadata: vi.fn().mockResolvedValue({ width: 2000, height: 1500 }),
          }) as unknown as ReturnType<typeof sharp>,
      );
      vi.mocked(isGpuAvailable).mockReturnValue(false);

      let caught: unknown;
      try {
        await upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, { scale: 8 });
      } catch (err) {
        caught = err;
      }

      expect(isToolInputError(caught)).toBe(true);
      expect((caught as Error).message).toMatch(/192\.0 MP at 8x.*max 64 MP on CPU/i);
      expect(toBuffer).not.toHaveBeenCalled();
      expect(writeFile).not.toHaveBeenCalled();
      expect(runPythonWithProgress).not.toHaveBeenCalled();
    });

    it("honors MAX_CPU_UPSCALE_MP env override and disables the CPU cap when set to 0", async () => {
      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
            metadata: vi.fn().mockResolvedValue({ width: 4000, height: 3000 }),
          }) as unknown as ReturnType<typeof sharp>,
      );
      vi.mocked(isGpuAvailable).mockReturnValue(false);

      process.env.MAX_CPU_UPSCALE_MP = "0";
      await expect(upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, { scale: 4 })).resolves.toBeDefined();

      process.env.MAX_CPU_UPSCALE_MP = "2";
      await expect(upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, { scale: 2 })).rejects.toThrow(
        /12\.0 MP.*max 2 MP on CPU/i,
      );

      // Proportional output ceiling when MAX_CPU_UPSCALE_MP=2 -> maxCpuOutputMp = 32 MP
      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
            metadata: vi.fn().mockResolvedValue({ width: 1500, height: 1000 }),
          }) as unknown as ReturnType<typeof sharp>,
      );
      await expect(upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, { scale: 6 })).rejects.toThrow(
        /54\.0 MP at 6x.*max 32 MP on CPU/i,
      );

      // Invalid/negative env values fall back to default 4 MP ceiling
      process.env.MAX_CPU_UPSCALE_MP = "-2";
      await expect(upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, { scale: 2 })).resolves.toBeDefined();
      process.env.MAX_CPU_UPSCALE_MP = "invalid";
      await expect(upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, { scale: 2 })).resolves.toBeDefined();
    });

    it("allows exact 4.0 MP input at 4x (64.0 MP output) on CPU and formats near-boundary exceeded MP with 2 decimals (#3061)", async () => {
      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
            metadata: vi.fn().mockResolvedValue({ width: 2000, height: 2000 }),
          }) as unknown as ReturnType<typeof sharp>,
      );
      vi.mocked(isGpuAvailable).mockReturnValue(false);

      await expect(upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, { scale: 4 })).resolves.toBeDefined();

      // 2001x2000 = 4.002 MP: sub-half-centimegapixel excess must clamp up to 4.01 MP
      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
            metadata: vi.fn().mockResolvedValue({ width: 2001, height: 2000 }),
          }) as unknown as ReturnType<typeof sharp>,
      );
      await expect(upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, { scale: 2 })).rejects.toThrow(
        "Image is too large for CPU upscaling (4.01 MP, max 4 MP on CPU). Resize the image, use Fast (Lanczos) quality, or use a GPU host.",
      );

      // 4005x1000 = 4.005 MP: IEEE-754 (4.005).toFixed(2) === "4.00", must round to 4.01 MP
      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
            metadata: vi.fn().mockResolvedValue({ width: 4005, height: 1000 }),
          }) as unknown as ReturnType<typeof sharp>,
      );
      await expect(upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, { scale: 2 })).rejects.toThrow(
        "Image is too large for CPU upscaling (4.01 MP, max 4 MP on CPU). Resize the image, use Fast (Lanczos) quality, or use a GPU host.",
      );

      // 2010x2000 = 4.02 MP
      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
            metadata: vi.fn().mockResolvedValue({ width: 2010, height: 2000 }),
          }) as unknown as ReturnType<typeof sharp>,
      );
      await expect(upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, { scale: 2 })).rejects.toThrow(
        /4\.02 MP, max 4 MP on CPU/,
      );

      // 4050x1000 = 4.05 MP ((4.05).toFixed(1) === "4.0" in IEEE-754 -> 4.05 MP) vs 4051x1000 = 4.051 MP -> 4.1 MP (1-decimal)
      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
            metadata: vi.fn().mockResolvedValue({ width: 4050, height: 1000 }),
          }) as unknown as ReturnType<typeof sharp>,
      );
      await expect(upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, { scale: 2 })).rejects.toThrow(
        "Image is too large for CPU upscaling (4.05 MP, max 4 MP on CPU). Resize the image, use Fast (Lanczos) quality, or use a GPU host.",
      );

      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
            metadata: vi.fn().mockResolvedValue({ width: 4051, height: 1000 }),
          }) as unknown as ReturnType<typeof sharp>,
      );
      await expect(upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, { scale: 2 })).rejects.toThrow(
        "Image is too large for CPU upscaling (4.1 MP, max 4 MP on CPU). Resize the image, use Fast (Lanczos) quality, or use a GPU host.",
      );

      // Output ceiling near-boundary: 4,000,100 px at 4x (model=lanczos) = 64.0016 MP -> 64.01 MP
      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
            metadata: vi.fn().mockResolvedValue({ width: 40_001, height: 100 }),
          }) as unknown as ReturnType<typeof sharp>,
      );
      await expect(
        upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, { scale: 4, model: "lanczos" }),
      ).rejects.toThrow(
        "Upscaled output is too large for CPU upscaling (64.01 MP at 4x, max 64 MP on CPU). Use a smaller image, lower scale factor, or a GPU host.",
      );
    });

    it("exempts model=lanczos from the 4 MP AI input cap on CPU while still enforcing the 64 MP output cap", async () => {
      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
            metadata: vi.fn().mockResolvedValue({ width: 4000, height: 3000 }),
          }) as unknown as ReturnType<typeof sharp>,
      );
      vi.mocked(isGpuAvailable).mockReturnValue(false);

      // 12 MP at 2x = 48 MP output (<= 64 MP): allowed for lanczos
      await expect(
        upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, { scale: 2, model: "lanczos" }),
      ).resolves.toBeDefined();

      // 12 MP at 4x = 192 MP output (> 64 MP): still rejected on CPU
      await expect(
        upscale(FAKE_INPUT, FAKE_OUTPUT_DIR, { scale: 4, model: "lanczos" }),
      ).rejects.toThrow(/192\.0 MP at 4x.*max 64 MP on CPU/i);
    });
  });

  describe.skipIf(!hasPython)("upscale.py CPU vs GPU tile sizing (issue #2513)", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const pyDir = resolve(here, "../../../packages/ai/python");

    it("uses 256px fp32 tiles on CPU and 512px fp16 tiles on GPU, with CPU OOM fallback to 128 without empty_cache", () => {
      const script = `
import importlib.util, json, os, sys, tempfile, types

py_dir = ${JSON.stringify(pyDir)}
sys.path.insert(0, py_dir)
spec = importlib.util.spec_from_file_location("upscale_mod", os.path.join(py_dir, "upscale.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

assert mod.default_tile_size(False) == 256, f"expected CPU tile 256, got {mod.default_tile_size(False)}"
assert mod.default_tile_size(True) == 512, f"expected GPU tile 512, got {mod.default_tile_size(True)}"
assert mod.fallback_tile_size(512) == 256
assert mod.fallback_tile_size(256) == 128
assert mod.is_oom_error(RuntimeError("DefaultCPUAllocator: not enough memory: you tried to allocate 600000000 bytes.")) is True
assert mod.is_oom_error(MemoryError("unable to allocate array")) is True
assert mod.is_oom_error(RuntimeError("Unable to allocate 1.86 GiB for an array with shape (4096, 4096, 30) and data type float32")) is True
assert "out of memory" in mod.realesrgan_failure_message(RuntimeError("Unable to allocate 1.86 GiB for an array with shape (4096, 4096, 30) and data type float32")).lower()
for oom_err in (
    RuntimeError("CUDA error: CUBLAS_STATUS_ALLOC_FAILED"),
    RuntimeError("cudaErrorMemoryAllocation"),
    RuntimeError("std::bad_alloc"),
    RuntimeError("MemoryError: allocation failed"),
    OSError(12, "Cannot allocate memory"),
    OSError(12, "Nicht genügend Hauptspeicher verfügbar"),
):
    assert mod.is_oom_error(oom_err) is True, f"expected is_oom_error({oom_err!r}) to be True"
    oom_msg = mod.realesrgan_failure_message(oom_err)
    assert "out of memory" in oom_msg.lower(), oom_msg
    assert "Reinstall" not in oom_msg, oom_msg
    assert "Reset AI Environment" not in oom_msg, oom_msg
assert mod.is_oom_error(OSError(13, "Permission denied")) is False

with tempfile.TemporaryDirectory() as tmp:
    weights_path = os.path.join(tmp, "RealESRGAN_x4plus.pth")
    gfpgan_path = os.path.join(tmp, "GFPGANv1.3.pth")
    with open(weights_path, "wb") as f:
        f.write(b"weights")
    with open(gfpgan_path, "wb") as f:
        f.write(b"gfpgan")
    mod.REALESRGAN_MODEL_PATH = weights_path
    mod.GFPGAN_MODEL_PATH = gfpgan_path

    # Stub PIL, numpy, basicsr, realesrgan, gfpgan, offline_guard, gpu, torch
    pil_mod = types.ModuleType("PIL")
    class FakeImageObj:
        width = 64
        height = 64
        size = (128, 128)
        def convert(self, mode, **kw): return self
        def save(self, path, **kw):
            with open(path, "wb") as f: f.write(b"png")
    class FakeImageMod:
        ADAPTIVE = 1
        LANCZOS = 1
        @staticmethod
        def open(path): return FakeImageObj()
        @staticmethod
        def fromarray(arr): return FakeImageObj()
    pil_mod.Image = FakeImageMod
    sys.modules["PIL"] = pil_mod

    np_mod = types.ModuleType("numpy")
    np_mod.array = lambda img: "fake_rgb_array"
    sys.modules["numpy"] = np_mod

    basicsr_mod = types.ModuleType("basicsr")
    basicsr_archs = types.ModuleType("basicsr.archs")
    basicsr_rrdb = types.ModuleType("basicsr.archs.rrdbnet_arch")
    basicsr_rrdb.RRDBNet = lambda **kw: ("rrdb", kw)
    sys.modules["basicsr"] = basicsr_mod
    sys.modules["basicsr.archs"] = basicsr_archs
    sys.modules["basicsr.archs.rrdbnet_arch"] = basicsr_rrdb

    recorded = []
    face_recorded = []
    empty_cache_calls = []

    torch_mod = types.ModuleType("torch")
    torch_mod.device = lambda name: f"device:{name}"
    torch_cuda = types.SimpleNamespace(empty_cache=lambda: empty_cache_calls.append(1))
    torch_mod.cuda = torch_cuda
    sys.modules["torch"] = torch_mod

    gpu_state = {"avail": False}
    gpu_mod = types.ModuleType("gpu")
    gpu_mod.torch_gpu_available = lambda: gpu_state["avail"]
    sys.modules["gpu"] = gpu_mod

    fail_first = {"active": True, "face_oom": False, "exc": RuntimeError("DefaultCPUAllocator: not enough memory: tried to allocate 600MB"), "face_exc": RuntimeError("DefaultCPUAllocator: not enough memory")}
    class FakeRealESRGANer:
        def __init__(self, **kw):
            self.tile = kw["tile"]
            self.half = kw["half"]
            self.device = kw["device"]
            recorded.append({"init_tile": self.tile, "half": self.half, "device": self.device, "enhance_tiles": []})
        def enhance(self, img_array, outscale=2):
            recorded[-1]["enhance_tiles"].append(self.tile)
            if fail_first["active"] and len(recorded[-1]["enhance_tiles"]) == 1:
                raise fail_first["exc"]
            return ("out_arr", None)

    realesrgan_mod = types.ModuleType("realesrgan")
    realesrgan_mod.RealESRGANer = FakeRealESRGANer
    sys.modules["realesrgan"] = realesrgan_mod

    class FakeGFPGANer:
        def __init__(self, **kw):
            self.bg_upsampler = kw["bg_upsampler"]
            face_recorded.append({"enhance_tiles": []})
        def enhance(self, img_array, **kw):
            face_recorded[-1]["enhance_tiles"].append(self.bg_upsampler.tile)
            if fail_first["face_oom"] and len(face_recorded[-1]["enhance_tiles"]) == 1:
                raise fail_first["face_exc"]
            return (None, None, "face_out_arr")

    gfpgan_mod = types.ModuleType("gfpgan")
    gfpgan_mod.GFPGANer = FakeGFPGANer
    sys.modules["gfpgan"] = gfpgan_mod

    offline_mod = types.ModuleType("offline_guard")
    offline_mod.prepare_gfpgan_helper_weights = lambda base: None
    sys.modules["offline_guard"] = offline_mod

    in_path = os.path.join(tmp, "in.png")
    out_path = os.path.join(tmp, "out.png")
    with open(in_path, "wb") as f:
        f.write(b"in")

    # 1) CPU run with OOM retry (real DefaultCPUAllocator: not enough memory string):
    #    starts at tile=256, retries at tile=128, does NOT call empty_cache
    sys.argv = ["upscale.py", in_path, out_path, json.dumps({"scale": 2, "model": "realesrgan"})]
    mod.main()
    assert len(recorded) == 1
    assert recorded[0]["init_tile"] == 256
    assert recorded[0]["half"] is False
    assert recorded[0]["device"] == "device:cpu"
    assert recorded[0]["enhance_tiles"] == [256, 128], recorded[0]
    assert len(empty_cache_calls) == 0, f"expected 0 empty_cache calls on CPU, got {len(empty_cache_calls)}"

    # 2) CPU run where _enhance succeeds at 256 and faceEnhance hits OOM at 256 -> retries at 128 without empty_cache
    fail_first["active"] = False
    fail_first["face_oom"] = True
    sys.argv = ["upscale.py", in_path, out_path, json.dumps({"scale": 2, "model": "realesrgan", "faceEnhance": True})]
    mod.main()
    assert len(recorded) == 2
    assert recorded[1]["enhance_tiles"] == [256]
    assert face_recorded[-1]["enhance_tiles"] == [256, 128], face_recorded[-1]
    assert len(empty_cache_calls) == 0

    # 3) GPU run with OOM retry: starts at tile=512, retries at tile=256, calls empty_cache
    fail_first["active"] = True
    fail_first["face_oom"] = False
    gpu_state["avail"] = True
    sys.argv = ["upscale.py", in_path, out_path, json.dumps({"scale": 2, "model": "realesrgan"})]
    mod.main()
    assert len(recorded) == 3
    assert recorded[2]["init_tile"] == 512
    assert recorded[2]["half"] is True
    assert recorded[2]["device"] == "device:cuda"
    assert recorded[2]["enhance_tiles"] == [512, 256], recorded[2]
    assert len(empty_cache_calls) == 1, f"expected 1 empty_cache call on GPU, got {len(empty_cache_calls)}"

    # 4) OSError(12, "Cannot allocate memory") and CUDA/C++ markers in _enhance and face_enhancer.enhance step down tiles (#3058)
    gpu_state["avail"] = False
    fail_first["active"] = True
    fail_first["face_oom"] = False
    fail_first["exc"] = OSError(12, "Cannot allocate memory")
    sys.argv = ["upscale.py", in_path, out_path, json.dumps({"scale": 2, "model": "realesrgan"})]
    mod.main()
    assert recorded[-1]["enhance_tiles"] == [256, 128], recorded[-1]

    fail_first["active"] = False
    fail_first["face_oom"] = True
    fail_first["face_exc"] = OSError(12, "Cannot allocate memory")
    sys.argv = ["upscale.py", in_path, out_path, json.dumps({"scale": 2, "model": "realesrgan", "faceEnhance": True})]
    mod.main()
    assert recorded[-1]["enhance_tiles"] == [256], recorded[-1]
    assert face_recorded[-1]["enhance_tiles"] == [256, 128], face_recorded[-1]

    gpu_state["avail"] = True
    for cuda_err in (
        RuntimeError("CUDA error: CUBLAS_STATUS_ALLOC_FAILED"),
        RuntimeError("cudaErrorMemoryAllocation"),
        RuntimeError("std::bad_alloc"),
        RuntimeError("MemoryError: allocation failed"),
    ):
        before_cache = len(empty_cache_calls)
        fail_first["active"] = True
        fail_first["face_oom"] = False
        fail_first["exc"] = cuda_err
        sys.argv = ["upscale.py", in_path, out_path, json.dumps({"scale": 2, "model": "realesrgan"})]
        mod.main()
        assert recorded[-1]["enhance_tiles"] == [512, 256], (cuda_err, recorded[-1])
        assert len(empty_cache_calls) == before_cache + 1, (cuda_err, len(empty_cache_calls))

        before_cache = len(empty_cache_calls)
        fail_first["active"] = False
        fail_first["face_oom"] = True
        fail_first["face_exc"] = cuda_err
        sys.argv = ["upscale.py", in_path, out_path, json.dumps({"scale": 2, "model": "realesrgan", "faceEnhance": True})]
        mod.main()
        assert recorded[-1]["enhance_tiles"] == [512], (cuda_err, recorded[-1])
        assert face_recorded[-1]["enhance_tiles"] == [512, 256], (cuda_err, face_recorded[-1])
        assert len(empty_cache_calls) == before_cache + 1, (cuda_err, len(empty_cache_calls))

    import io
    def run_expecting_exit1():
        buf = io.StringIO()
        orig_stdout, orig_dunder = sys.stdout, sys.__stdout__
        sys.stdout = sys.__stdout__ = buf
        try:
            try:
                mod.main()
            except SystemExit as exc:
                assert exc.code == 1, exc.code
            else:
                raise AssertionError("Expected SystemExit(1)")
        finally:
            sys.stdout, sys.__stdout__ = orig_stdout, orig_dunder
        return json.loads(buf.getvalue().strip())

    # Unrecoverable OOM when _enhance already stepped down to 128 on CPU and faceEnhance also hits OOM at 128 (retry_tile >= upsampler.tile)
    gpu_state["avail"] = False
    fail_first["active"] = True
    fail_first["exc"] = OSError(12, "Cannot allocate memory")
    fail_first["face_oom"] = True
    fail_first["face_exc"] = RuntimeError("CUDA error: CUBLAS_STATUS_ALLOC_FAILED")
    sys.argv = ["upscale.py", in_path, out_path, json.dumps({"scale": 2, "model": "realesrgan", "faceEnhance": True})]
    oom_payload = run_expecting_exit1()
    assert recorded[-1]["enhance_tiles"] == [256, 128], recorded[-1]
    assert face_recorded[-1]["enhance_tiles"] == [128], face_recorded[-1]
    assert oom_payload["success"] is False
    assert "out of memory" in oom_payload["error"].lower(), oom_payload

    # Non-OOM OSError (e.g. EACCES) in _enhance or faceEnhance must NOT retry tiles and must exit 1 with repair message
    gpu_state["avail"] = False
    for is_face in (False, True):
        fail_first["active"] = not is_face
        fail_first["face_oom"] = is_face
        fail_first["exc"] = OSError(13, "Permission denied")
        fail_first["face_exc"] = OSError(13, "Permission denied")
        sys.argv = ["upscale.py", in_path, out_path, json.dumps({"scale": 2, "model": "realesrgan", "faceEnhance": is_face})]
        err_payload = run_expecting_exit1()
        assert err_payload["success"] is False
        assert "Permission denied" in err_payload["error"], err_payload
        assert "out of memory" not in err_payload["error"].lower(), err_payload
        assert "Reinstall" in err_payload["error"], err_payload
        if not is_face:
            assert recorded[-1]["enhance_tiles"] == [256], recorded[-1]
        else:
            assert face_recorded[-1]["enhance_tiles"] == [256], face_recorded[-1]

print("TILE_OK")
`;
      const res = spawnSync(pythonBin as string, ["-c", script], {
        encoding: "utf8",
        timeout: 15_000,
      });
      expect(res.status, res.stderr).toBe(0);
      expect(res.stdout).toContain("TILE_OK");
    });
  });
});
