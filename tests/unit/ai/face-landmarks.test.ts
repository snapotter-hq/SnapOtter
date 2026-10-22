import { spawnSync } from "node:child_process";
import { unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasPython, pythonBin } from "../../helpers/python-gate.js";

vi.mock("sharp", () => {
  const mockSharp = vi.fn(() => ({
    png: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
  }));
  return { default: mockSharp };
});

vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../packages/ai/src/bridge.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../packages/ai/src/bridge.js")>()),
  runPythonWithProgress: vi.fn(),
  parseStdoutJson: vi.fn(),
}));

import { parseStdoutJson, runPythonWithProgress } from "../../../packages/ai/src/bridge.js";
import { detectFaceLandmarks } from "../../../packages/ai/src/face-landmarks.js";

const FAKE_INPUT = Buffer.from("fake-image-data");

const FULL_LANDMARKS = {
  leftEye: { x: 100, y: 150 },
  rightEye: { x: 200, y: 150 },
  eyeCenter: { x: 150, y: 150 },
  chin: { x: 150, y: 300 },
  forehead: { x: 150, y: 80 },
  crown: { x: 150, y: 50 },
  nose: { x: 150, y: 200 },
  faceCenterX: 150,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(writeFile).mockResolvedValue(undefined);
  vi.mocked(unlink).mockResolvedValue(undefined);
  vi.mocked(runPythonWithProgress).mockResolvedValue({
    stdout: '{"success": true}',
    stderr: "",
  });
  vi.mocked(parseStdoutJson).mockReturnValue({
    success: true,
    faceDetected: true,
    landmarks: FULL_LANDMARKS,
    imageWidth: 800,
    imageHeight: 600,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("detectFaceLandmarks", () => {
  describe("request serialization", () => {
    it("calls face_landmarks.py with input path, 'unused', and '{}'", async () => {
      await detectFaceLandmarks(FAKE_INPUT);

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "face_landmarks.py",
        [expect.stringContaining("face_landmarks_"), "unused", "{}"],
        expect.any(Object),
      );
    });

    it("converts input buffer to PNG before writing", async () => {
      const sharp = (await import("sharp")).default;
      await detectFaceLandmarks(FAKE_INPUT);

      expect(sharp).toHaveBeenCalledWith(FAKE_INPUT);
      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining("face_landmarks_"),
        Buffer.from("mock-png-data"),
      );
    });

    it("writes to system tmpdir", async () => {
      await detectFaceLandmarks(FAKE_INPUT);

      const writePath = vi.mocked(writeFile).mock.calls[0][0] as string;
      expect(writePath).toContain("face_landmarks_");
    });
  });

  describe("response parsing", () => {
    it("returns all landmark points when face is detected", async () => {
      const result = await detectFaceLandmarks(FAKE_INPUT);

      expect(result.faceDetected).toBe(true);
      expect(result.landmarks).toEqual(FULL_LANDMARKS);
    });

    it("returns individual landmark points correctly", async () => {
      const result = await detectFaceLandmarks(FAKE_INPUT);

      expect(result.landmarks?.leftEye).toEqual({ x: 100, y: 150 });
      expect(result.landmarks?.rightEye).toEqual({ x: 200, y: 150 });
      expect(result.landmarks?.eyeCenter).toEqual({ x: 150, y: 150 });
      expect(result.landmarks?.chin).toEqual({ x: 150, y: 300 });
      expect(result.landmarks?.forehead).toEqual({ x: 150, y: 80 });
      expect(result.landmarks?.crown).toEqual({ x: 150, y: 50 });
      expect(result.landmarks?.nose).toEqual({ x: 150, y: 200 });
      expect(result.landmarks?.faceCenterX).toBe(150);
    });

    it("returns imageWidth and imageHeight from response", async () => {
      const result = await detectFaceLandmarks(FAKE_INPUT);

      expect(result.imageWidth).toBe(800);
      expect(result.imageHeight).toBe(600);
    });

    it("returns null landmarks when no face detected", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        faceDetected: false,
        imageWidth: 1024,
        imageHeight: 768,
      });

      const result = await detectFaceLandmarks(FAKE_INPUT);

      expect(result.faceDetected).toBe(false);
      expect(result.landmarks).toBeNull();
    });

    it("defaults landmarks to null when field is absent", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        faceDetected: true,
        imageWidth: 800,
        imageHeight: 600,
      });

      const result = await detectFaceLandmarks(FAKE_INPUT);
      expect(result.landmarks).toBeNull();
    });

    it("defaults imageWidth to 0 when absent", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        faceDetected: false,
      });

      const result = await detectFaceLandmarks(FAKE_INPUT);
      expect(result.imageWidth).toBe(0);
    });

    it("defaults imageHeight to 0 when absent", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        faceDetected: false,
      });

      const result = await detectFaceLandmarks(FAKE_INPUT);
      expect(result.imageHeight).toBe(0);
    });

    it("returns both dimensions as 0 when both absent", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        faceDetected: true,
        landmarks: FULL_LANDMARKS,
      });

      const result = await detectFaceLandmarks(FAKE_INPUT);
      expect(result.imageWidth).toBe(0);
      expect(result.imageHeight).toBe(0);
    });
  });

  describe("error handling", () => {
    it("throws with custom error from Python", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: false,
        error: "MediaPipe model not found",
      });

      await expect(detectFaceLandmarks(FAKE_INPUT)).rejects.toThrow("MediaPipe model not found");
    });

    it("throws fallback error when success: false without error string", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

      await expect(detectFaceLandmarks(FAKE_INPUT)).rejects.toThrow(
        "Face landmark detection failed",
      );
    });

    it("propagates bridge timeout", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(new Error("Python script timed out"));

      await expect(detectFaceLandmarks(FAKE_INPUT)).rejects.toThrow("timed out");
    });

    it("propagates OOM errors", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(
        new Error("Process killed (out of memory)"),
      );

      await expect(detectFaceLandmarks(FAKE_INPUT)).rejects.toThrow("out of memory");
    });

    it("propagates parseStdoutJson errors", async () => {
      vi.mocked(parseStdoutJson).mockImplementation(() => {
        throw new Error("No JSON response from Python script");
      });

      await expect(detectFaceLandmarks(FAKE_INPUT)).rejects.toThrow(
        "No JSON response from Python script",
      );
    });
  });

  describe("temp file cleanup", () => {
    it("cleans up temp input file after success", async () => {
      await detectFaceLandmarks(FAKE_INPUT);

      expect(unlink).toHaveBeenCalledWith(expect.stringContaining("face_landmarks_"));
    });

    it("cleans up temp input file when Python returns failure", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

      await expect(detectFaceLandmarks(FAKE_INPUT)).rejects.toThrow();
      expect(unlink).toHaveBeenCalled();
    });

    it("cleans up temp input file when bridge rejects", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(new Error("crash"));

      await expect(detectFaceLandmarks(FAKE_INPUT)).rejects.toThrow();
      expect(unlink).toHaveBeenCalled();
    });

    it("does not throw if unlink fails", async () => {
      vi.mocked(unlink).mockRejectedValue(new Error("ENOENT"));

      await expect(detectFaceLandmarks(FAKE_INPUT)).resolves.toBeDefined();
    });
  });

  describe("onProgress forwarding", () => {
    it("passes onProgress to bridge", async () => {
      const onProgress = vi.fn();
      await detectFaceLandmarks(FAKE_INPUT, onProgress);

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "face_landmarks.py",
        expect.any(Array),
        expect.objectContaining({ onProgress }),
      );
    });

    it("omits onProgress when not provided", async () => {
      await detectFaceLandmarks(FAKE_INPUT);

      const options = vi.mocked(runPythonWithProgress).mock.calls[0][2];
      expect(options.onProgress).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("propagates writeFile error", async () => {
      vi.mocked(writeFile).mockRejectedValueOnce(new Error("Permission denied"));

      await expect(detectFaceLandmarks(FAKE_INPUT)).rejects.toThrow("Permission denied");
    });

    it("propagates segfault from bridge", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(
        new Error("Process crashed (segmentation fault)"),
      );

      await expect(detectFaceLandmarks(FAKE_INPUT)).rejects.toThrow("segmentation fault");
    });

    it("uses timestamps in temp file names", async () => {
      await detectFaceLandmarks(FAKE_INPUT);

      const writePath = vi.mocked(writeFile).mock.calls[0][0] as string;
      // File path includes a numeric timestamp
      expect(writePath).toMatch(/face_landmarks_\d+\.png$/);
    });

    it("handles faceDetected true with missing landmarks", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        faceDetected: true,
        imageWidth: 1920,
        imageHeight: 1080,
      });

      const result = await detectFaceLandmarks(FAKE_INPUT);
      expect(result.faceDetected).toBe(true);
      expect(result.landmarks).toBeNull();
    });
  });

  describe.skipIf(!hasPython)(
    "face_landmarks.py ImportError scoping and detail reporting (issue #3625)",
    () => {
      const here = dirname(fileURLToPath(import.meta.url));
      const pyDir = resolve(here, "../../../packages/ai/python");

      it("scopes Pillow ImportError to PIL import and includes detail and libGL hints on MediaPipe/NumPy ImportErrors", () => {
        const res = spawnSync(
          pythonBin as string,
          [
            "-c",
            `
import contextlib, importlib.util, io, json, os, sys, types

py_dir = ${JSON.stringify(pyDir)}
sys.path.insert(0, py_dir)

class FakeArr:
    shape = (64, 64, 3)

spec = importlib.util.spec_from_file_location("face_landmarks_mod", os.path.join(py_dir, "face_landmarks.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

def run_main():
    sys.argv = ["face_landmarks.py", "/tmp/in.png", "unused", "{}"]
    out_buf, err_buf = io.StringIO(), io.StringIO()
    try:
        with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
            mod.main()
    except SystemExit as exc:
        assert exc.code == 1, exc.code
    else:
        raise AssertionError(f"Expected SystemExit(1), got stdout={out_buf.getvalue()!r}")
    return json.loads(out_buf.getvalue().strip())

# 1. Missing PIL still reports Pillow installation message
sys.modules["PIL"] = None
try:
    payload = run_main()
    assert payload == {
        "success": False,
        "error": "Pillow is not installed. Install with: pip install Pillow",
    }, payload
finally:
    sys.modules.pop("PIL", None)

fake_pil = types.ModuleType("PIL")
fake_pil.Image = types.SimpleNamespace(
    open=lambda _p: types.SimpleNamespace(convert=lambda _m: types.SimpleNamespace(size=(64, 64))),
)
sys.modules["PIL"] = fake_pil

# 2. Missing mediapipe reports mediapipe ImportError with detail
sys.modules["mediapipe"] = None
try:
    payload = run_main()
    assert payload == {
        "success": False,
        "error": "Missing dependency: import of mediapipe halted; None in sys.modules. Install with: pip install mediapipe numpy",
    }, payload
finally:
    sys.modules.pop("mediapipe", None)

# 2b. ImportError inside Image.open (e.g. missing codec plugin) is not misreported as missing Pillow
fake_pil.Image.open = lambda _p: (_ for _ in ()).throw(ImportError("No module named 'pillow_heif'"))
payload = run_main()
assert payload == {
    "success": False,
    "error": "No module named 'pillow_heif'",
}, payload
fake_pil.Image.open = lambda _p: types.SimpleNamespace(convert=lambda _m: types.SimpleNamespace(size=(64, 64)))

fake_mp = types.ModuleType("mediapipe")
sys.modules["mediapipe"] = fake_mp

# 2c. Missing numpy when mediapipe is present reports numpy ImportError with detail
sys.modules["numpy"] = None
try:
    payload = run_main()
    assert payload == {
        "success": False,
        "error": "Missing dependency: import of numpy halted; None in sys.modules. Install with: pip install mediapipe numpy",
    }, payload
finally:
    sys.modules.pop("numpy", None)

fake_np = types.ModuleType("numpy")
fake_np.array = lambda _img: FakeArr()
sys.modules["numpy"] = fake_np

# 3. MediaPipe / libGL / empty ImportErrors in detect_with_solutions include detail and appropriate hint
for detect_exc, expected_error in (
    (
        ModuleNotFoundError("No module named 'mediapipe'"),
        "Missing dependency: No module named 'mediapipe'. Install with: pip install mediapipe numpy",
    ),
    (
        ImportError("libGL.so.1: cannot open shared object file: No such file or directory"),
        "Missing dependency: libGL.so.1: cannot open shared object file: No such file or directory. Fix with: apt-get install -y libgl1",
    ),
    (
        ImportError(),
        "Missing dependency: ImportError. Install with: pip install mediapipe numpy",
    ),
    (
        ImportError("   "),
        "Missing dependency: ImportError. Install with: pip install mediapipe numpy",
    ),
):
    def raise_detect(_arr, _max=1, _exc=detect_exc):
        raise _exc
    mod.detect_with_solutions = raise_detect
    payload = run_main()
    assert payload == {"success": False, "error": expected_error}, (detect_exc, payload)

print("FACE_LANDMARKS_3625_OK")
`,
          ],
          { encoding: "utf8", timeout: 30_000 },
        );
        expect(res.status, res.stderr).toBe(0);
        expect(res.stdout).toContain("FACE_LANDMARKS_3625_OK");
      });
    },
  );
});
