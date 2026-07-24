import { describe, expect, it } from "vitest";
import { formatFfmpegSeconds } from "../../../apps/api/src/lib/media-tool.js";

describe("formatFfmpegSeconds", () => {
  it.each([
    [0, "0"],
    [Number.MIN_VALUE, "0"],
    [0.00000049, "0"],
    [0.0000005, "0.000001"],
    [0.123456789, "0.123457"],
    [10, "10"],
    [10.5, "10.5"],
  ])("formats %s without exponent notation", (value, expected) => {
    expect(formatFfmpegSeconds(value)).toBe(expected);
  });

  it("rejects non-finite values", () => {
    expect(() => formatFfmpegSeconds(Number.POSITIVE_INFINITY)).toThrow(/finite/i);
  });
});
