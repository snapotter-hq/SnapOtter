// @vitest-environment jsdom
import { isSafeMessageError } from "@snapotter/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});

import { captureHandledError } from "@/lib/analytics";
import {
  checkToolResult,
  failedFrameMessage,
  frameFailure,
  MalformedResultError,
  parseResultBody,
  reportMalformedResult,
} from "@/lib/progress-frames";

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
    expect(() => parseResultBody(text)).toThrow(MalformedResultError);
  });

  // #1740: an object with nothing to download is no result either. Every
  // caller lands `downloadUrl` as the entry's result, and every sync 2xx the
  // API sends carries one.
  it.each([
    ["an empty object", "{}"],
    ["a job id alone", '{"jobId":"j"}'],
    ["a blank download URL", '{"downloadUrl":""}'],
    ["a non-string download URL", '{"downloadUrl":42}'],
  ])("throws for %s", (_label, text) => {
    expect(() => parseResultBody(text)).toThrow(MalformedResultError);
  });

  // What it throws gets reported, so it must carry nothing from the body: no
  // cause (Sentry appends a SafeError's cause, and JSON.parse quotes the text
  // it choked on) and a message that is one of two constants.
  it.each([
    ["markup", "<html>secret-token</html>"],
    ["an object without a URL", '{"note":"secret-token"}'],
  ])("throws a constant, causeless error for %s", (_label, text) => {
    const thrown = rejection(text);
    expect(isSafeMessageError(thrown)).toBe(true);
    expect(thrown.message).not.toContain("secret-token");
    expect(thrown.cause).toBeUndefined();
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

// #1794: a completed progress frame's `result` is already parsed, so the hooks
// run the same check on the value itself.
describe("checkToolResult (#1794)", () => {
  it("returns the result it was given", () => {
    const result = { downloadUrl: "/api/v1/download/j/out.png", processedSize: 3 };
    expect(checkToolResult(result)).toBe(result);
  });

  it.each([
    ["undefined", undefined, "notAnObject"],
    ["null", null, "notAnObject"],
    ["a string", "ok", "notAnObject"],
    ["an array", [{ downloadUrl: "/x" }], "notAnObject"],
    ["an empty object", {}, "noDownloadUrl"],
    ["a blank download URL", { downloadUrl: "" }, "noDownloadUrl"],
    ["a non-string download URL", { downloadUrl: 42 }, "noDownloadUrl"],
  ])("rejects %s", (_label, value, reason) => {
    let thrown: unknown;
    try {
      checkToolResult(value);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(MalformedResultError);
    expect((thrown as MalformedResultError).reason).toBe(reason);
    expect((thrown as Error).cause).toBeUndefined();
  });
});

/** What parseResultBody throws for a body it rejects. */
function rejection(text: string): Error {
  try {
    parseResultBody(text);
  } catch (err) {
    return err as Error;
  }
  throw new Error(`parseResultBody accepted ${text}`);
}

// #1740: a malformed 2xx is a server bug the client sees and nobody else hears
// about, so it goes to Sentry with a constant message and nothing from the body.
describe("reportMalformedResult (#1740)", () => {
  afterEach(() => {
    vi.mocked(captureHandledError).mockClear();
  });

  function reported(): { error: Error; tags: Record<string, string> | undefined } {
    expect(vi.mocked(captureHandledError)).toHaveBeenCalledTimes(1);
    const [error, tags] = vi.mocked(captureHandledError).mock.calls[0];
    return { error, tags };
  }

  it("reports a body with no download URL, with the status and tool", () => {
    reportMalformedResult(rejection('{"note":"secret-token"}'), { status: 200, toolId: "resize" });

    const { error, tags } = reported();
    expect(isSafeMessageError(error)).toBe(true);
    expect(error.name).toBe("ResultWithoutDownloadError");
    expect(error.message).toBe("Tool result has no download URL");
    expect(error.cause).toBeUndefined();
    expect((error as { statusCode?: number }).statusCode).toBe(200);
    expect(tags).toEqual({ error_class: "operational", tool_id: "resize" });
  });

  // Every report is built at the same line, so Sentry, which groups a stack
  // by exception type, only tells the two apart by the type.
  it("names a body that is not an object apart from one with no download URL", () => {
    reportMalformedResult(rejection("<html>secret-token</html>"), { status: 200 });

    const { error, tags } = reported();
    expect(error.name).toBe("ResultNotAnObjectError");
    expect(error.message).toBe("Tool result body is not a JSON object");
    expect(tags).toEqual({ error_class: "operational" });
  });

  it("never forwards an error it did not make, nor blames the server for it", () => {
    reportMalformedResult(new SyntaxError('Unexpected token "secret-token"'), { status: 200 });

    const { error } = reported();
    expect(isSafeMessageError(error)).toBe(true);
    expect(error.name).toBe("ResultUnreadableError");
    expect(error.message).toBe("Tool result could not be read");
    expect(error.cause).toBeUndefined();
  });
});
