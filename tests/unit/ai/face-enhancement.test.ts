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

  describe.skipIf(!hasPython)("enhance_faces.py cv2.imwrite return check (issue #3087)", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const pyDir = resolve(here, "../../../packages/ai/python");

    it("raises RuntimeError and cleans up the temporary file when cv2.imwrite returns False in enhance_with_codeformer", () => {
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

# Positive path: when cv2.imwrite returns True, enhance_with_codeformer invokes inference_app and still unlinks tmp_in_path
attempted_paths.clear()
inference_calls.clear()
def ok_imwrite(path, _img):
    attempted_paths.append(path)
    return True
fake_cv2.imwrite = ok_imwrite
restored = mod.enhance_with_codeformer(FakeArr(), 0.5)
assert restored is not None
assert len(attempted_paths) == 1, attempted_paths
assert len(inference_calls) == 1 and inference_calls[0]["image"] == attempted_paths[0], inference_calls
assert not os.path.exists(attempted_paths[0]), f"temp file should be cleaned up after enhance_with_codeformer succeeds: {attempted_paths[0]}"

print("ENHANCE_FACES_3087_OK")
`,
        ],
        { encoding: "utf8", timeout: 30_000 },
      );
      expect(res.status, res.stderr).toBe(0);
      expect(res.stdout).toContain("ENHANCE_FACES_3087_OK");
    });
  });
});
