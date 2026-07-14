import { describe, expect, it } from "vitest";
import {
  findOcrEncodedInputViolation,
  OCR_MAX_BATCH_ENCODED_INPUT_BYTES,
  OCR_MAX_ENCODED_INPUT_BYTES,
  ocrUploadErrorMessage,
  ocrUploadErrorStatus,
  resolveOcrEncodedInputLimit,
  resolveOcrUploadLimits,
} from "../../../apps/api/src/lib/ocr-limits.js";

describe("OCR ingress limits", () => {
  it("keeps a hard encoded ceiling when the global upload limit is unlimited or larger", () => {
    expect(resolveOcrEncodedInputLimit(0)).toBe(OCR_MAX_ENCODED_INPUT_BYTES);
    expect(resolveOcrEncodedInputLimit(1024)).toBe(OCR_MAX_ENCODED_INPUT_BYTES);
  });

  it("honors a smaller configured global upload limit", () => {
    expect(resolveOcrEncodedInputLimit(100)).toBe(100 * 1024 * 1024);
  });

  it("keeps the operator limit per file while reserving the hard ceiling for the aggregate", () => {
    expect(resolveOcrUploadLimits(100)).toEqual({
      fileBytes: 100 * 1024 * 1024,
      aggregateBytes: OCR_MAX_BATCH_ENCODED_INPUT_BYTES,
    });
    expect(OCR_MAX_BATCH_ENCODED_INPUT_BYTES).toBe(OCR_MAX_ENCODED_INPUT_BYTES);
  });

  it("allows multiple individually valid OCR inputs below the independent aggregate ceiling", () => {
    const mib = 1024 * 1024;
    expect(findOcrEncodedInputViolation([60 * mib, 60 * mib], 100)).toBeNull();
  });

  it("distinguishes per-file and aggregate OCR input violations", () => {
    const mib = 1024 * 1024;
    expect(findOcrEncodedInputViolation([101 * mib], 100)).toEqual({
      scope: "file",
      limitBytes: 100 * mib,
    });
    expect(
      findOcrEncodedInputViolation(
        Array.from({ length: 9 }, () => 60 * mib),
        100,
      ),
    ).toEqual({
      scope: "aggregate",
      limitBytes: OCR_MAX_BATCH_ENCODED_INPUT_BYTES,
    });
  });

  it("classifies both multipart and streaming size failures as payload-too-large", () => {
    expect(ocrUploadErrorStatus({ statusCode: 413 })).toBe(413);
    expect(ocrUploadErrorStatus(new Error("Upload exceeds the maximum allowed size"))).toBe(413);
    expect(ocrUploadErrorStatus(new Error("malformed multipart"))).toBe(400);
  });

  it("preserves service-unavailable storage failures with a truthful client message", () => {
    expect(ocrUploadErrorStatus({ statusCode: 503 })).toBe(503);
    expect(ocrUploadErrorMessage(503)).toBe("Upload storage unavailable");
    expect(ocrUploadErrorMessage(413)).toBe("Upload exceeds the allowed size");
    expect(ocrUploadErrorMessage(400)).toBe("Failed to parse multipart request");
  });
});
