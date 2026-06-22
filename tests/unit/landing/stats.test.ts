import { formatCompact, formatPulls } from "@landing/lib/stats";
import { describe, expect, it } from "vitest";

describe("formatCompact", () => {
  it("formats thousands with one decimal", () => {
    expect(formatCompact(1720)).toBe("1.7k");
  });

  it("drops a trailing .0 on whole thousands", () => {
    expect(formatCompact(1000)).toBe("1k");
    expect(formatCompact(12_000)).toBe("12k");
  });

  it("leaves sub-thousand counts untouched", () => {
    expect(formatCompact(999)).toBe("999");
  });

  it("formats millions with an M suffix", () => {
    expect(formatCompact(1_000_000)).toBe("1M");
    expect(formatCompact(2_300_000)).toBe("2.3M");
  });
});

describe("formatPulls", () => {
  it("rounds down to the nearest 10K below 1M", () => {
    expect(formatPulls(140_801)).toBe("140K+");
    expect(formatPulls(104_801)).toBe("100K+");
  });

  it("stays conservative just under a 10K boundary", () => {
    expect(formatPulls(99_999)).toBe("90K+");
  });

  it("switches to millions at 1M", () => {
    expect(formatPulls(1_000_000)).toBe("1M+");
    expect(formatPulls(999_999)).toBe("990K+");
  });

  it("rounds millions down to one decimal", () => {
    expect(formatPulls(1_250_000)).toBe("1.2M+");
  });
});
