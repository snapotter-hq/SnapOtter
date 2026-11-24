import { describe, expect, it } from "vitest";
import { formatTimecode, parseTimecode } from "@/lib/timecode";

describe("parseTimecode (#728)", () => {
  it.each([
    ["0", 0],
    ["90", 90],
    ["12.5", 12.5],
    ["12,5", 12.5],
    ["1:30", 90],
    ["01:30", 90],
    ["90:00", 5400],
    ["1:30.25", 90.25],
    ["1:02:03", 3723],
    ["01:02:03.5", 3723.5],
    ["  1:30  ", 90],
  ])("reads %j as %d seconds", (input, expected) => {
    expect(parseTimecode(input)).toBe(expected);
  });

  it.each([
    "",
    "   ",
    "abc",
    "1:",
    ":30",
    "1:60",
    "1:61:00",
    "1:00:60",
    "1:2:3:4",
    "-5",
    "1:-5",
    "1.5:00",
    "1e3",
    "1..5",
  ])("rejects %j", (input) => {
    expect(parseTimecode(input)).toBeNull();
  });

  it("rejects digit strings too long to be a finite number", () => {
    expect(parseTimecode("9".repeat(400))).toBeNull();
  });
});

describe("formatTimecode (#728)", () => {
  it.each([
    [0, "0:00"],
    [5, "0:05"],
    [90, "1:30"],
    [90.5, "1:30.5"],
    [90.25, "1:30.25"],
    [599.999, "9:59.999"],
    [3599, "59:59"],
    [3600, "1:00:00"],
    [3723.5, "1:02:03.5"],
    [36000, "10:00:00"],
  ])("writes %d seconds as %j", (seconds, expected) => {
    expect(formatTimecode(seconds)).toBe(expected);
  });

  it("rounds to the millisecond so float noise never leaks into the field", () => {
    expect(formatTimecode(0.1 + 0.2)).toBe("0:00.3");
    expect(formatTimecode(59.9996)).toBe("1:00");
  });

  it("round-trips through parseTimecode", () => {
    for (const s of [0, 1.5, 59.25, 61, 3599.5, 3600, 7322.125]) {
      expect(parseTimecode(formatTimecode(s))).toBe(s);
    }
  });
});
