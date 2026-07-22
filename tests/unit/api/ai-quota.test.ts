import { describe, expect, it } from "vitest";
import { isOverAiJobCap } from "../../../apps/api/src/lib/ai-quota.js";

describe("isOverAiJobCap", () => {
  it("is disabled (never over) when cap is 0", () => {
    expect(isOverAiJobCap(1000, 0)).toBe(false);
  });

  it("is false while in-flight is below the cap", () => {
    expect(isOverAiJobCap(4, 5)).toBe(false);
  });

  it("is true once in-flight reaches the cap", () => {
    expect(isOverAiJobCap(5, 5)).toBe(true);
    expect(isOverAiJobCap(6, 5)).toBe(true);
  });
});
