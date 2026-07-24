import { describe, expect, it } from "vitest";
import {
  findOcrEncodedInputViolation,
  OCR_MAX_ENCODED_INPUT_BYTES,
  ocrUploadErrorStatus,
  resolveOcrUploadLimits,
} from "../../../apps/api/src/lib/ocr-limits.js";

// Mutation-hardening tests for ocr-limits.ts. Each case pins the exact verdict on
// both sides of a comparison so the boundary (`<` vs `<=`, `>` vs `>=`), logical
// (`&&` vs `||`), and condition-forcing mutants each become observable.

const MIB = 1024 * 1024;

describe("findOcrEncodedInputViolation per-file boundary (line 43)", () => {
  it("returns null for a file exactly at the per-file limit", () => {
    // `bytes > fileBytes` is false at equality. The `>=` mutant would flip this
    // to a file violation, and the whole-condition `false` mutant would let the
    // loop fall through and (here) still return null - so this alone does not
    // separate `false`; the over-limit case below does.
    const { fileBytes } = resolveOcrUploadLimits(100);
    expect(fileBytes).toBe(100 * MIB);
    expect(findOcrEncodedInputViolation([fileBytes], 100)).toBeNull();
  });

  it("flags a file one byte over the per-file limit as a file violation", () => {
    // Original: file violation. Kills the whole-condition `false` mutant (which
    // would let 101 MiB fall through to a 101 MiB aggregate, under the 512 MiB
    // ceiling, and return null) and the `>=`/`>` boundary mutants.
    const overLimit = 100 * MIB + 1;
    expect(findOcrEncodedInputViolation([overLimit], 100)).toEqual({
      scope: "file",
      limitBytes: 100 * MIB,
    });
  });

  it("treats zero bytes as a valid file (not a violation)", () => {
    // `bytes < 0` is false at zero. The `bytes <= 0` mutant would classify a
    // 0-byte input as a file violation; the original returns null.
    expect(findOcrEncodedInputViolation([0], 100)).toBeNull();
  });

  it("flags a negative byte count as a file violation via the bytes < 0 arm", () => {
    // -1 is a safe integer and its magnitude is under the limit, so only the
    // `bytes < 0` sub-clause triggers. Kills the sub-clause `false` mutant
    // (which would return null) and the `<`/`<=` mutant is separated by the
    // zero case above.
    expect(findOcrEncodedInputViolation([-1], 100)).toEqual({
      scope: "file",
      limitBytes: 100 * MIB,
    });
  });

  it("flags a non-safe-integer (fractional) size as a file violation", () => {
    // 1.5 is positive, small, but not a safe integer, so only the
    // `!Number.isSafeInteger(bytes)` arm triggers. Kills the LogicalOperator
    // mutants that turn the leading `||` into `&&` (which would require
    // bytes < 0 too and thus miss 1.5).
    expect(findOcrEncodedInputViolation([1.5], 100)).toEqual({
      scope: "file",
      limitBytes: 100 * MIB,
    });
  });

  it("flags a non-safe huge integer (above MAX_SAFE_INTEGER) as a file violation", () => {
    expect(findOcrEncodedInputViolation([Number.MAX_SAFE_INTEGER + 2], 100)).toEqual({
      scope: "file",
      limitBytes: 100 * MIB,
    });
  });
});

