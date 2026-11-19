import { describe, expect, it } from "vitest";
import { solveProportion } from "../../../apps/api/src/lib/proportion.js";

describe("solveProportion", () => {
  it("solves a direct proportion: A is to B as C is to X", () => {
    // 3 apples cost 6, so 10 apples cost 20.
    expect(solveProportion(3, 6, 10, "direct")).toEqual({ ok: true, x: 20 });
  });

  it("solves an inverse proportion: A times B equals C times X", () => {
    // 4 workers take 6 days, so 8 workers take 3 days.
    expect(solveProportion(4, 6, 8, "inverse")).toEqual({ ok: true, x: 3 });
  });

  it("rounds away binary floating-point noise", () => {
    // In raw doubles these are 0.10000000000000002, 0.20999999999999996,
    // 1.5000000000000002 and 6.000000000000001.
    expect(solveProportion(3, 0.1, 3, "direct")).toEqual({ ok: true, x: 0.1 });
    expect(solveProportion(10, 0.7, 3, "direct")).toEqual({ ok: true, x: 0.21 });
    expect(solveProportion(3, 0.1, 0.2, "inverse")).toEqual({ ok: true, x: 1.5 });
    expect(solveProportion(0.1, 0.2, 3, "direct")).toEqual({ ok: true, x: 6 });
  });

  it("handles negative values and a zero numerator", () => {
    expect(solveProportion(-2, 5, 4, "direct")).toEqual({ ok: true, x: -10 });
    expect(solveProportion(2, 0, 4, "direct")).toEqual({ ok: true, x: 0 });
  });

  it("never answers negative zero", () => {
    const solved = solveProportion(-2, 0, 4, "direct");
    expect(solved.ok && Object.is(solved.x, 0)).toBe(true);
  });

  it("refuses a zero divisor: A for direct, C for inverse", () => {
    expect(solveProportion(0, 6, 10, "direct")).toEqual({ ok: false, reason: "zero-divisor" });
    expect(solveProportion(4, 6, 0, "inverse")).toEqual({ ok: false, reason: "zero-divisor" });
    // The other mode's divisor may be zero.
    expect(solveProportion(0, 6, 10, "inverse")).toEqual({ ok: true, x: 0 });
  });

  it("answers when only the intermediate product would overflow or underflow", () => {
    expect(solveProportion(1e200, 1e200, 1e200, "direct")).toEqual({ ok: true, x: 1e200 });
    expect(solveProportion(1e-200, 1e-200, 1e-200, "direct")).toEqual({ ok: true, x: 1e-200 });
    expect(solveProportion(1e200, 1e200, 1e200, "inverse")).toEqual({ ok: true, x: 1e200 });
    expect(solveProportion(1e-200, 1e-200, 1e-200, "inverse")).toEqual({ ok: true, x: 1e-200 });
  });

  it("keeps the largest double instead of rounding it up to infinity", () => {
    expect(solveProportion(1, Number.MAX_VALUE, 1, "direct")).toEqual({
      ok: true,
      x: Number.MAX_VALUE,
    });
  });

  it("refuses an answer outside the range a double holds", () => {
    expect(solveProportion(1e-300, 1e300, 1e300, "direct")).toEqual({
      ok: false,
      reason: "out-of-range",
    });
    expect(solveProportion(1e300, 1e-300, 1e-300, "direct")).toEqual({
      ok: false,
      reason: "out-of-range",
    });
  });
});
