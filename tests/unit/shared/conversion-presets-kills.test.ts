import { describe, expect, it } from "vitest";
import {
  CONVERSION_PRESET_BY_ID,
  expandConversionPresets,
} from "../../../packages/shared/src/conversion-presets.js";

// Targets the expansion logic in expandConversionPresets (L593-L599): the
// name/description templates and the executionHint derivation
// (base?.executionHint ?? (cfg.modality === "image" ? "fast" : "long")).

describe("expandConversionPresets name/description templates", () => {
  it("builds name and description from the preset's from/to for every preset", () => {
    const tools = expandConversionPresets();
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      const preset = CONVERSION_PRESET_BY_ID[tool.id];
      expect(preset).toBeDefined();
      expect(tool.name).toBe(`${preset.from} to ${preset.to}`);
      expect(tool.description).toBe(`Convert ${preset.from} to ${preset.to}`);
      expect(tool.route).toBe(`/${preset.id}`);
    }
  });
});

describe("expandConversionPresets executionHint derivation", () => {
  it("without a base tool: image modality is fast, every other modality is long", () => {
    const tools = expandConversionPresets();
    // Prove both arms of the ternary are exercised across the catalog.
    const image = tools.filter((t) => t.modality === "image");
    const other = tools.filter((t) => t.modality !== "image");
    expect(image.length).toBeGreaterThan(0);
    for (const t of image) expect(t.executionHint).toBe("fast");
    for (const t of other) expect(t.executionHint).toBe("long");
  });

  it("with a base tool present, the base's executionHint wins over the modality default", () => {
    // Give every base an explicit "long" hint; image presets would default to
    // "fast", so if they come back "long" the base override (the ?? left side)
    // is what produced it.
    const bases = new Set(Object.values(CONVERSION_PRESET_BY_ID).map((p) => p.base));
    const baseTools = [...bases].map((id) => ({ id, executionHint: "long" as const }));
    const tools = expandConversionPresets(baseTools);
    const image = tools.filter((t) => t.modality === "image");
    expect(image.length).toBeGreaterThan(0);
    for (const t of image) expect(t.executionHint).toBe("long");
  });

  it("a base tool with a fast hint overrides a non-image modality default of long", () => {
    const bases = new Set(Object.values(CONVERSION_PRESET_BY_ID).map((p) => p.base));
    const baseTools = [...bases].map((id) => ({ id, executionHint: "fast" as const }));
    const tools = expandConversionPresets(baseTools);
    const other = tools.filter((t) => t.modality !== "image");
    if (other.length > 0) for (const t of other) expect(t.executionHint).toBe("fast");
  });
});
