import { beforeEach, describe, expect, it, vi } from "vitest";

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

  it.each([
    "balanced",
    "best",
  ] as const)("keeps explicit Korean on the %s accurate tier without silent rerouting", async (quality) => {
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
  });

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

  it("propagates malformed accurate-runtime output", async () => {
    vi.mocked(runOcrRuntime).mockResolvedValueOnce(runtimeResponse("not an object"));

    await expect(extractText(INPUT, "/tmp/ocr", { quality: "balanced" })).rejects.toThrow(
      "invalid metadata",
    );
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
});
