import { describe, expect, it } from "vitest";
import { COMPRESS_PRESETS } from "../../../packages/shared/src/compress-presets.js";
import { CONVERSION_PRESETS } from "../../../packages/shared/src/conversion-presets.js";
import { isToolDisabled, presetBaseOf } from "../../../packages/shared/src/disabled-tools.js";

// #4462: the API closes a preset's route when its base is disabled (#4288), so
// every client filter has to hide the preset by the same rule.
describe("isToolDisabled", () => {
  it("matches a plain tool by its own id", () => {
    expect(isToolDisabled("resize", ["resize"])).toBe(true);
    expect(isToolDisabled("resize", ["crop"])).toBe(false);
    expect(isToolDisabled("resize", [])).toBe(false);
  });

  it("hides a preset disabled by its own id and keeps its siblings", () => {
    expect(isToolDisabled("heic-to-jpg", ["heic-to-jpg"])).toBe(true);
    expect(isToolDisabled("heic-to-png", ["heic-to-jpg"])).toBe(false);
  });

  it.each([...new Set(CONVERSION_PRESETS.map((p) => p.base))])(
    "hides every conversion preset of the %s base when the base is disabled",
    (base) => {
      for (const preset of CONVERSION_PRESETS) {
        expect(isToolDisabled(preset.id, [base]), preset.id).toBe(preset.base === base);
      }
    },
  );

  it.each(["compress", "compress-pdf"])(
    "hides every compress preset of the %s base when the base is disabled",
    (base) => {
      for (const preset of COMPRESS_PRESETS) {
        expect(isToolDisabled(preset.id, [base]), preset.id).toBe(preset.base === base);
      }
    },
  );

  it("accepts a Set as well as an array", () => {
    expect(isToolDisabled("heic-to-jpg", new Set(["convert"]))).toBe(true);
    expect(isToolDisabled("resize", new Set(["convert"]))).toBe(false);
  });

  it("does not resolve Object.prototype keys as presets", () => {
    expect(presetBaseOf("constructor")).toBeUndefined();
    expect(presetBaseOf("toString")).toBeUndefined();
    expect(isToolDisabled("constructor", ["convert"])).toBe(false);
  });
});

describe("presetBaseOf", () => {
  it("returns the base of conversion and compress presets", () => {
    expect(presetBaseOf("heic-to-jpg")).toBe("convert");
    expect(presetBaseOf("compress-image-to-100kb")).toBe("compress");
    expect(presetBaseOf("compress-pdf-to-1mb")).toBe("compress-pdf");
  });

  it("returns undefined for a tool that is not a preset", () => {
    expect(presetBaseOf("resize")).toBeUndefined();
    expect(presetBaseOf("convert")).toBeUndefined();
  });
});
