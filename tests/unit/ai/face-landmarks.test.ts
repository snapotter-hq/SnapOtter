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

    it("hands the abort signal to the sidecar call", async () => {
      const { signal } = new AbortController();
      await detectFaceLandmarks(FAKE_INPUT, undefined, { signal });

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "face_landmarks.py",
        expect.any(Array),
        expect.objectContaining({ signal }),
      );
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
fake_mp.solutions = types.SimpleNamespace(face_mesh=object())
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

      it("scopes except AttributeError in main() to mp.solutions.face_mesh lookup (issue #3626)", () => {
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
    shape = (64, 64, 3)

fake_pil = types.ModuleType("PIL")
fake_pil.Image = types.SimpleNamespace(
    open=lambda _p: types.SimpleNamespace(convert=lambda _m: types.SimpleNamespace(size=(64, 64))),
)
sys.modules["PIL"] = fake_pil

fake_np = types.ModuleType("numpy")
fake_np.array = lambda _img: FakeArr()
sys.modules["numpy"] = fake_np

spec = importlib.util.spec_from_file_location("face_landmarks_mod_3626", os.path.join(py_dir, "face_landmarks.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
mod._DOCKER_MODEL_PATH = "/tmp/nonexistent-docker-3626.task"
mod.MODEL_PATH = "/tmp/nonexistent-local-3626.task"

ensure_model_calls = []
orig_ensure_model = mod.ensure_model
def tracked_ensure_model():
    ensure_model_calls.append(True)
    return orig_ensure_model()
mod.ensure_model = tracked_ensure_model

def run_main_expect_error():
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

# 1. AttributeError inside FaceMesh() init or face_mesh.process() when mp.solutions.face_mesh exists must report the AttributeError, not enter detect_with_tasks
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
    payload = run_main_expect_error()
    assert payload == {
        "success": False,
        "error": expected_msg,
    }, payload
    assert ensure_model_calls == [], f"ensure_model must not be called when mp.solutions.face_mesh exists: {ensure_model_calls}"

# 2. AttributeError during landmark coordinate extraction in detect_with_solutions must propagate directly
class BadLandmarkMesh:
    def __init__(self, **_kwargs):
        pass
    def process(self, _img):
        return types.SimpleNamespace(multi_face_landmarks=[types.SimpleNamespace(landmark=[None])])
    def close(self):
        pass

fake_mp.solutions.face_mesh.FaceMesh = BadLandmarkMesh
payload_lm = run_main_expect_error()
assert "has no attribute 'x'" in payload_lm["error"], payload_lm
assert ensure_model_calls == [], ensure_model_calls

# 2b. Positive mp.solutions paths (no face found and face found) never touch detect_with_tasks
class EmptySolutionsMesh:
    def __init__(self, **_kwargs):
        pass
    def process(self, _img):
        return types.SimpleNamespace(multi_face_landmarks=None)
    def close(self):
        pass

fake_mp.solutions.face_mesh.FaceMesh = EmptySolutionsMesh
sys.argv = ["face_landmarks.py", "/tmp/in.png", "unused", "{}"]
out_buf, err_buf = io.StringIO(), io.StringIO()
with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
    mod.main()
assert json.loads(out_buf.getvalue().strip()) == {"success": True, "faceDetected": False, "landmarks": None}
assert ensure_model_calls == [], ensure_model_calls

class OkSolutionsMesh:
    def __init__(self, **_kwargs):
        pass
    def process(self, _img):
        pts = [types.SimpleNamespace(x=0.5, y=0.5) for _ in range(400)]
        return types.SimpleNamespace(multi_face_landmarks=[types.SimpleNamespace(landmark=pts)])
    def close(self):
        pass

fake_mp.solutions.face_mesh.FaceMesh = OkSolutionsMesh
out_buf, err_buf = io.StringIO(), io.StringIO()
with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
    mod.main()
payload_sol_ok = json.loads(out_buf.getvalue().strip())
assert payload_sol_ok["success"] is True and payload_sol_ok["faceDetected"] is True, payload_sol_ok
assert ensure_model_calls == [], ensure_model_calls

# 3. When mp.solutions is missing (or face_mesh is missing/None), falls back to detect_with_tasks
mod.ensure_model = lambda: "/tmp/fake-landmarker-3626.task"
tasks_calls = []
class FakeLandmarker:
    def detect(self, _mp_image):
        tasks_calls.append(True)
        pts = [types.SimpleNamespace(x=0.5, y=0.5) for _ in range(400)]
        return types.SimpleNamespace(face_landmarks=[pts])
    def close(self):
        pass

for missing_solutions in ("no_attr", None, types.SimpleNamespace(), types.SimpleNamespace(face_mesh=None)):
    tasks_calls.clear()
    mp_tasks_mod = types.ModuleType("mediapipe")
    if missing_solutions != "no_attr":
        mp_tasks_mod.solutions = missing_solutions
    mp_tasks_mod.Image = types.SimpleNamespace(create_from_file=lambda p: p)
    mp_tasks_mod.tasks = types.SimpleNamespace(
        BaseOptions=lambda model_asset_path: model_asset_path,
        vision=types.SimpleNamespace(
            RunningMode=types.SimpleNamespace(IMAGE=1),
            FaceLandmarkerOptions=lambda **kw: kw,
            FaceLandmarker=types.SimpleNamespace(create_from_options=lambda _opts: FakeLandmarker()),
        ),
    )
    sys.modules["mediapipe"] = mp_tasks_mod
    sys.argv = ["face_landmarks.py", "/tmp/in.png", "unused", "{}"]
    out_buf, err_buf = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
        mod.main()
    payload_ok = json.loads(out_buf.getvalue().strip())
    assert payload_ok["success"] is True and payload_ok["faceDetected"] is True, (missing_solutions, payload_ok)
    assert len(tasks_calls) == 1, (missing_solutions, tasks_calls)
    progress_events = [json.loads(line) for line in err_buf.getvalue().strip().splitlines() if line.strip()]
    assert progress_events.count({"progress": 30, "stage": "Detecting face landmarks"}) == 1, progress_events

print("FACE_LANDMARKS_3626_OK")
`,
          ],
          { encoding: "utf8", timeout: 30_000 },
        );
        expect(res.status, res.stderr).toBe(0);
        expect(res.stdout).toContain("FACE_LANDMARKS_3626_OK");
      });

      it("closes MediaPipe FaceMesh and FaceLandmarker in detect_with_solutions and detect_with_tasks when .process(), create_from_file(), or .detect() raises (issue #3654)", () => {
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

spec = importlib.util.spec_from_file_location("face_landmarks_mod_3654", os.path.join(py_dir, "face_landmarks.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

# 1. detect_with_solutions: face_mesh.close() is called when face_mesh.process() raises
solutions_closed = []
raise_in_solutions = [True]

class RaisingSolutionsMesh:
    def __init__(self, **_kwargs):
        pass
    def process(self, _img):
        if raise_in_solutions[0]:
            raise RuntimeError("face_mesh process failed")
        return types.SimpleNamespace(multi_face_landmarks=None)
    def close(self):
        solutions_closed.append(True)

fake_mp_sol = types.ModuleType("mediapipe")
fake_mp_sol.solutions = types.SimpleNamespace(
    face_mesh=types.SimpleNamespace(FaceMesh=RaisingSolutionsMesh)
)
sys.modules["mediapipe"] = fake_mp_sol

try:
    mod.detect_with_solutions(FakeArr(), 1)
except RuntimeError as exc:
    assert str(exc) == "face_mesh process failed", exc
    assert solutions_closed == [True], solutions_closed
else:
    raise AssertionError("Expected RuntimeError from face_mesh.process()")

solutions_closed.clear()
raise_in_solutions[0] = False
assert mod.detect_with_solutions(FakeArr(), 1) is None
assert solutions_closed == [True], solutions_closed

# 2. detect_with_tasks: landmarker.close() is called when create_from_file() raises or when landmarker.detect() raises
mod.ensure_model = lambda: "/tmp/fake-landmarker-3654.task"
tasks_closed = []
raise_in_create = [False]
raise_in_detect = [False]

class RaisingLandmarker:
    def detect(self, _mp_image):
        if raise_in_detect[0]:
            raise RuntimeError("landmarker detect failed")
        return types.SimpleNamespace(face_landmarks=[])
    def close(self):
        tasks_closed.append(True)

def fake_create_from_file(path):
    if raise_in_create[0]:
        raise FileNotFoundError(f"cannot read image: {path}")
    return path

fake_mp_tasks = types.ModuleType("mediapipe")
fake_mp_tasks.Image = types.SimpleNamespace(create_from_file=fake_create_from_file)
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
raise_in_create[0] = True
raise_in_detect[0] = False
try:
    mod.detect_with_tasks("/tmp/missing.png", 1)
except FileNotFoundError as exc:
    assert "cannot read image: /tmp/missing.png" in str(exc), exc
    assert tasks_closed == [True], tasks_closed
else:
    raise AssertionError("Expected FileNotFoundError from create_from_file()")

tasks_closed.clear()
raise_in_create[0] = False
raise_in_detect[0] = True
try:
    mod.detect_with_tasks("/tmp/in.png", 1)
except RuntimeError as exc:
    assert str(exc) == "landmarker detect failed", exc
    assert tasks_closed == [True], tasks_closed
else:
    raise AssertionError("Expected RuntimeError from landmarker.detect()")

tasks_closed.clear()
raise_in_create[0] = False
raise_in_detect[0] = False
assert mod.detect_with_tasks("/tmp/in.png", 1) is None
assert tasks_closed == [True], tasks_closed

print("FACE_LANDMARKS_3654_OK")
`,
          ],
          { encoding: "utf8", timeout: 30_000 },
        );
        expect(res.status, res.stderr).toBe(0);
        expect(res.stdout).toContain("FACE_LANDMARKS_3654_OK");
      });
    },
  );
});
