import { describe, expect, it } from "vitest";
import { timeModeSegmentLength } from "../../../apps/api/src/routes/tools/split-audio.js";

describe("split-audio time-mode segment length (#4438)", () => {
  it("stretches the parts so a sub-frame remainder joins the last one", () => {
    // 60 s of 44.1 kHz MP3 probes as 60.029 s; a cut at 60 left a frameless tail.
    const seg = timeModeSegmentLength(60.029388, 10);
    expect(seg).not.toBeNull();
    expect(seg as number).toBeGreaterThan(10);
    expect(6 * (seg as number)).toBeGreaterThan(60.029388);
    expect(5 * (seg as number)).toBeLessThan(60.029388 - 9);

    const hour = timeModeSegmentLength(3600.04, 600) as number;
    expect(6 * hour).toBeGreaterThan(3600.04);
    expect(hour - 600).toBeLessThan(0.1);
  });

  it("keeps the requested length when the remainder decodes on its own", () => {
    expect(timeModeSegmentLength(1.2, 1)).toBe(1);
    expect(timeModeSegmentLength(20.1, 10)).toBe(10);
  });

  it("does not leave an empty part on an exact multiple", () => {
    const seg = timeModeSegmentLength(30, 10) as number;
    expect(3 * seg).toBeGreaterThan(30);
    expect(2 * seg).toBeLessThan(30);
  });

  it("returns null when the input fits in one part", () => {
    expect(timeModeSegmentLength(10.05, 10)).toBeNull();
    expect(timeModeSegmentLength(1.044898, 1)).toBeNull();
    expect(timeModeSegmentLength(5, 10)).toBeNull();
    expect(timeModeSegmentLength(0, 10)).toBeNull();
  });
});
