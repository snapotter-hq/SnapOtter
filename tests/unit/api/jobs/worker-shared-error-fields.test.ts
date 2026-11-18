import {
  markToolInputError,
  pixelLimitImageError,
  SafeError,
  ToolInputError,
  toolInputErrorCode,
} from "@snapotter/shared";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../apps/api/src/lib/error-report.js", () => ({
  reportError: vi.fn(),
  safeFormatTag: vi.fn(() => undefined),
}));
vi.mock("../../../../apps/api/src/lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { failureStatus, validationErrorFields } = await import(
  "../../../../apps/api/src/jobs/worker-shared.js"
);

function inputValidationError(code?: string, details?: string): Error {
  return Object.assign(new Error("bad input"), {
    name: "InputValidationError",
    statusCode: 400,
    ...(code && { code }),
    ...(details && { details }),
  });
}

// The failed job row is the only thing that carries a worker failure back to
// the route and the SSE stream, and the web app shows a specific message only
// for a code it can translate (#4679).
describe("validationErrorFields", () => {
  it("keeps a coded ToolInputError's code for the job row", () => {
    const err = new ToolInputError("This document couldn't be opened.", {
      code: "DOCUMENT_UNREADABLE",
    });
    expect(validationErrorFields(err)).toEqual({ code: "DOCUMENT_UNREADABLE" });
    expect(failureStatus(err)).toEqual({ httpStatus: 400 });
  });

  it("keeps the code of a ToolInputError built by a shared factory", () => {
    expect(validationErrorFields(pixelLimitImageError(new Error("pixel limit")))).toEqual({
      code: "IMAGE_TOO_LARGE",
    });
  });

  it("adds nothing for a ToolInputError without a code", () => {
    expect(validationErrorFields(new ToolInputError("Requested GIF frame does not exist"))).toEqual(
      {},
    );
  });

  it("ignores the library code on a marker-form input error", () => {
    // ffmpeg's and the decoders' own errors are marked as input faults in
    // place; their `code` is an errno or exit status, not one of ours.
    const err = markToolInputError(Object.assign(new Error("decode failed"), { code: "ENOENT" }));
    expect(validationErrorFields(err)).toEqual({});
    expect(toolInputErrorCode(err)).toBeUndefined();
  });

  it("still keeps an InputValidationError's code and details", () => {
    expect(
      validationErrorFields(inputValidationError("ENGINE_UNAVAILABLE", "Check QPDF_PATH")),
    ).toEqual({ code: "ENGINE_UNAVAILABLE", details: "Check QPDF_PATH" });
    expect(validationErrorFields(inputValidationError())).toEqual({});
  });

  it("keeps a server-fault SafeError's code and drops a bug's", () => {
    const storage = new SafeError("Workspace full", { code: "workspace-cap", statusCode: 507 });
    expect(validationErrorFields(storage)).toEqual({ code: "workspace-cap" });
    expect(validationErrorFields(new SafeError("boom", { kind: "bug", code: "x" }))).toEqual({});
  });

  it("adds nothing for a plain error", () => {
    expect(validationErrorFields(new Error("boom"))).toEqual({});
    expect(validationErrorFields("boom")).toEqual({});
  });
});
