import { readFile, unlink, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sharp", () => {
  const mockSharp = vi.fn(() => ({
    png: vi.fn().mockReturnThis(),
    resize: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
    metadata: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
  }));
  return { default: mockSharp };
});

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from("mock-output-data")),
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../packages/ai/src/bridge.js", () => ({
  runPythonWithProgress: vi.fn(),
  parseStdoutJson: vi.fn(),
}));

import sharp from "sharp";
import { removeBackground } from "../../../packages/ai/src/background-removal.js";
import { parseStdoutJson, runPythonWithProgress } from "../../../packages/ai/src/bridge.js";

const FAKE_INPUT = Buffer.from("fake-image-data");
const FAKE_OUTPUT_DIR = "/tmp/test-output";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readFile).mockResolvedValue(Buffer.from("mock-output-data"));
  vi.mocked(writeFile).mockResolvedValue(undefined);
  vi.mocked(unlink).mockResolvedValue(undefined);
  vi.mocked(runPythonWithProgress).mockResolvedValue({
    stdout: '{"success": true}',
    stderr: "",
  });
  vi.mocked(parseStdoutJson).mockReturnValue({ success: true });
  vi.mocked(sharp).mockImplementation(
    () =>
      ({
        png: vi.fn().mockReturnThis(),
        resize: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
        metadata: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
      }) as unknown as ReturnType<typeof sharp>,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("removeBackground", () => {
  describe("request serialization", () => {
    it("calls remove_bg.py with input path, output path, and options JSON", async () => {
      await removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "remove_bg.py",
        expect.arrayContaining([
          expect.stringContaining("rembg_in_"),
          expect.stringContaining("rembg_out_"),
          "{}",
        ]),
        expect.any(Object),
      );
    });

    it("serializes model option into the args JSON", async () => {
      await removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR, { model: "u2net_human_seg" });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ model: "u2net_human_seg" });
    });

    it("serializes backgroundColor option into the args JSON", async () => {
      await removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR, { backgroundColor: "#FF0000" });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ backgroundColor: "#FF0000" });
    });

    it("serializes both model and backgroundColor together", async () => {
      await removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR, {
        model: "isnet-general-use",
        backgroundColor: "transparent",
      });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({
        model: "isnet-general-use",
        backgroundColor: "transparent",
      });
    });

    it("converts input to PNG via sharp before writing to disk", async () => {
      await removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(sharp).toHaveBeenCalledWith(FAKE_INPUT);
      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining("rembg_in_"),
        Buffer.from("mock-png-data"),
      );
    });

    it("uses unique UUID in temp file names to prevent collisions", async () => {
      await removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR);
      await removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR);

      const call1Args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      const call2Args = vi.mocked(runPythonWithProgress).mock.calls[1][1];
      // The UUID portions should differ
      expect(call1Args[0]).not.toBe(call2Args[0]);
    });

    it("writes input to system tmpdir, output to outputDir", async () => {
      await removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR);

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      // Input path in tmpdir
      expect(args[0]).toMatch(/rembg_in_/);
      // Output path in outputDir
      expect(args[1]).toMatch(/^\/tmp\/test-output\/rembg_out_/);
    });
  });

  describe("response parsing", () => {
    it("reads the output file and returns its buffer on success", async () => {
      const outputBuf = Buffer.from("transparent-image");
      vi.mocked(readFile).mockResolvedValueOnce(outputBuf);

      const result = await removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result).toBe(outputBuf);
    });

    it("passes stdout through parseStdoutJson", async () => {
      vi.mocked(runPythonWithProgress).mockResolvedValue({
        stdout: '{"success": true, "extra": "data"}',
        stderr: "",
      });

      await removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(parseStdoutJson).toHaveBeenCalledWith('{"success": true, "extra": "data"}');
    });
  });

  describe("error handling", () => {
    it("throws when Python returns success: false with custom error", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: false,
        error: "Model u2net_cloth not available",
      });

      await expect(removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
        "Model u2net_cloth not available",
      );
    });

    it("throws fallback error when success: false and no error string", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

      await expect(removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
        "Background removal failed",
      );
    });

    it("propagates bridge timeout errors", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(new Error("Python script timed out"));

      await expect(removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
        "Python script timed out",
      );
    });

    it("propagates parseStdoutJson errors", async () => {
      vi.mocked(parseStdoutJson).mockImplementation(() => {
        throw new Error("No JSON response from Python script");
      });

      await expect(removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
        "No JSON response from Python script",
      );
    });

    it("propagates sharp conversion errors", async () => {
      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            resize: vi.fn().mockReturnThis(),
            toBuffer: vi.fn().mockRejectedValue(new Error("Invalid image")),
            metadata: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
          }) as unknown as ReturnType<typeof sharp>,
      );

      await expect(removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("Invalid image");
    });
  });

  describe("timeout calculation", () => {
    it("uses 300000ms base timeout for non-birefnet models", async () => {
      await removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR, { model: "u2net" });

      const options = vi.mocked(runPythonWithProgress).mock.calls[0][2];
      expect(options.timeout).toBe(300000);
    });

    it("uses 600000ms base timeout for birefnet models", async () => {
      await removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR, { model: "birefnet-general" });

      const options = vi.mocked(runPythonWithProgress).mock.calls[0][2];
      expect(options.timeout).toBeGreaterThanOrEqual(600000);
    });

    it("uses 600000ms base timeout for birefnet-massive model", async () => {
      await removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR, { model: "birefnet-massive" });

      const options = vi.mocked(runPythonWithProgress).mock.calls[0][2];
      expect(options.timeout).toBeGreaterThanOrEqual(600000);
    });

    it("scales timeout with megapixels for large images", async () => {
      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            resize: vi.fn().mockReturnThis(),
            toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
            metadata: vi.fn().mockResolvedValue({ width: 6000, height: 4000 }),
          }) as unknown as ReturnType<typeof sharp>,
      );

      await removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR);

      // 24 MP * 30 * 1000 = 720000 > 300000
      const options = vi.mocked(runPythonWithProgress).mock.calls[0][2];
      expect(options.timeout).toBe(720000);
    });

    it("uses default 300000ms base when model is not specified", async () => {
      await removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR);

      const options = vi.mocked(runPythonWithProgress).mock.calls[0][2];
      expect(options.timeout).toBe(300000);
    });
  });

  describe("temp file cleanup", () => {
    it("cleans up both input and output temp files on success", async () => {
      await removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(unlink).toHaveBeenCalledTimes(2);
      expect(unlink).toHaveBeenCalledWith(expect.stringContaining("rembg_in_"));
      expect(unlink).toHaveBeenCalledWith(expect.stringContaining("rembg_out_"));
    });

    it("cleans up temp files when Python returns failure", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

      await expect(removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow();
      expect(unlink).toHaveBeenCalledTimes(2);
    });

    it("cleans up temp files when bridge rejects", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(new Error("crash"));

      await expect(removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow();
      expect(unlink).toHaveBeenCalledTimes(2);
    });

    it("does not throw if unlink fails (swallows cleanup errors)", async () => {
      vi.mocked(unlink).mockRejectedValue(new Error("ENOENT"));

      // Should not throw -- unlink errors are caught
      await expect(removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR)).resolves.toBeDefined();
    });
  });

  describe("onProgress forwarding", () => {
    it("passes onProgress callback through to bridge", async () => {
      const onProgress = vi.fn();
      await removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR, {}, onProgress);

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "remove_bg.py",
        expect.any(Array),
        expect.objectContaining({ onProgress }),
      );
    });

    it("passes undefined onProgress when not provided", async () => {
      await removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR);

      const options = vi.mocked(runPythonWithProgress).mock.calls[0][2];
      expect(options.onProgress).toBeUndefined();
    });
  });

  describe("image downscaling", () => {
    it("does not call resize when image is within limit", async () => {
      const resizeFn = vi.fn().mockReturnThis();
      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            resize: resizeFn,
            toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
            metadata: vi.fn().mockResolvedValue({ width: 1024, height: 768 }),
          }) as unknown as ReturnType<typeof sharp>,
      );

      await removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(resizeFn).not.toHaveBeenCalled();
    });

    it("calls resize when longest edge exceeds 2048px", async () => {
      const resizeFn = vi.fn().mockReturnThis();
      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            resize: resizeFn,
            toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
            metadata: vi.fn().mockResolvedValue({ width: 4000, height: 3000 }),
          }) as unknown as ReturnType<typeof sharp>,
      );

      await removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(resizeFn).toHaveBeenCalledWith(
        expect.objectContaining({ width: 2048, fit: "inside", withoutEnlargement: true }),
      );
    });

    it("constrains by height when portrait orientation", async () => {
      const resizeFn = vi.fn().mockReturnThis();
      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            resize: resizeFn,
            toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
            metadata: vi.fn().mockResolvedValue({ width: 2000, height: 4000 }),
          }) as unknown as ReturnType<typeof sharp>,
      );

      await removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(resizeFn).toHaveBeenCalledWith(
        expect.objectContaining({ height: 2048, fit: "inside" }),
      );
    });

    it("upscales mask back to original dimensions after processing", async () => {
      const callCount = 0;
      const resizeFn = vi.fn().mockReturnThis();
      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            resize: resizeFn,
            toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
            metadata: vi.fn().mockResolvedValue({ width: 5000, height: 3000 }),
          }) as unknown as ReturnType<typeof sharp>,
      );

      await removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR);

      const upscaleCall = resizeFn.mock.calls.find(
        (c: unknown[]) =>
          c[0] && typeof c[0] === "object" && (c[0] as Record<string, unknown>).width === 5000,
      );
      expect(upscaleCall).toBeDefined();
      expect(upscaleCall![0]).toMatchObject({ width: 5000, height: 3000, fit: "fill" });
    });

    it("does not upscale mask when image was not downscaled", async () => {
      const resizeFn = vi.fn().mockReturnThis();
      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            resize: resizeFn,
            toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
            metadata: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
          }) as unknown as ReturnType<typeof sharp>,
      );

      await removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(resizeFn).not.toHaveBeenCalled();
    });
  });

  describe("OOM fallback", () => {
    it("retries with u2net when OOM is detected", async () => {
      vi.mocked(runPythonWithProgress)
        .mockRejectedValueOnce(new Error("Process killed (out of memory)"))
        .mockResolvedValueOnce({ stdout: '{"success": true}', stderr: "" });

      await removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR, { model: "birefnet-general" });

      expect(runPythonWithProgress).toHaveBeenCalledTimes(2);
      const fallbackArgs = vi.mocked(runPythonWithProgress).mock.calls[1][1];
      const fallbackOpts = JSON.parse(fallbackArgs[2]);
      expect(fallbackOpts.model).toBe("u2net");
    });

    it("fires progress callback on fallback retry", async () => {
      const onProgress = vi.fn();
      vi.mocked(runPythonWithProgress)
        .mockRejectedValueOnce(new Error("Process killed (out of memory)"))
        .mockResolvedValueOnce({ stdout: '{"success": true}', stderr: "" });

      await removeBackground(
        FAKE_INPUT,
        FAKE_OUTPUT_DIR,
        { model: "birefnet-general" },
        onProgress,
      );

      expect(onProgress).toHaveBeenCalledWith(5, expect.stringContaining("u2net"));
    });

    it("does not retry when already using u2net", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(
        new Error("Process killed (out of memory)"),
      );

      await expect(
        removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR, { model: "u2net" }),
      ).rejects.toThrow("out of memory");

      expect(runPythonWithProgress).toHaveBeenCalledTimes(1);
    });

    it("does not retry on non-OOM errors", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(new Error("Python script timed out"));

      await expect(
        removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR, { model: "birefnet-general" }),
      ).rejects.toThrow("timed out");

      expect(runPythonWithProgress).toHaveBeenCalledTimes(1);
    });

    it("uses 300000ms timeout for the u2net fallback attempt", async () => {
      vi.mocked(runPythonWithProgress)
        .mockRejectedValueOnce(new Error("Process killed (out of memory)"))
        .mockResolvedValueOnce({ stdout: '{"success": true}', stderr: "" });

      await removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR, { model: "birefnet-general" });

      const fallbackOptions = vi.mocked(runPythonWithProgress).mock.calls[1][2];
      expect(fallbackOptions.timeout).toBe(300000);
    });

    it("propagates error if fallback also fails", async () => {
      vi.mocked(runPythonWithProgress)
        .mockRejectedValueOnce(new Error("Process killed (out of memory)"))
        .mockRejectedValueOnce(new Error("Process killed (out of memory)"));

      await expect(
        removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR, { model: "birefnet-general" }),
      ).rejects.toThrow("out of memory");

      expect(runPythonWithProgress).toHaveBeenCalledTimes(2);
    });

    it("retries with fallback when no model is specified (default)", async () => {
      vi.mocked(runPythonWithProgress)
        .mockRejectedValueOnce(new Error("Process killed (out of memory)"))
        .mockResolvedValueOnce({ stdout: '{"success": true}', stderr: "" });

      await removeBackground(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(runPythonWithProgress).toHaveBeenCalledTimes(2);
      const fallbackArgs = vi.mocked(runPythonWithProgress).mock.calls[1][1];
      expect(JSON.parse(fallbackArgs[2]).model).toBe("u2net");
    });
  });
});
