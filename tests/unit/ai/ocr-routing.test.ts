import { beforeEach, describe, expect, it, vi } from "vitest";

const sharpMocks = vi.hoisted(() => ({
  resize: vi.fn(),
  png: vi.fn(),
  toFile: vi.fn(),
  metadata: vi.fn(),
}));

vi.mock("sharp", () => ({
  default: vi.fn(() => ({
    resize: sharpMocks.resize,
    png: sharpMocks.png,
    toFile: sharpMocks.toFile,
    metadata: sharpMocks.metadata,
  })),
}));

vi.mock("../../../packages/ai/src/ocr-runtime-dispatcher.js", () => ({
  runOcrRuntime: vi.fn(),
}));

vi.mock("../../../packages/ai/src/tesseract.js", () => ({
  runAdaptiveTesseract: vi.fn(),
  runTesseract: vi.fn(),
}));

vi.mock("../../../packages/ai/src/tesseract-pdf.js", () => ({
  preparePdfOcrPages: vi.fn(),
  runTesseractPdf: vi.fn(),
}));

import { extractPdfText, extractText } from "../../../packages/ai/src/ocr.js";
import { runOcrRuntime } from "../../../packages/ai/src/ocr-runtime-dispatcher.js";
import { runAdaptiveTesseract } from "../../../packages/ai/src/tesseract.js";
import { preparePdfOcrPages, runTesseractPdf } from "../../../packages/ai/src/tesseract-pdf.js";

const INPUT = Buffer.from("full-resolution-image");
const PNG = Buffer.from("lossless-png");
const PDF_PAGES = [
  { page: 1, path: "/tmp/job/ocr-pdf-pages/page-1.png" },
  { page: 2, path: "/tmp/job/ocr-pdf-pages/page-2.png" },
];

function runtimeResponse(result: Record<string, unknown>) {
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
  sharpMocks.png.mockReturnThis();
  sharpMocks.resize.mockReturnThis();
  sharpMocks.toFile.mockResolvedValue({ size: PNG.length });
  sharpMocks.metadata.mockResolvedValue({ width: 4000, height: 3000 });
  vi.mocked(runAdaptiveTesseract).mockResolvedValue({
    text: "Fast text",
    engine: "tesseract",
    provider: "native",
    device: "cpu",
  });
  vi.mocked(runTesseractPdf).mockResolvedValue({
    text: "--- Page 1 ---\n\nFast PDF text",
    pages: 1,
    pageNumbers: [1],
    engine: "tesseract",
    provider: "native",
    device: "cpu",
  });
  vi.mocked(runOcrRuntime).mockResolvedValue(
    runtimeResponse({
      success: true,
      text: "Accurate text",
      engine: "rapidocr-onnx",
      requestedQuality: "balanced",
      actualQuality: "balanced",
      device: "cpu",
      provider: "CPUExecutionProvider",
      degraded: false,
      warnings: [],
      runtimeVersion: "ocr-runtime-1",
      modelVersion: "pp-ocrv6-small",
    }),
  );
  vi.mocked(preparePdfOcrPages).mockResolvedValue({
    pages: PDF_PAGES,
    totalPages: 2,
    remainingTimeoutMs: () => 900_000,
    cleanup: vi.fn().mockResolvedValue(undefined),
  });
});

