// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock all lazy-loaded tool settings components so we don't pull in the
// entire React component tree. Each dynamic import returns a minimal stub.
// ---------------------------------------------------------------------------

vi.mock("@/components/tools/resize-settings", () => ({
  ResizeSettings: () => null,
}));
vi.mock("@/components/tools/crop-settings", () => ({
  CropSettings: () => null,
}));
vi.mock("@/components/tools/rotate-settings", () => ({
  RotateSettings: () => null,
}));
vi.mock("@/components/tools/convert-settings", () => ({
  ConvertSettings: () => null,
}));
vi.mock("@/components/tools/compress-settings", () => ({
  CompressSettings: () => null,
}));
vi.mock("@/components/tools/optimize-for-web-settings", () => ({
  OptimizeForWebSettings: () => null,
}));
vi.mock("@/components/tools/strip-metadata-settings", () => ({
  StripMetadataSettings: () => null,
}));
vi.mock("@/components/tools/edit-metadata-settings", () => ({
  EditMetadataSettings: () => null,
}));
vi.mock("@/components/tools/color-settings", () => ({
  ColorSettings: () => null,
}));
vi.mock("@/components/tools/sharpening-settings", () => ({
  SharpeningSettings: () => null,
}));
vi.mock("@/components/tools/watermark-text-settings", () => ({
  WatermarkTextSettings: () => null,
}));
vi.mock("@/components/tools/watermark-image-settings", () => ({
  WatermarkImageSettings: () => null,
}));
vi.mock("@/components/tools/text-overlay-settings", () => ({
  TextOverlaySettings: () => null,
}));
vi.mock("@/components/tools/compose-settings", () => ({
  ComposeSettings: () => null,
}));
vi.mock("@/components/tools/info-settings", () => ({
  InfoSettings: () => null,
}));
vi.mock("@/components/tools/compare-settings", () => ({
  CompareSettings: () => null,
}));
vi.mock("@/components/tools/find-duplicates-settings", () => ({
  FindDuplicatesSettings: () => null,
}));
vi.mock("@/components/tools/find-duplicates-results", () => ({
  FindDuplicatesResults: () => null,
}));
vi.mock("@/components/tools/color-palette-settings", () => ({
  ColorPaletteSettings: () => null,
}));
vi.mock("@/components/tools/qr-generate-settings", () => ({
  QrGenerateSettings: () => null,
}));
vi.mock("@/components/tools/qr-generate-preview", () => ({
  QrGeneratePreview: () => null,
}));
vi.mock("@/components/tools/barcode-read-settings", () => ({
  BarcodeReadSettings: () => null,
}));
vi.mock("@/components/tools/image-to-base64-settings", () => ({
  ImageToBase64Settings: () => null,
}));
vi.mock("@/components/tools/image-to-base64-results", () => ({
  ImageToBase64Results: () => null,
}));
vi.mock("@/components/tools/collage-settings", () => ({
  CollageSettings: () => null,
}));
vi.mock("@/components/tools/collage-preview", () => ({
  CollagePreview: () => null,
}));
vi.mock("@/components/tools/stitch-settings", () => ({
  StitchSettings: () => null,
}));
vi.mock("@/components/tools/split-settings", () => ({
  SplitSettings: () => null,
}));
vi.mock("@/components/tools/split-canvas", () => ({
  SplitCanvas: () => null,
}));
vi.mock("@/components/tools/border-settings", () => ({
  BorderSettings: () => null,
}));
vi.mock("@/components/tools/svg-to-raster-settings", () => ({
  SvgToRasterSettings: () => null,
}));
vi.mock("@/components/tools/vectorize-settings", () => ({
  VectorizeSettings: () => null,
}));
vi.mock("@/components/tools/gif-tools-settings", () => ({
  GifToolsSettings: () => null,
}));
vi.mock("@/components/tools/bulk-rename-settings", () => ({
  BulkRenameSettings: () => null,
}));
vi.mock("@/components/tools/favicon-settings", () => ({
  FaviconSettings: () => null,
}));
vi.mock("@/components/tools/image-to-pdf-settings", () => ({
  ImageToPdfSettings: () => null,
}));
vi.mock("@/components/tools/pdf-to-image-settings", () => ({
  PdfToImageSettings: () => null,
}));
vi.mock("@/components/tools/pdf-to-image-preview", () => ({
  PdfToImagePreview: () => null,
}));
vi.mock("@/components/tools/replace-color-settings", () => ({
  ReplaceColorSettings: () => null,
}));
vi.mock("@/components/tools/remove-bg-settings", () => ({
  RemoveBgSettings: () => null,
}));
vi.mock("@/components/tools/upscale-settings", () => ({
  UpscaleSettings: () => null,
}));
vi.mock("@/components/tools/ocr-settings", () => ({
  OcrSettings: () => null,
}));
vi.mock("@/components/tools/blur-faces-settings", () => ({
  BlurFacesSettings: () => null,
}));
vi.mock("@/components/tools/enhance-faces-settings", () => ({
  EnhanceFacesSettings: () => null,
}));
vi.mock("@/components/tools/erase-object-settings", () => ({
  EraseObjectSettings: () => null,
}));
vi.mock("@/components/tools/smart-crop-settings", () => ({
  SmartCropSettings: () => null,
}));
vi.mock("@/components/tools/image-enhancement-settings", () => ({
  ImageEnhancementSettings: () => null,
}));
vi.mock("@/components/tools/colorize-settings", () => ({
  ColorizeSettings: () => null,
}));
vi.mock("@/components/tools/noise-removal-settings", () => ({
  NoiseRemovalSettings: () => null,
}));
vi.mock("@/components/tools/passport-photo-settings", () => ({
  PassportPhotoSettings: () => null,
  PassportPhotoPreview: () => null,
}));
vi.mock("@/components/tools/red-eye-removal-settings", () => ({
  RedEyeRemovalSettings: () => null,
}));
vi.mock("@/components/tools/restore-photo-settings", () => ({
  RestorePhotoSettings: () => null,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import type { DisplayMode } from "@/lib/tool-registry";
import { getToolRegistryEntry, toolRegistry } from "@/lib/tool-registry";

// ==========================================================================
// toolRegistry (Map)
// ==========================================================================

describe("toolRegistry", () => {
  it("is a Map with entries", () => {
    expect(toolRegistry).toBeInstanceOf(Map);
    expect(toolRegistry.size).toBeGreaterThan(0);
  });

  it("contains all expected essential tool IDs", () => {
    const essentials = [
      "resize",
      "crop",
      "rotate",
      "convert",
      "compress",
      "strip-metadata",
      "edit-metadata",
    ];
    for (const id of essentials) {
      expect(toolRegistry.has(id), `missing tool: ${id}`).toBe(true);
    }
  });

  it("contains AI tool IDs", () => {
    const aiTools = [
      "remove-background",
      "upscale",
      "ocr",
      "blur-faces",
      "enhance-faces",
      "erase-object",
      "smart-crop",
      "image-enhancement",
      "colorize",
      "noise-removal",
      "passport-photo",
      "red-eye-removal",
      "restore-photo",
    ];
    for (const id of aiTools) {
      expect(toolRegistry.has(id), `missing AI tool: ${id}`).toBe(true);
    }
  });

  it("contains layout and composition tools", () => {
    const layoutTools = ["collage", "stitch", "split", "border"];
    for (const id of layoutTools) {
      expect(toolRegistry.has(id), `missing layout tool: ${id}`).toBe(true);
    }
  });

  it("contains utility tools", () => {
    const utilityTools = [
      "info",
      "compare",
      "find-duplicates",
      "color-palette",
      "qr-generate",
      "barcode-read",
      "image-to-base64",
    ];
    for (const id of utilityTools) {
      expect(toolRegistry.has(id), `missing utility tool: ${id}`).toBe(true);
    }
  });

  it("contains format and conversion tools", () => {
    const formatTools = [
      "svg-to-raster",
      "vectorize",
      "gif-tools",
      "bulk-rename",
      "favicon",
      "image-to-pdf",
      "pdf-to-image",
      "optimize-for-web",
    ];
    for (const id of formatTools) {
      expect(toolRegistry.has(id), `missing format tool: ${id}`).toBe(true);
    }
  });

  it("every entry has a valid displayMode", () => {
    const validModes: DisplayMode[] = [
      "side-by-side",
      "before-after",
      "live-preview",
      "no-comparison",
      "interactive-crop",
      "interactive-eraser",
      "interactive-split",
      "no-dropzone",
      "custom-results",
    ];
    for (const [toolId, entry] of toolRegistry) {
      expect(validModes, `invalid displayMode for ${toolId}`).toContain(entry.displayMode);
    }
  });

  it("every entry has a Settings component", () => {
    for (const [toolId, entry] of toolRegistry) {
      expect(entry.Settings, `missing Settings for ${toolId}`).toBeDefined();
      expect(["function", "object"]).toContain(typeof entry.Settings);
    }
  });

  it("tools with custom-results display mode have a ResultsPanel", () => {
    for (const [toolId, entry] of toolRegistry) {
      if (entry.displayMode === "custom-results") {
        expect(entry.ResultsPanel, `missing ResultsPanel for ${toolId}`).toBeDefined();
      }
    }
  });

  it("tools with no-dropzone display mode have a ResultsPanel", () => {
    for (const [toolId, entry] of toolRegistry) {
      if (entry.displayMode === "no-dropzone") {
        expect(entry.ResultsPanel, `missing ResultsPanel for ${toolId}`).toBeDefined();
      }
    }
  });

  it("rotate has livePreview enabled", () => {
    const rotate = toolRegistry.get("rotate");
    expect(rotate?.livePreview).toBe(true);
  });

  it("adjust-colors has livePreview enabled", () => {
    const adjustColors = toolRegistry.get("adjust-colors");
    expect(adjustColors?.livePreview).toBe(true);
  });

  it("border has livePreview enabled", () => {
    const border = toolRegistry.get("border");
    expect(border?.livePreview).toBe(true);
  });

  it("crop uses interactive-crop display mode", () => {
    const crop = toolRegistry.get("crop");
    expect(crop?.displayMode).toBe("interactive-crop");
  });

  it("erase-object uses interactive-eraser display mode", () => {
    const eraseObject = toolRegistry.get("erase-object");
    expect(eraseObject?.displayMode).toBe("interactive-eraser");
  });

  it("split uses interactive-split display mode", () => {
    const split = toolRegistry.get("split");
    expect(split?.displayMode).toBe("interactive-split");
  });
});

// ==========================================================================
// getToolRegistryEntry
// ==========================================================================

describe("getToolRegistryEntry", () => {
  it("returns the entry for a known tool", () => {
    const entry = getToolRegistryEntry("resize");
    expect(entry).toBeDefined();
    expect(entry?.displayMode).toBe("side-by-side");
  });

  it("returns undefined for an unknown tool", () => {
    expect(getToolRegistryEntry("nonexistent-tool")).toBeUndefined();
  });

  it("returns the correct entry for compress", () => {
    const entry = getToolRegistryEntry("compress");
    expect(entry).toBeDefined();
    expect(entry?.displayMode).toBe("before-after");
  });

  it("returns entry with ResultsPanel for find-duplicates", () => {
    const entry = getToolRegistryEntry("find-duplicates");
    expect(entry).toBeDefined();
    expect(entry?.displayMode).toBe("custom-results");
    expect(entry?.ResultsPanel).toBeDefined();
  });

  it("returns entry with ResultsPanel for qr-generate", () => {
    const entry = getToolRegistryEntry("qr-generate");
    expect(entry).toBeDefined();
    expect(entry?.displayMode).toBe("no-dropzone");
    expect(entry?.ResultsPanel).toBeDefined();
  });
});

// ==========================================================================
// Wrapper components (lines 305-324)
// ==========================================================================

import { render } from "@testing-library/react";
import React from "react";

function renderSettings(Settings: React.ComponentType<Record<string, unknown>>, props = {}) {
  return render(
    React.createElement(React.Suspense, { fallback: null }, React.createElement(Settings, props)),
  );
}

describe("CropSettingsWrapper", () => {
  it("renders null when cropProps is undefined", () => {
    const entry = getToolRegistryEntry("crop");
    expect(entry).toBeDefined();
    const { container } = renderSettings(entry!.Settings as never);
    expect(container.innerHTML).toBe("");
  });

  it("renders CropSettings when cropProps is provided", () => {
    const entry = getToolRegistryEntry("crop");
    expect(entry).toBeDefined();
    const cropProps = {
      cropState: {
        crop: { x: 0, y: 0, width: 50, height: 50, unit: "%" },
        aspect: undefined,
        showGrid: true,
        imgDimensions: { width: 200, height: 150 },
      },
      onCropChange: vi.fn(),
      onAspectChange: vi.fn(),
      onGridToggle: vi.fn(),
    };
    const { container } = renderSettings(entry!.Settings as never, { cropProps });
    expect(container).toBeDefined();
  });
});

describe("EraseObjectSettingsWrapper", () => {
  it("renders null when eraserProps is undefined", () => {
    const entry = getToolRegistryEntry("erase-object");
    expect(entry).toBeDefined();
    const { container } = renderSettings(entry!.Settings as never);
    expect(container.innerHTML).toBe("");
  });

  it("renders EraseObjectSettings when eraserProps is provided", () => {
    const entry = getToolRegistryEntry("erase-object");
    expect(entry).toBeDefined();
    const eraserProps = {
      eraserRef: React.createRef(),
      hasStrokes: false,
      brushSize: 20,
      onBrushSizeChange: vi.fn(),
    };
    const { container } = renderSettings(entry!.Settings as never, { eraserProps });
    expect(container).toBeDefined();
  });
});

describe("makeColorSettingsComponent", () => {
  it("adjust-colors Settings renders without throwing", () => {
    const entry = getToolRegistryEntry("adjust-colors");
    expect(entry).toBeDefined();
    const { container } = renderSettings(entry!.Settings as never, {
      onPreviewFilter: vi.fn(),
    });
    expect(container).toBeDefined();
  });
});
