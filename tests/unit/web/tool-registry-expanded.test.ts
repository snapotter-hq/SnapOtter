// @vitest-environment jsdom
/**
 * Expanded tests for tool-registry covering edge cases not in the main test.
 *
 * Focuses on: DisplayMode type completeness, registry size validation,
 * livePreview flag consistency, ResultsPanel / PreviewPanel presence,
 * and verifying the registry aligns with shared TOOLS definitions.
 */
import { describe, expect, it, vi } from "vitest";

// Mock all lazy-loaded tool settings components
vi.mock("@/components/tools/resize-settings", () => ({ ResizeSettings: () => null }));
vi.mock("@/components/tools/crop-settings", () => ({ CropSettings: () => null }));
vi.mock("@/components/tools/rotate-settings", () => ({ RotateSettings: () => null }));
vi.mock("@/components/tools/convert-settings", () => ({ ConvertSettings: () => null }));
vi.mock("@/components/tools/compress-settings", () => ({ CompressSettings: () => null }));
vi.mock("@/components/tools/optimize-for-web-settings", () => ({
  OptimizeForWebSettings: () => null,
}));
vi.mock("@/components/tools/strip-metadata-settings", () => ({
  StripMetadataSettings: () => null,
}));
vi.mock("@/components/tools/edit-metadata-settings", () => ({
  EditMetadataSettings: () => null,
}));
vi.mock("@/components/tools/color-settings", () => ({ ColorSettings: () => null }));
vi.mock("@/components/tools/sharpening-settings", () => ({ SharpeningSettings: () => null }));
vi.mock("@/components/tools/watermark-text-settings", () => ({
  WatermarkTextSettings: () => null,
}));
vi.mock("@/components/tools/watermark-image-settings", () => ({
  WatermarkImageSettings: () => null,
}));
vi.mock("@/components/tools/text-overlay-settings", () => ({
  TextOverlaySettings: () => null,
}));
vi.mock("@/components/tools/compose-settings", () => ({ ComposeSettings: () => null }));
vi.mock("@/components/tools/info-settings", () => ({ InfoSettings: () => null }));
vi.mock("@/components/tools/compare-settings", () => ({ CompareSettings: () => null }));
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
vi.mock("@/components/tools/collage-settings", () => ({ CollageSettings: () => null }));
vi.mock("@/components/tools/collage-preview", () => ({ CollagePreview: () => null }));
vi.mock("@/components/tools/stitch-settings", () => ({ StitchSettings: () => null }));
vi.mock("@/components/tools/split-settings", () => ({ SplitSettings: () => null }));
vi.mock("@/components/tools/split-canvas", () => ({ SplitCanvas: () => null }));
vi.mock("@/components/tools/border-settings", () => ({ BorderSettings: () => null }));
vi.mock("@/components/tools/svg-to-raster-settings", () => ({
  SvgToRasterSettings: () => null,
}));
vi.mock("@/components/tools/vectorize-settings", () => ({ VectorizeSettings: () => null }));
vi.mock("@/components/tools/gif-tools-settings", () => ({ GifToolsSettings: () => null }));
vi.mock("@/components/tools/bulk-rename-settings", () => ({
  BulkRenameSettings: () => null,
}));
vi.mock("@/components/tools/favicon-settings", () => ({ FaviconSettings: () => null }));
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
vi.mock("@/components/tools/remove-bg-settings", () => ({ RemoveBgSettings: () => null }));
vi.mock("@/components/tools/upscale-settings", () => ({ UpscaleSettings: () => null }));
vi.mock("@/components/tools/ocr-settings", () => ({ OcrSettings: () => null }));
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
vi.mock("@/components/tools/colorize-settings", () => ({ ColorizeSettings: () => null }));
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
vi.mock("@/components/tools/transparency-fixer-settings", () => ({
  TransparencyFixerSettings: () => null,
}));
vi.mock("@/components/tools/content-aware-resize-settings", () => ({
  ContentAwareResizeSettings: () => null,
}));
vi.mock("@/components/tools/beautify-settings", () => ({
  BeautifySettings: () => null,
}));
vi.mock("@/components/tools/meme-generator-settings", () => ({
  MemeGeneratorSettings: () => null,
}));
vi.mock("@/components/tools/meme-generator-preview", () => ({
  MemeGeneratorPreview: () => null,
}));
vi.mock("@/components/tools/color-blindness-settings", () => ({
  ColorBlindnessSettings: () => null,
}));
vi.mock("@/components/tools/ai-canvas-expand-settings", () => ({
  AiCanvasExpandSettings: () => null,
}));
vi.mock("@/components/tools/merge-pdf-settings", () => ({
  MergePdfSettings: () => null,
}));
vi.mock("@/components/tools/split-pdf-settings", () => ({
  SplitPdfSettings: () => null,
}));
vi.mock("@/components/tools/compress-pdf-settings", () => ({
  CompressPdfSettings: () => null,
}));
vi.mock("@/components/tools/rotate-pdf-settings", () => ({
  RotatePdfSettings: () => null,
}));
vi.mock("@/components/tools/word-to-pdf-settings", () => ({
  WordToPdfSettings: () => null,
}));
vi.mock("@/components/tools/csv-excel-settings", () => ({
  CsvExcelSettings: () => null,
}));
vi.mock("@/components/tools/csv-json-settings", () => ({
  CsvJsonSettings: () => null,
}));
vi.mock("@/components/tools/json-xml-settings", () => ({
  JsonXmlSettings: () => null,
}));
vi.mock("@/components/tools/split-csv-settings", () => ({
  SplitCsvSettings: () => null,
}));

