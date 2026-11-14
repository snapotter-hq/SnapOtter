import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasPython, pythonBin } from "../../helpers/python-gate.js";

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

      const options = vi.mocked(runPythonWithProgress).mock.calls[0][2]!;
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

    it("throws fallback message when Python returns an empty error string (e.g. bare MemoryError())", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        error: "",
      });

      await expect(transcribeAudio(FAKE_AUDIO, { language: "auto" })).rejects.toThrow(
        "Transcription failed",
      );
    });

    it("throws when Python returns success: false without a non-empty error string", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: false,
      });

      await expect(transcribeAudio(FAKE_AUDIO, { language: "auto" })).rejects.toThrow(
        "Transcription failed",
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

      const options = vi.mocked(runPythonWithProgress).mock.calls[0][2]!;
      expect(options.onProgress).toBeUndefined();
    });

    it("forwards the caller AbortSignal to the Python bridge", async () => {
      const controller = new AbortController();

      await transcribeAudio(FAKE_AUDIO, { language: "auto", signal: controller.signal });

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "transcribe.py",
        expect.any(Array),
        expect.objectContaining({ signal: controller.signal }),
      );
    });
  });
});

describe.skipIf(!hasPython)("transcribe.py compute type selection (NODE-49)", () => {
  const pyDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../packages/ai/python");

  it("uses a compute type the device supports and falls back to the CPU when the GPU has none", () => {
    const script = `
import importlib.util, os, sys, types

py_dir = ${JSON.stringify(pyDir)}
sys.path.insert(0, py_dir)
gpu_mod = types.ModuleType("gpu")
gpu_mod.ctranslate2_gpu_available = lambda: False
sys.modules["gpu"] = gpu_mod
spec = importlib.util.spec_from_file_location("transcribe_mod", os.path.join(py_dir, "transcribe.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

def fake_ct2(cuda, cpu):
    def supported(device):
        types_for = cuda if device == "cuda" else cpu
        if isinstance(types_for, Exception):
            raise types_for
        return set(types_for)
    return types.SimpleNamespace(get_supported_compute_types=supported)

cpu = {"int8", "int8_float32", "float32"}
# A modern GPU keeps float16.
assert mod.select_device_and_compute_type(fake_ct2({"float16", "int8_float16", "float32"}, cpu), True) == ("cuda", "float16")
# A Pascal-era GPU without efficient float16 uses int8 on the GPU instead of failing.
assert mod.select_device_and_compute_type(fake_ct2({"int8_float32", "int8", "float32"}, cpu), True) == ("cuda", "int8_float32")
# A GPU reporting nothing usable, or a failing probe, falls back to the CPU.
assert mod.select_device_and_compute_type(fake_ct2(set(), cpu), True) == ("cpu", "int8")
assert mod.select_device_and_compute_type(fake_ct2(RuntimeError("no CUDA"), cpu), True) == ("cpu", "int8")
# No GPU: int8 on the CPU, or CTranslate2's own default when the CPU probe fails.
assert mod.select_device_and_compute_type(fake_ct2({"float16"}, cpu), False) == ("cpu", "int8")
assert mod.select_device_and_compute_type(fake_ct2(set(), {"float32"}), False) == ("cpu", "float32")
assert mod.select_device_and_compute_type(fake_ct2(set(), RuntimeError("probe failed")), False) == ("cpu", "default")
print("COMPUTE_TYPE_OK")
`;
    const res = spawnSync(pythonBin as string, ["-c", script], {
      encoding: "utf8",
      timeout: 15_000,
    });
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain("COMPUTE_TYPE_OK");
  });
});
