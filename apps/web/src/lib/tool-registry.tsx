/**
 * Tool UI registry.
 *
 * Maps each toolId to its settings component, display mode, and capabilities.
 * Adding a new tool means adding one entry here instead of editing a 750-line file.
 */

import { AUDIO_INPUTS, VIDEO_INPUTS } from "@snapotter/shared";
import type React from "react";
import { lazy } from "react";
import type { Crop } from "react-image-crop";
import type { BgPreviewState } from "@/components/common/image-viewer";
import type { EraserCanvasRef } from "@/components/tools/eraser-canvas";
import type { PreviewTransform } from "@/components/tools/rotate-settings";
import { TOOL_DISPLAY_MODES } from "./tool-display-modes";

// ── Display modes ──────────────────────────────────────────────────
// The DisplayMode type and per-tool map live in tool-display-modes.ts (a pure
// module with no React imports) so tests can introspect them. Re-exported here
// for existing importers.

export type { DisplayMode } from "./tool-display-modes";

import type { DisplayMode } from "./tool-display-modes";

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
  maskedFileCount: number;
}

// ── Registry entry ─────────────────────────────────────────────────

export interface ToolRegistryEntry {
  /** The display mode for this tool's image viewer. */
  displayMode: DisplayMode;
  /** Whether this tool supports live preview transforms (rotate, color). */
  livePreview?: boolean;
  /** Override the default file-picker accept string (e.g. ".svg,.svgz"). */
  accept?: string;
  /** The settings component for this tool. */
  Settings: React.ComponentType<{
    onPreviewTransform?: (t: PreviewTransform) => void;
    onPreviewFilter?: (filter: string) => void;
    onBgPreview?: (state: BgPreviewState | null) => void;
    onImageStyle?: (style: React.CSSProperties | null) => void;
    onImageOverlay?: (children: React.ReactNode) => void;
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
const AiCanvasExpandSettings = lazy(() =>
  import("@/components/tools/ai-canvas-expand-settings").then((m) => ({
    default: m.AiCanvasExpandSettings,
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
const HtmlToImageSettings = lazy(() =>
  import("@/components/tools/html-to-image-settings").then((m) => ({
    default: m.HtmlToImageSettings,
  })),
);
const HtmlToImageResults = lazy(() =>
  import("@/components/tools/html-to-image-results").then((m) => ({
    default: m.HtmlToImageResults,
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
const BeautifySettings = lazy(() =>
  import("@/components/tools/beautify-settings").then((m) => ({ default: m.BeautifySettings })),
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
const MemeGeneratorSettings = lazy(() =>
  import("@/components/tools/meme-generator-settings").then((m) => ({
    default: m.MemeGeneratorSettings,
  })),
);
const MemeGeneratorPreview = lazy(() =>
  import("@/components/tools/meme-generator-preview").then((m) => ({
    default: m.MemeGeneratorPreview,
  })),
);
const ColorBlindnessSettings = lazy(() =>
  import("@/components/tools/color-blindness-settings").then((m) => ({
    default: m.ColorBlindnessSettings,
  })),
);
const ConvertVideoSettings = lazy(() =>
  import("@/components/tools/convert-video-settings").then((m) => ({
    default: m.ConvertVideoSettings,
  })),
);
const CompressVideoSettings = lazy(() =>
  import("@/components/tools/compress-video-settings").then((m) => ({
    default: m.CompressVideoSettings,
  })),
);
const TrimVideoSettings = lazy(() =>
  import("@/components/tools/trim-video-settings").then((m) => ({
    default: m.TrimVideoSettings,
  })),
);
const MuteVideoSettings = lazy(() =>
  import("@/components/tools/mute-video-settings").then((m) => ({
    default: m.MuteVideoSettings,
  })),
);
const VideoToGifSettings = lazy(() =>
  import("@/components/tools/video-to-gif-settings").then((m) => ({
    default: m.VideoToGifSettings,
  })),
);
const ConvertAudioSettings = lazy(() =>
  import("@/components/tools/convert-audio-settings").then((m) => ({
    default: m.ConvertAudioSettings,
  })),
);
const TrimAudioSettings = lazy(() =>
  import("@/components/tools/trim-audio-settings").then((m) => ({
    default: m.TrimAudioSettings,
  })),
);
const ExtractAudioSettings = lazy(() =>
  import("@/components/tools/extract-audio-settings").then((m) => ({
    default: m.ExtractAudioSettings,
  })),
);
const MergePdfSettings = lazy(() =>
  import("@/components/tools/merge-pdf-settings").then((m) => ({
    default: m.MergePdfSettings,
  })),
);
const SplitPdfSettings = lazy(() =>
  import("@/components/tools/split-pdf-settings").then((m) => ({
    default: m.SplitPdfSettings,
  })),
);
const CompressPdfSettings = lazy(() =>
  import("@/components/tools/compress-pdf-settings").then((m) => ({
    default: m.CompressPdfSettings,
  })),
);
const RotatePdfSettings = lazy(() =>
  import("@/components/tools/rotate-pdf-settings").then((m) => ({
    default: m.RotatePdfSettings,
  })),
);
const WordToPdfSettings = lazy(() =>
  import("@/components/tools/word-to-pdf-settings").then((m) => ({
    default: m.WordToPdfSettings,
  })),
);
const CsvExcelSettings = lazy(() =>
  import("@/components/tools/csv-excel-settings").then((m) => ({
    default: m.CsvExcelSettings,
  })),
);
const CsvJsonSettings = lazy(() =>
  import("@/components/tools/csv-json-settings").then((m) => ({
    default: m.CsvJsonSettings,
  })),
);
const JsonXmlSettings = lazy(() =>
  import("@/components/tools/json-xml-settings").then((m) => ({
    default: m.JsonXmlSettings,
  })),
);
const SplitCsvSettings = lazy(() =>
  import("@/components/tools/split-csv-settings").then((m) => ({
    default: m.SplitCsvSettings,
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
// Display modes come from TOOL_DISPLAY_MODES (tool-display-modes.ts); entries
// here hold only the React-side pieces (Settings, ResultsPanel, livePreview,
// accept). The merge below throws at module load if either side is missing a
// tool, so drift between the two files cannot ship.

type RegistryEntryConfig = Omit<ToolRegistryEntry, "displayMode">;

const ENTRY_CONFIG: ReadonlyArray<[string, RegistryEntryConfig]> = [
  // Essentials
  ["resize", { Settings: ResizeSettings }],
  ["crop", { Settings: CropSettingsWrapper as never }],
  ["rotate", { livePreview: true, Settings: RotateSettings as never }],
  ["convert", { Settings: ConvertSettings }],
  ["compress", { Settings: CompressSettings }],
  ["strip-metadata", { Settings: StripMetadataSettings }],
  ["edit-metadata", { Settings: EditMetadataSettings }],

  // Color adjustments (consolidated)
  [
    "adjust-colors",
    { livePreview: true, Settings: makeColorSettingsComponent("adjust-colors") as never },
  ],

  // Sharpening
  ["sharpening", { Settings: SharpeningSettings }],

  // Watermark & Overlay
  ["watermark-text", { Settings: WatermarkTextSettings }],
  ["watermark-image", { Settings: WatermarkImageSettings }],
  ["text-overlay", { Settings: TextOverlaySettings }],
  ["compose", { Settings: ComposeSettings }],
  ["meme-generator", { Settings: MemeGeneratorSettings, ResultsPanel: MemeGeneratorPreview }],

  // Utilities
  ["info", { Settings: InfoSettings }],
  ["compare", { Settings: CompareSettings }],
  ["find-duplicates", { Settings: FindDuplicatesSettings, ResultsPanel: FindDuplicatesResults }],
  ["color-palette", { Settings: ColorPaletteSettings }],
  ["qr-generate", { Settings: QrGenerateSettings, ResultsPanel: QrGeneratePreview }],
  ["html-to-image", { Settings: HtmlToImageSettings, ResultsPanel: HtmlToImageResults }],
  ["barcode-read", { Settings: BarcodeReadSettings }],
  ["image-to-base64", { Settings: ImageToBase64Settings, ResultsPanel: ImageToBase64Results }],

  // Layout & Composition
  ["collage", { Settings: CollageSettings, ResultsPanel: CollagePreview }],
  ["stitch", { Settings: StitchSettings }],
  ["split", { Settings: SplitSettings, ResultsPanel: SplitCanvas }],
  ["border", { livePreview: true, Settings: BorderSettings as never }],
  ["beautify", { livePreview: true, Settings: BeautifySettings as never }],

  // Format & Conversion
  ["svg-to-raster", { accept: ".svg,.svgz", Settings: SvgToRasterSettings }],
  ["vectorize", { Settings: VectorizeSettings }],
  ["gif-tools", { Settings: GifToolsSettings }],

  // Optimization extras
  ["bulk-rename", { Settings: BulkRenameSettings }],
  ["favicon", { Settings: FaviconSettings }],
  ["image-to-pdf", { Settings: ImageToPdfSettings }],
  ["optimize-for-web", { Settings: OptimizeForWebSettings }],
  [
    "pdf-to-image",
    { accept: ".pdf", Settings: PdfToImageSettings, ResultsPanel: PdfToImagePreview },
  ],

  // Adjustments extra
  ["replace-color", { Settings: ReplaceColorSettings }],
  ["color-blindness", { Settings: ColorBlindnessSettings }],

  // AI Tools
  ["remove-background", { Settings: RemoveBgSettings }],
  ["upscale", { Settings: UpscaleSettings }],
  ["ocr", { Settings: OcrSettings }],
  ["blur-faces", { Settings: BlurFacesSettings }],
  ["enhance-faces", { Settings: EnhanceFacesSettings }],
  ["erase-object", { Settings: EraseObjectSettingsWrapper as never }],
  ["smart-crop", { Settings: SmartCropSettings }],
  ["image-enhancement", { livePreview: true, Settings: ImageEnhancementSettings as never }],
  ["colorize", { Settings: ColorizeSettings }],
  ["noise-removal", { Settings: NoiseRemovalSettings }],
  ["passport-photo", { Settings: PassportPhotoSettings, ResultsPanel: PassportPhotoPreview }],
  ["red-eye-removal", { Settings: RedEyeRemovalSettings }],
  ["restore-photo", { Settings: RestorePhotoSettings }],
  ["transparency-fixer", { Settings: TransparencyFixerSettings }],
  ["content-aware-resize", { Settings: ContentAwareResizeSettings }],
  ["ai-canvas-expand", { Settings: AiCanvasExpandSettings }],

  // Video tools
  ["convert-video", { accept: VIDEO_INPUTS.join(","), Settings: ConvertVideoSettings }],
  ["compress-video", { accept: VIDEO_INPUTS.join(","), Settings: CompressVideoSettings }],
  ["trim-video", { accept: VIDEO_INPUTS.join(","), Settings: TrimVideoSettings }],
  ["mute-video", { accept: VIDEO_INPUTS.join(","), Settings: MuteVideoSettings }],
  ["video-to-gif", { accept: VIDEO_INPUTS.join(","), Settings: VideoToGifSettings }],

  // Audio tools
  ["convert-audio", { accept: AUDIO_INPUTS.join(","), Settings: ConvertAudioSettings }],
  ["trim-audio", { accept: AUDIO_INPUTS.join(","), Settings: TrimAudioSettings }],
  ["extract-audio", { accept: VIDEO_INPUTS.join(","), Settings: ExtractAudioSettings }],

  // PDF & Document tools
  ["merge-pdf", { accept: ".pdf", Settings: MergePdfSettings }],
  ["split-pdf", { accept: ".pdf", Settings: SplitPdfSettings }],
  ["compress-pdf", { accept: ".pdf", Settings: CompressPdfSettings }],
  ["rotate-pdf", { accept: ".pdf", Settings: RotatePdfSettings }],
  ["word-to-pdf", { accept: ".docx,.doc,.odt,.rtf,.txt", Settings: WordToPdfSettings }],

  // Data tools
  ["csv-excel", { accept: ".csv,.xlsx", Settings: CsvExcelSettings }],
  ["csv-json", { accept: ".csv,.json", Settings: CsvJsonSettings }],
  ["json-xml", { accept: ".json,.xml", Settings: JsonXmlSettings }],
  ["split-csv", { accept: ".csv", Settings: SplitCsvSettings }],
];

export const toolRegistry = new Map<string, ToolRegistryEntry>(
  ENTRY_CONFIG.map(([toolId, entry]) => {
    const displayMode = TOOL_DISPLAY_MODES[toolId];
    if (!displayMode) {
      throw new Error(`Tool "${toolId}" has no display mode in tool-display-modes.ts`);
    }
    return [toolId, { ...entry, displayMode }];
  }),
);

export function getToolRegistryEntry(toolId: string): ToolRegistryEntry | undefined {
  return toolRegistry.get(toolId);
}
