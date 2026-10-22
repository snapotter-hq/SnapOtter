import { spawnSync } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";
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
  unlink: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../packages/ai/src/bridge.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../packages/ai/src/bridge.js")>()),
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

    it("omits onProgress when not provided", async () => {
      await detectFaces(FAKE_INPUT);

      const options = vi.mocked(runPythonWithProgress).mock.calls[0][2];
      expect(options.onProgress).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("converts input to PNG before writing to tmpdir", async () => {
      await detectFaces(FAKE_INPUT);

      expect(sharp).toHaveBeenCalledWith(FAKE_INPUT);
    });

    it("propagates sharp conversion errors", async () => {
      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            toBuffer: vi.fn().mockRejectedValue(new Error("Corrupt image")),
          }) as unknown as ReturnType<typeof sharp>,
      );

      await expect(detectFaces(FAKE_INPUT)).rejects.toThrow("Corrupt image");
    });

    it("propagates writeFile errors", async () => {
      vi.mocked(writeFile).mockRejectedValueOnce(new Error("Permission denied"));

      await expect(detectFaces(FAKE_INPUT)).rejects.toThrow("Permission denied");
    });
  });

  describe.skipIf(!hasPython)(
    "detect_faces.py ImportError scoping and detail reporting (issue #3625)",
    () => {
      const here = dirname(fileURLToPath(import.meta.url));
      const pyDir = resolve(here, "../../../packages/ai/python");

      it("scopes Pillow ImportError to PIL import and includes detail and libGL hints on MediaPipe/NumPy/cv2 ImportErrors", () => {
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

spec = importlib.util.spec_from_file_location("detect_faces_mod", os.path.join(py_dir, "detect_faces.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

def run_main(settings=None):
    sys.argv = ["detect_faces.py", "/tmp/in.png", "/tmp/out.png", json.dumps(settings or {"detectOnly": True})]
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
    open=lambda _p: types.SimpleNamespace(convert=lambda _m: FakeArr(), width=64, height=64),
)
fake_pil.ImageFilter = types.SimpleNamespace(GaussianBlur=lambda _r: None)
sys.modules["PIL"] = fake_pil

# 2. Missing numpy reports numpy ImportError with detail, not Pillow or generic MediaPipe
sys.modules["numpy"] = None
try:
    payload = run_main()
    assert payload == {
        "success": False,
        "error": "Missing dependency: import of numpy halted; None in sys.modules. Install with: pip install mediapipe numpy opencv-python",
    }, payload
finally:
    sys.modules.pop("numpy", None)

# 2b. ImportError inside Image.open (e.g. missing codec plugin) is not misreported as missing Pillow
fake_pil.Image.open = lambda _p: (_ for _ in ()).throw(ImportError("No module named 'pillow_heif'"))
payload = run_main()
assert payload == {
    "success": False,
    "error": "No module named 'pillow_heif'",
}, payload
fake_pil.Image.open = lambda _p: types.SimpleNamespace(convert=lambda _m: FakeArr(), width=64, height=64)

fake_np = types.ModuleType("numpy")
fake_np.array = lambda _img: FakeArr()
sys.modules["numpy"] = fake_np

# 3. Unstubbed _detect_faces propagates real cv2 ImportError when cv2 is missing
sys.modules["cv2"] = None
try:
    payload = run_main()
    assert payload == {
        "success": False,
        "error": "Missing dependency: import of cv2 halted; None in sys.modules. Install with: pip install mediapipe numpy opencv-python",
    }, payload
finally:
    sys.modules.pop("cv2", None)

# 3b. MediaPipe / cv2 / libGL ImportErrors in _detect_faces include detail and appropriate hint
for detect_exc, expected_error in (
    (
        ModuleNotFoundError("No module named 'mediapipe'"),
        "Missing dependency: No module named 'mediapipe'. Install with: pip install mediapipe numpy opencv-python",
    ),
    (
        ModuleNotFoundError("No module named 'cv2'"),
        "Missing dependency: No module named 'cv2'. Install with: pip install mediapipe numpy opencv-python",
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
    def raise_detect(_arr, _c, _exc=detect_exc):
        raise _exc
    mod._detect_faces = raise_detect
    payload = run_main()
    assert payload == {"success": False, "error": expected_error}, (detect_exc, payload)

print("DETECT_FACES_3625_OK")
`,
          ],
          { encoding: "utf8", timeout: 30_000 },
        );
        expect(res.status, res.stderr).toBe(0);
        expect(res.stdout).toContain("DETECT_FACES_3625_OK");
      });
    },
  );
});
