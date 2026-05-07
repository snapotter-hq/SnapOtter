/**
 * Tool UI registry.
 *
 * Maps each toolId to its settings component, display mode, and capabilities.
 * Adding a new tool means adding one entry here instead of editing a 750-line file.
 */
import type React from "react";
import { lazy } from "react";
import type { Crop } from "react-image-crop";
import type { BgPreviewState } from "@/components/common/image-viewer";
import type { EraserCanvasRef } from "@/components/tools/eraser-canvas";
import type { PreviewTransform } from "@/components/tools/rotate-settings";

// ── Display modes ──────────────────────────────────────────────────

export type DisplayMode =
  | "side-by-side"
  | "before-after"
  | "live-preview"
  | "no-comparison"
  | "interactive-crop"
  | "interactive-eraser"
  | "interactive-split"
  | "no-dropzone"
  | "custom-results";

// ── Crop and eraser prop types ─────────────────────────────────────

export interface CropProps {
  cropState: {
    crop: Crop;
    aspect: number | undefined;
    showGrid: boolean;
    imgDimensions: { width: number; height: number } | null;
  };
  onCropChange: (crop: Crop) => void;
  onAspectChange: (aspect: number | undefined) => void;
  onGridToggle: (show: boolean) => void;
}

export interface EraserProps {
  eraserRef: React.RefObject<EraserCanvasRef | null>;
  hasStrokes: boolean;
  brushSize: number;
  onBrushSizeChange: (size: number) => void;
  onMaskCenter?: (centerPct: number) => void;
}

// ── Registry entry ─────────────────────────────────────────────────

export interface ToolRegistryEntry {
  /** The display mode for this tool's image viewer. */
  displayMode: DisplayMode;
  /** Whether this tool supports live preview transforms (rotate, color). */
  livePreview?: boolean;
  /** The settings component for this tool. */
  Settings: React.ComponentType<{
    onPreviewTransform?: (t: PreviewTransform) => void;
    onPreviewFilter?: (filter: string) => void;
    onBgPreview?: (state: BgPreviewState | null) => void;
    onImageStyle?: (style: React.CSSProperties | null) => void;
    cropProps?: CropProps;
    eraserProps?: EraserProps;
  }>;
  /** Optional panel for tools that render custom content in the main area. */
  ResultsPanel?: React.ComponentType;
}

// ── Lazy-loaded settings components ────────────────────────────────
// Using dynamic imports so the bundle only loads what's needed.

