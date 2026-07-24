import { isToolInputError } from "@snapotter/shared";
import { describe, expect, it } from "vitest";
import { markIfInputError } from "../src/ffmpeg.js";

/**
 * markIfInputError tags the error with the isToolInputError marker when stderr
 * matches one of INPUT_ERROR_PATTERNS. One matching string per pattern kills
 * the corresponding array-element mutant; a non-matching string proves the
 * marker is NOT applied indiscriminately (kills the `.some(...) ? ... : err`
 * conditional and the boolean-return mutants).
 */
describe("markIfInputError: matches each INPUT_ERROR_PATTERN", () => {
  const matches: Array<[string, string]> = [
    ["received no packets", "Output file #0 does not contain any stream: received no packets"],
    ["invalid data found when processing input", "pipe:: Invalid data found when processing input"],
    ["could not find codec parameters", "Could not find codec parameters for stream 0 (Video)"],
    ["moov atom not found", "[mov,mp4] moov atom not found\nError opening input file"],
  ];

  for (const [label, stderr] of matches) {
    it(`marks input error for "${label}"`, () => {
      const err = markIfInputError(new Error("ffmpeg exited 1"), stderr);
      expect(isToolInputError(err)).toBe(true);
    });
  }
});

describe("markIfInputError: does not mark unrelated stderr", () => {
  it("leaves a generic ffmpeg error unmarked", () => {
    const err = markIfInputError(new Error("boom"), "Conversion failed! Unknown encoder 'libfoo'");
    expect(isToolInputError(err)).toBe(false);
  });

  it("leaves empty stderr unmarked", () => {
    const err = markIfInputError(new Error("boom"), "");
    expect(isToolInputError(err)).toBe(false);
  });
});

describe("markIfInputError: case-insensitive matching and identity", () => {
  it("matches regardless of case (uppercase 'MOOV ATOM NOT FOUND')", () => {
    const err = markIfInputError(new Error("x"), "MOOV ATOM NOT FOUND");
    expect(isToolInputError(err)).toBe(true);
  });

  it("returns the same error object it was given", () => {
    const original = new Error("x");
    expect(markIfInputError(original, "moov atom not found")).toBe(original);
  });

  it("returns the same object when it does not match (no copy)", () => {
    const original = new Error("x");
    expect(markIfInputError(original, "nothing matches here")).toBe(original);
  });
});
