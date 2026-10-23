import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
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
import { removeRedEye } from "../../../packages/ai/src/red-eye-removal.js";

const FAKE_INPUT = Buffer.from("fake-redeye-image");
const FAKE_OUTPUT_DIR = "/tmp/test-redeye";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readFile).mockResolvedValue(Buffer.from("mock-output-data"));
  vi.mocked(writeFile).mockResolvedValue(undefined);
  vi.mocked(runPythonWithProgress).mockResolvedValue({
    stdout: '{"success": true}',
    stderr: "",
  });
  vi.mocked(parseStdoutJson).mockReturnValue({
    success: true,
    facesDetected: 1,
    eyesCorrected: 2,
    width: 800,
    height: 600,
    format: "png",
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

describe("removeRedEye", () => {
  describe("request serialization", () => {
    it("calls red_eye_removal.py with correct file paths", async () => {
      await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "red_eye_removal.py",
        [`${FAKE_OUTPUT_DIR}/input_redeye.png`, `${FAKE_OUTPUT_DIR}/output_redeye.png`, "{}"],
        expect.any(Object),
      );
    });

    it("serializes sensitivity option", async () => {
      await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR, { sensitivity: 0.8 });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ sensitivity: 0.8 });
    });

    it("serializes strength option", async () => {
      await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR, { strength: 0.6 });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ strength: 0.6 });
    });

    it("serializes format and quality options", async () => {
      await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR, { format: "webp", quality: 90 });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ format: "webp", quality: 90 });
    });

    it("serializes all options together", async () => {
      const allOptions = {
        sensitivity: 0.9,
        strength: 0.7,
        format: "jpeg",
        quality: 85,
      };
      await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR, allOptions);

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual(allOptions);
    });

    it("converts input to PNG before writing", async () => {
      await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(sharp).toHaveBeenCalledWith(FAKE_INPUT);
    });
  });

  describe("response parsing", () => {
    it("returns RedEyeRemovalResult with all fields", async () => {
      const result = await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(result).toEqual({
        buffer: expect.any(Buffer),
        facesDetected: 1,
        eyesCorrected: 2,
        width: 800,
        height: 600,
        format: "png",
      });
    });

    it("reads from default output path", async () => {
      await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(readFile).toHaveBeenCalledWith(`${FAKE_OUTPUT_DIR}/output_redeye.png`);
    });

    it("reads from alternate output_path when provided", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 800,
        height: 600,
        output_path: "/tmp/alt-redeye.webp",
      });

      await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(readFile).toHaveBeenCalledWith("/tmp/alt-redeye.webp");
    });

    it("defaults facesDetected to 0 when absent", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 800,
        height: 600,
      });

      const result = await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.facesDetected).toBe(0);
    });

    it("defaults eyesCorrected to 0 when absent", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 800,
        height: 600,
      });

      const result = await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.eyesCorrected).toBe(0);
    });

    it("defaults format to 'png' when absent", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 800,
        height: 600,
      });

      const result = await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.format).toBe("png");
    });

    it("reports zero corrections when no red eyes found", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        facesDetected: 1,
        eyesCorrected: 0,
        width: 800,
        height: 600,
        format: "png",
      });

      const result = await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.facesDetected).toBe(1);
      expect(result.eyesCorrected).toBe(0);
    });

    it("handles multiple faces with multiple corrections", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        facesDetected: 3,
        eyesCorrected: 5,
        width: 1920,
        height: 1080,
        format: "png",
      });

      const result = await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.facesDetected).toBe(3);
      expect(result.eyesCorrected).toBe(5);
    });
  });

  describe("error handling", () => {
    it("throws with custom error from Python", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: false,
        error: "Face detection model not available",
      });

      await expect(removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
        "Face detection model not available",
      );
    });

    it("throws fallback error when success: false without error string", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

      await expect(removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
        "Red eye removal failed",
      );
    });

    it("propagates bridge timeout", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(new Error("Python script timed out"));

      await expect(removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("timed out");
    });

    it("propagates bridge segfault", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(
        new Error("Process crashed (segmentation fault)"),
      );

      await expect(removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("segmentation fault");
    });

    it("propagates OOM errors from bridge", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(
        new Error("Process killed (out of memory)"),
      );

      await expect(removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("out of memory");
    });
  });

  describe("onProgress forwarding", () => {
    it("passes onProgress to bridge", async () => {
      const onProgress = vi.fn();
      await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR, {}, onProgress);

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "red_eye_removal.py",
        expect.any(Array),
        expect.objectContaining({ onProgress }),
      );
    });

    it("omits onProgress when not provided", async () => {
      await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR);

      const options = vi.mocked(runPythonWithProgress).mock.calls[0][2];
      expect(options.onProgress).toBeUndefined();
    });
  });

  describe("sharp conversion errors", () => {
    it("propagates sharp toBuffer error", async () => {
      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            toBuffer: vi.fn().mockRejectedValue(new Error("Invalid BMP data")),
          }) as unknown as ReturnType<typeof sharp>,
      );

      await expect(removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("Invalid BMP data");
    });
  });

  describe("edge cases", () => {
    it("propagates writeFile error", async () => {
      vi.mocked(writeFile).mockRejectedValueOnce(new Error("ENOSPC: disk full"));

      await expect(removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("disk full");
    });

    it("propagates readFile error after successful Python run", async () => {
      vi.mocked(readFile).mockRejectedValueOnce(new Error("ENOENT: output missing"));

      await expect(removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("output missing");
    });

    it("passes empty options as empty JSON object", async () => {
      await removeRedEye(FAKE_INPUT, FAKE_OUTPUT_DIR);

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({});
    });
  });

  describe.skipIf(!hasPython)(
    "red_eye_removal.py ImportError scoping and detail reporting (issue #3640)",
    () => {
      const here = dirname(fileURLToPath(import.meta.url));
      const pyDir = resolve(here, "../../../packages/ai/python");

      it("scopes Pillow ImportError to PIL import and preserves downstream ImportErrors", () => {
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

spec = importlib.util.spec_from_file_location("red_eye_removal_mod", os.path.join(py_dir, "red_eye_removal.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

def run_main(settings=None):
    sys.argv = ["red_eye_removal.py", "/tmp/in.png", "/tmp/out.png", json.dumps(settings or {})]
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
    open=lambda _p: types.SimpleNamespace(convert=lambda _m: types.SimpleNamespace(size=(64, 64), save=lambda *_a, **_k: None)),
    fromarray=lambda _a: types.SimpleNamespace(size=(64, 64), save=lambda *_a, **_k: None),
)
sys.modules["PIL"] = fake_pil

# 2. ImportError inside Image.open (e.g. missing codec plugin) is not misreported as missing Pillow
fake_pil.Image.open = lambda _p: (_ for _ in ()).throw(ImportError("No module named 'pillow_heif'"))
payload = run_main()
assert payload == {
    "success": False,
    "error": "No module named 'pillow_heif'",
}, payload

fake_pil.Image.open = lambda _p: (_ for _ in ()).throw(ImportError("   "))
payload = run_main()
assert payload == {
    "success": False,
    "error": "ImportError",
}, payload

fake_pil.Image.open = lambda _p: types.SimpleNamespace(convert=lambda _m: types.SimpleNamespace(size=(64, 64), save=lambda *_a, **_k: None))

# 3. Missing numpy reports numpy ImportError with detail, not Pillow
sys.modules["numpy"] = None
try:
    payload = run_main()
    assert payload == {
        "success": False,
        "error": "Missing dependency: import of numpy halted; None in sys.modules. Install with: pip install mediapipe numpy opencv-python",
    }, payload
finally:
    sys.modules.pop("numpy", None)

fake_np = types.ModuleType("numpy")
fake_np.array = lambda _img: FakeArr()
sys.modules["numpy"] = fake_np

# 4. Missing cv2 reports cv2 ImportError with detail
sys.modules["cv2"] = None
try:
    payload = run_main()
    assert payload == {
        "success": False,
        "error": "Missing dependency: import of cv2 halted; None in sys.modules. Install with: pip install mediapipe numpy opencv-python",
    }, payload
finally:
    sys.modules.pop("cv2", None)

fake_cv2 = types.ModuleType("cv2")
sys.modules["cv2"] = fake_cv2

# 5. Unstubbed _detect_face_mesh propagates real mediapipe ImportError when mediapipe is missing
sys.modules["mediapipe"] = None
try:
    payload = run_main()
    assert payload == {
        "success": False,
        "error": "Missing dependency: import of mediapipe halted; None in sys.modules. Install with: pip install mediapipe numpy opencv-python",
    }, payload
finally:
    sys.modules.pop("mediapipe", None)

# 6. MediaPipe / libGL / empty ImportErrors in _detect_face_mesh include detail and appropriate hint
for detect_exc, expected_error in (
    (
        ModuleNotFoundError("No module named 'mediapipe'"),
        "Missing dependency: No module named 'mediapipe'. Install with: pip install mediapipe numpy opencv-python",
    ),
    (
        ImportError("libGL.so.1: cannot open shared object file: No such file or directory"),
        "Missing dependency: libGL.so.1: cannot open shared object file: No such file or directory. Fix with: apt-get install -y libgl1",
    ),
    (
        ImportError(),
        "Missing dependency: ImportError. Install with: pip install mediapipe numpy opencv-python",
    ),
    (
        ImportError("   "),
        "Missing dependency: ImportError. Install with: pip install mediapipe numpy opencv-python",
    ),
):
    def raise_mesh(_arr, _max=50, _min=0.5, _exc=detect_exc):
        raise _exc
    mod._detect_face_mesh = raise_mesh
    payload = run_main()
    assert payload == {"success": False, "error": expected_error}, (detect_exc, payload)

# 7. ImportError inside img.save (e.g. missing output codec plugin) is not misreported as missing Pillow or mediapipe
mod._detect_face_mesh = lambda _arr, _max=50, _min=0.5: []
fake_pil.Image.open = lambda _p: types.SimpleNamespace(
    convert=lambda _m: types.SimpleNamespace(
        size=(64, 64),
        save=lambda *_a, **_k: (_ for _ in ()).throw(ImportError("No module named 'pillow_avif'")),
    ),
)
payload = run_main()
assert payload == {
    "success": False,
    "error": "No module named 'pillow_avif'",
}, payload

print("RED_EYE_3640_OK")
`,
          ],
          { encoding: "utf8", timeout: 30_000 },
        );
        expect(res.status, res.stderr).toBe(0);
        expect(res.stdout).toContain("RED_EYE_3640_OK");
      });
    },
  );
});
