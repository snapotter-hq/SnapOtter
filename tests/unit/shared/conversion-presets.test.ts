import { describe, expect, it } from "vitest";
import { TOOLS } from "../../../packages/shared/src/constants.js";
import {
  CONVERSION_PRESETS,
  expandConversionPresets,
} from "../../../packages/shared/src/conversion-presets.js";

describe("conversion presets", () => {
  it("defines 83 presets with unique ids", () => {
    expect(CONVERSION_PRESETS.length).toBe(83);
    const ids = CONVERSION_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(83);
  });

  it("every expanded preset is a valid Tool with route, keywords, modality", () => {
    for (const tool of expandConversionPresets()) {
      expect(tool.route).toBe(`/${tool.id}`);
      expect(tool.keywords && tool.keywords.length).toBeGreaterThan(3);
      expect(tool.modality).toBeTruthy();
      expect(tool.executionHint).toMatch(/fast|long/);
    }
  });

  it("presets are present in the exported TOOLS catalog", () => {
    const toolIds = new Set(TOOLS.map((t) => t.id));
    for (const p of CONVERSION_PRESETS) expect(toolIds.has(p.id)).toBe(true);
  });

  it("preset keywords include the natural phrasing", () => {
    const jpgPng = expandConversionPresets().find((t) => t.id === "jpg-to-png");
    expect(jpgPng?.keywords).toContain("jpg to png");
    expect(jpgPng?.keywords).toContain("jpeg to png");
  });
});
