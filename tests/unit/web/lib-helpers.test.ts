// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Global mocks
// ---------------------------------------------------------------------------

vi.stubGlobal("localStorage", {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  get length() {
    return 0;
  },
  key: vi.fn(() => null),
});

// ==========================================================================
// formatFileSize (download.ts)
// ==========================================================================

import { formatFileSize } from "@/lib/download";

describe("formatFileSize", () => {
  it("formats bytes under 1 MB as KB", () => {
    expect(formatFileSize(512)).toBe("1 KB");
    expect(formatFileSize(1024)).toBe("1 KB");
    expect(formatFileSize(10240)).toBe("10 KB");
    expect(formatFileSize(512000)).toBe("500 KB");
  });

  it("formats bytes at or above 1 MB as MB", () => {
    expect(formatFileSize(1048576)).toBe("1.0 MB");
    expect(formatFileSize(1572864)).toBe("1.5 MB");
    expect(formatFileSize(10485760)).toBe("10.0 MB");
  });

  it("handles zero bytes", () => {
    expect(formatFileSize(0)).toBe("0 KB");
  });

  it("formats values just below 1 MB threshold", () => {
    expect(formatFileSize(1048575)).toBe("1024 KB");
  });
});

// ==========================================================================
// formatExifValue / exifStr (metadata-utils.ts)
// ==========================================================================

import { exifStr, formatExifValue, SKIP_KEYS } from "@/lib/metadata-utils";

describe("formatExifValue", () => {
  it("returns 'N/A' for null", () => {
    expect(formatExifValue("any", null)).toBe("N/A");
  });

  it("returns 'N/A' for undefined", () => {
    expect(formatExifValue("any", undefined)).toBe("N/A");
  });

  it("returns string values as-is", () => {
    expect(formatExifValue("Make", "Canon")).toBe("Canon");
  });

  it("formats ExposureTime as fraction", () => {
    expect(formatExifValue("ExposureTime", 0.004)).toBe("1/250s");
    expect(formatExifValue("ExposureTime", 0.0125)).toBe("1/80s");
  });

  it("formats ExposureTime >= 1 as plain number", () => {
    expect(formatExifValue("ExposureTime", 2)).toBe("2");
  });

  it("formats FNumber with f/ prefix", () => {
    expect(formatExifValue("FNumber", 2.8)).toBe("f/2.8");
  });

  it("formats FocalLength with mm suffix", () => {
    expect(formatExifValue("FocalLength", 50)).toBe("50mm");
    expect(formatExifValue("FocalLengthIn35mmFormat", 85)).toBe("85mm");
  });

  it("returns plain number string for other numeric keys", () => {
    expect(formatExifValue("ISO", 400)).toBe("400");
  });

  it("joins short arrays with commas", () => {
    expect(formatExifValue("Keywords", ["nature", "sunset"])).toBe("nature, sunset");
  });

  it("summarizes long arrays", () => {
    const arr = [1, 2, 3, 4, 5, 6, 7];
    expect(formatExifValue("SomeField", arr)).toBe("[7 values]");
  });

  it("handles arrays of exactly 6 items", () => {
    const arr = [1, 2, 3, 4, 5, 6];
    expect(formatExifValue("SomeField", arr)).toBe("1, 2, 3, 4, 5, 6");
  });

  it("stringifies other types", () => {
    expect(formatExifValue("unknown", true)).toBe("true");
    expect(formatExifValue("unknown", { nested: 1 })).toBe("[object Object]");
  });
});

describe("exifStr", () => {
  it("returns string value from exif object", () => {
    expect(exifStr({ Make: "Nikon" }, "Make")).toBe("Nikon");
  });

  it("returns stringified number from exif object", () => {
    expect(exifStr({ ISO: 800 }, "ISO")).toBe("800");
  });

  it("returns empty string for missing key", () => {
    expect(exifStr({ Make: "Canon" }, "Model")).toBe("");
  });

  it("returns empty string for null exif", () => {
    expect(exifStr(null, "Make")).toBe("");
  });

  it("returns empty string for undefined exif", () => {
    expect(exifStr(undefined, "Make")).toBe("");
  });

  it("returns empty string for non-string/number values", () => {
    expect(exifStr({ Keywords: ["a", "b"] }, "Keywords")).toBe("");
  });
});

describe("SKIP_KEYS", () => {
  it("contains expected internal keys", () => {
    expect(SKIP_KEYS.has("ExifToolVersion")).toBe(true);
    expect(SKIP_KEYS.has("FileName")).toBe(true);
    expect(SKIP_KEYS.has("ThumbnailImage")).toBe(true);
    expect(SKIP_KEYS.has("MakerNote")).toBe(true);
  });

  it("does not contain display keys", () => {
    expect(SKIP_KEYS.has("Make")).toBe(false);
    expect(SKIP_KEYS.has("Model")).toBe(false);
    expect(SKIP_KEYS.has("ISO")).toBe(false);
  });
});

// ==========================================================================
// getSuggestedTools (suggested-tools.ts)
// ==========================================================================

import { getSuggestedTools } from "@/lib/suggested-tools";