const ResizeSettings = lazy(() =>
  import("@/components/tools/resize-settings").then((m) => ({ default: m.ResizeSettings })),
);
const ContentAwareResizeSettings = lazy(() =>
  import("@/components/tools/content-aware-resize-settings").then((m) => ({
    default: m.ContentAwareResizeSettings,
  })),
);
const CropSettings = lazy(() =>
  import("@/components/tools/crop-settings").then((m) => ({ default: m.CropSettings })),
);
const RotateSettings = lazy(() =>
  import("@/components/tools/rotate-settings").then((m) => ({ default: m.RotateSettings })),
);
const ConvertSettings = lazy(() =>
  import("@/components/tools/convert-settings").then((m) => ({ default: m.ConvertSettings })),
);
const CompressSettings = lazy(() =>
  import("@/components/tools/compress-settings").then((m) => ({ default: m.CompressSettings })),
);
const OptimizeForWebSettings = lazy(() =>
  import("@/components/tools/optimize-for-web-settings").then((m) => ({
    default: m.OptimizeForWebSettings,
  })),
);
const StripMetadataSettings = lazy(() =>
  import("@/components/tools/strip-metadata-settings").then((m) => ({
    default: m.StripMetadataSettings,
  })),
);
const EditMetadataSettings = lazy(() =>
  import("@/components/tools/edit-metadata-settings").then((m) => ({
    default: m.EditMetadataSettings,
  })),
);
const ColorSettings = lazy(() =>
  import("@/components/tools/color-settings").then((m) => ({ default: m.ColorSettings })),
);
const SharpeningSettings = lazy(() =>
  import("@/components/tools/sharpening-settings").then((m) => ({
    default: m.SharpeningSettings,
  })),
);
const WatermarkTextSettings = lazy(() =>
  import("@/components/tools/watermark-text-settings").then((m) => ({
    default: m.WatermarkTextSettings,
  })),
);
const WatermarkImageSettings = lazy(() =>
  import("@/components/tools/watermark-image-settings").then((m) => ({
    default: m.WatermarkImageSettings,
  })),
);
const TextOverlaySettings = lazy(() =>
  import("@/components/tools/text-overlay-settings").then((m) => ({
    default: m.TextOverlaySettings,
  })),
);
const ComposeSettings = lazy(() =>
  import("@/components/tools/compose-settings").then((m) => ({ default: m.ComposeSettings })),
);
const InfoSettings = lazy(() =>
  import("@/components/tools/info-settings").then((m) => ({ default: m.InfoSettings })),
);
const CompareSettings = lazy(() =>
  import("@/components/tools/compare-settings").then((m) => ({ default: m.CompareSettings })),
);
const FindDuplicatesSettings = lazy(() =>
  import("@/components/tools/find-duplicates-settings").then((m) => ({
    default: m.FindDuplicatesSettings,
  })),
);
const FindDuplicatesResults = lazy(() =>
  import("@/components/tools/find-duplicates-results").then((m) => ({
    default: m.FindDuplicatesResults,
  })),
);
const ColorPaletteSettings = lazy(() =>
  import("@/components/tools/color-palette-settings").then((m) => ({
    default: m.ColorPaletteSettings,
  })),
);
const QrGenerateSettings = lazy(() =>
  import("@/components/tools/qr-generate-settings").then((m) => ({
    default: m.QrGenerateSettings,
  })),
);
const QrGeneratePreview = lazy(() =>
  import("@/components/tools/qr-generate-preview").then((m) => ({
    default: m.QrGeneratePreview,
  })),
);
const BarcodeReadSettings = lazy(() =>
  import("@/components/tools/barcode-read-settings").then((m) => ({
    default: m.BarcodeReadSettings,
  })),
);
const ImageToBase64Settings = lazy(() =>
  import("@/components/tools/image-to-base64-settings").then((m) => ({
    default: m.ImageToBase64Settings,
  })),
);
const ImageToBase64Results = lazy(() =>
  import("@/components/tools/image-to-base64-results").then((m) => ({
    default: m.ImageToBase64Results,
  })),
);
const CollageSettings = lazy(() =>
  import("@/components/tools/collage-settings").then((m) => ({ default: m.CollageSettings })),
);
const CollagePreview = lazy(() =>
  import("@/components/tools/collage-preview").then((m) => ({ default: m.CollagePreview })),
);
const StitchSettings = lazy(() =>
  import("@/components/tools/stitch-settings").then((m) => ({ default: m.StitchSettings })),
);
const SplitSettings = lazy(() =>
  import("@/components/tools/split-settings").then((m) => ({ default: m.SplitSettings })),
);
const SplitCanvas = lazy(() =>
  import("@/components/tools/split-canvas").then((m) => ({ default: m.SplitCanvas })),
);
const BorderSettings = lazy(() =>
  import("@/components/tools/border-settings").then((m) => ({ default: m.BorderSettings })),
);
const SvgToRasterSettings = lazy(() =>
  import("@/components/tools/svg-to-raster-settings").then((m) => ({
    default: m.SvgToRasterSettings,
  })),
);
const VectorizeSettings = lazy(() =>
  import("@/components/tools/vectorize-settings").then((m) => ({
    default: m.VectorizeSettings,
  })),
);
const GifToolsSettings = lazy(() =>
  import("@/components/tools/gif-tools-settings").then((m) => ({
    default: m.GifToolsSettings,
  })),
);
const BulkRenameSettings = lazy(() =>
  import("@/components/tools/bulk-rename-settings").then((m) => ({
    default: m.BulkRenameSettings,
  })),
);
const FaviconSettings = lazy(() =>
  import("@/components/tools/favicon-settings").then((m) => ({ default: m.FaviconSettings })),
);
const ImageToPdfSettings = lazy(() =>
  import("@/components/tools/image-to-pdf-settings").then((m) => ({
    default: m.ImageToPdfSettings,
  })),
);
const PdfToImageSettings = lazy(() =>
  import("@/components/tools/pdf-to-image-settings").then((m) => ({
    default: m.PdfToImageSettings,
  })),
);
const PdfToImagePreview = lazy(() =>
  import("@/components/tools/pdf-to-image-preview").then((m) => ({
    default: m.PdfToImagePreview,
  })),
);
const ReplaceColorSettings = lazy(() =>
  import("@/components/tools/replace-color-settings").then((m) => ({
    default: m.ReplaceColorSettings,
  })),
);
const RemoveBgSettings = lazy(() =>
  import("@/components/tools/remove-bg-settings").then((m) => ({
    default: m.RemoveBgSettings,
  })),
);
const UpscaleSettings = lazy(() =>
  import("@/components/tools/upscale-settings").then((m) => ({ default: m.UpscaleSettings })),
);
const OcrSettings = lazy(() =>
  import("@/components/tools/ocr-settings").then((m) => ({ default: m.OcrSettings })),
);
const BlurFacesSettings = lazy(() =>
  import("@/components/tools/blur-faces-settings").then((m) => ({
    default: m.BlurFacesSettings,
  })),
);
const EnhanceFacesSettings = lazy(() =>
  import("@/components/tools/enhance-faces-settings").then((m) => ({
    default: m.EnhanceFacesSettings,
  })),
);
const EraseObjectSettings = lazy(() =>
  import("@/components/tools/erase-object-settings").then((m) => ({
    default: m.EraseObjectSettings,
  })),
);
const SmartCropSettings = lazy(() =>
  import("@/components/tools/smart-crop-settings").then((m) => ({
    default: m.SmartCropSettings,
  })),
);
const ImageEnhancementSettings = lazy(() =>
  import("@/components/tools/image-enhancement-settings").then((m) => ({
    default: m.ImageEnhancementSettings,
  })),
);
const ColorizeSettings = lazy(() =>
  import("@/components/tools/colorize-settings").then((m) => ({
    default: m.ColorizeSettings,
  })),
);
const NoiseRemovalSettings = lazy(() =>
  import("@/components/tools/noise-removal-settings").then((m) => ({
    default: m.NoiseRemovalSettings,
  })),
);
const PassportPhotoSettings = lazy(() =>
  import("@/components/tools/passport-photo-settings").then((m) => ({
    default: m.PassportPhotoSettings,
  })),
);
const PassportPhotoPreview = lazy(() =>
  import("@/components/tools/passport-photo-settings").then((m) => ({
    default: m.PassportPhotoPreview,
  })),
);
const RedEyeRemovalSettings = lazy(() =>
  import("@/components/tools/red-eye-removal-settings").then((m) => ({
    default: m.RedEyeRemovalSettings,
  })),
);
const RestorePhotoSettings = lazy(() =>
  import("@/components/tools/restore-photo-settings").then((m) => ({
    default: m.RestorePhotoSettings,
  })),
);
const TransparencyFixerSettings = lazy(() =>
  import("@/components/tools/transparency-fixer-settings").then((m) => ({
    default: m.TransparencyFixerSettings,
  })),
);

