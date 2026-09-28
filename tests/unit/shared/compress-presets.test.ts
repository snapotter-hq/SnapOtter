import { describe, expect, it } from "vitest";
import {
  COMPRESS_PRESET_BY_ID,
  COMPRESS_PRESETS,
  expandCompressPresets,
} from "../../../packages/shared/src/compress-presets.js";
import { TOOLS } from "../../../packages/shared/src/constants.js";
import { toolSection } from "../../../packages/shared/src/section.js";

const imagePresets = COMPRESS_PRESETS.filter((p) => p.base === "compress");
const pdfPresets = COMPRESS_PRESETS.filter((p) => p.base === "compress-pdf");

describe("compress presets", () => {
  it("defines 10 presets with unique ids", () => {
    expect(COMPRESS_PRESETS.length).toBe(10);
    const ids = COMPRESS_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(10);
  });

  it("every preset locks target-size mode at its own target", () => {
    for (const preset of COMPRESS_PRESETS) {
      expect(preset.locked).toEqual({ mode: "targetSize", targetSizeKb: preset.targetSizeKb });
      expect(preset.lockedSettings).toEqual(preset.locked);
    }
  });

  it("presets are present in the exported TOOLS catalog", () => {
    const toolIds = new Set(TOOLS.map((t) => t.id));
    for (const p of COMPRESS_PRESETS) {
      expect(toolIds.has(p.id)).toBe(true);
    }
  });

  it("COMPRESS_PRESET_BY_ID indexes all presets accurately", () => {
    for (const p of COMPRESS_PRESETS) {
      expect(COMPRESS_PRESET_BY_ID[p.id]).toBe(p);
    }
  });
});

describe("image compress presets", () => {
  it("targets 20, 50, 100, 200, and 500 KB", () => {
    expect(imagePresets.map((p) => p.targetSizeKb)).toEqual([20, 50, 100, 200, 500]);
  });

  it("expand into image tools in the essentials category", () => {
    const expanded = expandCompressPresets(TOOLS).filter((t) =>
      imagePresets.some((p) => p.id === t.id),
    );
    expect(expanded.length).toBe(5);
    for (const tool of expanded) {
      expect(tool.route).toBe(`/${tool.id}`);
      expect(tool.modality).toBe("image");
      expect(tool.category).toBe("essentials");
      expect(tool.executionHint).toBe("fast");
      expect(tool.keywords?.length).toBeGreaterThan(3);
    }
  });

  it("keywords include the natural phrasing and target size variants", () => {
    const to50 = expandCompressPresets(TOOLS).find((t) => t.id === "compress-image-to-50kb");
    expect(to50?.keywords).toContain("compress image to 50kb");
    expect(to50?.keywords).toContain("50 kb");
    expect(to50?.keywords).toContain("50kb");
  });
});

// #1070: the sizes people hit on upload caps (portals, applications, email).
describe("PDF compress presets", () => {
  it("targets 100, 200, 500 KB and 1, 2 MB in decimal units", () => {
    expect(pdfPresets.map((p) => [p.id, p.targetSizeKb, p.label])).toEqual([
      ["compress-pdf-to-100kb", 100, "100 KB"],
      ["compress-pdf-to-200kb", 200, "200 KB"],
      ["compress-pdf-to-500kb", 500, "500 KB"],
      ["compress-pdf-to-1mb", 1000, "1 MB"],
      ["compress-pdf-to-2mb", 2000, "2 MB"],
    ]);
  });

  it("expand into PDF tools that mirror compress-pdf", () => {
    const base = TOOLS.find((t) => t.id === "compress-pdf");
    const expanded = expandCompressPresets(TOOLS).filter((t) =>
      pdfPresets.some((p) => p.id === t.id),
    );
    expect(expanded.length).toBe(5);
    for (const tool of expanded) {
      expect(tool.route).toBe(`/${tool.id}`);
      expect(tool.modality).toBe("document");
      expect(tool.acceptedInputs).toEqual([".pdf"]);
      expect(tool.category).toBe(base?.category);
      expect(tool.icon).toBe(base?.icon);
      expect(tool.executionHint).toBe("long");
      expect(toolSection(tool)).toBe("pdf");
    }
  });

  it("keywords cover the searches the presets exist for", () => {
    const expanded = expandCompressPresets(TOOLS);
    const to100 = expanded.find((t) => t.id === "compress-pdf-to-100kb");
    expect(to100?.keywords).toEqual(
      expect.arrayContaining([
        "compress pdf to 100kb",
        "compress pdf to 100 kb",
        "pdf under 100kb",
      ]),
    );
    const to1mb = expanded.find((t) => t.id === "compress-pdf-to-1mb");
    expect(to1mb?.keywords).toEqual(
      expect.arrayContaining(["compress pdf to 1mb", "compress pdf to 1 mb", "pdf under 1mb"]),
    );
    // A PDF preset must not claim the image presets' bare size keywords.
    expect(to100?.keywords).not.toContain("100kb");
  });
});
