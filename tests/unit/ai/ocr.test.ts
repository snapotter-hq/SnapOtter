import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasPython, pythonBin } from "../../helpers/python-gate.js";

vi.mock("sharp", () => ({
  default: vi.fn(() => ({
    png: vi.fn().mockReturnThis(),
    toFile: vi.fn().mockResolvedValue({ size: 3 }),
    metadata: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
  })),
}));

vi.mock("../../../packages/ai/src/ocr-runtime-dispatcher.js", () => ({
  runOcrRuntime: vi.fn(),
}));

vi.mock("../../../packages/ai/src/tesseract.js", () => ({
  runAdaptiveTesseract: vi.fn(),
  runTesseract: vi.fn(),
}));

import sharp from "sharp";
import { extractText } from "../../../packages/ai/src/ocr.js";
import { runOcrRuntime } from "../../../packages/ai/src/ocr-runtime-dispatcher.js";
import { runAdaptiveTesseract } from "../../../packages/ai/src/tesseract.js";

const INPUT = Buffer.from("image");

function runtimeResponse(result: unknown) {
  return {
    result,
    stderr: "",
    runtime: {
      generation: "ocr-runtime-1",
      artifactVersion: "1.0.0",
      target: "linux-amd64-cpu-py312" as const,
      providers: ["CPUExecutionProvider"],
      models: { detection: "sha256:detection" },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(sharp).mockImplementation(
    () =>
      ({
        png: vi.fn().mockReturnThis(),
        toFile: vi.fn().mockResolvedValue({ size: 3 }),
        metadata: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
      }) as unknown as ReturnType<typeof sharp>,
  );
  vi.mocked(runAdaptiveTesseract).mockResolvedValue({
    text: "text",
    engine: "tesseract",
    provider: "native",
    device: "cpu",
  });
  vi.mocked(runOcrRuntime).mockResolvedValue(
    runtimeResponse({
      success: true,
      text: "text",
      engine: "rapidocr-onnx",
      requestedQuality: "balanced",
      actualQuality: "balanced",
      device: "cpu",
      provider: "CPUExecutionProvider",
      degraded: false,
      warnings: [],
    }),
  );
});

describe("extractText error and progress behavior", () => {
  it("forwards progress and the AbortSignal to Tesseract", async () => {
    const onProgress = vi.fn();
    const controller = new AbortController();

    await extractText(
      INPUT,
      "/tmp/ocr",
      { quality: "fast", language: "ja", signal: controller.signal },
      onProgress,
    );

    expect(runAdaptiveTesseract).toHaveBeenCalledWith(
      "/tmp/ocr/input_ocr.png",
      expect.objectContaining({
        language: "ja",
        signal: controller.signal,
        timeoutMs: 600_000,
        maxStdoutBytes: 1_000_000,
        onProgress: expect.any(Function),
      }),
    );
    const relayedProgress = vi.mocked(runAdaptiveTesseract).mock.calls[0]?.[1].onProgress;
    relayedProgress?.(42, "Recognizing text");
    expect(onProgress).toHaveBeenCalledWith(42, "Recognizing text");
  });

  it("rejects explicit Korean Fast OCR before image processing or Tesseract dispatch", async () => {
    await expect(
      extractText(INPUT, "/tmp/ocr", { quality: "fast", language: "ko" }),
    ).rejects.toThrow(
      "Fast OCR does not support Korean. Install the Accurate OCR bundle and choose Balanced or Best.",
    );

    expect(sharp).not.toHaveBeenCalled();
    expect(runAdaptiveTesseract).not.toHaveBeenCalled();
    expect(runOcrRuntime).not.toHaveBeenCalled();
  });

  it("rejects explicit Arabic Fast OCR before image processing or Tesseract dispatch", async () => {
    await expect(
      extractText(INPUT, "/tmp/ocr", { quality: "fast", language: "ar" }),
    ).rejects.toThrow(
      "Fast OCR does not support Arabic. Install the Accurate OCR bundle and choose Balanced or Best.",
    );

    expect(sharp).not.toHaveBeenCalled();
    expect(runAdaptiveTesseract).not.toHaveBeenCalled();
    expect(runOcrRuntime).not.toHaveBeenCalled();
  });

  it.each(["balanced", "best"] as const)(
    "keeps explicit Arabic on the %s accurate tier without silent rerouting",
    async (quality) => {
      vi.mocked(runOcrRuntime).mockResolvedValueOnce(
        runtimeResponse({
          success: true,
          text: "مرحبا بالعالم",
          engine: "rapidocr-onnx",
          requestedQuality: quality,
          actualQuality: quality,
          device: "cpu",
          provider: "CPUExecutionProvider",
          degraded: false,
          warnings: [],
        }),
      );

      const result = await extractText(INPUT, "/tmp/ocr", { quality, language: "ar" });

      expect(result.text).toBe("مرحبا بالعالم");
      expect(result.requestedQuality).toBe(quality);
      expect(result.actualQuality).toBe(quality);
      expect(runAdaptiveTesseract).not.toHaveBeenCalled();
      expect(runOcrRuntime).toHaveBeenCalledTimes(1);
      const runtimeOptions = JSON.parse(
        vi.mocked(runOcrRuntime).mock.calls[0]?.[1][1] ?? "null",
      ) as Record<string, unknown>;
      expect(runtimeOptions).toMatchObject({ language: "ar", quality });
    },
  );

  it.each(["balanced", "best"] as const)(
    "keeps explicit Korean on the %s accurate tier without silent rerouting",
    async (quality) => {
      vi.mocked(runOcrRuntime).mockResolvedValueOnce(
        runtimeResponse({
          success: true,
          text: "한글",
          engine: "rapidocr-onnx",
          requestedQuality: quality,
          actualQuality: quality,
          device: "cpu",
          provider: "CPUExecutionProvider",
          degraded: false,
          warnings: [],
        }),
      );

      const result = await extractText(INPUT, "/tmp/ocr", { quality, language: "ko" });

      expect(result.requestedQuality).toBe(quality);
      expect(result.actualQuality).toBe(quality);
      expect(runAdaptiveTesseract).not.toHaveBeenCalled();
      expect(runOcrRuntime).toHaveBeenCalledTimes(1);
      const runtimeOptions = JSON.parse(
        vi.mocked(runOcrRuntime).mock.calls[0]?.[1][1] ?? "null",
      ) as Record<string, unknown>;
      expect(runtimeOptions).toMatchObject({ language: "ko", quality });
    },
  );

  it("applies requested local-contrast preprocessing for Fast OCR", async () => {
    const recognitionPipeline = {
      clahe: vi.fn().mockReturnThis(),
      png: vi.fn().mockReturnThis(),
      toFile: vi.fn().mockResolvedValue({ size: 12 }),
    };
    const pipeline = {
      clone: vi.fn(() => recognitionPipeline),
      png: vi.fn().mockReturnThis(),
      toFile: vi.fn().mockResolvedValue({ size: 12 }),
      metadata: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
    };
    vi.mocked(sharp).mockReturnValueOnce(pipeline as unknown as ReturnType<typeof sharp>);

    await extractText(INPUT, "/tmp/ocr", { quality: "fast", enhance: true });

    expect(recognitionPipeline.clahe).toHaveBeenCalledWith({
      height: 75,
      maxSlope: 2,
      width: 100,
    });
    expect(pipeline.toFile).toHaveBeenCalledWith("/tmp/ocr/input_ocr.png");
    expect(recognitionPipeline.toFile).toHaveBeenCalledWith("/tmp/ocr/input_ocr_recognition.png");
  });

  it("automatically restores contrast on faint low-resolution Fast inputs", async () => {
    const statsPipeline = {
      grayscale: vi.fn().mockReturnThis(),
      stats: vi.fn().mockResolvedValue({
        channels: [{ mean: 225, stdev: 15 }],
      }),
    };
    const recognitionPipeline = {
      grayscale: vi.fn().mockReturnThis(),
      linear: vi.fn().mockReturnThis(),
      png: vi.fn().mockReturnThis(),
      toFile: vi.fn().mockResolvedValue({ size: 12 }),
    };
    const pipeline = {
      clone: vi.fn().mockReturnValueOnce(statsPipeline).mockReturnValueOnce(recognitionPipeline),
      metadata: vi.fn().mockResolvedValue({ width: 450, height: 640 }),
      png: vi.fn().mockReturnThis(),
      toFile: vi.fn().mockResolvedValue({ size: 12 }),
    };
    vi.mocked(sharp).mockReturnValueOnce(pipeline as unknown as ReturnType<typeof sharp>);

    const result = await extractText(INPUT, "/tmp/ocr", { quality: "fast" });

    expect(recognitionPipeline.linear).toHaveBeenCalledWith(4, -650);
    expect(runAdaptiveTesseract).toHaveBeenCalledWith(
      "/tmp/ocr/input_ocr.png",
      expect.objectContaining({
        blockLayoutOnly: true,
        recognitionInputPath: "/tmp/ocr/input_ocr_recognition.png",
      }),
    );
    expect(result.warnings).toContain("Applied automatic low-contrast OCR preprocessing.");
  });

  it("does not alter ordinary low-resolution Fast inputs", async () => {
    const statsPipeline = {
      grayscale: vi.fn().mockReturnThis(),
      stats: vi.fn().mockResolvedValue({
        channels: [{ mean: 138, stdev: 91 }],
      }),
    };
    const pipeline = {
      clone: vi.fn(() => statsPipeline),
      linear: vi.fn().mockReturnThis(),
      metadata: vi.fn().mockResolvedValue({ width: 432, height: 648 }),
      png: vi.fn().mockReturnThis(),
      toFile: vi.fn().mockResolvedValue({ size: 12 }),
    };
    vi.mocked(sharp).mockReturnValueOnce(pipeline as unknown as ReturnType<typeof sharp>);

    const result = await extractText(INPUT, "/tmp/ocr", { quality: "fast" });

    expect(pipeline.linear).not.toHaveBeenCalled();
    expect(result.warnings).toEqual([]);
  });

  it("prepares two bounded horizontal fallback tiles for large CJK scene text", async () => {
    const sourcePipeline = {
      metadata: vi.fn().mockResolvedValue({ width: 4_000, height: 3_000 }),
      png: vi.fn().mockReturnThis(),
      toFile: vi.fn().mockResolvedValue({ size: 12 }),
    };
    const tilePipelines = Array.from({ length: 2 }, () => ({
      extract: vi.fn().mockReturnThis(),
      png: vi.fn().mockReturnThis(),
      toFile: vi.fn().mockResolvedValue({ size: 12 }),
    }));
    vi.mocked(sharp)
      .mockReturnValueOnce(sourcePipeline as unknown as ReturnType<typeof sharp>)
      .mockReturnValueOnce(tilePipelines[0] as unknown as ReturnType<typeof sharp>)
      .mockReturnValueOnce(tilePipelines[1] as unknown as ReturnType<typeof sharp>);

    await extractText(INPUT, "/tmp/ocr", { quality: "fast", language: "ja" });
    const fallbackInputProvider =
      vi.mocked(runAdaptiveTesseract).mock.calls[0]?.[1].fallbackInputProvider;
    await expect(fallbackInputProvider?.()).resolves.toEqual([
      "/tmp/ocr/input_ocr_scene_upper.png",
      "/tmp/ocr/input_ocr_scene_lower.png",
    ]);

    expect(tilePipelines[0].extract).toHaveBeenCalledWith({
      height: 1_500,
      left: 0,
      top: 0,
      width: 4_000,
    });
    expect(tilePipelines[1].extract).toHaveBeenCalledWith({
      height: 1_500,
      left: 0,
      top: 1_500,
      width: 4_000,
    });
    expect(runAdaptiveTesseract).toHaveBeenCalledWith(
      "/tmp/ocr/input_ocr.png",
      expect.objectContaining({
        fallbackInputProvider: expect.any(Function),
      }),
    );
  });

  it("lazily prepares a bounded dense-board enhancement for small CJK scenes", async () => {
    const sourcePipeline = {
      metadata: vi.fn().mockResolvedValue({ width: 1_200, height: 1_600 }),
      png: vi.fn().mockReturnThis(),
      toFile: vi.fn().mockResolvedValue({ size: 12 }),
    };
    const densePipeline = {
      grayscale: vi.fn().mockReturnThis(),
      clahe: vi.fn().mockReturnThis(),
      sharpen: vi.fn().mockReturnThis(),
      png: vi.fn().mockReturnThis(),
      toFile: vi.fn().mockResolvedValue({ size: 12 }),
    };
    vi.mocked(sharp)
      .mockReturnValueOnce(sourcePipeline as unknown as ReturnType<typeof sharp>)
      .mockReturnValueOnce(densePipeline as unknown as ReturnType<typeof sharp>);

    await extractText(INPUT, "/tmp/ocr", { quality: "fast", language: "ja" });
    const denseCjkInputProvider =
      vi.mocked(runAdaptiveTesseract).mock.calls[0]?.[1].denseCjkInputProvider;
    expect(denseCjkInputProvider).toEqual(expect.any(Function));
    expect(densePipeline.grayscale).not.toHaveBeenCalled();

    await expect(denseCjkInputProvider?.()).resolves.toBe("/tmp/ocr/input_ocr_dense_cjk.png");
    expect(sharp).toHaveBeenLastCalledWith("/tmp/ocr/input_ocr.png");
    expect(densePipeline.grayscale).toHaveBeenCalledTimes(1);
    expect(densePipeline.clahe).toHaveBeenCalledWith({
      height: 200,
      maxSlope: 2,
      width: 150,
    });
    expect(densePipeline.sharpen).toHaveBeenCalledWith({ sigma: 1 });
    expect(densePipeline.toFile).toHaveBeenCalledWith("/tmp/ocr/input_ocr_dense_cjk.png");
  });

  it("does not offer dense-board preprocessing outside its bounded CJK gate", async () => {
    vi.mocked(sharp).mockImplementation(
      () =>
        ({
          png: vi.fn().mockReturnThis(),
          toFile: vi.fn().mockResolvedValue({ size: 3 }),
          metadata: vi.fn().mockResolvedValue({ width: 1_200, height: 1_600 }),
        }) as unknown as ReturnType<typeof sharp>,
    );

    await extractText(INPUT, "/tmp/ocr", { quality: "fast", language: "en" });

    expect(runAdaptiveTesseract).toHaveBeenCalledWith(
      expect.any(String),
      expect.not.objectContaining({ denseCjkInputProvider: expect.anything() }),
    );
  });

  it("does not prepare CJK scene tiles for an explicit Latin language", async () => {
    vi.mocked(sharp).mockImplementation(
      () =>
        ({
          png: vi.fn().mockReturnThis(),
          toFile: vi.fn().mockResolvedValue({ size: 3 }),
          metadata: vi.fn().mockResolvedValue({ width: 4_000, height: 3_000 }),
        }) as unknown as ReturnType<typeof sharp>,
    );

    await extractText(INPUT, "/tmp/ocr", { quality: "fast", language: "en" });

    expect(sharp).toHaveBeenCalledTimes(1);
    expect(runAdaptiveTesseract).toHaveBeenCalledWith(
      expect.any(String),
      expect.not.objectContaining({ fallbackInputPaths: expect.anything() }),
    );
  });

  it("uses a megapixel-scaled timeout for very large images", async () => {
    vi.mocked(sharp).mockImplementation(
      () =>
        ({
          png: vi.fn().mockReturnThis(),
          toFile: vi.fn().mockResolvedValue({ size: 3 }),
          metadata: vi.fn().mockResolvedValue({ width: 6_000, height: 6_000 }),
        }) as unknown as ReturnType<typeof sharp>,
    );

    await extractText(INPUT, "/tmp/ocr", { quality: "fast", language: "en" });

    expect(runAdaptiveTesseract).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ timeoutMs: 1_080_000 }),
    );
  });

  it("rejects pathological image sides before conversion or detector tiling", async () => {
    const toFile = vi.fn().mockResolvedValue({ size: 3 });
    vi.mocked(sharp).mockImplementation(
      () =>
        ({
          png: vi.fn().mockReturnThis(),
          toFile,
          metadata: vi.fn().mockResolvedValue({ width: 40_001, height: 1 }),
        }) as unknown as ReturnType<typeof sharp>,
    );

    await expect(extractText(INPUT, "/tmp/ocr", { quality: "best" })).rejects.toThrow(
      "dimension safety limit",
    );
    expect(toFile).not.toHaveBeenCalled();
    expect(runOcrRuntime).not.toHaveBeenCalled();
    expect(runAdaptiveTesseract).not.toHaveBeenCalled();
  });

  it("propagates image conversion failures", async () => {
    vi.mocked(sharp).mockImplementation(
      () =>
        ({
          png: vi.fn().mockReturnThis(),
          toFile: vi.fn().mockRejectedValue(new Error("invalid pixels")),
          metadata: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
        }) as unknown as ReturnType<typeof sharp>,
    );

    await expect(extractText(INPUT, "/tmp/ocr")).rejects.toThrow("invalid pixels");
  });

  it("propagates scratch write failures", async () => {
    vi.mocked(sharp).mockImplementationOnce(
      () =>
        ({
          png: vi.fn().mockReturnThis(),
          toFile: vi.fn().mockRejectedValue(new Error("disk full")),
          metadata: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
        }) as unknown as ReturnType<typeof sharp>,
    );

    await expect(extractText(INPUT, "/tmp/ocr")).rejects.toThrow("disk full");
    expect(runAdaptiveTesseract).not.toHaveBeenCalled();
  });

  it("propagates Tesseract cancellation and process failures", async () => {
    const error = new Error("Tesseract OCR was canceled");
    error.name = "AbortError";
    vi.mocked(runAdaptiveTesseract).mockRejectedValueOnce(error);

    await expect(extractText(INPUT, "/tmp/ocr", { quality: "fast" })).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("propagates accurate-runtime transport failures without retrying", async () => {
    vi.mocked(runOcrRuntime).mockRejectedValueOnce(new Error("OCR runtime exited unexpectedly"));

    await expect(extractText(INPUT, "/tmp/ocr", { quality: "balanced" })).rejects.toThrow(
      "exited unexpectedly",
    );
    expect(runOcrRuntime).toHaveBeenCalledTimes(1);
    expect(runAdaptiveTesseract).not.toHaveBeenCalled();
  });

  it("emits progress heartbeats while the accurate runtime is busy", async () => {
    vi.useFakeTimers();
    let finishRuntime: ((value: ReturnType<typeof runtimeResponse>) => void) | undefined;
    vi.mocked(runOcrRuntime).mockReturnValueOnce(
      new Promise((resolve) => {
        finishRuntime = resolve;
      }),
    );
    const onProgress = vi.fn();

    try {
      const pending = extractText(INPUT, "/tmp/ocr", { quality: "balanced" }, onProgress);
      await vi.advanceTimersByTimeAsync(0);
      expect(onProgress).toHaveBeenCalledWith(10, "Starting accurate OCR");

      await vi.advanceTimersByTimeAsync(30_000);
      expect(onProgress).toHaveBeenCalledWith(10, "Running accurate OCR");

      finishRuntime?.(
        runtimeResponse({
          success: true,
          text: "text",
          engine: "rapidocr-onnx",
          requestedQuality: "balanced",
          actualQuality: "balanced",
          device: "cpu",
          provider: "CPUExecutionProvider",
          degraded: false,
          warnings: [],
        }),
      );
      await pending;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("throws a SafeError when the accurate runtime reports a tier mismatch", async () => {
    vi.mocked(runOcrRuntime).mockResolvedValueOnce(
      runtimeResponse({
        success: true,
        text: "hello",
        engine: "paddle",
        requestedQuality: "best",
        actualQuality: "fast",
        device: "cpu",
        provider: "none",
        degraded: false,
        warnings: [],
      }),
    );

    const promise = extractText(INPUT, "/tmp/ocr", { quality: "best" });
    const err = await promise.catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.isSafeMessage).toBe(true);
    expect(err.kind).toBe("bug");
    expect(err.code).toBe("OCR_RUNTIME_MISMATCH");
    expect(err.statusCode).toBe(500);
    expect(err.cause).toBeInstanceOf(Error);
    expect(err.cause.message).toBe("requested best, reported best/fast");
  });

  it("propagates malformed accurate-runtime output", async () => {
    vi.mocked(runOcrRuntime).mockResolvedValueOnce(runtimeResponse("not an object"));
    const promise1 = extractText(INPUT, "/tmp/ocr", { quality: "balanced" });
    await expect(promise1).rejects.toMatchObject({
      isSafeMessage: true,
      kind: "bug",
      code: "OCR_RUNTIME_INVALID_METADATA",
      statusCode: 500,
    });

    vi.mocked(runOcrRuntime).mockResolvedValueOnce(runtimeResponse({ success: true }));
    const promise2 = extractText(INPUT, "/tmp/ocr", { quality: "balanced" });
    await expect(promise2).rejects.toMatchObject({
      isSafeMessage: true,
      kind: "bug",
      code: "OCR_RUNTIME_INVALID_METADATA",
      statusCode: 500,
    });
  });

  it("preserves multiline Unicode text", async () => {
    vi.mocked(runAdaptiveTesseract).mockResolvedValueOnce({
      text: "こんにちは\n안녕하세요\n你好",
      engine: "tesseract",
      provider: "native",
      device: "cpu",
    });

    const result = await extractText(INPUT, "/tmp/ocr", { quality: "fast" });
    expect(result.text).toBe("こんにちは\n안녕하세요\n你好");
  });

  describe.skipIf(!hasPython)("ocr_preprocess.py sidecar script", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const pyDir = resolve(here, "../../../packages/ai/python");
    const fakeCv2Bootstrap = `
import importlib.util, os, sys, types

py_dir = ${JSON.stringify(pyDir)}
sys.path.insert(0, py_dir)

class FakeImg:
    shape = (64, 64, 3)

fake_cv2 = types.ModuleType("cv2")
fake_cv2.COLOR_BGR2GRAY = 6
fake_cv2.COLOR_GRAY2BGR = 8
fake_cv2.COLOR_BGR2LAB = 44
fake_cv2.COLOR_LAB2BGR = 56
fake_cv2.ADAPTIVE_THRESH_GAUSSIAN_C = 1
fake_cv2.THRESH_BINARY = 0
fake_cv2.imread = lambda _p: FakeImg()
fake_cv2.imwrite = lambda _p, _img: True
fake_cv2.cvtColor = lambda img, _c: img
fake_cv2.Canny = lambda _g, _a, _b, apertureSize=3: FakeImg()
fake_cv2.HoughLinesP = lambda *_a, **_k: None
fake_cv2.split = lambda img: (img, img, img)
fake_cv2.merge = lambda chs: chs[0]
fake_cv2.createCLAHE = lambda **_k: types.SimpleNamespace(apply=lambda ch: ch)
fake_cv2.bilateralFilter = lambda img, *_a: img
fake_cv2.adaptiveThreshold = lambda img, *_a: img
sys.modules["cv2"] = fake_cv2

fake_np = types.ModuleType("numpy")
fake_np.pi = 3.141592653589793
sys.modules["numpy"] = fake_np
`;

    it("raises RuntimeError when cv2.imwrite returns False in preprocess() (issue #3087)", () => {
      const res = spawnSync(
        pythonBin as string,
        [
          "-c",
          `${fakeCv2Bootstrap}
fake_cv2.imwrite = lambda _p, _img: False

spec = importlib.util.spec_from_file_location("ocr_preprocess_mod", os.path.join(py_dir, "ocr_preprocess.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

try:
    mod.preprocess("/tmp/in_ocr.png", "/tmp/out_ocr.png")
except RuntimeError as exc:
    assert str(exc) == "Failed to write output image: /tmp/out_ocr.png", exc
else:
    raise AssertionError("Expected RuntimeError when cv2.imwrite returns False in ocr_preprocess.preprocess")

fake_cv2.imwrite = lambda _p, _img: True
assert mod.preprocess("/tmp/in_ocr.png", "/tmp/out_ocr.png") == "/tmp/out_ocr.png"

print("OCR_PREPROCESS_3087_OK")
`,
        ],
        { encoding: "utf8", timeout: 30_000 },
      );
      expect(res.status, res.stderr).toBe(0);
      expect(res.stdout).toContain("OCR_PREPROCESS_3087_OK");
    });

    it("executes main() on __main__ dispatch and returns JSON on success and failure (issue #3420)", () => {
      const res = spawnSync(
        pythonBin as string,
        [
          "-c",
          `${fakeCv2Bootstrap}
import io, json

read_paths = []
written_paths = []

def _imread(p):
    read_paths.append(p)
    return FakeImg()

def _imwrite(p, _img):
    written_paths.append(p)
    return True

fake_cv2.imread = _imread
fake_cv2.imwrite = _imwrite

for mod_name in ("PIL", "mediapipe", "gpu", "rembg", "torchvision", "torchvision.transforms", "torchvision.transforms.functional_tensor"):
    sys.modules[mod_name] = types.ModuleType(mod_name)

os.environ.pop("DISPATCHER_PROFILE", None)
import dispatcher
assert "ocr_preprocess" in dispatcher.ALLOWED_SCRIPTS, dispatcher.ALLOWED_SCRIPTS

# 1. Success via dispatcher._run_script_main using real ALLOWED_SCRIPTS
out, code = dispatcher._run_script_main("ocr_preprocess", ["/tmp/in_ocr.png", "/tmp/out_ocr.png"])
assert code == 0, f"expected exit 0, got {code}: {out}"
payload = json.loads(out)
assert payload == {"success": True, "output_path": "/tmp/out_ocr.png"}, payload
assert read_paths == ["/tmp/in_ocr.png"], read_paths
assert written_paths == ["/tmp/out_ocr.png"], written_paths

# 2. Failure via dispatcher._run_script_main when preprocess raises
fake_cv2.imread = lambda _p: None
out_err, code_err = dispatcher._run_script_main("ocr_preprocess", ["/tmp/missing.png", "/tmp/out_ocr.png"])
assert code_err == 1, f"expected exit 1, got {code_err}: {out_err}"
payload_err = json.loads(out_err)
assert payload_err == {"success": False, "error": "Cannot read image: /tmp/missing.png"}, payload_err

# 3. Direct mod.main() call with empty-message exception falls back to class name
spec = importlib.util.spec_from_file_location("ocr_preprocess_mod", os.path.join(py_dir, "ocr_preprocess.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
mod.preprocess = lambda _i, _o: (_ for _ in ()).throw(RuntimeError(""))
buf = io.StringIO()
old_stdout, old_argv = sys.stdout, sys.argv
sys.stdout = buf
sys.argv = ["ocr_preprocess.py", "/tmp/in.png", "/tmp/out.png"]
try:
    mod.main()
except SystemExit as exc:
    assert exc.code == 1, exc.code
else:
    raise AssertionError("Expected SystemExit(1)")
finally:
    sys.stdout = old_stdout
    sys.argv = old_argv

assert json.loads(buf.getvalue()) == {"success": False, "error": "RuntimeError"}, buf.getvalue()
print("OCR_PREPROCESS_3420_OK")
`,
        ],
        { encoding: "utf8", timeout: 30_000 },
      );
      expect(res.status, res.stderr).toBe(0);
      expect(res.stdout).toContain("OCR_PREPROCESS_3420_OK");
    });

    it("guards top-level cv2 and numpy imports and reports Missing dependency JSON with libGL hint (issue #3640)", () => {
      const res = spawnSync(
        pythonBin as string,
        [
          "-c",
          `
import builtins, contextlib, importlib.util, io, json, os, sys, types

py_dir = ${JSON.stringify(pyDir)}
sys.path.insert(0, py_dir)
script_path = os.path.join(py_dir, "ocr_preprocess.py")

orig_import = builtins.__import__

def exec_with_import_error(module_name, target_pkg, exc):
    def custom_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == target_pkg:
            raise exc
        return orig_import(name, globals, locals, fromlist, level)

    sys.modules.pop("cv2", None)
    sys.modules.pop("numpy", None)
    if target_pkg != "cv2":
        sys.modules["cv2"] = types.ModuleType("cv2")
    spec = importlib.util.spec_from_file_location(module_name, script_path)
    mod = importlib.util.module_from_spec(spec)
    out_buf, err_buf = io.StringIO(), io.StringIO()
    builtins.__import__ = custom_import
    try:
        with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
            spec.loader.exec_module(mod)
    finally:
        builtins.__import__ = orig_import
    return mod, out_buf.getvalue().strip()

# 1. Standalone (__main__) execution with libGL ImportError emits JSON with libgl1 hint and exits 1
for target_pkg, exc, expected_err in (
    (
        "cv2",
        ImportError("libGL.so.1: cannot open shared object file: No such file or directory"),
        "Missing dependency: libGL.so.1: cannot open shared object file: No such file or directory. Fix with: apt-get install -y libgl1",
    ),
    (
        "cv2",
        ModuleNotFoundError("No module named 'cv2'"),
        "Missing dependency: No module named 'cv2'. Install with: pip install opencv-python-headless numpy",
    ),
    (
        "numpy",
        ModuleNotFoundError("No module named 'numpy'"),
        "Missing dependency: No module named 'numpy'. Install with: pip install opencv-python-headless numpy",
    ),
    (
        "cv2",
        ImportError("   "),
        "Missing dependency: ImportError. Install with: pip install opencv-python-headless numpy",
    ),
):
    out_buf, err_buf = io.StringIO(), io.StringIO()
    def custom_import(name, globals=None, locals=None, fromlist=(), level=0, _pkg=target_pkg, _exc=exc):
        if name == _pkg:
            raise _exc
        return orig_import(name, globals, locals, fromlist, level)

    sys.modules.pop("cv2", None)
    sys.modules.pop("numpy", None)
    if target_pkg != "cv2":
        sys.modules["cv2"] = types.ModuleType("cv2")
    spec = importlib.util.spec_from_file_location("__main__", script_path)
    mod = importlib.util.module_from_spec(spec)
    builtins.__import__ = custom_import
    try:
        try:
            with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
                spec.loader.exec_module(mod)
        except SystemExit as exit_exc:
            assert exit_exc.code == 1, exit_exc.code
        else:
            raise AssertionError("Expected SystemExit(1) on __main__ import failure")
    finally:
        builtins.__import__ = orig_import
    payload = json.loads(out_buf.getvalue().strip())
    assert payload == {"success": False, "error": expected_err}, (target_pkg, exc, payload)

    # 2. Imported as non-__main__ module: defers exit to main()
    mod_imported, import_stdout = exec_with_import_error("ocr_preprocess_mod", target_pkg, exc)
    assert import_stdout == "", import_stdout
    assert mod_imported._IMPORT_ERROR is exc
    assert mod_imported.cv2 is None
    assert mod_imported.np is None
    main_out, main_err = io.StringIO(), io.StringIO()
    try:
        with contextlib.redirect_stdout(main_out), contextlib.redirect_stderr(main_err):
            mod_imported.main()
    except SystemExit as exit_exc:
        assert exit_exc.code == 1, exit_exc.code
    else:
        raise AssertionError("Expected SystemExit(1) when calling main() with _IMPORT_ERROR set")
    main_payload = json.loads(main_out.getvalue().strip())
    assert main_payload == {"success": False, "error": expected_err}, (target_pkg, exc, main_payload)

print("OCR_PREPROCESS_3640_OK")
`,
        ],
        { encoding: "utf8", timeout: 30_000 },
      );
      expect(res.status, res.stderr).toBe(0);
      expect(res.stdout).toContain("OCR_PREPROCESS_3640_OK");
    });
  });
});
