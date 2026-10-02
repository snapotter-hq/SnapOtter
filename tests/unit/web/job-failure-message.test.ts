import { de } from "@snapotter/shared/i18n/de.js";
import { en } from "@snapotter/shared/i18n/en.js";
import { describe, expect, it } from "vitest";
import { FRAME_HANDLING_FAILED, frameFailure, jobFailureMessage } from "@/lib/progress-frames";

// Sign PDF and Erase Object subscribe to job progress outside any component,
// so they report a failure without text and the component translates it here
// (#1593). German is the check that nothing English leaks through.
describe("jobFailureMessage", () => {
  it("shows the server's own error unchanged", () => {
    expect(jobFailureMessage({ message: "Signature box is off the page" }, de.errors)).toBe(
      "Signature box is off the page",
    );
  });

  it("translates a failed job the server gave no reason for", () => {
    expect(jobFailureMessage({ reason: "noDetail" }, de.errors)).toBe(
      de.errors.processingFailedNoDetail,
    );
    expect(de.errors.processingFailedNoDetail).not.toBe(en.errors.processingFailedNoDetail);
  });

  it("translates a run whose progress handling broke", () => {
    expect(jobFailureMessage({ reason: "trackingFailed" }, de.errors)).toBe(
      de.errors.jobTrackingFailed,
    );
    expect(de.errors.jobTrackingFailed).not.toBe(en.errors.jobTrackingFailed);
  });

  it("translates a completed run with nothing to download (#1830)", () => {
    expect(jobFailureMessage({ reason: "invalidResponse" }, de.errors)).toBe(
      de.errors.invalidResponse,
    );
    expect(de.errors.invalidResponse).not.toBe(en.errors.invalidResponse);
  });

  it("keeps the English tracking message in step with the hooks' constant", () => {
    // use-tool-processor and use-pipeline-processor still show FRAME_HANDLING_FAILED,
    // so English users should see the same words from every tool.
    expect(en.errors.jobTrackingFailed).toBe(FRAME_HANDLING_FAILED);
  });
});

describe("frameFailure", () => {
  it("keeps real server text as the message", () => {
    expect(frameFailure("Mask is empty")).toEqual({ message: "Mask is empty" });
  });

  it("maps a missing, blank or non-string error to noDetail", () => {
    for (const error of [undefined, null, "", "   ", 42, { message: "x" }]) {
      expect(frameFailure(error)).toEqual({ reason: "noDetail" });
    }
  });
});
