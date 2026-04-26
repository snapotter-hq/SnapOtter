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
import { enhanceFaces } from "../../../packages/ai/src/face-enhancement.js";

const FAKE_INPUT = Buffer.from("fake-image-data");
const FAKE_OUTPUT_DIR = "/tmp/test-enhance";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readFile).mockResolvedValue(Buffer.from("mock-output-data"));
  vi.mocked(writeFile).mockResolvedValue(undefined);
  vi.mocked(runPythonWithProgress).mockResolvedValue({
    stdout: '{"success": true, "facesDetected": 1, "faces": [], "model": "gfpgan"}',
    stderr: "",
  });
  vi.mocked(parseStdoutJson).mockReturnValue({
    success: true,
    facesDetected: 1,
    faces: [{ x: 10, y: 20, w: 80, h: 90 }],
    model: "gfpgan",
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

describe("enhanceFaces", () => {
  describe("request serialization", () => {
    it("calls enhance_faces.py with correct file paths", async () => {
      await enhanceFaces(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "enhance_faces.py",
        [
          `${FAKE_OUTPUT_DIR}/input_enhance_faces.png`,
          `${FAKE_OUTPUT_DIR}/output_enhance_faces.png`,
          "{}",
        ],
        expect.any(Object),
      );
    });

    it("serializes model option", async () => {
      await enhanceFaces(FAKE_INPUT, FAKE_OUTPUT_DIR, { model: "codeformer" });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ model: "codeformer" });
    });

    it("serializes strength option", async () => {
      await enhanceFaces(FAKE_INPUT, FAKE_OUTPUT_DIR, { strength: 0.7 });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ strength: 0.7 });
    });

    it("serializes onlyCenterFace option", async () => {
      await enhanceFaces(FAKE_INPUT, FAKE_OUTPUT_DIR, { onlyCenterFace: true });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ onlyCenterFace: true });
    });

    it("serializes sensitivity option", async () => {
      await enhanceFaces(FAKE_INPUT, FAKE_OUTPUT_DIR, { sensitivity: 0.4 });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ sensitivity: 0.4 });
    });

    it("serializes all options together", async () => {
      await enhanceFaces(FAKE_INPUT, FAKE_OUTPUT_DIR, {
        model: "auto",
        strength: 0.5,
        onlyCenterFace: false,
        sensitivity: 0.6,
      });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({
        model: "auto",
        strength: 0.5,
        onlyCenterFace: false,
        sensitivity: 0.6,
      });
    });

    it("converts input to PNG before writing", async () => {
      await enhanceFaces(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(sharp).toHaveBeenCalledWith(FAKE_INPUT);
      expect(writeFile).toHaveBeenCalledWith(
        `${FAKE_OUTPUT_DIR}/input_enhance_faces.png`,
        Buffer.from("mock-png-data"),
      );
    });
  });

  describe("response parsing", () => {
    it("returns EnhanceFacesResult with all fields", async () => {
      const result = await enhanceFaces(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(result).toEqual({
        buffer: expect.any(Buffer),
        facesDetected: 1,
        faces: [{ x: 10, y: 20, w: 80, h: 90 }],
        model: "gfpgan",
      });
    });

    it("reads the enhanced output file", async () => {
      const enhancedBuf = Buffer.from("enhanced-faces");
      vi.mocked(readFile).mockResolvedValueOnce(enhancedBuf);

      const result = await enhanceFaces(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.buffer).toBe(enhancedBuf);
      expect(readFile).toHaveBeenCalledWith(`${FAKE_OUTPUT_DIR}/output_enhance_faces.png`);
    });

    it("defaults model to 'unknown' when absent from response", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        facesDetected: 1,
        faces: [{ x: 0, y: 0, w: 50, h: 50 }],
      });

      const result = await enhanceFaces(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.model).toBe("unknown");
    });

    it("defaults faces to empty array when absent from response", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        facesDetected: 0,
      });

      const result = await enhanceFaces(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.faces).toEqual([]);
    });

    it("returns multiple face regions", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        facesDetected: 3,
        faces: [
          { x: 10, y: 10, w: 50, h: 50 },
          { x: 100, y: 100, w: 60, h: 60 },
          { x: 200, y: 50, w: 40, h: 40 },
        ],
        model: "codeformer",
      });

      const result = await enhanceFaces(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.facesDetected).toBe(3);
      expect(result.faces).toHaveLength(3);
    });
  });

  describe("error handling", () => {
    it("throws with custom error from Python", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: false,
        error: "GFPGAN weights not found",
      });

      await expect(enhanceFaces(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
        "GFPGAN weights not found",
      );
    });

    it("throws fallback error when success: false without error string", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

      await expect(enhanceFaces(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
        "Face enhancement failed",
      );
    });

    it("propagates OOM errors from bridge", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(
        new Error("Process killed (out of memory)"),
      );

      await expect(enhanceFaces(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("out of memory");
    });
  });

  describe("onProgress forwarding", () => {
    it("passes onProgress to bridge", async () => {
      const onProgress = vi.fn();
      await enhanceFaces(FAKE_INPUT, FAKE_OUTPUT_DIR, {}, onProgress);

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "enhance_faces.py",
        expect.any(Array),
        expect.objectContaining({ onProgress }),
      );
    });
  });
});
