/**
 * The QA sweep used to post an image to the aspect-ratio calculator, which
 * takes a JSON body and answers with numbers, and recorded the 400 (#5031).
 * Its lane now sends a JSON body, and this oracle checks the numbers rather
 * than accepting any non-empty JSON object as a pass.
 */

import { describe, expect, it } from "vitest";
import { calculateAspectRatio } from "../../../apps/api/src/routes/tools/aspect-ratio-calculator.js";
import { JSON_RESULT_ORACLES } from "../../qa/lib/oracles.js";

const oracle = JSON_RESULT_ORACLES["aspect-ratio-calculator"];

describe("aspect-ratio-calculator JSON oracle", () => {
  it("passes the route's answer for the sweep's 1920x1080 to 1280-wide body", () => {
    const result = calculateAspectRatio({ width: 1920, height: 1080, newWidth: 1280, round: true });
    expect(result).toMatchObject({ ratio: "16:9", newHeight: 720 });
    expect(oracle(result as unknown as Record<string, unknown>)).toBeNull();
  });

  it("passes a solved width when the body pins the new height", () => {
    const result = calculateAspectRatio({ width: 1920, height: 1080, newHeight: 720, round: true });
    expect(oracle(result as unknown as Record<string, unknown>)).toBeNull();
  });

  it("passes sizes with more decimals than the route keeps", () => {
    const result = calculateAspectRatio({ width: 1.23456, height: 1, round: true });
    expect(result.ratio).toBe("6173:5000");
    expect(oracle(result as unknown as Record<string, unknown>)).toBeNull();
  });

  it("fails a ratio that is not the simplified width:height", () => {
    const base = {
      width: 1920,
      height: 1080,
      ratioDecimal: 1.7778,
      newWidth: 1280,
      newHeight: 720,
    };
    expect(oracle({ ...base, ratio: "4:3" })).toMatch(/ratio/);
    expect(oracle({ ...base, ratio: "32:18" })).toMatch(/ratio/);
  });

  it("fails a solved dimension that breaks the ratio", () => {
    const wrong = {
      width: 1920,
      height: 1080,
      ratio: "16:9",
      ratioDecimal: 1.7778,
      newWidth: 1280,
      newHeight: 960,
    };
    expect(oracle(wrong)).toMatch(/newHeight/);
  });

  it("fails a body with no ratio at all", () => {
    expect(oracle({ width: 1920, height: 1080 })).toMatch(/ratio/);
  });
});
