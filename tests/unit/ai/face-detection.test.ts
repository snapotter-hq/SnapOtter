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

    it("hands the abort signal to the sidecar call", async () => {
      const { signal } = new AbortController();
      await blurFaces(FAKE_INPUT, FAKE_OUTPUT_DIR, { signal });

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "detect_faces.py",
        expect.any(Array),
        expect.objectContaining({ signal }),
      );
      // The signal is not a sidecar option and must not reach the script JSON.
      expect(JSON.parse(vi.mocked(runPythonWithProgress).mock.calls[0][1][2])).toEqual({});
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

    it("hands the abort signal to the sidecar call", async () => {
      const { signal } = new AbortController();
      await detectFaces(FAKE_INPUT, { signal });

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "detect_faces.py",
        expect.any(Array),
        expect.objectContaining({ signal }),
      );
      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ detectOnly: true });
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

      it("scopes except AttributeError in _detect_single_orientation to mp.solutions.face_detection lookup (issue #3626)", () => {
        const res = spawnSync(
          pythonBin as string,
          [
            "-c",
            `
import contextlib, importlib.util, io, json, os, sys, types

py_dir = ${JSON.stringify(pyDir)}
sys.path.insert(0, py_dir)
os.environ["SNAPOTTER_ALLOW_MODEL_DOWNLOAD"] = "0"
os.environ["MODELS_PATH"] = "/tmp/nonexistent-models-3626"

class FakeArr:
    shape = (100, 200, 3)

spec = importlib.util.spec_from_file_location("detect_faces_mod_3626", os.path.join(py_dir, "detect_faces.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
mod._DOCKER_MODEL_PATH = "/tmp/nonexistent-docker-3626.tflite"
mod._LOCAL_MODEL_PATH = "/tmp/nonexistent-local-3626.tflite"

ensure_model_calls = []
orig_ensure_model = mod._ensure_face_detect_model
def tracked_ensure_model():
    ensure_model_calls.append(True)
    return orig_ensure_model()
mod._ensure_face_detect_model = tracked_ensure_model

# 1. AttributeError inside FaceDetection() init or detector.process() when mp.solutions.face_detection exists must propagate directly
class InitAttrErrorDetector:
    def __init__(self, **_kwargs):
        raise AttributeError("unexpected NoneType attribute in init")

class ProcessAttrErrorDetector:
    def __init__(self, **_kwargs):
        pass
    def process(self, _img):
        raise AttributeError("unexpected NoneType attribute in process")
    def close(self):
        pass

fake_mp = types.ModuleType("mediapipe")
fake_mp.solutions = types.SimpleNamespace(
    face_detection=types.SimpleNamespace(FaceDetection=InitAttrErrorDetector)
)
sys.modules["mediapipe"] = fake_mp

for det_cls, expected_msg in (
    (InitAttrErrorDetector, "unexpected NoneType attribute in init"),
    (ProcessAttrErrorDetector, "unexpected NoneType attribute in process"),
):
    fake_mp.solutions.face_detection.FaceDetection = det_cls
    try:
        mod._detect_single_orientation(FakeArr(), 0.5)
    except AttributeError as exc:
        assert str(exc) == expected_msg, exc
        assert ensure_model_calls == [], f"_ensure_face_detect_model must not be called: {ensure_model_calls}"
    else:
        raise AssertionError(f"Expected AttributeError from {det_cls.__name__} to propagate")

# 1b. Through main(), AttributeError in detector.process() reports the AttributeError, not the offline model download error
fake_pil = types.ModuleType("PIL")
fake_pil.Image = types.SimpleNamespace(
    open=lambda _p: types.SimpleNamespace(convert=lambda _m: FakeArr(), width=200, height=100),
)
fake_pil.ImageFilter = types.SimpleNamespace(GaussianBlur=lambda _r: None)
sys.modules["PIL"] = fake_pil
fake_np = types.ModuleType("numpy")
fake_np.array = lambda _img: FakeArr()
sys.modules["numpy"] = fake_np
fake_cv2 = types.ModuleType("cv2")
fake_cv2.ROTATE_90_CLOCKWISE = 0
fake_cv2.ROTATE_180 = 1
fake_cv2.ROTATE_90_COUNTERCLOCKWISE = 2
fake_cv2.rotate = lambda arr, _flag: arr
sys.modules["cv2"] = fake_cv2

sys.argv = ["detect_faces.py", "/tmp/in.png", "unused", json.dumps({"detectOnly": True})]
out_buf, err_buf = io.StringIO(), io.StringIO()
try:
    with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
        mod.main()
except SystemExit as exc:
    assert exc.code == 1, exc.code
    payload = json.loads(out_buf.getvalue().strip())
    assert payload == {"success": False, "error": "unexpected NoneType attribute in process"}, payload
    assert ensure_model_calls == [], ensure_model_calls
else:
    raise AssertionError("Expected SystemExit(1) from main()")

# 2. AttributeError during bbox parsing in _detect_with_solutions must propagate directly
class BadResultDetector:
    def __init__(self, **_kwargs):
        pass
    def process(self, _img):
        return types.SimpleNamespace(detections=[types.SimpleNamespace(location_data=None)])
    def close(self):
        pass

fake_mp.solutions.face_detection.FaceDetection = BadResultDetector
try:
    mod._detect_single_orientation(FakeArr(), 0.5)
except AttributeError as exc:
    assert "relative_bounding_box" in str(exc), exc
    assert ensure_model_calls == [], ensure_model_calls
else:
    raise AssertionError("Expected AttributeError from bbox parsing to propagate")

# 3. Positive mp.solutions path returns deduplicated faces without touching mp.tasks
class OkSolutionsDetector:
    def __init__(self, model_selection=0, min_detection_confidence=0.5):
        self.ms = model_selection
    def process(self, _img):
        if self.ms == 0:
            bbox = types.SimpleNamespace(xmin=0.1, ymin=0.2, width=0.3, height=0.4)
            det = types.SimpleNamespace(location_data=types.SimpleNamespace(relative_bounding_box=bbox))
            return types.SimpleNamespace(detections=[det])
        return types.SimpleNamespace(detections=None)
    def close(self):
        pass

fake_mp.solutions.face_detection.FaceDetection = OkSolutionsDetector
faces_sol = mod._detect_single_orientation(FakeArr(), 0.5)
assert faces_sol == [{"x": 20, "y": 20, "w": 60, "h": 40}], faces_sol
assert ensure_model_calls == [], ensure_model_calls

# 4. When mp.solutions is missing (or face_detection is missing/None), falls back to _detect_with_tasks
mod._ensure_face_detect_model = lambda: "/tmp/fake-blaze-3626.tflite"
tasks_calls = []
class FakeTasksDetector:
    def detect(self, _mp_image):
        tasks_calls.append(True)
        bbox = types.SimpleNamespace(origin_x=12, origin_y=34, width=56, height=78)
        return types.SimpleNamespace(detections=[types.SimpleNamespace(bounding_box=bbox)])
    def close(self):
        pass

for missing_solutions in ("no_attr", None, types.SimpleNamespace(), types.SimpleNamespace(face_detection=None)):
    tasks_calls.clear()
    mp_tasks_mod = types.ModuleType("mediapipe")
    if missing_solutions != "no_attr":
        mp_tasks_mod.solutions = missing_solutions
    mp_tasks_mod.ImageFormat = types.SimpleNamespace(SRGB=1)
    mp_tasks_mod.Image = lambda image_format, data: data
    mp_tasks_mod.tasks = types.SimpleNamespace(
        BaseOptions=lambda model_asset_path: model_asset_path,
        vision=types.SimpleNamespace(
            RunningMode=types.SimpleNamespace(IMAGE=1),
            FaceDetectorOptions=lambda **kw: kw,
            FaceDetector=types.SimpleNamespace(create_from_options=lambda _opts: FakeTasksDetector()),
        ),
    )
    sys.modules["mediapipe"] = mp_tasks_mod
    faces_tasks = mod._detect_single_orientation(FakeArr(), 0.5)
    assert faces_tasks == [{"x": 12, "y": 34, "w": 56, "h": 78}], (missing_solutions, faces_tasks)
    assert len(tasks_calls) == 1, (missing_solutions, tasks_calls)

print("DETECT_FACES_3626_OK")
`,
          ],
          { encoding: "utf8", timeout: 30_000 },
        );
        expect(res.status, res.stderr).toBe(0);
        expect(res.stdout).toContain("DETECT_FACES_3626_OK");
      });

      it("closes MediaPipe detectors in _detect_with_solutions and _detect_with_tasks when .process(), mp.Image(), or .detect() raises (issue #3654)", () => {
        const res = spawnSync(
          pythonBin as string,
          [
            "-c",
            `
import importlib.util, os, sys, types

py_dir = ${JSON.stringify(pyDir)}
sys.path.insert(0, py_dir)

class FakeArr:
    shape = (100, 200, 3)

spec = importlib.util.spec_from_file_location("detect_faces_mod_3654", os.path.join(py_dir, "detect_faces.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

# 1. _detect_with_solutions: detector.close() is called when detector.process() raises on model_selection=0 or model_selection=1
closed_models = []
fail_on_model = [0]

class RaisingSolutionsDetector:
    def __init__(self, model_selection=0, min_detection_confidence=0.5):
        self.ms = model_selection
    def process(self, _img):
        if self.ms == fail_on_model[0]:
            raise RuntimeError(f"solutions process failed on model {self.ms}")
        return types.SimpleNamespace(detections=None)
    def close(self):
        closed_models.append(self.ms)

fake_mp_sol = types.ModuleType("mediapipe")
fake_mp_sol.solutions = types.SimpleNamespace(
    face_detection=types.SimpleNamespace(FaceDetection=RaisingSolutionsDetector)
)
sys.modules["mediapipe"] = fake_mp_sol

for target_ms, expected_closed in ((0, [0]), (1, [0, 1])):
    closed_models.clear()
    fail_on_model[0] = target_ms
    try:
        mod._detect_with_solutions(FakeArr(), 0.5)
    except RuntimeError as exc:
        assert str(exc) == f"solutions process failed on model {target_ms}", exc
        assert closed_models == expected_closed, (target_ms, closed_models)
    else:
        raise AssertionError(f"Expected RuntimeError on model {target_ms}")

closed_models.clear()
fail_on_model[0] = -1
assert mod._detect_with_solutions(FakeArr(), 0.5) == []
assert closed_models == [0, 1], closed_models

# 2. _detect_with_tasks: detector.close() is called when mp.Image() raises or when detector.detect() raises
mod._ensure_face_detect_model = lambda: "/tmp/fake-blaze-3654.tflite"
tasks_closed = []
raise_in_image = [False]
raise_in_detect = [False]

class RaisingTasksDetector:
    def detect(self, _mp_image):
        if raise_in_detect[0]:
            raise RuntimeError("tasks detect failed")
        return types.SimpleNamespace(detections=[])
    def close(self):
        tasks_closed.append(True)

def fake_mp_image(image_format, data):
    if raise_in_image[0]:
        raise ValueError("mp.Image wrap failed")
    return data

fake_mp_tasks = types.ModuleType("mediapipe")
fake_mp_tasks.ImageFormat = types.SimpleNamespace(SRGB=1)
fake_mp_tasks.Image = fake_mp_image
fake_mp_tasks.tasks = types.SimpleNamespace(
    BaseOptions=lambda model_asset_path: model_asset_path,
    vision=types.SimpleNamespace(
        RunningMode=types.SimpleNamespace(IMAGE=1),
        FaceDetectorOptions=lambda **kw: kw,
        FaceDetector=types.SimpleNamespace(create_from_options=lambda _opts: RaisingTasksDetector()),
    ),
)
sys.modules["mediapipe"] = fake_mp_tasks

tasks_closed.clear()
raise_in_image[0] = True
raise_in_detect[0] = False
try:
    mod._detect_with_tasks(FakeArr(), 0.5)
except ValueError as exc:
    assert str(exc) == "mp.Image wrap failed", exc
    assert tasks_closed == [True], tasks_closed
else:
    raise AssertionError("Expected ValueError from mp.Image()")

tasks_closed.clear()
raise_in_image[0] = False
raise_in_detect[0] = True
try:
    mod._detect_with_tasks(FakeArr(), 0.5)
except RuntimeError as exc:
    assert str(exc) == "tasks detect failed", exc
    assert tasks_closed == [True], tasks_closed
else:
    raise AssertionError("Expected RuntimeError from detector.detect()")

tasks_closed.clear()
raise_in_image[0] = False
raise_in_detect[0] = False
assert mod._detect_with_tasks(FakeArr(), 0.5) == []
assert tasks_closed == [True], tasks_closed

print("DETECT_FACES_3654_OK")
`,
          ],
          { encoding: "utf8", timeout: 30_000 },
        );
        expect(res.status, res.stderr).toBe(0);
        expect(res.stdout).toContain("DETECT_FACES_3654_OK");
      });
    },
  );
});