describe("getSuggestedTools", () => {
  it("returns suggestions for a known tool", () => {
    const suggestions = getSuggestedTools("resize");
    expect(suggestions).toContain("compress");
    expect(suggestions).toContain("convert");
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it("returns suggestions for compress", () => {
    const suggestions = getSuggestedTools("compress");
    expect(suggestions).toContain("convert");
  });

  it("returns default fallback for an unknown tool", () => {
    const suggestions = getSuggestedTools("nonexistent-tool");
    expect(suggestions).toEqual(["resize", "compress", "convert"]);
  });

  it("returns suggestions for remove-background", () => {
    const suggestions = getSuggestedTools("remove-background");
    expect(suggestions).toContain("resize");
    expect(suggestions).toContain("compress");
  });
});

// ==========================================================================
// needsServerPreview (image-preview.ts)
// ==========================================================================

import { needsServerPreview } from "@/lib/image-preview";

describe("needsServerPreview", () => {
  it("returns true for HEIC files", () => {
    const file = new File([], "photo.heic", { type: "image/heic" });
    expect(needsServerPreview(file)).toBe(true);
  });

  it("returns true for HEIF files", () => {
    const file = new File([], "photo.heif", { type: "image/heif" });
    expect(needsServerPreview(file)).toBe(true);
  });

  it("returns true for JPEG XL files", () => {
    const file = new File([], "photo.jxl", { type: "image/jxl" });
    expect(needsServerPreview(file)).toBe(true);
  });

  it("returns true for camera RAW formats", () => {
    for (const ext of ["dng", "cr2", "nef", "arw", "orf", "rw2"]) {
      const file = new File([], `photo.${ext}`);
      expect(needsServerPreview(file)).toBe(true);
    }
  });

  it("returns true for PSD files", () => {
    const file = new File([], "design.psd");
    expect(needsServerPreview(file)).toBe(true);
  });

  it("returns true for EXR files", () => {
    const file = new File([], "render.exr");
    expect(needsServerPreview(file)).toBe(true);
  });

  it("returns true for HDR files", () => {
    const file = new File([], "panorama.hdr");
    expect(needsServerPreview(file)).toBe(true);
  });

  it("returns true for TGA files", () => {
    const file = new File([], "texture.tga");
    expect(needsServerPreview(file)).toBe(true);
  });

  it("returns true for ICO files", () => {
    const file = new File([], "favicon.ico");
    expect(needsServerPreview(file)).toBe(true);
  });

  it("returns false for standard browser-supported formats", () => {
    for (const ext of ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"]) {
      const file = new File([], `image.${ext}`);
      expect(needsServerPreview(file)).toBe(false);
    }
  });

  it("returns false for files with no extension", () => {
    const file = new File([], "noext");
    expect(needsServerPreview(file)).toBe(false);
  });
});

// ==========================================================================
// Collage template helpers (collage-templates.ts)
// ==========================================================================

import {
  COLLAGE_TEMPLATES,
  getDefaultTemplate,
  getTemplateById,
  getTemplatesForCount,
} from "@/lib/collage-templates";

describe("getTemplatesForCount", () => {
  it("returns templates matching a given image count", () => {
    const twoImage = getTemplatesForCount(2);
    expect(twoImage.length).toBeGreaterThan(0);
    expect(twoImage.every((t) => t.imageCount === 2)).toBe(true);
  });

  it("returns multiple templates for counts with variants", () => {
    const threeImage = getTemplatesForCount(3);
    expect(threeImage.length).toBeGreaterThanOrEqual(3);
  });

  it("returns empty array for unsupported count", () => {
    expect(getTemplatesForCount(100)).toEqual([]);
  });
});

describe("getDefaultTemplate", () => {
  it("returns first exact match for known count", () => {
    const template = getDefaultTemplate(2);
    expect(template.imageCount).toBe(2);
    expect(template.id).toBe("2-h-equal");
  });

  it("returns nearest template for unknown count", () => {
    const template = getDefaultTemplate(10);
    expect(template).toBeDefined();
    expect(template.cells.length).toBeGreaterThan(0);
  });

  it("returns a template for count 1", () => {
    const template = getDefaultTemplate(1);
    expect(template).toBeDefined();
  });
});

describe("getTemplateById", () => {
  it("finds a template by ID", () => {
    const template = getTemplateById("4-grid");
    expect(template).toBeDefined();
    expect(template?.imageCount).toBe(4);
    expect(template?.cells).toHaveLength(4);
  });

  it("returns undefined for unknown ID", () => {
    expect(getTemplateById("nonexistent")).toBeUndefined();
  });
});

describe("COLLAGE_TEMPLATES", () => {
  it("has templates for counts 2 through 9", () => {
    for (let count = 2; count <= 9; count++) {
      const templates = getTemplatesForCount(count);
      expect(templates.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("every template has cells matching or exceeding imageCount", () => {
    for (const t of COLLAGE_TEMPLATES) {
      expect(t.cells.length).toBeGreaterThanOrEqual(t.imageCount);
    }
  });

  it("every template has a non-empty label", () => {
    for (const t of COLLAGE_TEMPLATES) {
      expect(t.label.length).toBeGreaterThan(0);
    }
  });
});