describe("extractPdfText tier routing", () => {
  it("uses built-in Ghostscript plus Tesseract by default", async () => {
    const result = await extractPdfText("/tmp/job/document.pdf", {
      pages: "1",
      language: "en",
    });

    expect(runTesseractPdf).toHaveBeenCalledWith(
      "/tmp/job/document.pdf",
      "/tmp/job",
      expect.objectContaining({ pages: "1", language: "en" }),
    );
    expect(runOcrRuntime).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      pages: 1,
      engine: "tesseract",
      requestedQuality: "fast",
      actualQuality: "fast",
      device: "cpu",
      provider: "native",
      degraded: false,
      warnings: [],
    });
  });

  it("rejects explicit Korean Fast PDF OCR before native processing", async () => {
    await expect(
      extractPdfText("/tmp/job/document.pdf", {
        quality: "fast",
        language: "ko",
      }),
    ).rejects.toThrow(
      "Fast OCR does not support Korean. Install the Accurate OCR bundle and choose Balanced or Best.",
    );

    expect(runTesseractPdf).not.toHaveBeenCalled();
    expect(preparePdfOcrPages).not.toHaveBeenCalled();
    expect(runOcrRuntime).not.toHaveBeenCalled();
  });

  it.each([
    "balanced",
    "best",
  ] as const)("keeps explicit Korean PDF OCR on the %s accurate tier", async (quality) => {
    vi.mocked(runOcrRuntime).mockResolvedValueOnce(
      runtimeResponse({
        success: true,
        text: "정확한 PDF 텍스트",
        pages: 2,
        engine: "rapidocr-onnx",
        requestedQuality: quality,
        actualQuality: quality,
        device: "cpu",
        provider: "CPUExecutionProvider",
        degraded: false,
        warnings: [],
      }),
    );

    const result = await extractPdfText("/tmp/job/document.pdf", {
      quality,
      language: "ko",
    });

    expect(result.requestedQuality).toBe(quality);
    expect(result.actualQuality).toBe(quality);
    expect(runTesseractPdf).not.toHaveBeenCalled();
    expect(preparePdfOcrPages).toHaveBeenCalledTimes(1);
    expect(runOcrRuntime).toHaveBeenCalledTimes(1);
    const runtimeOptions = JSON.parse(
      vi.mocked(runOcrRuntime).mock.calls[0]?.[1][1] ?? "null",
    ) as Record<string, unknown>;
    expect(runtimeOptions).toMatchObject({ language: "ko", quality });
  });

  it("keeps Fast PDF OCR jobs alive while native processing is quiet", async () => {
    vi.useFakeTimers();
    let finish: ((value: Awaited<ReturnType<typeof runTesseractPdf>>) => void) | undefined;
    vi.mocked(runTesseractPdf).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const onProgress = vi.fn();

    try {
      const pending = extractPdfText("/tmp/job/document.pdf", {}, onProgress);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(onProgress).toHaveBeenCalledWith(10, "Running Fast PDF OCR");

      finish?.({
        text: "Fast PDF text",
        pages: 1,
        pageNumbers: [1],
        engine: "tesseract",
        provider: "native",
        device: "cpu",
      });
      await pending;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("routes Balanced PDF OCR once through the accurate runtime", async () => {
    const cleanup = vi.fn().mockResolvedValue(undefined);
    vi.mocked(preparePdfOcrPages).mockResolvedValueOnce({
      pages: PDF_PAGES,
      totalPages: 2,
      remainingTimeoutMs: () => 900_000,
      cleanup,
    });
    vi.mocked(runOcrRuntime).mockResolvedValueOnce(
      runtimeResponse({
        success: true,
        text: "Accurate PDF text",
        pages: 2,
        engine: "rapidocr-onnx",
        requestedQuality: "balanced",
        actualQuality: "balanced",
        device: "cpu",
        provider: "CPUExecutionProvider",
        degraded: false,
        warnings: [],
        runtimeVersion: "ocr-runtime-1",
        modelVersion: "pp-ocrv6-small",
      }),
    );

    const result = await extractPdfText("/tmp/job/document.pdf", {
      quality: "balanced",
      pages: "1-2",
    });

    expect(runTesseractPdf).not.toHaveBeenCalled();
    expect(preparePdfOcrPages).toHaveBeenCalledWith(
      "/tmp/job/document.pdf",
      "/tmp/job",
      expect.objectContaining({ pages: "1-2" }),
    );
    expect(runOcrRuntime).toHaveBeenCalledWith(
      "ocr_pdf",
      [
        JSON.stringify(PDF_PAGES),
        JSON.stringify({ quality: "balanced", language: "auto", enhance: false }),
      ],
      expect.objectContaining({ timeoutMs: 900_000 }),
    );
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      pages: 2,
      requestedQuality: "balanced",
      actualQuality: "balanced",
      modelVersion: "pp-ocrv6-small",
    });
  });

  it("enables calibrated enhancement for Best PDF OCR unless explicitly disabled", async () => {
    vi.mocked(runOcrRuntime).mockResolvedValueOnce(
      runtimeResponse({
        success: true,
        text: "Best PDF text",
        pages: 2,
        engine: "rapidocr-onnx",
        requestedQuality: "best",
        actualQuality: "best",
        device: "cpu",
        provider: "CPUExecutionProvider",
        degraded: false,
        warnings: [],
      }),
    );

    await extractPdfText("/tmp/job/document.pdf", { quality: "best" });

    expect(runOcrRuntime).toHaveBeenCalledWith(
      "ocr_pdf",
      [
        JSON.stringify(PDF_PAGES),
        JSON.stringify({ quality: "best", language: "auto", enhance: true }),
      ],
      expect.any(Object),
    );
  });

  it("keeps accurate PDF preparation alive while Ghostscript is quiet", async () => {
    vi.useFakeTimers();
    let finish: ((value: Awaited<ReturnType<typeof preparePdfOcrPages>>) => void) | undefined;
    vi.mocked(preparePdfOcrPages).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    vi.mocked(runOcrRuntime).mockResolvedValueOnce(
      runtimeResponse({
        success: true,
        text: "Accurate PDF text",
        pages: 2,
        engine: "rapidocr-onnx",
        requestedQuality: "balanced",
        actualQuality: "balanced",
        device: "cpu",
        provider: "CPUExecutionProvider",
        degraded: false,
        warnings: [],
      }),
    );
    const onProgress = vi.fn();

    try {
      const pending = extractPdfText("/tmp/job/document.pdf", { quality: "balanced" }, onProgress);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(onProgress).toHaveBeenCalledWith(10, "Preparing accurate PDF OCR");

      finish?.({
        pages: PDF_PAGES,
        totalPages: 2,
        remainingTimeoutMs: () => 900_000,
        cleanup: vi.fn().mockResolvedValue(undefined),
      });
      await pending;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects an accurate PDF result that omits prepared pages", async () => {
    const cleanup = vi.fn().mockResolvedValue(undefined);
    vi.mocked(preparePdfOcrPages).mockResolvedValueOnce({
      pages: PDF_PAGES,
      totalPages: 2,
      remainingTimeoutMs: () => 900_000,
      cleanup,
    });
    vi.mocked(runOcrRuntime).mockResolvedValueOnce(
      runtimeResponse({
        success: true,
        text: "Only one page",
        pages: 1,
        engine: "rapidocr-onnx",
        requestedQuality: "balanced",
        actualQuality: "balanced",
        device: "cpu",
        provider: "CPUExecutionProvider",
        degraded: false,
        warnings: [],
        runtimeVersion: "ocr-runtime-1",
        modelVersion: "pp-ocrv6-small",
      }),
    );

    await expect(
      extractPdfText("/tmp/job/document.pdf", { quality: "balanced", pages: "1-2" }),
    ).rejects.toThrow("page count");
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});

describe("extractText tier routing", () => {
  it("uses built-in Tesseract by default with complete truthful metadata", async () => {
    const result = await extractText(INPUT, "/tmp/ocr");

    expect(runAdaptiveTesseract).toHaveBeenCalledWith(
      "/tmp/ocr/input_ocr.png",
      expect.objectContaining({ language: "auto" }),
    );
    expect(runOcrRuntime).not.toHaveBeenCalled();
    expect(result).toEqual({
      text: "Fast text",
      engine: "tesseract",
      requestedQuality: "fast",
      actualQuality: "fast",
      device: "cpu",
      provider: "native",
      degraded: false,
      warnings: [],
    });
  });

  it("keeps Fast image OCR jobs alive while native processing is quiet", async () => {
    vi.useFakeTimers();
    let finish: ((value: Awaited<ReturnType<typeof runAdaptiveTesseract>>) => void) | undefined;
    vi.mocked(runAdaptiveTesseract).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const onProgress = vi.fn();

    try {
      const pending = extractText(INPUT, "/tmp/ocr", { quality: "fast" }, onProgress);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(onProgress).toHaveBeenCalledWith(10, "Running Fast OCR");

      finish?.({
        text: "Fast text",
        engine: "tesseract",
        provider: "native",
        device: "cpu",
      });
      await pending;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("preserves source resolution instead of applying the old 2048px cap", async () => {
    await extractText(INPUT, "/tmp/ocr", { quality: "fast" });

    expect(sharpMocks.resize).not.toHaveBeenCalled();
    expect(sharpMocks.png).toHaveBeenCalledTimes(1);
    expect(sharpMocks.toFile).toHaveBeenCalledWith("/tmp/ocr/input_ocr.png");
  });

  it("rejects unsafe source pixel counts before allocating a full PNG", async () => {
    sharpMocks.metadata.mockResolvedValueOnce({ width: 10_000, height: 5_000 });

    await expect(extractText(INPUT, "/tmp/ocr", { quality: "best" })).rejects.toThrow(
      "40,000,000 pixel safety limit",
    );
    expect(sharpMocks.toFile).not.toHaveBeenCalled();
    expect(runOcrRuntime).not.toHaveBeenCalled();
  });

  it("routes Balanced to the accurate runtime and preserves its provenance", async () => {
    const result = await extractText(INPUT, "/tmp/ocr", {
      quality: "balanced",
      language: "ja",
      enhance: false,
    });

    expect(runAdaptiveTesseract).not.toHaveBeenCalled();
    expect(runOcrRuntime).toHaveBeenCalledWith(
      "ocr",
      [
        "/tmp/ocr/input_ocr.png",
        JSON.stringify({ quality: "balanced", language: "ja", enhance: false }),
      ],
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );
    expect(result).toMatchObject({
      engine: "rapidocr-onnx",
      requestedQuality: "balanced",
      actualQuality: "balanced",
      provider: "CPUExecutionProvider",
      runtimeVersion: "ocr-runtime-1",
      modelVersion: "pp-ocrv6-small",
    });
  });

  it("enables calibrated enhancement for Best image OCR unless explicitly disabled", async () => {
    vi.mocked(runOcrRuntime).mockResolvedValueOnce(
      runtimeResponse({
        success: true,
        text: "Best text",
        engine: "rapidocr-onnx",
        requestedQuality: "best",
        actualQuality: "best",
        device: "cpu",
        provider: "CPUExecutionProvider",
        degraded: false,
        warnings: [],
      }),
    );

    await extractText(INPUT, "/tmp/ocr", { quality: "best" });

    expect(runOcrRuntime).toHaveBeenCalledWith(
      "ocr",
      ["/tmp/ocr/input_ocr.png", JSON.stringify({ quality: "best", enhance: true })],
      expect.any(Object),
    );
  });

  it("maps the legacy tesseract engine to Fast", async () => {
    const result = await extractText(INPUT, "/tmp/ocr", { engine: "tesseract" });

    expect(result.actualQuality).toBe("fast");
    expect(runAdaptiveTesseract).toHaveBeenCalledTimes(1);
  });

  it("rejects incomplete accurate-runtime metadata", async () => {
    vi.mocked(runOcrRuntime).mockResolvedValueOnce(
      runtimeResponse({
        success: true,
        text: "text",
        engine: "rapidocr-onnx",
      }),
    );

    await expect(extractText(INPUT, "/tmp/ocr", { quality: "balanced" })).rejects.toThrow(
      "invalid metadata",
    );
  });

  it("defensively rejects accurate image text above the UTF-8 durable-result budget", async () => {
    vi.mocked(runOcrRuntime).mockResolvedValueOnce(
      runtimeResponse({
        success: true,
        text: "界".repeat(333_334),
        engine: "rapidocr-onnx",
        requestedQuality: "balanced",
        actualQuality: "balanced",
        device: "cpu",
        provider: "CPUExecutionProvider",
        degraded: false,
        warnings: [],
      }),
    );

    await expect(extractText(INPUT, "/tmp/ocr", { quality: "balanced" })).rejects.toThrow(
      "1,000,000 byte",
    );
  });

  it("rejects an accurate runtime that changes the selected tier", async () => {
    vi.mocked(runOcrRuntime).mockResolvedValueOnce(
      runtimeResponse({
        success: true,
        text: "text",
        engine: "rapidocr-onnx",
        requestedQuality: "best",
        actualQuality: "fast",
        device: "cpu",
        provider: "CPUExecutionProvider",
        degraded: true,
        warnings: ["fallback"],
      }),
    );

    await expect(extractText(INPUT, "/tmp/ocr", { quality: "best" })).rejects.toThrow(
      "tier mismatch",
    );
  });
});
