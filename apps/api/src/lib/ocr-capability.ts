import {
  FAST_KOREAN_UNSUPPORTED_REASON,
  getOcrRuntimeCapability,
  type OcrRuntimeCapability,
  type OcrRuntimeQuality,
} from "@snapotter/ai";
import { InputValidationError } from "../modality/contract.js";

export type OcrIngressQuality = "fast" | OcrRuntimeQuality;

export const OCR_FAST_KOREAN_GUIDANCE = FAST_KOREAN_UNSUPPORTED_REASON;

export type OcrIngressResolution =
  | {
      ok: true;
      settings: unknown;
    }
  | {
      ok: false;
      code: "FEATURE_NOT_INSTALLED" | "FEATURE_INCOMPATIBLE";
      reason: string;
      requestedQuality: OcrIngressQuality;
      guidance?: string;
    };

type CapabilityReader = () => OcrRuntimeCapability;

export interface OcrIngressOptions {
  /** Original client settings, before a schema applies defaults. */
  requestedSettings?: unknown;
  /** Test seam for the filesystem-backed capability reader. */
  readCapability?: CapabilityReader;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOcrQuality(value: unknown): value is OcrIngressQuality {
  return value === "fast" || value === "balanced" || value === "best";
}

/**
 * Pin an OCR quality tier at API ingress and enforce the optional runtime's
 * advertised capabilities. Callers must pass settings only after their tool
 * schema has accepted them; the returned settings are the value persisted on
 * the job, preventing a queued job from silently selecting another tier.
 */
export function resolveOcrIngressSettings(
  toolId: string,
  settings: unknown,
  options: OcrIngressOptions = {},
): OcrIngressResolution {
  if (toolId !== "ocr" && toolId !== "ocr-pdf") {
    return { ok: true, settings };
  }

  const parsedSettings = isRecord(settings) ? settings : {};
  const requestedSettings = isRecord(options.requestedSettings)
    ? options.requestedSettings
    : parsedSettings;
  const readCapability = options.readCapability ?? getOcrRuntimeCapability;
  const explicitQuality = isOcrQuality(requestedSettings.quality)
    ? requestedSettings.quality
    : undefined;
  const legacyQuality =
    explicitQuality === undefined
      ? requestedSettings.engine === "tesseract"
        ? "fast"
        : requestedSettings.engine === "paddleocr"
          ? "balanced"
          : undefined
      : undefined;

  let capability: OcrRuntimeCapability | undefined;
  let quality = explicitQuality ?? legacyQuality;
  if (!quality) {
    capability = readCapability();
    if (parsedSettings.language === "ko") {
      quality =
        capability.available && capability.qualities.includes("best")
          ? "best"
          : capability.available && capability.qualities.includes("balanced")
            ? "balanced"
            : "best";
    } else {
      quality =
        capability.available && capability.qualities.includes("best")
          ? "best"
          : capability.available && capability.qualities.includes("balanced")
            ? "balanced"
            : "fast";
    }
  }

  const { engine: _legacyEngine, ...normalizedSettings } = parsedSettings;
  const settingsWithQuality = { ...normalizedSettings, quality };

  if (quality === "fast") {
    if (parsedSettings.language === "ko") {
      return {
        ok: false,
        code: "FEATURE_INCOMPATIBLE",
        reason: "fast-korean-unsupported",
        requestedQuality: "fast",
        guidance: OCR_FAST_KOREAN_GUIDANCE,
      };
    }
    return { ok: true, settings: settingsWithQuality };
  }

  capability ??= readCapability();
  if (capability.available) {
    if (capability.qualities.includes(quality)) {
      return { ok: true, settings: settingsWithQuality };
    }

    return {
      ok: false,
      code: "FEATURE_INCOMPATIBLE",
      reason: "quality-not-supported",
      requestedQuality: quality,
    };
  }

  return {
    ok: false,
    code:
      capability.status === "invalid" || capability.status === "incompatible"
        ? "FEATURE_INCOMPATIBLE"
        : "FEATURE_NOT_INSTALLED",
    reason: capability.reason,
    requestedQuality: quality,
  };
}

/**
 * The accurate OCR runtime was there when the file was uploaded and is gone by
 * the time the worker looks. That is the operator's install, not the caller's
 * file, so it is a 503 with a code: the route and a batch of these answer it as
 * a server-side failure instead of a 422 that blames the upload (#2181).
 */
export function ocrRuntimeUnavailable(quality: OcrRuntimeQuality): InputValidationError {
  return new InputValidationError(
    `OCR ${quality} runtime is no longer available`,
    503,
    "The accurate OCR runtime was installed when the file was uploaded and is missing now. Check the OCR optional pack in Settings, then run it again.",
    "ENGINE_UNAVAILABLE",
  );
}

/**
 * The runtime ran a different tier than the worker asked for. The worker checked
 * the tier first, so this is an invariant breaking inside the server, not
 * anything about the file: a 500 with a code, reported like any server bug.
 */
export function ocrTierMismatch(message: string): InputValidationError {
  return new InputValidationError(message, 500, undefined, "OCR_TIER_MISMATCH");
}
