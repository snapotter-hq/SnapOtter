import { describe, expect, it } from "vitest";
import { failedRead } from "../../../apps/api/src/routes/tools/barcode-read.js";

/**
 * zxing turns any C++ exception during a read into a single result with
 * `isValid: false` and the exception text in `error`. Filtering those out as
 * invalid reads answered "no barcodes found" (#1425).
 */
const ok = { isValid: true, error: "" };
const raised = (error: string) => [{ isValid: false, error }];

describe("failedRead", () => {
  it("passes a normal read, with or without barcodes", () => {
    expect(failedRead([])).toBeNull();
    expect(failedRead([ok, ok])).toBeNull();
  });

  it("passes an invalid read that carries no exception", () => {
    expect(failedRead([{ isValid: false, error: "" }])).toBeNull();
  });

  it.each(["std::bad_alloc", "std::bad_array_new_length"])(
    "treats %s as the decoder running out of memory",
    (error) => {
      const err = failedRead(raised(error));
      expect(err?.name).toBe("DecoderOutOfMemory");
      expect(err?.message).toBe(error);
    },
  );

  it.each(["std::length_error", "std::overflow_error", "Unknown error"])(
    "surfaces any other exception (%s) instead of an empty result",
    (error) => {
      const err = failedRead(raised(error));
      expect(err).toBeInstanceOf(Error);
      expect(err?.name).toBe("Error");
      expect(err?.message).toContain(error);
    },
  );
});
