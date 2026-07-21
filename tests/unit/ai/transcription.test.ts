import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../packages/ai/src/bridge.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../packages/ai/src/bridge.js")>()),
  runPythonWithProgress: vi.fn(),
  parseStdoutJson: vi.fn(),
}));

import { parseStdoutJson, runPythonWithProgress } from "../../../packages/ai/src/bridge.js";
import { transcribeAudio } from "../../../packages/ai/src/transcription.js";

const FAKE_AUDIO = "/tmp/test-audio/input.wav";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(runPythonWithProgress).mockResolvedValue({
    stdout:
      '{"success":true,"language":"en","segments":[{"start":0.0,"end":1.5,"text":"Hello"}],"text":"Hello"}',
    stderr: "",
  });
  vi.mocked(parseStdoutJson).mockReturnValue({
    success: true,
    language: "en",
    segments: [{ start: 0.0, end: 1.5, text: "Hello" }],
    text: "Hello",
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("transcribeAudio", () => {
  describe("request serialization", () => {
    it("calls transcribe.py with input path and options JSON", async () => {
      await transcribeAudio(FAKE_AUDIO, { language: "auto" });

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "transcribe.py",
        [FAKE_AUDIO, JSON.stringify({ language: "auto", task: "transcribe" })],
        expect.objectContaining({ timeout: 30 * 60_000 }),
      );
    });

    it("serializes a specific language", async () => {
      await transcribeAudio(FAKE_AUDIO, { language: "de" });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[1])).toEqual({ language: "de", task: "transcribe" });
    });

    it("always includes task: transcribe", async () => {
      await transcribeAudio(FAKE_AUDIO, { language: "ja" });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      const parsed = JSON.parse(args[1]);
      expect(parsed.task).toBe("transcribe");
    });

    it("uses 30 minute timeout", async () => {
      await transcribeAudio(FAKE_AUDIO, { language: "auto" });

      const options = vi.mocked(runPythonWithProgress).mock.calls[0][2];
      expect(options.timeout).toBe(30 * 60_000);
    });
  });

  describe("segment key mapping", () => {
    it("maps python start/end to startS/endS", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        language: "en",
        segments: [
          { start: 0.0, end: 1.5, text: "Hello" },
          { start: 2.0, end: 4.123, text: "World" },
        ],
        text: "Hello World",
      });

      const result = await transcribeAudio(FAKE_AUDIO, { language: "auto" });

      expect(result.segments).toEqual([
        { startS: 0.0, endS: 1.5, text: "Hello" },
        { startS: 2.0, endS: 4.123, text: "World" },
      ]);
    });

    it("trims segment text", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        language: "en",
        segments: [{ start: 0, end: 1, text: "  padded text  " }],
        text: "padded text",
      });

      const result = await transcribeAudio(FAKE_AUDIO, { language: "auto" });
      expect(result.segments[0].text).toBe("padded text");
    });

    it("defaults missing start/end to 0", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        language: "en",
        segments: [{ text: "no timestamps" }],
        text: "no timestamps",
      });

      const result = await transcribeAudio(FAKE_AUDIO, { language: "auto" });
      expect(result.segments[0]).toEqual({ startS: 0, endS: 0, text: "no timestamps" });
    });

    it("defaults missing text to empty string", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        language: "en",
        segments: [{ start: 0, end: 1 }],
        text: "",
      });

      const result = await transcribeAudio(FAKE_AUDIO, { language: "auto" });
      expect(result.segments[0].text).toBe("");
    });
  });

  describe("defensive parsing", () => {
    it("returns empty segments when segments field is missing", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        language: "en",
        text: "Hello",
      });

      const result = await transcribeAudio(FAKE_AUDIO, { language: "auto" });
      expect(result.segments).toEqual([]);
    });

    it("returns empty segments when segments is null", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        language: "en",
        segments: null,
        text: "Hello",
      });

      const result = await transcribeAudio(FAKE_AUDIO, { language: "auto" });
      expect(result.segments).toEqual([]);
    });

    it("returns empty segments when segments is not an array", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        language: "en",
        segments: "not-an-array",
        text: "Hello",
      });

      const result = await transcribeAudio(FAKE_AUDIO, { language: "auto" });
      expect(result.segments).toEqual([]);
    });

    it("defaults language to en when missing", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        segments: [],
        text: "",
      });

      const result = await transcribeAudio(FAKE_AUDIO, { language: "auto" });
      expect(result.language).toBe("en");
    });

    it("defaults text to empty string when missing", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        language: "en",
        segments: [],
      });

      const result = await transcribeAudio(FAKE_AUDIO, { language: "auto" });
      expect(result.text).toBe("");
    });
  });

  describe("response parsing", () => {
    it("returns language, text, and segments", async () => {
      const result = await transcribeAudio(FAKE_AUDIO, { language: "auto" });

      expect(result).toEqual({
        language: "en",
        text: "Hello",
        segments: [{ startS: 0.0, endS: 1.5, text: "Hello" }],
      });
    });

    it("returns detected language", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        language: "fr",
        segments: [],
        text: "Bonjour",
      });

      const result = await transcribeAudio(FAKE_AUDIO, { language: "auto" });
      expect(result.language).toBe("fr");
    });
  });

  describe("error handling", () => {
    it("throws when Python returns an error field", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        error: "Model not found",
      });

      await expect(transcribeAudio(FAKE_AUDIO, { language: "auto" })).rejects.toThrow(
        "Model not found",
      );
    });

    it("propagates bridge timeout", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(new Error("Python script timed out"));

      await expect(transcribeAudio(FAKE_AUDIO, { language: "auto" })).rejects.toThrow("timed out");
    });

    it("propagates OOM errors from bridge", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(
        new Error("Process killed (out of memory)"),
      );

      await expect(transcribeAudio(FAKE_AUDIO, { language: "auto" })).rejects.toThrow(
        "out of memory",
      );
    });

    it("propagates parseStdoutJson errors", async () => {
      vi.mocked(parseStdoutJson).mockImplementation(() => {
        throw new Error("No JSON response from Python script");
      });

      await expect(transcribeAudio(FAKE_AUDIO, { language: "auto" })).rejects.toThrow(
        "No JSON response from Python script",
      );
    });
  });

  describe("onProgress forwarding", () => {
    it("passes onProgress to bridge", async () => {
      const onProgress = vi.fn();
      await transcribeAudio(FAKE_AUDIO, { language: "auto" }, onProgress);

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "transcribe.py",
        expect.any(Array),
        expect.objectContaining({ onProgress }),
      );
    });

    it("omits onProgress when not provided", async () => {
      await transcribeAudio(FAKE_AUDIO, { language: "auto" });

      const options = vi.mocked(runPythonWithProgress).mock.calls[0][2];
      expect(options.onProgress).toBeUndefined();
    });
  });
});