// ── Color tool wrapper ─────────────────────────────────────────────
// Color tools share a single component but differ by toolId.

function makeColorSettingsComponent(
  toolId: string,
): React.ComponentType<{ onPreviewFilter?: (filter: string) => void }> {
  return function ColorSettingsForTool(props: { onPreviewFilter?: (filter: string) => void }) {
    return <ColorSettings toolId={toolId} onPreviewFilter={props.onPreviewFilter} />;
  };
}

// ── Crop/Eraser wrappers ───────────────────────────────────────────
// These tools need special props that are passed through the registry.

function CropSettingsWrapper(props: { cropProps?: CropProps }) {
  if (!props.cropProps) return null;
  return <CropSettings {...props.cropProps} />;
}

function EraseObjectSettingsWrapper(props: { eraserProps?: EraserProps }) {
  if (!props.eraserProps) return null;
  return <EraseObjectSettings {...props.eraserProps} />;
}

// ── The registry ───────────────────────────────────────────────────

export const toolRegistry = new Map<string, ToolRegistryEntry>([
  // Essentials
  ["resize", { displayMode: "side-by-side", Settings: ResizeSettings }],
  ["crop", { displayMode: "interactive-crop", Settings: CropSettingsWrapper as never }],
  [
    "rotate",
    {
      displayMode: "side-by-side",
      livePreview: true,
      Settings: RotateSettings as never,
    },
  ],
  ["convert", { displayMode: "no-comparison", Settings: ConvertSettings }],
  ["compress", { displayMode: "before-after", Settings: CompressSettings }],
  ["strip-metadata", { displayMode: "no-comparison", Settings: StripMetadataSettings }],
  ["edit-metadata", { displayMode: "no-comparison", Settings: EditMetadataSettings }],

  // Color adjustments (consolidated)
  [
    "adjust-colors",
    {
      displayMode: "live-preview" as DisplayMode,
      livePreview: true,
      Settings: makeColorSettingsComponent("adjust-colors") as never,
    },
  ],

  // Sharpening
  ["sharpening", { displayMode: "before-after", Settings: SharpeningSettings }],

  // Watermark & Overlay
  ["watermark-text", { displayMode: "before-after", Settings: WatermarkTextSettings }],
  ["watermark-image", { displayMode: "before-after", Settings: WatermarkImageSettings }],
  ["text-overlay", { displayMode: "before-after", Settings: TextOverlaySettings }],
  ["compose", { displayMode: "before-after", Settings: ComposeSettings }],

  // Utilities
  ["info", { displayMode: "before-after", Settings: InfoSettings }],
  ["compare", { displayMode: "before-after", Settings: CompareSettings }],
  [
    "find-duplicates",
    {
      displayMode: "custom-results",
      Settings: FindDuplicatesSettings,
      ResultsPanel: FindDuplicatesResults,
    },
  ],
  ["color-palette", { displayMode: "before-after", Settings: ColorPaletteSettings }],
  [
    "qr-generate",
    { displayMode: "no-dropzone", Settings: QrGenerateSettings, ResultsPanel: QrGeneratePreview },
  ],
  ["barcode-read", { displayMode: "before-after", Settings: BarcodeReadSettings }],
  [
    "image-to-base64",
    {
      displayMode: "custom-results",
      Settings: ImageToBase64Settings,
      ResultsPanel: ImageToBase64Results,
    },
  ],

  // Layout & Composition
  [
    "collage",
    { displayMode: "no-dropzone", Settings: CollageSettings, ResultsPanel: CollagePreview },
  ],
  ["stitch", { displayMode: "no-comparison", Settings: StitchSettings }],
  [
    "split",
    { displayMode: "interactive-split", Settings: SplitSettings, ResultsPanel: SplitCanvas },
  ],
  ["border", { displayMode: "live-preview", livePreview: true, Settings: BorderSettings as never }],

  // Format & Conversion
  ["svg-to-raster", { displayMode: "before-after", Settings: SvgToRasterSettings }],
  ["vectorize", { displayMode: "before-after", Settings: VectorizeSettings }],
  ["gif-tools", { displayMode: "before-after", Settings: GifToolsSettings }],

  // Optimization extras
  ["bulk-rename", { displayMode: "before-after", Settings: BulkRenameSettings }],
  ["favicon", { displayMode: "before-after", Settings: FaviconSettings }],
  ["image-to-pdf", { displayMode: "before-after", Settings: ImageToPdfSettings }],
  ["optimize-for-web", { displayMode: "before-after", Settings: OptimizeForWebSettings }],
  [
    "pdf-to-image",
    { displayMode: "no-dropzone", Settings: PdfToImageSettings, ResultsPanel: PdfToImagePreview },
  ],

  // Adjustments extra
  ["replace-color", { displayMode: "before-after", Settings: ReplaceColorSettings }],

  // AI Tools
  ["remove-background", { displayMode: "before-after", Settings: RemoveBgSettings }],
  ["upscale", { displayMode: "before-after", Settings: UpscaleSettings }],
  ["ocr", { displayMode: "before-after", Settings: OcrSettings }],
  ["blur-faces", { displayMode: "before-after", Settings: BlurFacesSettings }],
  ["enhance-faces", { displayMode: "before-after", Settings: EnhanceFacesSettings }],
  [
    "erase-object",
    {
      displayMode: "interactive-eraser",
      Settings: EraseObjectSettingsWrapper as never,
    },
  ],
  ["smart-crop", { displayMode: "before-after", Settings: SmartCropSettings }],
  [
    "image-enhancement",
    {
      displayMode: "before-after" as DisplayMode,
      livePreview: true,
      Settings: ImageEnhancementSettings as never,
    },
  ],
  ["colorize", { displayMode: "before-after", Settings: ColorizeSettings }],
  ["noise-removal", { displayMode: "before-after", Settings: NoiseRemovalSettings }],
  [
    "passport-photo",
    {
      displayMode: "custom-results",
      Settings: PassportPhotoSettings,
      ResultsPanel: PassportPhotoPreview,
    },
  ],
  ["red-eye-removal", { displayMode: "before-after", Settings: RedEyeRemovalSettings }],
  ["restore-photo", { displayMode: "before-after", Settings: RestorePhotoSettings }],
  ["transparency-fixer", { displayMode: "before-after", Settings: TransparencyFixerSettings }],
  ["content-aware-resize", { displayMode: "side-by-side", Settings: ContentAwareResizeSettings }],
]);

export function getToolRegistryEntry(toolId: string): ToolRegistryEntry | undefined {
  return toolRegistry.get(toolId);
}
