import type { OcrRuntimeCapability } from "@snapotter/ai";
import { describe, expect, it, vi } from "vitest";
import { resolveOcrIngressSettings } from "../../../apps/api/src/lib/ocr-capability.js";

const missingCapability: OcrRuntimeCapability = {
  available: false,
  status: "missing",
  reason: "descriptor-missing",
  qualities: [],
  providers: [],
};

const incompatibleCapability: OcrRuntimeCapability = {
  available: false,
  status: "invalid",
  reason: "descriptor-invalid",
  qualities: [],
  providers: [],
};

function readyCapability(qualities: readonly ("balanced" | "best")[]): OcrRuntimeCapability {
  return {
    available: true,
    status: "ready",
    qualities,
    providers: ["CPUExecutionProvider"],
    descriptor: {} as never,
  };
}

describe("resolveOcrIngressSettings", () => {
  it("leaves non-OCR tool settings alone without inspecting OCR capability", () => {
    const settings = { quality: 80 };
    const getCapability = vi.fn(() => missingCapability);

    expect(
      resolveOcrIngressSettings("compress", settings, { readCapability: getCapability }),
    ).toEqual({
      ok: true,
      settings,
    });
    expect(getCapability).not.toHaveBeenCalled();
  });

  it.each(["ocr", "ocr-pdf"])("admits an explicit Fast tier for non-Korean %s", (toolId) => {
    const getCapability = vi.fn(() => incompatibleCapability);

    expect(
      resolveOcrIngressSettings(
        toolId,
        { quality: "fast", language: "en" },
        { readCapability: getCapability },
      ),
    ).toEqual({
      ok: true,
      settings: { quality: "fast", language: "en" },
    });
    expect(getCapability).not.toHaveBeenCalled();
  });

  it.each([
    "ocr",
    "ocr-pdf",
  ])("rejects explicit Fast Korean %s before reading or queueing an accurate runtime", (toolId) => {
    const getCapability = vi.fn(() => readyCapability(["balanced", "best"]));

    expect(
      resolveOcrIngressSettings(
        toolId,
        { quality: "fast", language: "ko" },
        { readCapability: getCapability },
      ),
    ).toEqual({
      ok: false,
      code: "FEATURE_INCOMPATIBLE",
      reason: "fast-korean-unsupported",
      requestedQuality: "fast",
      guidance:
        "Fast OCR does not support Korean. Install the Accurate OCR bundle and choose Balanced or Best.",
    });
    expect(getCapability).not.toHaveBeenCalled();
  });

  it("resolves an omitted tier to Best when the healthy runtime supports it", () => {
    expect(
      resolveOcrIngressSettings(
        "ocr",
        { language: "auto" },
        {
          readCapability: () => readyCapability(["balanced", "best"]),
        },
      ),
    ).toEqual({
      ok: true,
      settings: { language: "auto", quality: "best" },
    });
  });

  it("resolves an omitted non-Korean tier to Balanced when it is the best available tier", () => {
    expect(
      resolveOcrIngressSettings(
        "ocr-pdf",
        { language: "en", pages: "all" },
        { readCapability: () => readyCapability(["balanced"]) },
      ),
    ).toEqual({
      ok: true,
      settings: { language: "en", pages: "all", quality: "balanced" },
    });
  });

  it("resolves an omitted tier to Fast when no healthy runtime is active", () => {
    expect(
      resolveOcrIngressSettings(
        "ocr-pdf",
        { pages: "all" },
        {
          readCapability: () => missingCapability,
        },
      ),
    ).toEqual({
      ok: true,
      settings: { pages: "all", quality: "fast" },
    });
  });

  it("resolves omitted Korean to Best when Best is available", () => {
    expect(
      resolveOcrIngressSettings(
        "ocr",
        { language: "ko" },
        { readCapability: () => readyCapability(["balanced", "best"]) },
      ),
    ).toEqual({
      ok: true,
      settings: { language: "ko", quality: "best" },
    });
  });

  it("resolves omitted Korean to Balanced when it is the available accurate tier", () => {
    expect(
      resolveOcrIngressSettings(
        "ocr-pdf",
        { language: "ko", pages: "all" },
        { readCapability: () => readyCapability(["balanced"]) },
      ),
    ).toEqual({
      ok: true,
      settings: { language: "ko", pages: "all", quality: "balanced" },
    });
  });

  it("pins omitted Korean to an accurate tier when the pack is missing", () => {
    expect(
      resolveOcrIngressSettings(
        "ocr",
        { language: "ko" },
        { readCapability: () => missingCapability },
      ),
    ).toEqual({
      ok: false,
      code: "FEATURE_NOT_INSTALLED",
      reason: "descriptor-missing",
      requestedQuality: "best",
    });
  });

  it("uses the request to detect omission even if a schema supplied a quality default", () => {
    expect(
      resolveOcrIngressSettings(
        "ocr",
        { quality: "balanced", language: "auto" },
        {
          requestedSettings: { language: "auto" },
          readCapability: () => readyCapability(["balanced", "best"]),
        },
      ),
    ).toEqual({
      ok: true,
      settings: { quality: "best", language: "auto" },
    });
  });

  it.each([
    ["tesseract", "fast"],
    ["paddleocr", "balanced"],
  ] as const)("maps legacy engine %s only when quality is absent", (engine, quality) => {
    expect(
      resolveOcrIngressSettings(
        "ocr",
        { engine, language: "en" },
        {
          readCapability: () => readyCapability(["balanced", "best"]),
        },
      ),
    ).toEqual({
      ok: true,
      settings: { language: "en", quality },
    });
  });

  it("rejects legacy Tesseract for Korean like explicit Fast", () => {
    expect(
      resolveOcrIngressSettings(
        "ocr",
        { engine: "tesseract", language: "ko" },
        { readCapability: () => readyCapability(["balanced", "best"]) },
      ),
    ).toMatchObject({
      ok: false,
      code: "FEATURE_INCOMPATIBLE",
      reason: "fast-korean-unsupported",
      requestedQuality: "fast",
    });
  });

  it("maps legacy PaddleOCR Korean requests to Balanced normally", () => {
    expect(
      resolveOcrIngressSettings(
        "ocr-pdf",
        { engine: "paddleocr", language: "ko", pages: "all" },
        { readCapability: () => readyCapability(["balanced", "best"]) },
      ),
    ).toEqual({
      ok: true,
      settings: { language: "ko", pages: "all", quality: "balanced" },
    });
  });

  it("lets an explicit quality override the legacy engine and removes the legacy field", () => {
    expect(
      resolveOcrIngressSettings(
        "ocr",
        { quality: "best", engine: "tesseract", language: "en" },
        { readCapability: () => readyCapability(["balanced", "best"]) },
      ),
    ).toEqual({
      ok: true,
      settings: { quality: "best", language: "en" },
    });
  });

  it("reports a missing accurate runtime as FEATURE_NOT_INSTALLED", () => {
    expect(
      resolveOcrIngressSettings(
        "ocr",
        { quality: "balanced" },
        {
          readCapability: () => missingCapability,
        },
      ),
    ).toEqual({
      ok: false,
      code: "FEATURE_NOT_INSTALLED",
      reason: "descriptor-missing",
      requestedQuality: "balanced",
    });
  });

  it("reports an invalid runtime as FEATURE_INCOMPATIBLE with its reason", () => {
    expect(
      resolveOcrIngressSettings(
        "ocr-pdf",
        { quality: "best" },
        {
          readCapability: () => incompatibleCapability,
        },
      ),
    ).toEqual({
      ok: false,
      code: "FEATURE_INCOMPATIBLE",
      reason: "descriptor-invalid",
      requestedQuality: "best",
    });
  });

  it("reports a healthy runtime missing the requested tier as incompatible", () => {
    expect(
      resolveOcrIngressSettings(
        "ocr",
        { quality: "best" },
        {
          readCapability: () => readyCapability(["balanced"]),
        },
      ),
    ).toEqual({
      ok: false,
      code: "FEATURE_INCOMPATIBLE",
      reason: "quality-not-supported",
      requestedQuality: "best",
    });
  });
});
