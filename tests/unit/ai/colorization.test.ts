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
import { colorize } from "../../../packages/ai/src/colorization.js";

const FAKE_INPUT = Buffer.from("fake-bw-image");
const FAKE_OUTPUT_DIR = "/tmp/test-colorize";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readFile).mockResolvedValue(Buffer.from("mock-output-data"));
  vi.mocked(writeFile).mockResolvedValue(undefined);
  vi.mocked(runPythonWithProgress).mockResolvedValue({
    stdout: '{"success": true, "width": 800, "height": 600, "method": "deoldify"}',
    stderr: "",
  });
  vi.mocked(parseStdoutJson).mockReturnValue({
    success: true,
    width: 800,
    height: 600,
    method: "deoldify",
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

describe("colorize", () => {
  describe("request serialization", () => {
    it("calls colorize.py with input path, output path, and options JSON", async () => {
      await colorize(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "colorize.py",
        [`${FAKE_OUTPUT_DIR}/input_colorize.png`, `${FAKE_OUTPUT_DIR}/output_colorize.png`, "{}"],
        expect.any(Object),
      );
    });

    it("serializes intensity option", async () => {
      await colorize(FAKE_INPUT, FAKE_OUTPUT_DIR, { intensity: 0.5 });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ intensity: 0.5 });
    });

    it("serializes model option", async () => {
      await colorize(FAKE_INPUT, FAKE_OUTPUT_DIR, { model: "eccv16" });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ model: "eccv16" });
    });

    it("serializes both intensity and model together", async () => {
      await colorize(FAKE_INPUT, FAKE_OUTPUT_DIR, { intensity: 1.0, model: "siggraph17" });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ intensity: 1.0, model: "siggraph17" });
    });

    it("converts input to PNG before writing", async () => {
      await colorize(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(sharp).toHaveBeenCalledWith(FAKE_INPUT);
      expect(writeFile).toHaveBeenCalledWith(
        `${FAKE_OUTPUT_DIR}/input_colorize.png`,
        Buffer.from("mock-png-data"),
      );
    });
  });

  describe("response parsing", () => {
    it("returns ColorizeResult with buffer, width, height, and method", async () => {
      const result = await colorize(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(result).toEqual({
        buffer: expect.any(Buffer),
        width: 800,
        height: 600,
        method: "deoldify",
      });
    });

    it("reads from default output path when output_path not in response", async () => {
      await colorize(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(readFile).toHaveBeenCalledWith(`${FAKE_OUTPUT_DIR}/output_colorize.png`);
    });

    it("reads from alternate output_path when provided by Python", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 800,
        height: 600,
        output_path: "/tmp/alternate-colorized.png",
      });

      await colorize(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(readFile).toHaveBeenCalledWith("/tmp/alternate-colorized.png");
    });

    it("defaults method to 'unknown' when not provided by Python", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 800,
        height: 600,
      });

      const result = await colorize(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.method).toBe("unknown");
    });

    it("preserves width and height from Python response", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 1920,
        height: 1080,
        method: "eccv16",
      });

      const result = await colorize(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);
    });
  });

  describe("error handling", () => {
    it("throws when Python returns success: false with custom error", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: false,
        error: "Input is already a color image",
      });

      await expect(colorize(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
        "Input is already a color image",
      );
    });

    it("classifies OpenCV colorizer OOM error as operational SafeError", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: false,
        error:
          "OpenCV colorizer ran out of memory: [Errno 12] Nicht genügend Hauptspeicher verfügbar. Try a smaller image.",
      });

      await expect(colorize(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toMatchObject({
        message:
          "OpenCV colorizer ran out of memory: [Errno 12] Nicht genügend Hauptspeicher verfügbar. Try a smaller image.",
        kind: "operational",
      });
    });

    it("classifies non-OOM OpenCV colorizer error as bug SafeError", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: false,
        error: "OpenCV colorize models not found: /opt/models/colorize-opencv/pts_in_hull.npy",
      });

      await expect(colorize(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toMatchObject({
        message: "OpenCV colorize models not found: /opt/models/colorize-opencv/pts_in_hull.npy",
        kind: "bug",
      });
    });

    it("throws fallback error when success: false and no error string", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

      await expect(colorize(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("Colorization failed");
    });

    it("propagates bridge rejection", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(
        new Error("Process killed (out of memory)"),
      );

      await expect(colorize(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("out of memory");
    });

    it("propagates parseStdoutJson errors", async () => {
      vi.mocked(parseStdoutJson).mockImplementation(() => {
        throw new SyntaxError("Unexpected token");
      });

      await expect(colorize(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("Unexpected token");
    });
  });

  describe("onProgress forwarding", () => {
    it("passes onProgress callback to bridge", async () => {
      const onProgress = vi.fn();
      await colorize(FAKE_INPUT, FAKE_OUTPUT_DIR, {}, onProgress);

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "colorize.py",
        expect.any(Array),
        expect.objectContaining({ onProgress }),
      );
    });

    it("omits onProgress when not provided", async () => {
      await colorize(FAKE_INPUT, FAKE_OUTPUT_DIR);

      const options = vi.mocked(runPythonWithProgress).mock.calls[0][2];
      expect(options.onProgress).toBeUndefined();
    });

    it("hands the abort signal to the sidecar call", async () => {
      const { signal } = new AbortController();
      await colorize(FAKE_INPUT, FAKE_OUTPUT_DIR, { signal });

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "colorize.py",
        expect.any(Array),
        expect.objectContaining({ signal }),
      );
      // The signal is not a sidecar option and must not reach the script JSON.
      expect(vi.mocked(runPythonWithProgress).mock.calls[0][1][2]).toBe("{}");
    });
  });

  describe("sharp conversion errors", () => {
    it("propagates sharp toBuffer error", async () => {
      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            toBuffer: vi.fn().mockRejectedValue(new Error("Corrupt image data")),
          }) as unknown as ReturnType<typeof sharp>,
      );

      await expect(colorize(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("Corrupt image data");
    });
  });

  describe("edge cases", () => {
    it("passes empty options as empty JSON object", async () => {
      await colorize(FAKE_INPUT, FAKE_OUTPUT_DIR, {});

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({});
    });

    it("handles zero width and height in response", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 0,
        height: 0,
        method: "deoldify",
      });

      const result = await colorize(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.width).toBe(0);
      expect(result.height).toBe(0);
    });
  });

  describe.skipIf(!hasPython)("colorize.py cv2.imwrite return check (issue #3087)", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const pyDir = resolve(here, "../../../packages/ai/python");

    it("exits 1 and reports an error when cv2.imwrite returns False", () => {
      const res = spawnSync(
        pythonBin as string,
        [
          "-c",
          `
import contextlib, importlib.util, io, json, os, sys, types

py_dir = ${JSON.stringify(pyDir)}
sys.path.insert(0, py_dir)

class FakeImg:
    shape = (64, 64, 3)

fake_cv2 = types.ModuleType("cv2")
fake_cv2.IMREAD_COLOR = 1
fake_cv2.imread = lambda _p, _f: FakeImg()
fake_cv2.imwrite = lambda _p, _img: False
sys.modules["cv2"] = fake_cv2
sys.modules["numpy"] = types.ModuleType("numpy")
fake_pil = types.ModuleType("PIL")
fake_pil.Image = types.SimpleNamespace()
sys.modules["PIL"] = fake_pil

spec = importlib.util.spec_from_file_location("colorize_mod", os.path.join(py_dir, "colorize.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

mod.DDCOLOR_MODEL_PATH = os.path.join(py_dir, "colorize.py")
mod.colorize_ddcolor = lambda img, _intensity: (img, "ddcolor")

sys.argv = ["colorize.py", "/tmp/in.png", "/tmp/out_colorize.png", json.dumps({"model": "ddcolor"})]
out_buf, err_buf = io.StringIO(), io.StringIO()
try:
    with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
        mod.main()
except SystemExit as exc:
    assert exc.code == 1, exc.code
    payload = json.loads(out_buf.getvalue().strip())
    assert payload == {
        "success": False,
        "error": "Failed to write output image: /tmp/out_colorize.png",
    }, payload
else:
    raise AssertionError(f"Expected SystemExit(1) when cv2.imwrite returns False, got stdout={out_buf.getvalue()!r}")

fake_cv2.imwrite = lambda _p, _img: True
out_ok, err_ok = io.StringIO(), io.StringIO()
with contextlib.redirect_stdout(out_ok), contextlib.redirect_stderr(err_ok):
    mod.main()
payload_ok = json.loads(out_ok.getvalue().strip())
assert payload_ok["success"] is True, payload_ok
assert payload_ok["output_path"] == "/tmp/out_colorize.png", payload_ok

print("COLORIZE_3087_OK")
`,
        ],
        { encoding: "utf8", timeout: 30_000 },
      );
      expect(res.status, res.stderr).toBe(0);
      expect(res.stdout).toContain("COLORIZE_3087_OK");
    });
  });

  describe.skipIf(!hasPython)("colorize.py DDColor failure messages (issue #3610)", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const pyDir = resolve(here, "../../../packages/ai/python");

    it("distinguishes OOMs, missing models/modules, and broken runtime installs in ddcolor_failure_message and main()", () => {
      const res = spawnSync(
        pythonBin as string,
        [
          "-c",
          `
import contextlib, errno, importlib.util, io, json, os, sys, types

py_dir = ${JSON.stringify(pyDir)}
sys.path.insert(0, py_dir)

class FakeImg:
    shape = (64, 64, 3)

fake_cv2 = types.ModuleType("cv2")
fake_cv2.IMREAD_COLOR = 1
fake_cv2.imread = lambda _p, _f: FakeImg()
fake_cv2.imwrite = lambda _p, _img: True
sys.modules["cv2"] = fake_cv2
sys.modules["numpy"] = types.ModuleType("numpy")
fake_pil = types.ModuleType("PIL")
fake_pil.Image = types.SimpleNamespace()
sys.modules["PIL"] = fake_pil

spec = importlib.util.spec_from_file_location("colorize_mod", os.path.join(py_dir, "colorize.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

# 1) Direct unit checks on is_oom_error and ddcolor_failure_message
for oom_err in (
    MemoryError("Out of host memory"),
    MemoryError(),
    RuntimeError("DefaultCPUAllocator: not enough memory"),
    RuntimeError("CUDA out of memory"),
    RuntimeError("Unable to allocate 1.86 GiB for an array"),
    RuntimeError("Failed to allocate memory for requested buffer"),
    RuntimeError("cudaErrorMemoryAllocation"),
    RuntimeError("CUBLAS_STATUS_ALLOC_FAILED"),
    RuntimeError("std::bad_alloc"),
    OSError(errno.ENOMEM, "Cannot allocate memory"),
    OSError(errno.ENOMEM, "Nicht genügend Hauptspeicher verfügbar"),
):
    assert mod.is_oom_error(oom_err) is True, f"expected is_oom_error({oom_err!r}) to be True"
    oom_msg = mod.ddcolor_failure_message(oom_err)
    assert oom_msg.startswith("DDColor ran out of memory:"), oom_msg
    assert "Try a smaller image or use model=opencv for basic colorization." in oom_msg, oom_msg
    assert "Install the colorize feature" not in oom_msg, oom_msg
    assert "Reinstall" not in oom_msg, oom_msg
    assert "Reset AI Environment" not in oom_msg, oom_msg

assert mod.is_oom_error(RuntimeError("ONNX Runtime failed to load session")) is False
assert mod.is_oom_error(OSError(errno.EACCES, "Permission denied")) is False

# Empty / whitespace-only exception messages fall back to exception class name
assert mod.ddcolor_failure_message(MemoryError()).startswith("DDColor ran out of memory: MemoryError.")
assert mod.ddcolor_failure_message(RuntimeError("   ")).startswith("DDColor is not available: RuntimeError.")

# 2) Missing module or missing weights -> install guidance
for missing_err in (
    FileNotFoundError("DDColor model not found: /opt/models/ddcolor/ddcolor.onnx"),
    ModuleNotFoundError("No module named 'onnxruntime'"),
):
    msg = mod.ddcolor_failure_message(missing_err)
    assert msg.startswith("DDColor is not available:"), msg
    assert "Install the colorize feature, or use model=opencv for basic colorization." in msg, msg
    assert "Reinstall" not in msg, msg

# 3) Broken runtime / dependency conflict -> repair guidance rather than install
for broken_err in (
    ImportError("cannot import name 'InferenceSession' from 'onnxruntime'"),
    RuntimeError("InvalidProtobuf: Protobuf parsing failed"),
    OSError(errno.EACCES, "Permission denied"),
):
    msg = mod.ddcolor_failure_message(broken_err)
    assert msg.startswith("DDColor is not available:"), msg
    assert "Install the colorize feature" not in msg, msg
    assert "Reinstall it from Settings > AI Features" in msg, msg
    assert "Reset AI Environment" in msg, msg
    assert "use model=opencv for basic colorization." in msg, msg

# 4) End-to-end main() behavior for OOM, missing model, and runtime failure
def run_main_expecting_exit1(model_choice="ddcolor"):
    sys.argv = ["colorize.py", "/tmp/in.png", "/tmp/out_colorize.png", json.dumps({"model": model_choice})]
    out_buf, err_buf = io.StringIO(), io.StringIO()
    try:
        with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
            mod.main()
    except SystemExit as exc:
        assert exc.code == 1, exc.code
        return json.loads(out_buf.getvalue().strip())
    raise AssertionError(f"Expected SystemExit(1), got stdout={out_buf.getvalue()!r}")

mod.DDCOLOR_MODEL_PATH = os.path.join(py_dir, "colorize.py")
mod.colorize_ddcolor = lambda _img, _intensity: (_ for _ in ()).throw(
    RuntimeError("DefaultCPUAllocator: not enough memory")
)
oom_payload = run_main_expecting_exit1("auto")
assert oom_payload == {
    "success": False,
    "error": (
        "DDColor ran out of memory: DefaultCPUAllocator: not enough memory. "
        "Try a smaller image or use model=opencv for basic colorization."
    ),
}, oom_payload

mod.colorize_ddcolor = lambda _img, _intensity: (_ for _ in ()).throw(
    RuntimeError("InvalidGraph: node input missing")
)
broken_payload = run_main_expecting_exit1("ddcolor")
assert broken_payload["success"] is False
assert broken_payload["error"].startswith("DDColor is not available: InvalidGraph: node input missing."), broken_payload
assert "Install the colorize feature" not in broken_payload["error"], broken_payload
assert "Reinstall it from Settings > AI Features" in broken_payload["error"], broken_payload

mod.DDCOLOR_MODEL_PATH = "/tmp/nonexistent-ddcolor-weights-3610.onnx"
missing_payload = run_main_expecting_exit1("auto")
assert missing_payload["success"] is False
assert "Install the colorize feature" in missing_payload["error"], missing_payload

# 5) Deferred _IMPORT_ERROR guard in main()
mod._IMPORT_ERROR = ImportError("libGL.so.1: cannot open shared object file")
libgl_payload = run_main_expecting_exit1("ddcolor")
assert libgl_payload == {
    "success": False,
    "error": "Missing dependency: libGL.so.1: cannot open shared object file. Fix with: apt-get install -y libgl1",
}, libgl_payload

mod._IMPORT_ERROR = ImportError("No module named 'cv2'")
cv2_payload = run_main_expecting_exit1("ddcolor")
assert cv2_payload == {
    "success": False,
    "error": "Missing dependency: No module named 'cv2'. Install opencv-python-headless, numpy, and Pillow.",
}, cv2_payload
mod._IMPORT_ERROR = None

print("COLORIZE_3610_OK")
`,
        ],
        { encoding: "utf8", timeout: 30_000 },
      );
      expect(res.status, res.stderr).toBe(0);
      expect(res.stdout).toContain("COLORIZE_3610_OK");
    });
  });

  describe.skipIf(!hasPython)(
    "colorize.py model=opencv preflight and OOM messages (issue #3617)",
    () => {
      const here = dirname(fileURLToPath(import.meta.url));
      const pyDir = resolve(here, "../../../packages/ai/python");

      it("checks OPENCV_POINTS_PATH in preflight and formats OpenCV OOMs as operational out-of-memory errors", () => {
        const res = spawnSync(
          pythonBin as string,
          [
            "-c",
            `
import contextlib, errno, importlib.util, io, json, os, sys, tempfile, types

py_dir = ${JSON.stringify(pyDir)}
sys.path.insert(0, py_dir)

class FakeImg:
    shape = (64, 64, 3)

fake_cv2 = types.ModuleType("cv2")
fake_cv2.IMREAD_COLOR = 1
fake_cv2.imread = lambda _p, _f: FakeImg()
fake_cv2.imwrite = lambda _p, _img: True
fake_cv2.dnn = types.SimpleNamespace(readNetFromCaffe=lambda _p, _m: None)
sys.modules["cv2"] = fake_cv2

fake_np = types.ModuleType("numpy")
def fake_np_load(path):
    open(path, "rb").close()
    raise AssertionError("unexpected")
fake_np.load = fake_np_load
sys.modules["numpy"] = fake_np

fake_pil = types.ModuleType("PIL")
fake_pil.Image = types.SimpleNamespace()
sys.modules["PIL"] = fake_pil

spec = importlib.util.spec_from_file_location("colorize_mod", os.path.join(py_dir, "colorize.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

def run_opencv_expecting_exit1():
    sys.argv = ["colorize.py", "/tmp/in.png", "/tmp/out_colorize.png", json.dumps({"model": "opencv"})]
    out_buf, err_buf = io.StringIO(), io.StringIO()
    try:
        with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
            mod.main()
    except SystemExit as exc:
        assert exc.code == 1, exc.code
        return json.loads(out_buf.getvalue().strip()), err_buf.getvalue()
    raise AssertionError(f"Expected SystemExit(1), got stdout={out_buf.getvalue()!r}")

with tempfile.TemporaryDirectory() as tmpdir:
    proto = os.path.join(tmpdir, "colorization_deploy_v2.prototxt")
    model = os.path.join(tmpdir, "colorization_release_v2.caffemodel")
    points = os.path.join(tmpdir, "pts_in_hull.npy")

    # 1) Proto and caffemodel exist, but pts_in_hull.npy is missing
    open(proto, "wb").close()
    open(model, "wb").close()
    mod.OPENCV_PROTO_PATH = proto
    mod.OPENCV_MODEL_PATH = model
    mod.OPENCV_POINTS_PATH = points

    missing_pts_payload, _ = run_opencv_expecting_exit1()
    assert missing_pts_payload == {
        "success": False,
        "error": f"OpenCV colorize models not found: {points}",
    }, missing_pts_payload

    # 1b) Proto and pts_in_hull.npy exist, but caffemodel is missing (does not falsely blame proto)
    os.remove(model)
    open(points, "wb").close()
    missing_model_payload, _ = run_opencv_expecting_exit1()
    assert missing_model_payload == {
        "success": False,
        "error": f"OpenCV colorize models not found: {model}",
    }, missing_model_payload

    # 2) All three missing -> lists all three in order
    os.remove(proto)
    os.remove(points)
    missing_all_payload, _ = run_opencv_expecting_exit1()
    assert missing_all_payload == {
        "success": False,
        "error": f"OpenCV colorize models not found: {proto}, {model}, {points}",
    }, missing_all_payload

    # 3) All three present; localized ENOMEM and bare MemoryError() format as OpenCV colorizer OOM
    for p in (proto, model, points):
        open(p, "wb").close()

    localized_enomem = OSError(errno.ENOMEM, "Nicht genügend Hauptspeicher verfügbar")
    mod.colorize_opencv = lambda _img, _intensity: (_ for _ in ()).throw(localized_enomem)
    enomem_payload, enomem_stderr = run_opencv_expecting_exit1()
    assert enomem_payload == {
        "success": False,
        "error": f"OpenCV colorizer ran out of memory: {localized_enomem}. Try a smaller image.",
    }, enomem_payload
    assert "[colorize] OpenCV failed:" in enomem_stderr, enomem_stderr

    mod.colorize_opencv = lambda _img, _intensity: (_ for _ in ()).throw(MemoryError())
    mem_payload, _ = run_opencv_expecting_exit1()
    assert mem_payload == {
        "success": False,
        "error": "OpenCV colorizer ran out of memory: MemoryError. Try a smaller image.",
    }, mem_payload

    # 4) Non-OOM exception preserves error message (or exception type when message is blank)
    mod.colorize_opencv = lambda _img, _intensity: (_ for _ in ()).throw(
        RuntimeError("OpenCV DNN failed to parse Caffe prototxt")
    )
    non_oom_payload, _ = run_opencv_expecting_exit1()
    assert non_oom_payload == {
        "success": False,
        "error": "OpenCV DNN failed to parse Caffe prototxt",
    }, non_oom_payload

    mod.colorize_opencv = lambda _img, _intensity: (_ for _ in ()).throw(RuntimeError("   "))
    blank_non_oom_payload, blank_stderr = run_opencv_expecting_exit1()
    assert blank_non_oom_payload == {
        "success": False,
        "error": "RuntimeError",
    }, blank_non_oom_payload
    assert "[colorize] OpenCV failed: RuntimeError" in blank_stderr, blank_stderr

    # 5) Happy path when all three files exist
    mod.colorize_opencv = lambda img, _intensity: (img, "opencv")
    sys.argv = ["colorize.py", "/tmp/in.png", "/tmp/out_colorize.png", json.dumps({"model": "opencv"})]
    out_ok, err_ok = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out_ok), contextlib.redirect_stderr(err_ok):
        mod.main()
    ok_payload = json.loads(out_ok.getvalue().strip())
    assert ok_payload == {
        "success": True,
        "width": 64,
        "height": 64,
        "method": "opencv",
        "output_path": "/tmp/out_colorize.png",
    }, ok_payload

print("COLORIZE_3617_OK")
`,
          ],
          { encoding: "utf8", timeout: 30_000 },
        );
        expect(res.status, res.stderr).toBe(0);
        expect(res.stdout).toContain("COLORIZE_3617_OK");
      });
    },
  );
});
