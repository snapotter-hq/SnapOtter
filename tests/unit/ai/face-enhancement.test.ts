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

    it("omits onProgress when not provided", async () => {
      await enhanceFaces(FAKE_INPUT, FAKE_OUTPUT_DIR);

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
            toBuffer: vi.fn().mockRejectedValue(new Error("Invalid JPEG")),
          }) as unknown as ReturnType<typeof sharp>,
      );

      await expect(enhanceFaces(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("Invalid JPEG");
    });
  });

  describe("edge cases", () => {
    it("handles response with zero facesDetected and non-empty faces array", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        facesDetected: 0,
        faces: [{ x: 10, y: 20, w: 30, h: 40 }],
        model: "gfpgan",
      });

      const result = await enhanceFaces(FAKE_INPUT, FAKE_OUTPUT_DIR);
      // The function trusts what Python returns
      expect(result.facesDetected).toBe(0);
      expect(result.faces).toHaveLength(1);
    });

    it("propagates segfault errors from bridge", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(
        new Error("Process crashed (segmentation fault)"),
      );

      await expect(enhanceFaces(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("segmentation fault");
    });
  });

  describe.skipIf(!hasPython)(
    "enhance_faces.py cv2.imwrite return check and result_path cleanup (issues #3087, #3419)",
    () => {
      const here = dirname(fileURLToPath(import.meta.url));
      const pyDir = resolve(here, "../../../packages/ai/python");

      it("raises RuntimeError on cv2.imwrite failure and cleans up both tmp_in_path and result_path in enhance_with_codeformer", () => {
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
    def __getitem__(self, _idx):
        return self
    def copy(self):
        return self

attempted_paths = []
inference_calls = []

fake_cv2 = types.ModuleType("cv2")
fake_cv2.IMREAD_COLOR = 1
def fake_imwrite(path, _img):
    attempted_paths.append(path)
    return False
fake_cv2.imwrite = fake_imwrite
fake_cv2.imread = lambda _p, _f: FakeArr()
sys.modules["cv2"] = fake_cv2

fake_np = types.ModuleType("numpy")
fake_np.array = lambda _img: FakeArr()
sys.modules["numpy"] = fake_np

fake_torch = types.ModuleType("torch")
fake_torch.cuda = types.SimpleNamespace(is_available=lambda: False)
sys.modules["torch"] = fake_torch

fake_gpu = types.ModuleType("gpu")
fake_gpu.torch_gpu_available = lambda: False
sys.modules["gpu"] = fake_gpu

fake_offline = types.ModuleType("offline_guard")
fake_offline.prepare_codeformer_weights = lambda _b: None
sys.modules["offline_guard"] = fake_offline

fake_cf_pkg = types.ModuleType("codeformer")
fake_cf_app = types.ModuleType("codeformer.app")
def fake_inference_app(**kwargs):
    inference_calls.append(kwargs)
    return kwargs["image"]
fake_cf_app.inference_app = fake_inference_app
sys.modules["codeformer"] = fake_cf_pkg
sys.modules["codeformer.app"] = fake_cf_app

fake_pil = types.ModuleType("PIL")
fake_pil.Image = types.SimpleNamespace(
    open=lambda _p: types.SimpleNamespace(convert=lambda _m: FakeArr()),
    fromarray=lambda _a: types.SimpleNamespace(save=lambda _p: None),
)
sys.modules["PIL"] = fake_pil

spec = importlib.util.spec_from_file_location("enhance_faces_mod", os.path.join(py_dir, "enhance_faces.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

mod.detect_faces_mediapipe = lambda _arr, _s: [{"x": 0, "y": 0, "w": 32, "h": 32}]

try:
    mod.enhance_with_codeformer(FakeArr(), 0.5)
except RuntimeError as exc:
    assert len(attempted_paths) == 1, attempted_paths
    tmp_path = attempted_paths[0]
    assert str(exc) == f"Failed to write output image: {tmp_path}", exc
    assert inference_calls == [], f"inference_app should not be called when imwrite fails: {inference_calls}"
    assert not os.path.exists(tmp_path), f"temp file should be cleaned up on imwrite failure: {tmp_path}"
else:
    raise AssertionError("Expected RuntimeError when cv2.imwrite returns False in enhance_with_codeformer")

attempted_paths.clear()
sys.argv = ["enhance_faces.py", "/tmp/in.png", "/tmp/out_faces.png", json.dumps({"model": "codeformer", "strength": 1.0})]
out_buf, err_buf = io.StringIO(), io.StringIO()
orig_dunder_stdout = sys.__stdout__
try:
    sys.__stdout__ = out_buf
    with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
        mod.main()
except SystemExit as exc:
    assert exc.code == 1, exc.code
    assert len(attempted_paths) == 1, attempted_paths
    tmp_path = attempted_paths[0]
    payload = json.loads(out_buf.getvalue().strip())
    assert payload == {
        "success": False,
        "error": f"Failed to write output image: {tmp_path}",
    }, payload
    assert not os.path.exists(tmp_path), f"temp file should be cleaned up on main() failure: {tmp_path}"
else:
    raise AssertionError(f"Expected SystemExit(1) when cv2.imwrite returns False in main(), got stdout={out_buf.getvalue()!r}")
finally:
    sys.__stdout__ = orig_dunder_stdout

# In model="auto" mode, a cv2.imwrite failure in enhance_with_codeformer still cleans up tmp_in_path and falls back to GFPGAN
attempted_paths.clear()
gfpgan_calls = []
def fake_gfpgan(arr, only_center):
    gfpgan_calls.append(only_center)
    return arr
mod.enhance_with_gfpgan = fake_gfpgan
sys.argv = ["enhance_faces.py", "/tmp/in.png", "/tmp/out_faces.png", json.dumps({"model": "auto", "strength": 1.0})]
out_auto, err_auto = io.StringIO(), io.StringIO()
try:
    sys.__stdout__ = out_auto
    with contextlib.redirect_stdout(out_auto), contextlib.redirect_stderr(err_auto):
        mod.main()
finally:
    sys.__stdout__ = orig_dunder_stdout
assert len(attempted_paths) == 1, attempted_paths
assert not os.path.exists(attempted_paths[0]), f"temp file should be cleaned up before GFPGAN fallback: {attempted_paths[0]}"
assert gfpgan_calls == [False], gfpgan_calls
payload_auto = json.loads(out_auto.getvalue().strip())
assert payload_auto["success"] is True and payload_auto["model"] == "gfpgan", payload_auto

# Positive path: when cv2.imwrite returns True, enhance_with_codeformer invokes inference_app and unlinks both tmp_in_path and result_path
attempted_paths.clear()
inference_calls.clear()
result_paths = []
import atexit
def _cleanup_test_results():
    for p in result_paths:
        try:
            os.unlink(p)
        except OSError:
            pass
atexit.register(_cleanup_test_results)
def ok_imwrite(path, _img):
    attempted_paths.append(path)
    return True
fake_cv2.imwrite = ok_imwrite
imread_existed = []
def imread_checking_exists(path, _flags):
    imread_existed.append((path, os.path.exists(path)))
    return FakeArr() if os.path.exists(path) else None
fake_cv2.imread = imread_checking_exists
def fake_inference_app_with_temp_output(**kwargs):
    inference_calls.append(kwargs)
    import tempfile
    with tempfile.NamedTemporaryFile(suffix="_cf_out.png", delete=False) as tmp_out:
        result_paths.append(tmp_out.name)
        return tmp_out.name
fake_cf_app.inference_app = fake_inference_app_with_temp_output
restored = mod.enhance_with_codeformer(FakeArr(), 0.5)
assert restored is not None
assert len(attempted_paths) == 1, attempted_paths
assert len(inference_calls) == 1 and inference_calls[0]["image"] == attempted_paths[0], inference_calls
assert not os.path.exists(attempted_paths[0]), f"temp file should be cleaned up after enhance_with_codeformer succeeds: {attempted_paths[0]}"
assert len(result_paths) == 1, result_paths
assert imread_existed == [(result_paths[0], True)], f"result_path should exist when cv2.imread reads it: {imread_existed}"
assert not os.path.exists(result_paths[0]), f"result_path should be cleaned up after enhance_with_codeformer succeeds: {result_paths[0]}"

# Unreadable result_path: when cv2.imread returns None, enhance_with_codeformer raises RuntimeError and still unlinks result_path
attempted_paths.clear()
inference_calls.clear()
result_paths.clear()
fake_cv2.imread = lambda _p, _f: None
try:
    mod.enhance_with_codeformer(FakeArr(), 0.5)
except RuntimeError as exc:
    assert str(exc) == "CodeFormer output file could not be read", exc
    assert len(result_paths) == 1, result_paths
    assert not os.path.exists(result_paths[0]), f"result_path should be cleaned up when cv2.imread returns None: {result_paths[0]}"
else:
    raise AssertionError("Expected RuntimeError when cv2.imread returns None")

# Exception inside cv2.imread: when cv2.imread raises, finally block still unlinks result_path and propagates the exception
attempted_paths.clear()
inference_calls.clear()
result_paths.clear()
def raising_imread(_p, _f):
    raise ValueError("corrupt png stream")
fake_cv2.imread = raising_imread
try:
    mod.enhance_with_codeformer(FakeArr(), 0.5)
except ValueError as exc:
    assert str(exc) == "corrupt png stream", exc
    assert len(result_paths) == 1, result_paths
    assert not os.path.exists(result_paths[0]), f"result_path should be cleaned up when cv2.imread raises: {result_paths[0]}"
else:
    raise AssertionError("Expected ValueError when cv2.imread raises")

# Already-unlinked result_path (str(result_path) == tmp_in_path): OSError is suppressed in finally and original error propagates
attempted_paths.clear()
inference_calls.clear()
result_paths.clear()
fake_cv2.imread = lambda _p, _f: None
fake_cf_app.inference_app = lambda **kw: kw["image"]
try:
    mod.enhance_with_codeformer(FakeArr(), 0.5)
except RuntimeError as exc:
    assert str(exc) == "CodeFormer output file could not be read", exc
    assert len(attempted_paths) == 1 and not os.path.exists(attempted_paths[0]), attempted_paths
else:
    raise AssertionError("Expected RuntimeError when already-unlinked result_path returns None from imread")

print("ENHANCE_FACES_3087_OK")
`,
          ],
          { encoding: "utf8", timeout: 30_000 },
        );
        expect(res.status, res.stderr).toBe(0);
        expect(res.stdout).toContain("ENHANCE_FACES_3087_OK");
      });

      it("re-raises CodeFormer OOM exceptions in auto mode without falling back to GFPGAN (issue #3440)", () => {
        const res = spawnSync(
          pythonBin as string,
          [
            "-c",
            `
import contextlib, errno, importlib.util, io, json, os, sys, types

py_dir = ${JSON.stringify(pyDir)}
sys.path.insert(0, py_dir)

class FakeArr:
    shape = (64, 64, 3)
    def __getitem__(self, _idx):
        return self
    def copy(self):
        return self

fake_np = types.ModuleType("numpy")
fake_np.array = lambda _img: FakeArr()
sys.modules["numpy"] = fake_np

fake_pil = types.ModuleType("PIL")
fake_pil.Image = types.SimpleNamespace(
    open=lambda _p: types.SimpleNamespace(convert=lambda _m: FakeArr()),
    fromarray=lambda _a: types.SimpleNamespace(save=lambda _p: None),
)
sys.modules["PIL"] = fake_pil

spec = importlib.util.spec_from_file_location("enhance_faces_mod", os.path.join(py_dir, "enhance_faces.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

mod.detect_faces_mediapipe = lambda _arr, _s: [{"x": 0, "y": 0, "w": 32, "h": 32}]

gfpgan_calls = []
def fake_gfpgan(arr, only_center):
    gfpgan_calls.append(only_center)
    return arr
mod.enhance_with_gfpgan = fake_gfpgan

orig_dunder_stdout = sys.__stdout__

for oom_exc, expected_err in (
    (MemoryError(), "MemoryError"),
    (MemoryError("CodeFormer OOM"), "CodeFormer OOM"),
    (RuntimeError("CUDA out of memory. Tried to allocate 512.00 MiB"), "CUDA out of memory. Tried to allocate 512.00 MiB"),
    (RuntimeError("Failed to allocate memory for requested buffer"), "Failed to allocate memory for requested buffer"),
    (RuntimeError("DefaultCPUAllocator: not enough memory: you tried to allocate 600000000 bytes."), "DefaultCPUAllocator: not enough memory: you tried to allocate 600000000 bytes."),
    (RuntimeError("DefaultCPUAllocator: can't allocate memory: you tried to allocate 104857600 bytes."), "DefaultCPUAllocator: can't allocate memory: you tried to allocate 104857600 bytes."),
    (RuntimeError("Unable to allocate 1.86 GiB for an array with shape (4096, 4096, 3)"), "Unable to allocate 1.86 GiB for an array with shape (4096, 4096, 3)"),
    (RuntimeError("cudaErrorMemoryAllocation: out of memory"), "cudaErrorMemoryAllocation: out of memory"),
    (RuntimeError("CUBLAS_STATUS_ALLOC_FAILED"), "CUBLAS_STATUS_ALLOC_FAILED"),
    (RuntimeError("std::bad_alloc"), "std::bad_alloc"),
    (OSError(errno.ENOMEM, "Cannot allocate memory"), "[Errno 12] Cannot allocate memory"),
    (OSError(errno.ENOMEM, "Nicht genügend Hauptspeicher verfügbar"), "[Errno 12] Nicht genügend Hauptspeicher verfügbar"),
):
    gfpgan_calls.clear()
    def raise_oom(_arr, _fid, _exc=oom_exc):
        raise _exc
    mod.enhance_with_codeformer = raise_oom
    sys.argv = ["enhance_faces.py", "/tmp/in.png", "/tmp/out_faces.png", json.dumps({"model": "auto", "strength": 1.0})]
    out_buf, err_buf = io.StringIO(), io.StringIO()
    try:
        sys.__stdout__ = out_buf
        with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
            mod.main()
    except SystemExit as exc:
        assert exc.code == 1, (oom_exc, exc.code)
        assert gfpgan_calls == [], f"GFPGAN must not be called on CodeFormer OOM {oom_exc!r}: {gfpgan_calls}"
        assert "falling back to gfpgan" not in err_buf.getvalue().lower(), err_buf.getvalue()
        payload = json.loads(out_buf.getvalue().strip())
        assert payload == {"success": False, "error": expected_err}, (oom_exc, payload)
    else:
        raise AssertionError(f"Expected SystemExit(1) for CodeFormer OOM {oom_exc!r}, got stdout={out_buf.getvalue()!r}")
    finally:
        sys.__stdout__ = orig_dunder_stdout

# Driving an inference_app OOM through the real enhance_with_codeformer in auto mode cleans up tmp_in_path, restores torch.cuda.is_available, and skips GFPGAN
unstubbed_codeformer = mod.enhance_with_codeformer
attempted_in_paths = []
fake_cv2 = types.ModuleType("cv2")
fake_cv2.IMREAD_COLOR = 1
def ok_imwrite(path, _img):
    attempted_in_paths.append(path)
    return True
fake_cv2.imwrite = ok_imwrite
sys.modules["cv2"] = fake_cv2

orig_cuda_fn = lambda: False
fake_torch = types.ModuleType("torch")
fake_torch.cuda = types.SimpleNamespace(is_available=orig_cuda_fn)
sys.modules["torch"] = fake_torch

fake_gpu = types.ModuleType("gpu")
fake_gpu.torch_gpu_available = lambda: False
sys.modules["gpu"] = fake_gpu

fake_offline = types.ModuleType("offline_guard")
fake_offline.prepare_codeformer_weights = lambda _b: None
sys.modules["offline_guard"] = fake_offline

fake_cf_pkg = types.ModuleType("codeformer")
fake_cf_app = types.ModuleType("codeformer.app")
def oom_inference_app(**_kwargs):
    raise RuntimeError("CUDA out of memory")
fake_cf_app.inference_app = oom_inference_app
sys.modules["codeformer"] = fake_cf_pkg
sys.modules["codeformer.app"] = fake_cf_app

# Reload enhance_with_codeformer from a fresh module spec so we have the unstubbed function
spec2 = importlib.util.spec_from_file_location("enhance_faces_mod2", os.path.join(py_dir, "enhance_faces.py"))
mod2 = importlib.util.module_from_spec(spec2)
spec2.loader.exec_module(mod2)
mod.enhance_with_codeformer = mod2.enhance_with_codeformer

gfpgan_calls.clear()
sys.argv = ["enhance_faces.py", "/tmp/in.png", "/tmp/out_faces.png", json.dumps({"model": "auto", "strength": 1.0})]
out_buf, err_buf = io.StringIO(), io.StringIO()
try:
    sys.__stdout__ = out_buf
    with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
        mod.main()
except SystemExit as exc:
    assert exc.code == 1, exc.code
    assert len(attempted_in_paths) == 1 and not os.path.exists(attempted_in_paths[0]), attempted_in_paths
    assert fake_torch.cuda.is_available is orig_cuda_fn
    assert gfpgan_calls == [], gfpgan_calls
    assert "falling back to gfpgan" not in err_buf.getvalue().lower(), err_buf.getvalue()
    assert json.loads(out_buf.getvalue().strip()) == {"success": False, "error": "CUDA out of memory"}
else:
    raise AssertionError("Expected SystemExit(1) for unstubbed enhance_with_codeformer OOM")
finally:
    sys.__stdout__ = orig_dunder_stdout

# Non-OOM exceptions (including non-ENOMEM OSError and empty-message RuntimeError) in auto mode still fall back to GFPGAN
for non_oom_exc, expected_detail in (
    (RuntimeError("CodeFormer returned no result (face detection may have failed)"), "CodeFormer returned no result (face detection may have failed)"),
    (RuntimeError("DefaultCPUAllocator: invalid alignment"), "DefaultCPUAllocator: invalid alignment"),
    (RuntimeError(), "RuntimeError"),
    (OSError(errno.EACCES, "Permission denied"), "[Errno 13] Permission denied"),
    (FileNotFoundError("CodeFormer weights missing"), "CodeFormer weights missing"),
):
    gfpgan_calls.clear()
    def raise_non_oom(_arr, _fid, _exc=non_oom_exc):
        raise _exc
    mod.enhance_with_codeformer = raise_non_oom
    sys.argv = ["enhance_faces.py", "/tmp/in.png", "/tmp/out_faces.png", json.dumps({"model": "auto", "strength": 1.0, "onlyCenterFace": True})]
    out_buf, err_buf = io.StringIO(), io.StringIO()
    try:
        sys.__stdout__ = out_buf
        with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
            mod.main()
    finally:
        sys.__stdout__ = orig_dunder_stdout
    assert gfpgan_calls == [True], (non_oom_exc, gfpgan_calls)
    assert f"CodeFormer failed, falling back to GFPGAN: {expected_detail}" in err_buf.getvalue(), err_buf.getvalue()
    payload = json.loads(out_buf.getvalue().strip())
    assert payload["success"] is True and payload["model"] == "gfpgan", (non_oom_exc, payload)

print("ENHANCE_FACES_3440_OK")
`,
          ],
          { encoding: "utf8", timeout: 30_000 },
        );
        expect(res.status, res.stderr).toBe(0);
        expect(res.stdout).toContain("ENHANCE_FACES_3440_OK");
      });

      it("scopes Pillow ImportError to PIL import and reports downstream ImportErrors with detail and libGL hints (issue #3625)", () => {
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
    def __getitem__(self, _idx):
        return self
    def copy(self):
        return self

spec = importlib.util.spec_from_file_location("enhance_faces_mod", os.path.join(py_dir, "enhance_faces.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

orig_dunder_stdout = sys.__stdout__

def run_main(settings):
    sys.argv = ["enhance_faces.py", "/tmp/in.png", "/tmp/out_faces.png", json.dumps(settings)]
    out_buf, err_buf = io.StringIO(), io.StringIO()
    try:
        sys.__stdout__ = out_buf
        with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
            mod.main()
    except SystemExit as exc:
        assert exc.code == 1, exc.code
    else:
        raise AssertionError(f"Expected SystemExit(1), got stdout={out_buf.getvalue()!r}")
    finally:
        sys.__stdout__ = orig_dunder_stdout
    return json.loads(out_buf.getvalue().strip())

# 1. Missing PIL still reports Pillow installation message
sys.modules["PIL"] = None
try:
    payload = run_main({"model": "gfpgan"})
    assert payload == {
        "success": False,
        "error": "Pillow is not installed. Install with: pip install Pillow",
    }, payload
finally:
    sys.modules.pop("PIL", None)

# Install fake PIL and numpy for subsequent checks
fake_pil = types.ModuleType("PIL")
fake_pil.Image = types.SimpleNamespace(
    open=lambda _p: types.SimpleNamespace(convert=lambda _m: FakeArr()),
    fromarray=lambda _a: types.SimpleNamespace(save=lambda _p: None),
)
sys.modules["PIL"] = fake_pil

# 2. Missing numpy after PIL succeeds reports numpy ImportError, not Pillow
sys.modules["numpy"] = None
try:
    payload = run_main({"model": "gfpgan"})
    assert payload["success"] is False, payload
    assert "Pillow is not installed" not in payload["error"], payload
    assert payload == {
        "success": False,
        "error": "Missing dependency: import of numpy halted; None in sys.modules. Install with: pip install mediapipe numpy opencv-python",
    }, payload
finally:
    sys.modules.pop("numpy", None)

# 2b. ImportError inside Image.open (e.g. missing codec plugin) is not misreported as missing Pillow
fake_pil.Image.open = lambda _p: (_ for _ in ()).throw(ImportError("No module named 'pillow_heif'"))
payload = run_main({"model": "gfpgan"})
assert payload == {
    "success": False,
    "error": "No module named 'pillow_heif'",
}, payload
fake_pil.Image.open = lambda _p: types.SimpleNamespace(convert=lambda _m: FakeArr())

fake_np = types.ModuleType("numpy")
fake_np.array = lambda _img: FakeArr()
sys.modules["numpy"] = fake_np

# 3. Unstubbed detect_faces_mediapipe, enhance_with_gfpgan, and enhance_with_codeformer propagate real ImportErrors cleanly
sys.modules["mediapipe"] = None
try:
    payload = run_main({"model": "gfpgan"})
    assert payload == {
        "success": False,
        "error": "Missing dependency: import of mediapipe halted; None in sys.modules. Install with: pip install mediapipe numpy opencv-python",
    }, payload
finally:
    sys.modules.pop("mediapipe", None)

mod.detect_faces_mediapipe = lambda _arr, _s: [{"x": 0, "y": 0, "w": 32, "h": 32}]

orig_cuda_fn = lambda: False
fake_torch = types.ModuleType("torch")
fake_torch.cuda = types.SimpleNamespace(is_available=orig_cuda_fn)
sys.modules["torch"] = fake_torch

fake_gpu = types.ModuleType("gpu")
fake_gpu.torch_gpu_available = lambda: False
sys.modules["gpu"] = fake_gpu

fake_offline = types.ModuleType("offline_guard")
fake_offline.prepare_codeformer_weights = lambda _b: None
fake_offline.prepare_gfpgan_helper_weights = lambda _b: None
sys.modules["offline_guard"] = fake_offline

fake_cv2 = types.ModuleType("cv2")
sys.modules["cv2"] = fake_cv2

sys.modules["gfpgan"] = None
try:
    payload = run_main({"model": "gfpgan", "strength": 1.0})
    assert payload == {
        "success": False,
        "error": "Missing dependency: import of gfpgan halted; None in sys.modules. Install with: pip install torch gfpgan codeformer-pip opencv-python numpy",
    }, payload
finally:
    sys.modules.pop("gfpgan", None)

sys.modules["codeformer"] = None
sys.modules["codeformer.app"] = None
try:
    payload = run_main({"model": "codeformer", "strength": 1.0})
    assert payload == {
        "success": False,
        "error": "Missing dependency: import of codeformer.app halted; None in sys.modules. Install with: pip install torch gfpgan codeformer-pip opencv-python numpy",
    }, payload
    assert fake_torch.cuda.is_available is orig_cuda_fn
finally:
    sys.modules.pop("codeformer", None)
    sys.modules.pop("codeformer.app", None)

# 3b. MediaPipe / cv2 / libGL ImportErrors in detect_faces_mediapipe include detail and appropriate hint
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
    def raise_detect(_arr, _s, _exc=detect_exc):
        raise _exc
    mod.detect_faces_mediapipe = raise_detect
    payload = run_main({"model": "gfpgan"})
    assert payload == {"success": False, "error": expected_error}, (detect_exc, payload)

# 4. Downstream GFPGAN / CodeFormer / torch / cv2 / libGL ImportErrors report actual cause, not Pillow
mod.detect_faces_mediapipe = lambda _arr, _s: [{"x": 0, "y": 0, "w": 32, "h": 32}]

for model_name, fn_attr, model_exc, expected_error in (
    (
        "gfpgan",
        "enhance_with_gfpgan",
        ModuleNotFoundError("No module named 'gfpgan'"),
        "Missing dependency: No module named 'gfpgan'. Install with: pip install torch gfpgan codeformer-pip opencv-python numpy",
    ),
    (
        "gfpgan",
        "enhance_with_gfpgan",
        ModuleNotFoundError("No module named 'torch'"),
        "Missing dependency: No module named 'torch'. Install with: pip install torch gfpgan codeformer-pip opencv-python numpy",
    ),
    (
        "codeformer",
        "enhance_with_codeformer",
        ModuleNotFoundError("No module named 'codeformer'"),
        "Missing dependency: No module named 'codeformer'. Install with: pip install torch gfpgan codeformer-pip opencv-python numpy",
    ),
    (
        "codeformer",
        "enhance_with_codeformer",
        ImportError("libGL.so.1: cannot open shared object file"),
        "Missing dependency: libGL.so.1: cannot open shared object file. Fix with: apt-get install -y libgl1",
    ),
    (
        "gfpgan",
        "enhance_with_gfpgan",
        ImportError(),
        "Missing dependency: ImportError. Install with: pip install torch gfpgan codeformer-pip opencv-python numpy",
    ),
    (
        "gfpgan",
        "enhance_with_gfpgan",
        ImportError("   "),
        "Missing dependency: ImportError. Install with: pip install torch gfpgan codeformer-pip opencv-python numpy",
    ),
):
    def raise_model(_arr, _arg, _exc=model_exc):
        raise _exc
    setattr(mod, fn_attr, raise_model)
    payload = run_main({"model": model_name, "strength": 1.0})
    assert payload == {"success": False, "error": expected_error}, (model_name, model_exc, payload)

# 5. In auto mode, CodeFormer ImportError falls back to GFPGAN; if GFPGAN also raises ImportError, reports GFPGAN ImportError
mod.enhance_with_codeformer = lambda _arr, _fid: (_ for _ in ()).throw(ModuleNotFoundError("No module named 'codeformer'"))
mod.enhance_with_gfpgan = lambda _arr, _only_center: (_ for _ in ()).throw(ModuleNotFoundError("No module named 'gfpgan'"))
payload = run_main({"model": "auto", "strength": 1.0})
assert payload == {
    "success": False,
    "error": "Missing dependency: No module named 'gfpgan'. Install with: pip install torch gfpgan codeformer-pip opencv-python numpy",
}, payload

print("ENHANCE_FACES_3625_OK")
`,
          ],
          { encoding: "utf8", timeout: 30_000 },
        );
        expect(res.status, res.stderr).toBe(0);
        expect(res.stdout).toContain("ENHANCE_FACES_3625_OK");
      });

      it("scopes except AttributeError in detect_faces_mediapipe to mp.solutions.face_detection lookup (issue #3626)", () => {
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

spec = importlib.util.spec_from_file_location("enhance_faces_mod_3626", os.path.join(py_dir, "enhance_faces.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
mod._DOCKER_MODEL_PATH = "/tmp/nonexistent-docker-3626.tflite"
mod._LOCAL_MODEL_PATH = "/tmp/nonexistent-local-3626.tflite"

tasks_calls = []
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
        mod.detect_faces_mediapipe(FakeArr(), 0.5)
    except AttributeError as exc:
        assert str(exc) == expected_msg, exc
        assert ensure_model_calls == [], f"_ensure_face_detect_model must not be called: {ensure_model_calls}"
    else:
        raise AssertionError(f"Expected AttributeError from {det_cls.__name__} to propagate")

# 1b. Through main(), AttributeError in detector.process() reports the AttributeError, not the offline model download error
fake_pil = types.ModuleType("PIL")
fake_pil.Image = types.SimpleNamespace(
    open=lambda _p: types.SimpleNamespace(convert=lambda _m: FakeArr()),
)
sys.modules["PIL"] = fake_pil
fake_np = types.ModuleType("numpy")
fake_np.array = lambda _img: FakeArr()
sys.modules["numpy"] = fake_np

sys.argv = ["enhance_faces.py", "/tmp/in.png", "/tmp/out.png", "{}"]
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

# 2. AttributeError during detection result parsing (location_data is None) must propagate directly
class BadResultDetector:
    def __init__(self, **_kwargs):
        pass
    def process(self, _img):
        return types.SimpleNamespace(detections=[types.SimpleNamespace(location_data=None)])
    def close(self):
        pass

fake_mp.solutions.face_detection.FaceDetection = BadResultDetector
try:
    mod.detect_faces_mediapipe(FakeArr(), 0.5)
except AttributeError as exc:
    assert "relative_bounding_box" in str(exc), exc
    assert ensure_model_calls == [], ensure_model_calls
else:
    raise AssertionError("Expected AttributeError from bbox parsing to propagate")

# 3. Positive mp.solutions paths (detections found and no detections found) never touch mp.tasks
class EmptySolutionsDetector:
    def __init__(self, **_kwargs):
        pass
    def process(self, _img):
        return types.SimpleNamespace(detections=None)
    def close(self):
        pass

fake_mp.solutions.face_detection.FaceDetection = EmptySolutionsDetector
assert mod.detect_faces_mediapipe(FakeArr(), 0.5) == []
assert ensure_model_calls == [], ensure_model_calls

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
faces_sol = mod.detect_faces_mediapipe(FakeArr(), 0.5)
assert faces_sol == [{"x": 20, "y": 20, "w": 60, "h": 40}], faces_sol
assert ensure_model_calls == [], ensure_model_calls

# 4. When mp.solutions is missing (or face_detection is missing/None), falls back to mp.tasks
mod._ensure_face_detect_model = lambda: "/tmp/fake-blaze-3626.tflite"
class FakeTasksDetector:
    def detect(self, _mp_image):
        tasks_calls.append(True)
        bbox = types.SimpleNamespace(origin_x=15, origin_y=25, width=50, height=60)
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
    faces_tasks = mod.detect_faces_mediapipe(FakeArr(), 0.5)
    assert faces_tasks == [{"x": 15, "y": 25, "w": 50, "h": 60}], (missing_solutions, faces_tasks)
    assert len(tasks_calls) == 1, (missing_solutions, tasks_calls)

print("ENHANCE_FACES_3626_OK")
`,
          ],
          { encoding: "utf8", timeout: 30_000 },
        );
        expect(res.status, res.stderr).toBe(0);
        expect(res.stdout).toContain("ENHANCE_FACES_3626_OK");
      });

      it("raises RuntimeError on GFPGAN None output, rejects unknown model_choice, and preserves CodeFormer failure detail when auto fallback also fails (issue #3627)", () => {
        const res = spawnSync(
          pythonBin as string,
          [
            "-c",
            `
import contextlib, errno, importlib.util, io, json, os, sys, types, tempfile

py_dir = ${JSON.stringify(pyDir)}
sys.path.insert(0, py_dir)

class FakeArr:
    shape = (64, 64, 3)
    def __getitem__(self, _idx):
        return self
    def copy(self):
        return self
    def astype(self, _dt):
        return self
    def __mul__(self, _other):
        return self
    def __add__(self, _other):
        return self

spec = importlib.util.spec_from_file_location("enhance_faces_mod_3627", os.path.join(py_dir, "enhance_faces.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

orig_dunder_stdout = sys.__stdout__

# 1. enhance_with_gfpgan() raises RuntimeError when GFPGANer.enhance returns None, and returns output when non-None
with tempfile.NamedTemporaryFile(suffix=".pth", delete=False) as tmp_weights:
    tmp_weights_path = tmp_weights.name

try:
    mod.GFPGAN_MODEL_PATH = tmp_weights_path

    fake_torch = types.ModuleType("torch")
    fake_torch.device = lambda d: f"device:{d}"
    sys.modules["torch"] = fake_torch

    fake_gpu = types.ModuleType("gpu")
    fake_gpu.torch_gpu_available = lambda: False
    sys.modules["gpu"] = fake_gpu

    fake_offline = types.ModuleType("offline_guard")
    fake_offline.prepare_gfpgan_helper_weights = lambda _b: None
    sys.modules["offline_guard"] = fake_offline

    enhance_return = [None]
    gfpgan_init_kwargs = []
    gfpgan_enhance_kwargs = []
    class FakeGFPGANer:
        def __init__(self, **kwargs):
            gfpgan_init_kwargs.append(kwargs)
        def enhance(self, img, **kwargs):
            gfpgan_enhance_kwargs.append((img, kwargs))
            return None, None, enhance_return[0]

    fake_gfpgan_mod = types.ModuleType("gfpgan")
    fake_gfpgan_mod.GFPGANer = FakeGFPGANer
    sys.modules["gfpgan"] = fake_gfpgan_mod

    try:
        mod.enhance_with_gfpgan(FakeArr(), True)
    except RuntimeError as exc:
        assert str(exc) == "GFPGAN returned no result (face enhancement may have failed)", exc
        assert len(gfpgan_enhance_kwargs) == 1 and gfpgan_enhance_kwargs[0][1]["only_center_face"] is True
    else:
        raise AssertionError("Expected RuntimeError when GFPGANer.enhance returns None output")

    expected_out = FakeArr()
    enhance_return[0] = expected_out
    out_arr = mod.enhance_with_gfpgan(FakeArr(), False)
    assert out_arr is expected_out

    # Through main(), GFPGAN None output surfaces the specific RuntimeError rather than "no model available"
    fake_pil = types.ModuleType("PIL")
    fake_pil.Image = types.SimpleNamespace(
        open=lambda _p: types.SimpleNamespace(convert=lambda _m: FakeArr()),
        fromarray=lambda _a: types.SimpleNamespace(save=lambda _p: None),
    )
    sys.modules["PIL"] = fake_pil

    fake_np = types.ModuleType("numpy")
    fake_np.float32 = "float32"
    fake_np.uint8 = "uint8"
    fake_np.array = lambda _img: FakeArr()
    fake_np.clip = lambda arr, _lo, _hi: arr
    sys.modules["numpy"] = fake_np

    mod.detect_faces_mediapipe = lambda _arr, _s: [{"x": 0, "y": 0, "w": 32, "h": 32}]

    def run_main_expect_fail(settings):
        sys.argv = ["enhance_faces.py", "/tmp/in.png", "/tmp/out_faces.png", json.dumps(settings)]
        out_buf, err_buf = io.StringIO(), io.StringIO()
        try:
            sys.__stdout__ = out_buf
            with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
                mod.main()
        except SystemExit as exc:
            assert exc.code == 1, exc.code
        else:
            raise AssertionError(f"Expected SystemExit(1), got stdout={out_buf.getvalue()!r}")
        finally:
            sys.__stdout__ = orig_dunder_stdout
        return json.loads(out_buf.getvalue().strip()), err_buf.getvalue()

    enhance_return[0] = None
    payload, _ = run_main_expect_fail({"model": "gfpgan", "strength": 1.0})
    assert payload == {
        "success": False,
        "error": "GFPGAN returned no result (face enhancement may have failed)",
    }, payload

    # In auto mode, when CodeFormer fails and unstubbed enhance_with_gfpgan returns None, both errors are surfaced
    mod.enhance_with_codeformer = lambda _arr, _fid: (_ for _ in ()).throw(
        RuntimeError("CodeFormer returned no result (face detection may have failed)")
    )
    payload_auto_none, _ = run_main_expect_fail({"model": "auto", "strength": 1.0})
    assert payload_auto_none == {
        "success": False,
        "error": "CodeFormer failed (CodeFormer returned no result (face detection may have failed)); GFPGAN fallback also failed (GFPGAN returned no result (face enhancement may have failed))",
    }, payload_auto_none
finally:
    try:
        os.unlink(tmp_weights_path)
    except OSError:
        pass

# 2. Unknown model_choice raises ValueError instead of falling through to "no model available"
for bad_model in ("bogus", "", "realesrgan", None):
    payload, _ = run_main_expect_fail({"model": bad_model})
    assert payload == {
        "success": False,
        "error": f"Unknown face enhancement model: {bad_model}".strip(),
    }, (bad_model, payload)

# 3. In auto mode, when CodeFormer fails with non-OOM and GFPGAN fallback also fails with non-OOM, both errors are surfaced
for cf_exc, gfp_exc, expected_msg in (
    (
        RuntimeError("CodeFormer weights corrupted"),
        FileNotFoundError("GFPGAN model not found: /opt/models/gfpgan/GFPGANv1.3.pth"),
        "CodeFormer failed (CodeFormer weights corrupted); GFPGAN fallback also failed (GFPGAN model not found: /opt/models/gfpgan/GFPGANv1.3.pth)",
    ),
    (
        RuntimeError("CodeFormer weights corrupted"),
        ModuleNotFoundError("No module named 'gfpgan'"),
        "CodeFormer failed (CodeFormer weights corrupted); GFPGAN fallback also failed (No module named 'gfpgan')",
    ),
    (
        RuntimeError(),
        ValueError("   "),
        "CodeFormer failed (RuntimeError); GFPGAN fallback also failed (ValueError)",
    ),
):
    mod.enhance_with_codeformer = lambda _arr, _fid, _e=cf_exc: (_ for _ in ()).throw(_e)
    mod.enhance_with_gfpgan = lambda _arr, _only, _e=gfp_exc: (_ for _ in ()).throw(_e)
    payload, _ = run_main_expect_fail({"model": "auto", "strength": 1.0})
    assert payload == {"success": False, "error": expected_msg}, (cf_exc, gfp_exc, payload)

# 4. In auto mode, if GFPGAN fallback raises an OOM exception, the OOM exception is re-raised directly
for gfp_oom, expected_oom_msg in (
    (MemoryError("GFPGAN OOM"), "GFPGAN OOM"),
    (RuntimeError("CUDA out of memory in GFPGAN"), "CUDA out of memory in GFPGAN"),
    (OSError(errno.ENOMEM, "Cannot allocate memory"), "[Errno 12] Cannot allocate memory"),
):
    mod.enhance_with_codeformer = lambda _arr, _fid: (_ for _ in ()).throw(RuntimeError("CodeFormer non-OOM error"))
    mod.enhance_with_gfpgan = lambda _arr, _only, _e=gfp_oom: (_ for _ in ()).throw(_e)
    payload, _ = run_main_expect_fail({"model": "auto", "strength": 1.0})
    assert payload == {"success": False, "error": expected_oom_msg}, (gfp_oom, payload)

print("ENHANCE_FACES_3627_OK")
`,
          ],
          { encoding: "utf8", timeout: 30_000 },
        );
        expect(res.status, res.stderr).toBe(0);
        expect(res.stdout).toContain("ENHANCE_FACES_3627_OK");
      });
    },
  );
});
