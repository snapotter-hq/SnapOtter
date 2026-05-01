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
import { inpaint } from "../../../packages/ai/src/inpainting.js";

const FAKE_INPUT = Buffer.from("fake-image-data");
const FAKE_MASK = Buffer.from("fake-mask-data");
const FAKE_OUTPUT_DIR = "/tmp/test-inpaint";

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

describe("inpaint", () => {
  describe("request serialization", () => {
    it("calls inpaint.py with input, mask, and output paths", async () => {
      await inpaint(FAKE_INPUT, FAKE_MASK, FAKE_OUTPUT_DIR);

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "inpaint.py",
        [
          `${FAKE_OUTPUT_DIR}/input_inpaint.png`,
          `${FAKE_OUTPUT_DIR}/mask_inpaint.png`,
          `${FAKE_OUTPUT_DIR}/output_inpaint.png`,
        ],
        expect.any(Object),
      );
    });

    it("converts both input and mask to PNG via sharp", async () => {
      await inpaint(FAKE_INPUT, FAKE_MASK, FAKE_OUTPUT_DIR);

      // sharp called twice: once for input, once for mask
      expect(sharp).toHaveBeenCalledTimes(2);
      expect(sharp).toHaveBeenCalledWith(FAKE_INPUT);
      expect(sharp).toHaveBeenCalledWith(FAKE_MASK);
    });

    it("writes both input and mask files to disk", async () => {
      await inpaint(FAKE_INPUT, FAKE_MASK, FAKE_OUTPUT_DIR);

      expect(writeFile).toHaveBeenCalledTimes(2);
      expect(writeFile).toHaveBeenCalledWith(
        `${FAKE_OUTPUT_DIR}/input_inpaint.png`,
        Buffer.from("mock-png-data"),
      );
      expect(writeFile).toHaveBeenCalledWith(
        `${FAKE_OUTPUT_DIR}/mask_inpaint.png`,
        Buffer.from("mock-png-data"),
      );
    });

    it("does not pass any options argument (only 3 args)", async () => {
      await inpaint(FAKE_INPUT, FAKE_MASK, FAKE_OUTPUT_DIR);

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(args).toHaveLength(3);
    });
  });

  describe("response parsing", () => {
    it("returns output buffer on success", async () => {
      const inpaintedBuf = Buffer.from("inpainted-result");
      vi.mocked(readFile).mockResolvedValueOnce(inpaintedBuf);

      const result = await inpaint(FAKE_INPUT, FAKE_MASK, FAKE_OUTPUT_DIR);
      expect(result).toBe(inpaintedBuf);
    });

    it("reads from the correct output path", async () => {
      await inpaint(FAKE_INPUT, FAKE_MASK, FAKE_OUTPUT_DIR);

      expect(readFile).toHaveBeenCalledWith(`${FAKE_OUTPUT_DIR}/output_inpaint.png`);
    });
  });

  describe("error handling", () => {
    it("throws with custom error from Python", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: false,
        error: "Mask dimensions do not match input",
      });

      await expect(inpaint(FAKE_INPUT, FAKE_MASK, FAKE_OUTPUT_DIR)).rejects.toThrow(
        "Mask dimensions do not match input",
      );
    });

    it("throws fallback error when success: false without error string", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

      await expect(inpaint(FAKE_INPUT, FAKE_MASK, FAKE_OUTPUT_DIR)).rejects.toThrow(
        "Inpainting failed",
      );
    });

    it("propagates bridge timeout", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(new Error("Python script timed out"));

      await expect(inpaint(FAKE_INPUT, FAKE_MASK, FAKE_OUTPUT_DIR)).rejects.toThrow("timed out");
    });

    it("propagates bridge OOM", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(
        new Error("Process killed (out of memory)"),
      );

      await expect(inpaint(FAKE_INPUT, FAKE_MASK, FAKE_OUTPUT_DIR)).rejects.toThrow(
        "out of memory",
      );
    });

    it("propagates parseStdoutJson errors", async () => {
      vi.mocked(parseStdoutJson).mockImplementation(() => {
        throw new Error("No JSON response from Python script");
      });

      await expect(inpaint(FAKE_INPUT, FAKE_MASK, FAKE_OUTPUT_DIR)).rejects.toThrow(
        "No JSON response from Python script",
      );
    });

    it("propagates sharp conversion errors on input", async () => {
      let callCount = 0;
      vi.mocked(sharp).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            png: vi.fn().mockReturnThis(),
            toBuffer: vi.fn().mockRejectedValue(new Error("Corrupt input image")),
          } as unknown as ReturnType<typeof sharp>;
        }
        return {
          png: vi.fn().mockReturnThis(),
          toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
        } as unknown as ReturnType<typeof sharp>;
      });

      await expect(inpaint(FAKE_INPUT, FAKE_MASK, FAKE_OUTPUT_DIR)).rejects.toThrow(
        "Corrupt input image",
      );
    });
  });

  describe("onProgress forwarding", () => {
    it("passes onProgress to bridge", async () => {
      const onProgress = vi.fn();
      await inpaint(FAKE_INPUT, FAKE_MASK, FAKE_OUTPUT_DIR, onProgress);

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "inpaint.py",
        expect.any(Array),
        expect.objectContaining({ onProgress }),
      );
    });

    it("omits onProgress when not provided", async () => {
      await inpaint(FAKE_INPUT, FAKE_MASK, FAKE_OUTPUT_DIR);

      const options = vi.mocked(runPythonWithProgress).mock.calls[0][2];
      expect(options.onProgress).toBeUndefined();
    });
  });
});
