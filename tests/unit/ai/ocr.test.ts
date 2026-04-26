import { writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sharp", () => {
  const mockSharp = vi.fn(() => ({
    resize: vi.fn().mockReturnThis(),
    png: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
    metadata: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
  }));
  return { default: mockSharp };
});

vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../packages/ai/src/bridge.js", () => ({
  runPythonWithProgress: vi.fn(),
  parseStdoutJson: vi.fn(),
}));

import sharp from "sharp";
import { parseStdoutJson, runPythonWithProgress } from "../../../packages/ai/src/bridge.js";
import { extractText } from "../../../packages/ai/src/ocr.js";

const FAKE_INPUT = Buffer.from("fake-image-data");
const FAKE_OUTPUT_DIR = "/tmp/test-ocr";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(writeFile).mockResolvedValue(undefined);
  vi.mocked(runPythonWithProgress).mockResolvedValue({
    stdout: '{"success": true, "text": "Hello World", "engine": "paddleocr"}',
    stderr: "",
  });
  vi.mocked(parseStdoutJson).mockReturnValue({
    success: true,
    text: "Hello World",
    engine: "paddleocr",
  });
  vi.mocked(sharp).mockImplementation(
    () =>
      ({
        resize: vi.fn().mockReturnThis(),
        png: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
        metadata: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
      }) as unknown as ReturnType<typeof sharp>,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("extractText", () => {
  describe("request serialization", () => {
    it("calls ocr.py with input path and options JSON", async () => {
      await extractText(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "ocr.py",
        [`${FAKE_OUTPUT_DIR}/input_ocr.png`, "{}"],
        expect.objectContaining({ timeout: expect.any(Number) }),
      );
    });

    it("serializes quality option", async () => {
      await extractText(FAKE_INPUT, FAKE_OUTPUT_DIR, { quality: "best" });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[1])).toEqual({ quality: "best" });
    });

    it("serializes language option", async () => {
      await extractText(FAKE_INPUT, FAKE_OUTPUT_DIR, { language: "ja" });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[1])).toEqual({ language: "ja" });
    });

    it("serializes enhance option", async () => {
      await extractText(FAKE_INPUT, FAKE_OUTPUT_DIR, { enhance: true });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[1])).toEqual({ enhance: true });
    });

    it("serializes deprecated engine option for backward compatibility", async () => {
      await extractText(FAKE_INPUT, FAKE_OUTPUT_DIR, { engine: "tesseract" });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[1])).toEqual({ engine: "tesseract" });
    });

    it("serializes all options together", async () => {
      await extractText(FAKE_INPUT, FAKE_OUTPUT_DIR, {
        quality: "fast",
        language: "en",
        enhance: false,
      });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[1])).toEqual({
        quality: "fast",
        language: "en",
        enhance: false,
      });
    });

    it("resizes input to max 2048px before writing", async () => {
      await extractText(FAKE_INPUT, FAKE_OUTPUT_DIR);

      // Sharp is called with the input, then resize is called
      expect(sharp).toHaveBeenCalledWith(FAKE_INPUT);
    });

    it("writes resized PNG to outputDir", async () => {
      await extractText(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(writeFile).toHaveBeenCalledWith(
        `${FAKE_OUTPUT_DIR}/input_ocr.png`,
        Buffer.from("mock-png-data"),
      );
    });
  });

  describe("response parsing", () => {
    it("returns OcrResult with text and engine", async () => {
      const result = await extractText(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(result).toEqual({
        text: "Hello World",
        engine: "paddleocr",
      });
    });

    it("returns text with special characters", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        text: "Price: $19.99\nDiscount: 15%",
        engine: "paddleocr",
      });

      const result = await extractText(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.text).toBe("Price: $19.99\nDiscount: 15%");
    });

    it("returns empty text string when no text detected", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        text: "",
        engine: "paddleocr",
      });

      const result = await extractText(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.text).toBe("");
    });

    it("returns engine information", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        text: "test",
        engine: "tesseract",
      });

      const result = await extractText(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.engine).toBe("tesseract");
    });

    it("returns undefined engine when not provided by Python", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        text: "test",
      });

      const result = await extractText(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.engine).toBeUndefined();
    });
  });

  describe("timeout calculation", () => {
    it("uses minimum 600000ms timeout for small images", async () => {
      await extractText(FAKE_INPUT, FAKE_OUTPUT_DIR);

      // 800x600 = 0.48 MP, 0.48 * 30 * 1000 = 14400 < 600000
      const options = vi.mocked(runPythonWithProgress).mock.calls[0][2];
      expect(options.timeout).toBe(600000);
    });

    it("scales timeout for large images", async () => {
      // We need sharp to return large dimensions for the resized buffer
      // First call resizes the input, second call reads metadata of the resized buffer
      let callCount = 0;
      vi.mocked(sharp).mockImplementation(() => {
        callCount++;
        return {
          resize: vi.fn().mockReturnThis(),
          png: vi.fn().mockReturnThis(),
          toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
          metadata: vi.fn().mockResolvedValue({ width: 5000, height: 4000 }),
        } as unknown as ReturnType<typeof sharp>;
      });

      await extractText(FAKE_INPUT, FAKE_OUTPUT_DIR);

      // 5000*4000 = 20 MP, 20 * 30 * 1000 = 600000 = 600000 (equal to min)
      const options = vi.mocked(runPythonWithProgress).mock.calls[0][2];
      expect(options.timeout).toBeGreaterThanOrEqual(600000);
    });
  });

  describe("error handling", () => {
    it("throws with custom error from Python", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: false,
        error: "PaddleOCR initialization failed",
      });

      await expect(extractText(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
        "PaddleOCR initialization failed",
      );
    });

    it("throws fallback error when success: false without error string", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

      await expect(extractText(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("OCR failed");
    });

    it("propagates bridge timeout", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(new Error("Python script timed out"));

      await expect(extractText(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("timed out");
    });

    it("propagates parseStdoutJson errors", async () => {
      vi.mocked(parseStdoutJson).mockImplementation(() => {
        throw new Error("No JSON response from Python script");
      });

      await expect(extractText(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
        "No JSON response from Python script",
      );
    });
  });

  describe("onProgress forwarding", () => {
    it("passes onProgress to bridge", async () => {
      const onProgress = vi.fn();
      await extractText(FAKE_INPUT, FAKE_OUTPUT_DIR, {}, onProgress);

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "ocr.py",
        expect.any(Array),
        expect.objectContaining({ onProgress }),
      );
    });
  });
});
