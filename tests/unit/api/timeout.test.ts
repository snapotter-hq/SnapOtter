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

  it("sets the CPU-vs-GPU expectation for heavy tools", () => {
    const msg = timeoutMessage(120_000);
    expect(msg).toMatch(/CPU/);
    expect(msg).toMatch(/GPU/);
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
