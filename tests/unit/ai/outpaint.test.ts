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

vi.mock("../../../packages/ai/src/bridge.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../packages/ai/src/bridge.js")>()),
  runPythonWithProgress: vi.fn(),
  parseStdoutJson: vi.fn(),
}));

import sharp from "sharp";
import { parseStdoutJson, runPythonWithProgress } from "../../../packages/ai/src/bridge.js";
import { type OutpaintOptions, outpaint } from "../../../packages/ai/src/outpainting.js";

const FAKE_INPUT = Buffer.from("fake-image-data");
const FAKE_OUTPUT_DIR = "/tmp/test-outpaint";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readFile).mockResolvedValue(Buffer.from("mock-output-data"));
  vi.mocked(writeFile).mockResolvedValue(undefined);
  vi.mocked(runPythonWithProgress).mockResolvedValue({
    stdout: '{"success": true}',
    stderr: "",
  });
  vi.mocked(parseStdoutJson).mockReturnValue({ success: true });
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

describe("outpaint", () => {
  describe("module exports", () => {
    it("exports outpaint as a function", () => {
      expect(typeof outpaint).toBe("function");
    });

    it("accepts a valid OutpaintOptions object", () => {
      const options: OutpaintOptions = {
        extendTop: 100,
        extendRight: 50,
        extendBottom: 100,
        extendLeft: 50,
      };
      expect(options.extendTop).toBe(100);
      expect(options.extendRight).toBe(50);
      expect(options.extendBottom).toBe(100);
      expect(options.extendLeft).toBe(50);
    });
  });

  describe("request serialization", () => {
    it("calls outpaint.py with input, output, and extension args", async () => {
      const options: OutpaintOptions = {
        extendTop: 10,
        extendRight: 20,
        extendBottom: 30,
        extendLeft: 40,
      };
      await outpaint(FAKE_INPUT, options, FAKE_OUTPUT_DIR);

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "outpaint.py",
        [
          `${FAKE_OUTPUT_DIR}/input_outpaint.png`,
          `${FAKE_OUTPUT_DIR}/output_outpaint.png`,
          "10",
          "20",
          "30",
          "40",
          "balanced",
        ],
        expect.any(Object),
      );
    });

    it("passes custom tier value instead of default 'balanced'", async () => {
      const options: OutpaintOptions = {
        extendTop: 10,
        extendRight: 20,
        extendBottom: 30,
        extendLeft: 40,
        tier: "high",
      };
      await outpaint(FAKE_INPUT, options, FAKE_OUTPUT_DIR);

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "outpaint.py",
        [
          `${FAKE_OUTPUT_DIR}/input_outpaint.png`,
          `${FAKE_OUTPUT_DIR}/output_outpaint.png`,
          "10",
          "20",
          "30",
          "40",
          "high",
        ],
        expect.any(Object),
      );
    });

    it("passes 'fast' tier value", async () => {
      const options: OutpaintOptions = {
        extendTop: 5,
        extendRight: 5,
        extendBottom: 5,
        extendLeft: 5,
        tier: "fast",
      };
      await outpaint(FAKE_INPUT, options, FAKE_OUTPUT_DIR);

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(args[6]).toBe("fast");
    });

    it("converts input to PNG via sharp", async () => {
      const options: OutpaintOptions = {
        extendTop: 0,
        extendRight: 0,
        extendBottom: 0,
        extendLeft: 0,
      };
      await outpaint(FAKE_INPUT, options, FAKE_OUTPUT_DIR);

      expect(sharp).toHaveBeenCalledTimes(1);
      expect(sharp).toHaveBeenCalledWith(FAKE_INPUT);
    });

    it("writes input file to disk", async () => {
      const options: OutpaintOptions = {
        extendTop: 0,
        extendRight: 0,
        extendBottom: 0,
        extendLeft: 0,
      };
      await outpaint(FAKE_INPUT, options, FAKE_OUTPUT_DIR);

      expect(writeFile).toHaveBeenCalledWith(
        `${FAKE_OUTPUT_DIR}/input_outpaint.png`,
        Buffer.from("mock-png-data"),
      );
    });
  });

  describe("response parsing", () => {
    it("returns output buffer on success", async () => {
      const outpaintedBuf = Buffer.from("outpainted-result");
      vi.mocked(readFile).mockResolvedValueOnce(outpaintedBuf);

      const options: OutpaintOptions = {
        extendTop: 10,
        extendRight: 10,
        extendBottom: 10,
        extendLeft: 10,
      };
      const result = await outpaint(FAKE_INPUT, options, FAKE_OUTPUT_DIR);
      expect(result).toBe(outpaintedBuf);
    });

    it("reads from the correct output path", async () => {
      const options: OutpaintOptions = {
        extendTop: 0,
        extendRight: 0,
        extendBottom: 0,
        extendLeft: 0,
      };
      await outpaint(FAKE_INPUT, options, FAKE_OUTPUT_DIR);

      expect(readFile).toHaveBeenCalledWith(`${FAKE_OUTPUT_DIR}/output_outpaint.png`);
    });
  });

  describe("error handling", () => {
    it("throws with custom error from Python", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: false,
        error: "Model not loaded",
      });

      const options: OutpaintOptions = {
        extendTop: 10,
        extendRight: 10,
        extendBottom: 10,
        extendLeft: 10,
      };
      await expect(outpaint(FAKE_INPUT, options, FAKE_OUTPUT_DIR)).rejects.toThrow(
        "Model not loaded",
      );
    });

    it("throws fallback error when success: false without error string", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

      const options: OutpaintOptions = {
        extendTop: 10,
        extendRight: 10,
        extendBottom: 10,
        extendLeft: 10,
      };
      await expect(outpaint(FAKE_INPUT, options, FAKE_OUTPUT_DIR)).rejects.toThrow(
        "Outpainting failed",
      );
    });

    it("propagates bridge timeout", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(new Error("Python script timed out"));

      const options: OutpaintOptions = {
        extendTop: 10,
        extendRight: 10,
        extendBottom: 10,
        extendLeft: 10,
      };
      await expect(outpaint(FAKE_INPUT, options, FAKE_OUTPUT_DIR)).rejects.toThrow("timed out");
    });

    it("propagates bridge OOM", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(
        new Error("Process killed (out of memory)"),
      );

      const options: OutpaintOptions = {
        extendTop: 10,
        extendRight: 10,
        extendBottom: 10,
        extendLeft: 10,
      };
      await expect(outpaint(FAKE_INPUT, options, FAKE_OUTPUT_DIR)).rejects.toThrow("out of memory");
    });

    it("propagates parseStdoutJson errors", async () => {
      vi.mocked(parseStdoutJson).mockImplementation(() => {
        throw new Error("No JSON response from Python script");
      });

      const options: OutpaintOptions = {
        extendTop: 10,
        extendRight: 10,
        extendBottom: 10,
        extendLeft: 10,
      };
      await expect(outpaint(FAKE_INPUT, options, FAKE_OUTPUT_DIR)).rejects.toThrow(
        "No JSON response from Python script",
      );
    });

    it("propagates sharp conversion error", async () => {
      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            toBuffer: vi.fn().mockRejectedValue(new Error("Corrupt input image")),
          }) as unknown as ReturnType<typeof sharp>,
      );

      const options: OutpaintOptions = {
        extendTop: 10,
        extendRight: 10,
        extendBottom: 10,
        extendLeft: 10,
      };
      await expect(outpaint(FAKE_INPUT, options, FAKE_OUTPUT_DIR)).rejects.toThrow(
        "Corrupt input image",
      );
    });
  });

  describe("onProgress forwarding", () => {
    it("passes onProgress to bridge", async () => {
      const onProgress = vi.fn();
      const options: OutpaintOptions = {
        extendTop: 10,
        extendRight: 10,
        extendBottom: 10,
        extendLeft: 10,
      };
      await outpaint(FAKE_INPUT, options, FAKE_OUTPUT_DIR, onProgress);

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "outpaint.py",
        expect.any(Array),
        expect.objectContaining({ onProgress }),
      );
    });

    it("omits onProgress when not provided", async () => {
      const options: OutpaintOptions = {
        extendTop: 10,
        extendRight: 10,
        extendBottom: 10,
        extendLeft: 10,
      };
      await outpaint(FAKE_INPUT, options, FAKE_OUTPUT_DIR);

      const bridgeOptions = vi.mocked(runPythonWithProgress).mock.calls[0][2];
      expect(bridgeOptions.onProgress).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("handles zero extension on all sides", async () => {
      const options: OutpaintOptions = {
        extendTop: 0,
        extendRight: 0,
        extendBottom: 0,
        extendLeft: 0,
      };
      await outpaint(FAKE_INPUT, options, FAKE_OUTPUT_DIR);

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "outpaint.py",
        expect.arrayContaining(["0", "0", "0", "0"]),
        expect.any(Object),
      );
    });

    it("propagates writeFile error", async () => {
      vi.mocked(writeFile).mockRejectedValueOnce(new Error("ENOSPC: disk full"));

      const options: OutpaintOptions = {
        extendTop: 10,
        extendRight: 10,
        extendBottom: 10,
        extendLeft: 10,
      };
      await expect(outpaint(FAKE_INPUT, options, FAKE_OUTPUT_DIR)).rejects.toThrow("disk full");
    });

    it("propagates readFile error after successful Python run", async () => {
      vi.mocked(readFile).mockRejectedValueOnce(new Error("ENOENT: output missing"));

      const options: OutpaintOptions = {
        extendTop: 10,
        extendRight: 10,
        extendBottom: 10,
        extendLeft: 10,
      };
      await expect(outpaint(FAKE_INPUT, options, FAKE_OUTPUT_DIR)).rejects.toThrow(
        "output missing",
      );
    });
  });
});
