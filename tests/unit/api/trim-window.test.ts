import { describe, expect, it } from "vitest";
import { resolveTrimWindow } from "../../../apps/api/src/lib/trim-window.js";
import { InputValidationError } from "../../../apps/api/src/modality/contract.js";

const range = (startS: number, endS: number) => ({
  mode: "range" as const,
  startS,
  endS,
  cutStartS: 0,
  cutEndS: 0,
});
const ends = (cutStartS: number, cutEndS: number) => ({
  mode: "ends" as const,
  startS: 0,
  cutStartS,
  cutEndS,
});

describe("resolveTrimWindow (#728)", () => {
  it("keeps the start/end range in range mode", () => {
    expect(resolveTrimWindow(range(2, 5), 10, "video")).toEqual({ startS: 2, endS: 5 });
  });

  it("clamps the range end to the duration", () => {
    expect(resolveTrimWindow(range(2, 50), 10, "video")).toEqual({ startS: 2, endS: 10 });
  });

  it("rejects a range that starts past the end", () => {
    expect(() => resolveTrimWindow(range(10, 12), 10, "audio")).toThrow(
      new InputValidationError("Start is beyond the end of the audio"),
    );
  });

  it("cuts time off both ends in ends mode", () => {
    expect(resolveTrimWindow(ends(1.5, 2), 10, "video")).toEqual({ startS: 1.5, endS: 8 });
  });

  it("cuts only the start or only the end", () => {
    expect(resolveTrimWindow(ends(3, 0), 10, "video")).toEqual({ startS: 3, endS: 10 });
    expect(resolveTrimWindow(ends(0, 3), 10, "video")).toEqual({ startS: 0, endS: 7 });
  });

  it("rejects ends cuts that leave nothing", () => {
    expect(() => resolveTrimWindow(ends(6, 4), 10, "video")).toThrow(InputValidationError);
    expect(() => resolveTrimWindow(ends(0, 12), 10, "video")).toThrow(InputValidationError);
    expect(() => resolveTrimWindow(ends(12, 0), 10, "video")).toThrow(InputValidationError);
    expect(() => resolveTrimWindow(ends(8, 5), 10, "audio")).toThrow(
      /nothing of the audio is left/i,
    );
  });
});
