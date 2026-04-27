import { readFile, unlink, writeFile } from "node:fs/promises";
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
  unlink: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../packages/ai/src/bridge.js", () => ({
  runPythonWithProgress: vi.fn(),
  parseStdoutJson: vi.fn(),
}));

import sharp from "sharp";
import { parseStdoutJson, runPythonWithProgress } from "../../../packages/ai/src/bridge.js";
import { blurFaces, detectFaces } from "../../../packages/ai/src/face-detection.js";

const FAKE_INPUT = Buffer.from("fake-image-data");
const FAKE_OUTPUT_DIR = "/tmp/test-faces";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readFile).mockResolvedValue(Buffer.from("mock-output-data"));
  vi.mocked(writeFile).mockResolvedValue(undefined);
  vi.mocked(unlink).mockResolvedValue(undefined);
  vi.mocked(runPythonWithProgress).mockResolvedValue({
    stdout: '{"success": true, "facesDetected": 0}',
    stderr: "",
  });
  vi.mocked(parseStdoutJson).mockReturnValue({
    success: true,
    facesDetected: 0,
    faces: [],
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

describe("blurFaces", () => {
  describe("request serialization", () => {
    it("calls detect_faces.py with correct file paths", async () => {
      await blurFaces(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "detect_faces.py",
        [`${FAKE_OUTPUT_DIR}/input_faces.png`, `${FAKE_OUTPUT_DIR}/output_faces.png`, "{}"],
        expect.any(Object),
      );
    });

    it("serializes blurRadius option", async () => {
      await blurFaces(FAKE_INPUT, FAKE_OUTPUT_DIR, { blurRadius: 30 });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ blurRadius: 30 });
    });

    it("serializes sensitivity option", async () => {
      await blurFaces(FAKE_INPUT, FAKE_OUTPUT_DIR, { sensitivity: 0.3 });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ sensitivity: 0.3 });
    });

    it("serializes both blurRadius and sensitivity", async () => {
      await blurFaces(FAKE_INPUT, FAKE_OUTPUT_DIR, { blurRadius: 25, sensitivity: 0.7 });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ blurRadius: 25, sensitivity: 0.7 });
    });

    it("converts input to PNG before writing", async () => {
      await blurFaces(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(sharp).toHaveBeenCalledWith(FAKE_INPUT);
    });
  });

  describe("response parsing", () => {
    it("returns BlurFacesResult with multiple face regions", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        facesDetected: 3,
        faces: [
          { x: 10, y: 20, w: 50, h: 60 },
          { x: 100, y: 120, w: 55, h: 65 },
          { x: 200, y: 220, w: 45, h: 55 },
        ],
      });

      const result = await blurFaces(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(result.facesDetected).toBe(3);
      expect(result.faces).toHaveLength(3);
      expect(result.buffer).toBeInstanceOf(Buffer);
    });

    it("returns empty faces array when none detected", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        facesDetected: 0,
      });

      const result = await blurFaces(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.facesDetected).toBe(0);
      expect(result.faces).toEqual([]);
    });

    it("defaults faces to empty array when field absent from response", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        facesDetected: 0,
      });

      const result = await blurFaces(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.faces).toEqual([]);
    });

    it("reads the output file for the blurred image", async () => {
      const blurredBuf = Buffer.from("blurred-faces-output");
      vi.mocked(readFile).mockResolvedValueOnce(blurredBuf);

      const result = await blurFaces(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.buffer).toBe(blurredBuf);
      expect(readFile).toHaveBeenCalledWith(`${FAKE_OUTPUT_DIR}/output_faces.png`);
    });
  });

  describe("error handling", () => {
    it("throws with custom error from Python", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: false,
        error: "MediaPipe initialization failed",
      });

      await expect(blurFaces(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
        "MediaPipe initialization failed",
      );
    });

    it("throws fallback error when success: false without error string", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

      await expect(blurFaces(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("Face detection failed");
    });

    it("propagates bridge timeout", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(new Error("Python script timed out"));

      await expect(blurFaces(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("timed out");
    });

    it("propagates OOM errors from bridge", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(
        new Error("Process killed (out of memory)"),
      );

      await expect(blurFaces(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("out of memory");
    });
  });

  describe("onProgress forwarding", () => {
    it("passes onProgress to bridge", async () => {
      const onProgress = vi.fn();
      await blurFaces(FAKE_INPUT, FAKE_OUTPUT_DIR, {}, onProgress);

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "detect_faces.py",
        expect.any(Array),
        expect.objectContaining({ onProgress }),
      );
    });
  });
});

describe("detectFaces", () => {
  describe("request serialization", () => {
    it("calls detect_faces.py with detectOnly: true", async () => {
      await detectFaces(FAKE_INPUT);

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      const optionsArg = JSON.parse(args[2]);
      expect(optionsArg.detectOnly).toBe(true);
    });

    it("passes 'unused' as the output path argument", async () => {
      await detectFaces(FAKE_INPUT);

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(args[1]).toBe("unused");
    });

    it("merges user sensitivity with detectOnly flag", async () => {
      await detectFaces(FAKE_INPUT, { sensitivity: 0.2 });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      const parsed = JSON.parse(args[2]);
      expect(parsed).toEqual({ sensitivity: 0.2, detectOnly: true });
    });

    it("writes input to tmpdir", async () => {
      await detectFaces(FAKE_INPUT);

      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining("detect_faces_"),
        Buffer.from("mock-png-data"),
      );
    });
  });

  describe("response parsing", () => {
    it("returns DetectFacesResult without a buffer property", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        facesDetected: 2,
        faces: [
          { x: 10, y: 20, w: 50, h: 60 },
          { x: 100, y: 120, w: 55, h: 65 },
        ],
      });

      const result = await detectFaces(FAKE_INPUT);

      expect(result.facesDetected).toBe(2);
      expect(result.faces).toHaveLength(2);
      expect(result).not.toHaveProperty("buffer");
    });

    it("defaults faces to empty array", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        facesDetected: 0,
      });

      const result = await detectFaces(FAKE_INPUT);
      expect(result.faces).toEqual([]);
    });
  });

  describe("temp file cleanup", () => {
    it("cleans up temp input file after success", async () => {
      await detectFaces(FAKE_INPUT);
      expect(unlink).toHaveBeenCalledWith(expect.stringContaining("detect_faces_"));
    });

    it("cleans up temp input file after failure", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

      await expect(detectFaces(FAKE_INPUT)).rejects.toThrow();
      expect(unlink).toHaveBeenCalled();
    });

    it("cleans up temp file when bridge rejects", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(new Error("crash"));

      await expect(detectFaces(FAKE_INPUT)).rejects.toThrow();
      expect(unlink).toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("throws fallback error", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

      await expect(detectFaces(FAKE_INPUT)).rejects.toThrow("Face detection failed");
    });

    it("propagates segfault error", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(
        new Error("Process crashed (segmentation fault)"),
      );

      await expect(detectFaces(FAKE_INPUT)).rejects.toThrow("segmentation fault");
    });

    it("propagates OOM errors from bridge", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(
        new Error("Process killed (out of memory)"),
      );

      await expect(detectFaces(FAKE_INPUT)).rejects.toThrow("out of memory");
    });
  });

  describe("onProgress forwarding", () => {
    it("passes onProgress to bridge", async () => {
      const onProgress = vi.fn();
      await detectFaces(FAKE_INPUT, {}, onProgress);

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "detect_faces.py",
        expect.any(Array),
        expect.objectContaining({ onProgress }),
      );
    });
  });
});