describe("findOcrEncodedInputViolation aggregate boundary (line 47)", () => {
  it("returns null when the running total exactly equals the aggregate ceiling", () => {
    // With maxUploadSizeMb=0 the per-file limit equals the hard ceiling, so a
    // single 512 MiB input passes the per-file check and lands the aggregate
    // exactly at the ceiling. `aggregateBytes > ceiling` is false at equality;
    // the `>=` mutant would report an aggregate violation here.
    const { fileBytes, aggregateBytes } = resolveOcrUploadLimits(0);
    expect(fileBytes).toBe(OCR_MAX_ENCODED_INPUT_BYTES);
    expect(aggregateBytes).toBe(OCR_MAX_ENCODED_INPUT_BYTES);
    expect(findOcrEncodedInputViolation([OCR_MAX_ENCODED_INPUT_BYTES], 0)).toBeNull();
  });

  it("flags an aggregate one byte over the ceiling", () => {
    // Two files that each pass the per-file check but sum to ceiling + 1.
    const half = OCR_MAX_ENCODED_INPUT_BYTES / 2;
    const inputs = [half, half + 1];
    expect(findOcrEncodedInputViolation(inputs, 0)).toEqual({
      scope: "aggregate",
      limitBytes: OCR_MAX_ENCODED_INPUT_BYTES,
    });
  });

  it("returns null for several inputs whose sum stays under the aggregate ceiling", () => {
    expect(findOcrEncodedInputViolation([60 * MIB, 60 * MIB, 60 * MIB], 100)).toBeNull();
  });
});

describe("ocrUploadErrorStatus 503 branch (lines 57-58)", () => {
  it("returns 503 only for an object carrying statusCode === 503", () => {
    expect(ocrUploadErrorStatus({ statusCode: 503 })).toBe(503);
  });

  it("does not return 503 for an object with a different statusCode", () => {
    // Kills the whole-condition `true` mutant on the 503 block (which would make
    // every input 503) and the equality/logical mutants on that block.
    expect(ocrUploadErrorStatus({ statusCode: 500 })).toBe(400);
  });

  it("does not return 503 for null", () => {
    // `error !== null` guards a null deref. Forcing that sub-condition true (or
    // dropping the &&) would try `null.statusCode` / `"in" null` and throw or
    // misroute; the original cleanly returns 400.
    expect(ocrUploadErrorStatus(null)).toBe(400);
    expect(ocrUploadErrorStatus(undefined)).toBe(400);
  });

  it("does not return 503 for a non-object (string) error", () => {
    // A string has no statusCode. Any logical mutant that reorders the guards so
    // `"statusCode" in error` runs against a string throws a TypeError; the
    // original returns 400. Asserting exactly 400 kills those.
    expect(ocrUploadErrorStatus("some string error")).toBe(400);
    expect(ocrUploadErrorStatus(42)).toBe(400);
  });
});

describe("ocrUploadErrorStatus 413 branch (lines 65-68)", () => {
  it("returns 413 for an object with statusCode === 413", () => {
    expect(ocrUploadErrorStatus({ statusCode: 413 })).toBe(413);
  });

  it("returns 413 for an Error whose message matches the size-exceeded pattern", () => {
    expect(ocrUploadErrorStatus(new Error("File too large"))).toBe(413);
    expect(ocrUploadErrorStatus(new Error("Upload exceeds the maximum allowed size"))).toBe(413);
    expect(ocrUploadErrorStatus(new Error("upload exceeds the configured limit"))).toBe(413);
  });

  it("returns 400 for an object whose statusCode is neither 413 nor 503", () => {
    // Object path, no regex match: kills the `error.statusCode === 413`
    // condition-forcing mutant (which would report 413 for any object).
    expect(ocrUploadErrorStatus({ statusCode: 418 })).toBe(400);
  });

  it("returns 400 for an Error whose message does not match the pattern", () => {
    // Error path, no size keyword: kills the regex-branch `true` mutant.
    expect(ocrUploadErrorStatus(new Error("malformed multipart body"))).toBe(400);
    expect(ocrUploadErrorStatus(new Error("upload exceeds"))).toBe(400);
  });

  it("returns 400 for a non-Error, non-object value with no status", () => {
    expect(ocrUploadErrorStatus("plain string")).toBe(400);
  });

  it("prefers 503 over 413 when both would nominally apply", () => {
    // A 503 object never reaches the 413 block; confirms ordering.
    expect(ocrUploadErrorStatus({ statusCode: 503, message: "file too large" })).toBe(503);
  });
});
