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
import { colorize } from "../../../packages/ai/src/colorization.js";

const FAKE_INPUT = Buffer.from("fake-bw-image");
const FAKE_OUTPUT_DIR = "/tmp/test-colorize";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readFile).mockResolvedValue(Buffer.from("mock-output-data"));
  vi.mocked(writeFile).mockResolvedValue(undefined);
  vi.mocked(runPythonWithProgress).mockResolvedValue({
    stdout: '{"success": true, "width": 800, "height": 600, "method": "deoldify"}',
    stderr: "",
  });
  vi.mocked(parseStdoutJson).mockReturnValue({
    success: true,
    width: 800,
    height: 600,
    method: "deoldify",
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

describe("colorize", () => {
  describe("request serialization", () => {
    it("calls colorize.py with input path, output path, and options JSON", async () => {
      await colorize(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "colorize.py",
        [`${FAKE_OUTPUT_DIR}/input_colorize.png`, `${FAKE_OUTPUT_DIR}/output_colorize.png`, "{}"],
        expect.any(Object),
      );
    });

    it("serializes intensity option", async () => {
      await colorize(FAKE_INPUT, FAKE_OUTPUT_DIR, { intensity: 0.5 });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ intensity: 0.5 });
    });

    it("serializes model option", async () => {
      await colorize(FAKE_INPUT, FAKE_OUTPUT_DIR, { model: "eccv16" });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ model: "eccv16" });
    });

    it("serializes both intensity and model together", async () => {
      await colorize(FAKE_INPUT, FAKE_OUTPUT_DIR, { intensity: 1.0, model: "siggraph17" });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ intensity: 1.0, model: "siggraph17" });
    });

    it("converts input to PNG before writing", async () => {
      await colorize(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(sharp).toHaveBeenCalledWith(FAKE_INPUT);
      expect(writeFile).toHaveBeenCalledWith(
        `${FAKE_OUTPUT_DIR}/input_colorize.png`,
        Buffer.from("mock-png-data"),
      );
    });
  });

  describe("response parsing", () => {
    it("returns ColorizeResult with buffer, width, height, and method", async () => {
      const result = await colorize(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(result).toEqual({
        buffer: expect.any(Buffer),
        width: 800,
        height: 600,
        method: "deoldify",
      });
    });

    it("reads from default output path when output_path not in response", async () => {
      await colorize(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(readFile).toHaveBeenCalledWith(`${FAKE_OUTPUT_DIR}/output_colorize.png`);
    });

    it("reads from alternate output_path when provided by Python", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 800,
        height: 600,
        output_path: "/tmp/alternate-colorized.png",
      });

      await colorize(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(readFile).toHaveBeenCalledWith("/tmp/alternate-colorized.png");
    });

    it("defaults method to 'unknown' when not provided by Python", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 800,
        height: 600,
      });

      const result = await colorize(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.method).toBe("unknown");
    });

    it("preserves width and height from Python response", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 1920,
        height: 1080,
        method: "eccv16",
      });

      const result = await colorize(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);
    });
  });

  describe("error handling", () => {
    it("throws when Python returns success: false with custom error", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: false,
        error: "Input is already a color image",
      });

      await expect(colorize(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
        "Input is already a color image",
      );
    });

    it("throws fallback error when success: false and no error string", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

      await expect(colorize(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("Colorization failed");
    });

    it("propagates bridge rejection", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(
        new Error("Process killed (out of memory)"),
      );

      await expect(colorize(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("out of memory");
    });

    it("propagates parseStdoutJson errors", async () => {
      vi.mocked(parseStdoutJson).mockImplementation(() => {
        throw new SyntaxError("Unexpected token");
      });

      await expect(colorize(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("Unexpected token");
    });
  });

  describe("onProgress forwarding", () => {
    it("passes onProgress callback to bridge", async () => {
      const onProgress = vi.fn();
      await colorize(FAKE_INPUT, FAKE_OUTPUT_DIR, {}, onProgress);

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "colorize.py",
        expect.any(Array),
        expect.objectContaining({ onProgress }),
      );
    });
  });
});
