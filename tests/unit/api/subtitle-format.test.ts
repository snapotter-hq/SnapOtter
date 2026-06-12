import { describe, expect, it } from "vitest";
import type { TranscriptSegment } from "../../../apps/api/src/lib/subtitle-format.js";
import { toSrt, toVtt } from "../../../apps/api/src/lib/subtitle-format.js";

const TWO_SEGMENTS: TranscriptSegment[] = [
  { startS: 0, endS: 1.5, text: "Hello world" },
  { startS: 2.0, endS: 4.75, text: "Second line" },
];

describe("toSrt", () => {
  it("formats two segments with comma millisecond separator and 1-based counters", () => {
    const result = toSrt(TWO_SEGMENTS);
    const expected =
      "1\n00:00:00,000 --> 00:00:01,500\nHello world\n\n" +
      "2\n00:00:02,000 --> 00:00:04,750\nSecond line\n";
    expect(result).toBe(expected);
  });

  it("returns empty string for empty segments", () => {
    expect(toSrt([])).toBe("");
  });
});

describe("toVtt", () => {
  it("formats two segments with WEBVTT header and dot millisecond separator", () => {
    const result = toVtt(TWO_SEGMENTS);
    const expected =
      "WEBVTT\n\n" +
      "00:00:00.000 --> 00:00:01.500\nHello world\n\n" +
      "00:00:02.000 --> 00:00:04.750\nSecond line\n";
    expect(result).toBe(expected);
  });

  it("returns WEBVTT header with trailing newlines for empty segments", () => {
    expect(toVtt([])).toBe("WEBVTT\n\n");
  });
});
