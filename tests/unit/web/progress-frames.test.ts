// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { failedFrameMessage, frameFailure, parseResultBody } from "@/lib/progress-frames";

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

// #1354: the one part of landing a sync 2xx that may blame the server. Anything
// but a JSON object is a bad response; the caller's own writes happen after.
describe("parseResultBody (#1354)", () => {
  afterEach(() => {
    document.head.innerHTML = "";
    vi.resetModules();
  });

  it("returns a JSON object body", () => {
    expect(
      parseResultBody('{"downloadUrl":"/api/v1/download/j/out.png","processedSize":3}'),
    ).toEqual({ downloadUrl: "/api/v1/download/j/out.png", processedSize: 3 });
  });

  it.each([
    ["markup", "<html>Bad Gateway</html>"],
    ["an empty body", ""],
    ["null", "null"],
    ["a string", JSON.stringify("ok")],
    ["a number", "42"],
    ["an array", "[]"],
  ])("throws for %s", (_label, text) => {
    expect(() => parseResultBody(text)).toThrow();
  });

  it("moves result URLs under the deployment prefix", async () => {
    document.head.innerHTML = '<base href="/snapotter/">';
    vi.resetModules();
    const { parseResultBody: parseUnderPrefix } = await import("@/lib/progress-frames");

    expect(
      parseUnderPrefix<{ downloadUrl: string }>('{"downloadUrl":"/api/v1/download/j/out.png"}'),
    ).toEqual({ downloadUrl: "/snapotter/api/v1/download/j/out.png" });
  });
});
