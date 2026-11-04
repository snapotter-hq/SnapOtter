import { describe, expect, it } from "vitest";
import { timeoutMessage } from "../../../apps/api/src/lib/timeout.js";

describe("timeoutMessage", () => {
  it("reports the elapsed timeout in seconds", () => {
    expect(timeoutMessage(120_000)).toContain("120s");
    expect(timeoutMessage(5_000)).toContain("5s");
  });

  it("is tool-agnostic (no hardcoded background-removal)", () => {
    // The old copy told every timed-out job a background-removal model was
    // downloading, which was wrong for AI upscale, video, etc. (#591).
    expect(timeoutMessage(120_000)).not.toMatch(/background-removal/i);
  });

  it("sets the CPU-vs-GPU expectation for heavy tools in the ai pool", () => {
    const msg = timeoutMessage(120_000, "ai");
    expect(msg).toMatch(/CPU/);
    expect(msg).toMatch(/GPU/);
    expect(msg).toMatch(/model may still be downloading/);
  });

  it("does not mention GPUs or model downloads for non-AI pools", () => {
    // A qpdf split (docs pool) has no model to download and no GPU to miss;
    // telling its user about either is wrong (#4516).
    for (const pool of ["docs", "image", "system", "media"]) {
      const msg = timeoutMessage(120_000, pool);
      expect(msg).not.toMatch(/GPU/);
      expect(msg).not.toMatch(/model/i);
      expect(msg).not.toMatch(/downloading/i);
    }
  });

  it("names the fast-pool setting for non-AI fast pools", () => {
    expect(timeoutMessage(120_000, "docs")).toContain("JOB_TIMEOUT_FAST_S");
    expect(timeoutMessage(120_000, "image")).toContain("JOB_TIMEOUT_FAST_S");
  });

  it("names the long-pool setting for the media pool", () => {
    expect(timeoutMessage(7_200_000, "media")).toContain("JOB_TIMEOUT_LONG_S");
  });

  it("survives friendlyError for non-AI pools too", () => {
    const msg = timeoutMessage(120_000, "docs");
    expect(msg.length).toBeLessThanOrEqual(280);
    expect(msg.split("\n")).toHaveLength(1);
  });

  it("survives friendlyError (single line, at most 280 chars)", () => {
    // friendlyError collapses any message over 280 chars or more than 3 lines
    // to a generic "Processing failed" sentence, which would hide this guidance.
    // Use the longest realistic timeout (JOB_TIMEOUT_LONG_S default of 2h).
    const msg = timeoutMessage(7_200_000);
    expect(msg.length).toBeLessThanOrEqual(280);
    expect(msg.split("\n")).toHaveLength(1);
  });
});
