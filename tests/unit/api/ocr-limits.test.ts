import { SafeError } from "@snapotter/shared";
import { describe, expect, it } from "vitest";
import { DecoderOutOfMemoryError } from "../../../apps/api/src/lib/format-decoders.js";
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

  it("rethrows 5xx storage and server faults so the global error handler reports them (#1642)", () => {
    const cap = new SafeError("Workspace storage limit reached", {
      kind: "operational",
      code: "workspace-cap",
      statusCode: 503,
    });
    expect(() => ocrUploadErrorStatus(cap)).toThrow(cap);

    const serverFault = Object.assign(new Error("storage exploded"), { statusCode: 500 });
    expect(() => ocrUploadErrorStatus(serverFault)).toThrow(serverFault);

    expect(ocrUploadErrorMessage(413)).toBe("Upload exceeds the allowed size");
    expect(ocrUploadErrorMessage(400)).toBe("Failed to parse multipart request");
  });

  it("converts a V8 buffer allocation failure into DecoderOutOfMemoryError and rethrows it (#3902)", () => {
    const v8Oom = new RangeError("Array buffer allocation failed");
    let caught: unknown;
    try {
      ocrUploadErrorStatus(v8Oom);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(DecoderOutOfMemoryError);
    expect(caught).toMatchObject({
      statusCode: 503,
      code: "ENGINE_UNAVAILABLE",
      cause: v8Oom,
    });

    const otherRange = new RangeError("Invalid array length");
    expect(ocrUploadErrorStatus(otherRange)).toBe(400);
  });
});
