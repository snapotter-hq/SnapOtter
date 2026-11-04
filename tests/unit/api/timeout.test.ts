import { describe, expect, it, vi } from "vitest";

vi.mock("../../../apps/api/src/config.js", () => ({
  env: { PROCESSING_TIMEOUT_S: 0 },
}));

import {
  computeExternalToolTimeout,
  computeTimeout,
  timeoutMessage,
} from "../../../apps/api/src/lib/timeout.js";

describe("computeTimeout", () => {
  it("returns correct timeout for sharp category", () => {
    const result = computeTimeout(50, "sharp");
    expect(result).toBe(Math.max(60_000, 50 * 2 * 1000));
  });

  it("returns correct timeout for ai_cpu category", () => {
    const result = computeTimeout(10, "ai_cpu");
    expect(result).toBe(Math.max(60_000, 10 * 30 * 1000));
  });

  it("returns correct timeout for ai_gpu category", () => {
    const result = computeTimeout(20, "ai_gpu");
    expect(result).toBe(Math.max(60_000, 20 * 5 * 1000));
  });

  it("returns correct timeout for external category", () => {
    const result = computeTimeout(10, "external");
    expect(result).toBe(Math.max(60_000, 10 * 10 * 1000));
  });

  it("returns correct timeout for python category", () => {
    const result = computeTimeout(10, "python");
    expect(result).toBe(Math.max(60_000, 10 * 15 * 1000));
  });

  it("enforces minimum timeout of 60_000ms", () => {
    const result = computeTimeout(0.001, "sharp");
    expect(result).toBe(60_000);
  });

  it("enforces minimum timeout for small megapixel values", () => {
    const result = computeTimeout(1, "sharp");
    expect(result).toBe(60_000);
  });

  it("multiplies timeout by file count", () => {
    const single = computeTimeout(50, "sharp");
    const triple = computeTimeout(50, "sharp", 3);
    expect(triple).toBe(single * 3);
  });

  it("defaults to fileCount of 1", () => {
    const result = computeTimeout(50, "sharp");
    const explicit = computeTimeout(50, "sharp", 1);
    expect(result).toBe(explicit);
  });

  it("scales correctly for large megapixel values", () => {
    const result = computeTimeout(100, "ai_cpu");
    expect(result).toBe(100 * 30 * 1000);
  });

  it("uses override when PROCESSING_TIMEOUT_S > 0", async () => {
    const configMod = await import("../../../apps/api/src/config.js");
    const saved = configMod.env.PROCESSING_TIMEOUT_S;
    configMod.env.PROCESSING_TIMEOUT_S = 120;
    try {
      const result = computeTimeout(999, "ai_gpu", 10);
      expect(result).toBe(120 * 1000);
    } finally {
      configMod.env.PROCESSING_TIMEOUT_S = saved;
    }
  });

  it("override ignores megapixels and fileCount", async () => {
    const configMod = await import("../../../apps/api/src/config.js");
    const saved = configMod.env.PROCESSING_TIMEOUT_S;
    configMod.env.PROCESSING_TIMEOUT_S = 60;
    try {
      const result = computeTimeout(200, "python", 5);
      expect(result).toBe(60 * 1000);
    } finally {
      configMod.env.PROCESSING_TIMEOUT_S = saved;
    }
  });

  it("minimum applies per-file before multiplying by count", () => {
    const result = computeTimeout(0, "sharp", 3);
    expect(result).toBe(60_000 * 3);
  });
});

describe("computeExternalToolTimeout", () => {
  it("returns correct timeout for external category", () => {
    const result = computeExternalToolTimeout(10);
    expect(result).toBe(10 * 10 * 1000);
  });

  it("enforces minimum timeout of 60_000ms", () => {
    const result = computeExternalToolTimeout(0);
    expect(result).toBe(60_000);
  });

  it("scales with megapixels", () => {
    const result = computeExternalToolTimeout(50);
    expect(result).toBe(50 * 10 * 1000);
  });

  it("uses override when PROCESSING_TIMEOUT_S > 0", async () => {
    const configMod = await import("../../../apps/api/src/config.js");
    const saved = configMod.env.PROCESSING_TIMEOUT_S;
    configMod.env.PROCESSING_TIMEOUT_S = 300;
    try {
      const result = computeExternalToolTimeout(999);
      expect(result).toBe(300 * 1000);
    } finally {
      configMod.env.PROCESSING_TIMEOUT_S = saved;
    }
  });

  it("enforces minimum for small megapixel values", () => {
    const result = computeExternalToolTimeout(0.5);
    expect(result).toBe(60_000);
  });
});

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