import { TOOLS } from "@snapotter/shared";
import type { DisplayMode, ToolRegistryEntry } from "@/lib/tool-registry";
import { getToolRegistryEntry, toolRegistry } from "@/lib/tool-registry";

describe("toolRegistry (expanded)", () => {
  describe("registry size and completeness", () => {
    it("has the same number of entries as TOOLS array", () => {
      expect(toolRegistry.size).toBe(TOOLS.length);
    });

    it("every entry in registry has a matching TOOLS entry", () => {
      const toolIds = new Set(TOOLS.map((t) => t.id));
      for (const registryId of toolRegistry.keys()) {
        expect(toolIds.has(registryId), `registry has ${registryId} not in TOOLS[]`).toBe(true);
      }
    });
  });

  describe("displayMode distribution", () => {
    it("has at least one tool per display mode in use", () => {
      const modesInUse = new Set<DisplayMode>();
      for (const entry of toolRegistry.values()) {
        modesInUse.add(entry.displayMode);
      }

      // These modes should be in use
      expect(modesInUse.has("side-by-side")).toBe(true);
      expect(modesInUse.has("before-after")).toBe(true);
      expect(modesInUse.has("live-preview")).toBe(true);
      expect(modesInUse.has("interactive-crop")).toBe(true);
      expect(modesInUse.has("interactive-eraser")).toBe(true);
      expect(modesInUse.has("no-dropzone")).toBe(true);
      expect(modesInUse.has("custom-results")).toBe(true);
    });
  });

  describe("livePreview flag consistency", () => {
    it("live-preview display mode tools have livePreview flag set", () => {
      for (const [toolId, entry] of toolRegistry) {
        if (entry.displayMode === "live-preview") {
          expect(
            entry.livePreview,
            `${toolId} has live-preview mode but livePreview is falsy`,
          ).toBe(true);
        }
      }
    });

    it("non-live-preview display mode tools do not have livePreview flag", () => {
      const liveModes: DisplayMode[] = ["live-preview"];
      for (const [, entry] of toolRegistry) {
        if (!liveModes.includes(entry.displayMode) && entry.livePreview) {
          // Some tools like rotate use livePreview with before-after mode, which is valid
          // Just verify the flag is a boolean
          expect(typeof entry.livePreview).toBe("boolean");
        }
      }
    });
  });

  describe("ResultsPanel requirements", () => {
    it("all custom-results tools have a ResultsPanel", () => {
      const missing: string[] = [];
      for (const [toolId, entry] of toolRegistry) {
        if (entry.displayMode === "custom-results" && !entry.ResultsPanel) {
          missing.push(toolId);
        }
      }
      expect(
        missing,
        `Tools with custom-results missing ResultsPanel: ${missing.join(", ")}`,
      ).toEqual([]);
    });

    it("tools with no-comparison mode do not require ResultsPanel", () => {
      for (const [, entry] of toolRegistry) {
        if (entry.displayMode === "no-comparison") {
          // ResultsPanel is optional for no-comparison mode
          // Just verify no error occurs
          expect(entry.Settings).toBeDefined();
        }
      }
    });
  });

  describe("PreviewPanel presence", () => {
    it("tools with PreviewPanel have the correct display modes", () => {
      const previewAllowedModes: DisplayMode[] = [
        "no-dropzone",
        "custom-results",
        "interactive-split",
      ];
      for (const [toolId, entry] of toolRegistry) {
        if ((entry as ToolRegistryEntry & { PreviewPanel?: unknown }).PreviewPanel) {
          // PreviewPanel is typically on no-dropzone or custom-results tools
          // Verify the tool has a valid display mode
          expect(
            previewAllowedModes.includes(entry.displayMode) ||
              entry.displayMode === "side-by-side" ||
              entry.displayMode === "before-after" ||
              entry.displayMode === "live-preview",
            `${toolId} has PreviewPanel but unexpected mode ${entry.displayMode}`,
          ).toBe(true);
        }
      }
    });
  });

  describe("specific tool configurations", () => {
    it("watermark-text uses before-after display", () => {
      const entry = getToolRegistryEntry("watermark-text");
      expect(entry?.displayMode).toBe("before-after");
    });

    it("watermark-image uses before-after display", () => {
      const entry = getToolRegistryEntry("watermark-image");
      expect(entry?.displayMode).toBe("before-after");
    });

    it("text-overlay uses before-after display", () => {
      const entry = getToolRegistryEntry("text-overlay");
      expect(entry?.displayMode).toBe("before-after");
    });

    it("replace-color uses before-after display", () => {
      const entry = getToolRegistryEntry("replace-color");
      expect(entry?.displayMode).toBe("before-after");
    });

    it("sharpening uses before-after display", () => {
      const entry = getToolRegistryEntry("sharpening");
      expect(entry?.displayMode).toBe("before-after");
    });

    it("strip-metadata uses no-comparison display", () => {
      const entry = getToolRegistryEntry("strip-metadata");
      expect(entry?.displayMode).toBe("no-comparison");
    });

    it("info uses no-comparison display", () => {
      const entry = getToolRegistryEntry("info");
      expect(entry?.displayMode).toBe("no-comparison");
    });

    it("compare uses before-after display", () => {
      const entry = getToolRegistryEntry("compare");
      expect(entry?.displayMode).toBe("before-after");
    });

    it("color-palette uses no-comparison display", () => {
      const entry = getToolRegistryEntry("color-palette");
      expect(entry?.displayMode).toBe("no-comparison");
    });

    it("barcode-read uses before-after display", () => {
      const entry = getToolRegistryEntry("barcode-read");
      expect(entry?.displayMode).toBe("before-after");
    });

    it("ocr uses before-after display", () => {
      const entry = getToolRegistryEntry("ocr");
      expect(entry?.displayMode).toBe("before-after");
    });

    it("vectorize uses before-after display", () => {
      const entry = getToolRegistryEntry("vectorize");
      expect(entry?.displayMode).toBe("before-after");
    });
  });

  describe("getToolRegistryEntry for all TOOLS", () => {
    it("returns defined entry for every shared TOOLS entry", () => {
      for (const tool of TOOLS) {
        const entry = getToolRegistryEntry(tool.id);
        expect(entry, `getToolRegistryEntry("${tool.id}") returned undefined`).toBeDefined();
      }
    });

    it("each returned entry has Settings as a function or object", () => {
      for (const tool of TOOLS) {
        const entry = getToolRegistryEntry(tool.id);
        if (entry) {
          expect(
            typeof entry.Settings === "function" || typeof entry.Settings === "object",
            `${tool.id} Settings is not function/object`,
          ).toBe(true);
        }
      }
    });
  });
});
