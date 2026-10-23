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

      it("scopes except AttributeError in _detect_face_mesh to mp.solutions.face_mesh lookup (issue #3652)", () => {
        const res = spawnSync(
          pythonBin as string,
          [
            "-c",
            `
import contextlib, importlib.util, io, json, os, sys, types

py_dir = ${JSON.stringify(pyDir)}
sys.path.insert(0, py_dir)
os.environ["SNAPOTTER_ALLOW_MODEL_DOWNLOAD"] = "0"
os.environ["MODELS_PATH"] = "/tmp/nonexistent-models-3652"

class FakeArr:
    shape = (64, 64, 3)

spec = importlib.util.spec_from_file_location("red_eye_removal_mod_3652", os.path.join(py_dir, "red_eye_removal.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
mod._DOCKER_MODEL_PATH = "/tmp/nonexistent-docker-3652.task"
mod._LOCAL_MODEL_PATH = "/tmp/nonexistent-local-3652.task"

ensure_model_calls = []
orig_ensure_model = mod._ensure_face_mesh_model
def tracked_ensure_model():
    ensure_model_calls.append(True)
    return orig_ensure_model()
mod._ensure_face_mesh_model = tracked_ensure_model

# 1. AttributeError inside FaceMesh() init or mesh.process() when mp.solutions.face_mesh exists must propagate directly
class InitAttrErrorMesh:
    def __init__(self, **_kwargs):
        raise AttributeError("unexpected NoneType attribute in init")

class ProcessAttrErrorMesh:
    def __init__(self, **_kwargs):
        pass
    def process(self, _img):
        raise AttributeError("unexpected NoneType attribute in process")
    def close(self):
        pass

fake_mp = types.ModuleType("mediapipe")
fake_mp.solutions = types.SimpleNamespace(
    face_mesh=types.SimpleNamespace(FaceMesh=InitAttrErrorMesh)
)
sys.modules["mediapipe"] = fake_mp

for mesh_cls, expected_msg in (
    (InitAttrErrorMesh, "unexpected NoneType attribute in init"),
    (ProcessAttrErrorMesh, "unexpected NoneType attribute in process"),
):
    fake_mp.solutions.face_mesh.FaceMesh = mesh_cls
    try:
        mod._detect_face_mesh(FakeArr(), 25, 0.6)
    except AttributeError as exc:
        assert str(exc) == expected_msg, exc
        assert ensure_model_calls == [], f"_ensure_face_mesh_model must not be called: {ensure_model_calls}"
    else:
        raise AssertionError(f"Expected AttributeError from {mesh_cls.__name__} to propagate")

# 1b. Through main(), AttributeError in mesh.process() reports the AttributeError, not the offline model download error
fake_pil = types.ModuleType("PIL")
fake_pil.Image = types.SimpleNamespace(
    open=lambda _p: types.SimpleNamespace(convert=lambda _m: types.SimpleNamespace(size=(64, 64), save=lambda *_a, **_k: None)),
    fromarray=lambda _a: types.SimpleNamespace(size=(64, 64), save=lambda *_a, **_k: None),
)
sys.modules["PIL"] = fake_pil
fake_np = types.ModuleType("numpy")
fake_np.array = lambda _img: FakeArr()
sys.modules["numpy"] = fake_np
fake_cv2 = types.ModuleType("cv2")
sys.modules["cv2"] = fake_cv2

sys.argv = ["red_eye_removal.py", "/tmp/in.png", "/tmp/out.png", "{}"]
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

# 2. AttributeError during landmark list comprehension in _mesh_with_solutions must propagate directly
class BadFaceLandmarkMesh:
    def __init__(self, **_kwargs):
        pass
    def process(self, _img):
        return types.SimpleNamespace(multi_face_landmarks=[None])
    def close(self):
        pass

fake_mp.solutions.face_mesh.FaceMesh = BadFaceLandmarkMesh
try:
    mod._detect_face_mesh(FakeArr())
except AttributeError as exc:
    assert "landmark" in str(exc), exc
    assert ensure_model_calls == [], ensure_model_calls
else:
    raise AssertionError("Expected AttributeError from face.landmark extraction to propagate")

# 3. Positive mp.solutions paths (no face found and face found) return landmarks without touching _mesh_with_tasks
class EmptySolutionsMesh:
    def __init__(self, **_kwargs):
        pass
    def process(self, _img):
        return types.SimpleNamespace(multi_face_landmarks=None)
    def close(self):
        pass

fake_mp.solutions.face_mesh.FaceMesh = EmptySolutionsMesh
assert mod._detect_face_mesh(FakeArr()) == []
assert ensure_model_calls == [], ensure_model_calls

class OkSolutionsMesh:
    def __init__(self, max_num_faces=50, min_detection_confidence=0.5, **_kwargs):
        self.max_num_faces = max_num_faces
        self.min_detection_confidence = min_detection_confidence
    def process(self, _img):
        pts = [types.SimpleNamespace(x=0.5, y=0.5, max_f=self.max_num_faces, min_c=self.min_detection_confidence)]
        return types.SimpleNamespace(multi_face_landmarks=[types.SimpleNamespace(landmark=pts)])
    def close(self):
        pass

fake_mp.solutions.face_mesh.FaceMesh = OkSolutionsMesh
sol_res = mod._detect_face_mesh(FakeArr(), max_faces=12, min_confidence=0.75)
assert len(sol_res) == 1 and sol_res[0][0].max_f == 12 and sol_res[0][0].min_c == 0.75, sol_res
assert ensure_model_calls == [], ensure_model_calls

# 4. When mp.solutions is missing (or face_mesh is missing/None), falls back to _mesh_with_tasks
mod._ensure_face_mesh_model = lambda: "/tmp/fake-landmarker-3652.task"
tasks_calls = []
class FakeLandmarker:
    def __init__(self, opts):
        self.opts = opts
    def detect(self, _mp_image):
        tasks_calls.append(self.opts)
        pts = [types.SimpleNamespace(x=0.25, y=0.75)]
        return types.SimpleNamespace(face_landmarks=[pts])
    def close(self):
        pass

for missing_solutions in ("no_attr", None, types.SimpleNamespace(), types.SimpleNamespace(face_mesh=None)):
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
            FaceLandmarkerOptions=lambda **kw: kw,
            FaceLandmarker=types.SimpleNamespace(create_from_options=lambda opts: FakeLandmarker(opts)),
        ),
    )
    sys.modules["mediapipe"] = mp_tasks_mod
    tasks_res = mod._detect_face_mesh(FakeArr(), max_faces=10, min_confidence=0.4)
    assert len(tasks_res) == 1 and tasks_res[0][0].x == 0.25, (missing_solutions, tasks_res)
    assert len(tasks_calls) == 1, (missing_solutions, tasks_calls)
    assert tasks_calls[0]["num_faces"] == 10 and tasks_calls[0]["min_face_detection_confidence"] == 0.4, tasks_calls

print("RED_EYE_3652_OK")
`,
          ],
          { encoding: "utf8", timeout: 30_000 },
        );
        expect(res.status, res.stderr).toBe(0);
        expect(res.stdout).toContain("RED_EYE_3652_OK");
      });

      it("closes MediaPipe FaceMesh and FaceLandmarker in _mesh_with_solutions and _mesh_with_tasks when .process(), mp.Image(), or .detect() raises (issue #3654)", () => {
        const res = spawnSync(
          pythonBin as string,
          [
            "-c",
            `
import importlib.util, os, sys, types

py_dir = ${JSON.stringify(pyDir)}
sys.path.insert(0, py_dir)

class FakeArr:
    shape = (64, 64, 3)

spec = importlib.util.spec_from_file_location("red_eye_removal_mod_3654", os.path.join(py_dir, "red_eye_removal.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

# 1. _mesh_with_solutions: mesh.close() is called when mesh.process() raises
solutions_closed = []
raise_in_solutions = [True]

class RaisingSolutionsMesh:
    def __init__(self, **_kwargs):
        pass
    def process(self, _img):
        if raise_in_solutions[0]:
            raise RuntimeError("mesh process failed")
        return types.SimpleNamespace(multi_face_landmarks=None)
    def close(self):
        solutions_closed.append(True)

fake_mp_sol = types.ModuleType("mediapipe")
fake_mp_sol.solutions = types.SimpleNamespace(
    face_mesh=types.SimpleNamespace(FaceMesh=RaisingSolutionsMesh)
)
sys.modules["mediapipe"] = fake_mp_sol

try:
    mod._mesh_with_solutions(FakeArr(), 10, 0.5)
except RuntimeError as exc:
    assert str(exc) == "mesh process failed", exc
    assert solutions_closed == [True], solutions_closed
else:
    raise AssertionError("Expected RuntimeError from mesh.process()")

solutions_closed.clear()
raise_in_solutions[0] = False
assert mod._mesh_with_solutions(FakeArr(), 10, 0.5) == []
assert solutions_closed == [True], solutions_closed

# 2. _mesh_with_tasks: landmarker.close() is called when mp.Image() raises or when landmarker.detect() raises
mod._ensure_face_mesh_model = lambda: "/tmp/fake-landmarker-3654.task"
tasks_closed = []
raise_in_image = [False]
raise_in_detect = [False]

class RaisingLandmarker:
    def detect(self, _mp_image):
        if raise_in_detect[0]:
            raise RuntimeError("landmarker detect failed")
        return types.SimpleNamespace(face_landmarks=[])
    def close(self):
        tasks_closed.append(True)

def fake_mp_image(image_format, data):
    if raise_in_image[0]:
        raise ValueError("red_eye mp.Image wrap failed")
    return data

fake_mp_tasks = types.ModuleType("mediapipe")
fake_mp_tasks.ImageFormat = types.SimpleNamespace(SRGB=1)
fake_mp_tasks.Image = fake_mp_image
fake_mp_tasks.tasks = types.SimpleNamespace(
    BaseOptions=lambda model_asset_path: model_asset_path,
    vision=types.SimpleNamespace(
        RunningMode=types.SimpleNamespace(IMAGE=1),
        FaceLandmarkerOptions=lambda **kw: kw,
        FaceLandmarker=types.SimpleNamespace(create_from_options=lambda _opts: RaisingLandmarker()),
    ),
)
sys.modules["mediapipe"] = fake_mp_tasks

tasks_closed.clear()
raise_in_image[0] = True
raise_in_detect[0] = False
try:
    mod._mesh_with_tasks(FakeArr(), 10, 0.5)
except ValueError as exc:
    assert str(exc) == "red_eye mp.Image wrap failed", exc
    assert tasks_closed == [True], tasks_closed
else:
    raise AssertionError("Expected ValueError from mp.Image()")

tasks_closed.clear()
raise_in_image[0] = False
raise_in_detect[0] = True
try:
    mod._mesh_with_tasks(FakeArr(), 10, 0.5)
except RuntimeError as exc:
    assert str(exc) == "landmarker detect failed", exc
    assert tasks_closed == [True], tasks_closed
else:
    raise AssertionError("Expected RuntimeError from landmarker.detect()")

tasks_closed.clear()
raise_in_image[0] = False
raise_in_detect[0] = False
assert mod._mesh_with_tasks(FakeArr(), 10, 0.5) == []
assert tasks_closed == [True], tasks_closed

print("RED_EYE_3654_OK")
`,
          ],
          { encoding: "utf8", timeout: 30_000 },
        );
        expect(res.status, res.stderr).toBe(0);
        expect(res.stdout).toContain("RED_EYE_3654_OK");
      });
    },
  );
});
