import { describe, expect, it } from "vitest";
import { failedFrameMessage, frameFailure } from "@/lib/progress-frames";

describe("failedFrameMessage (#1432)", () => {
  it("appends the operator hint an engine-unavailable frame carries", () => {
    expect(
      failedFrameMessage(
        { phase: "failed", error: "qpdf could not be started.", details: "Check QPDF_PATH." },
        "Processing failed",
      ),
    ).toBe("qpdf could not be started.: Check QPDF_PATH.");
  });

  it("keeps a plain error as it is", () => {
    expect(failedFrameMessage({ phase: "failed", error: "boom" }, "Processing failed")).toBe(
      "boom",
    );
  });

  it("falls back when the frame has no error", () => {
    expect(failedFrameMessage({ phase: "failed" }, "OCR failed")).toBe("OCR failed");
    expect(failedFrameMessage({ phase: "failed", error: "" }, "OCR failed")).toBe("OCR failed");
  });
});

describe("frameFailure with a hint (#1432)", () => {
  it("appends details to the message", () => {
    expect(frameFailure("qpdf could not be started.", "Check QPDF_PATH.")).toEqual({
      message: "qpdf could not be started.: Check QPDF_PATH.",
    });
  });

  it("ignores a blank or missing hint", () => {
    expect(frameFailure("boom", "")).toEqual({ message: "boom" });
    expect(frameFailure("boom", undefined)).toEqual({ message: "boom" });
  });

  it("still reports noDetail when there's no error, hint or not", () => {
    expect(frameFailure("", "Check QPDF_PATH.")).toEqual({ reason: "noDetail" });
  });
});
