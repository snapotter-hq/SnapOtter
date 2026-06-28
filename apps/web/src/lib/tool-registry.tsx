/**
 * Tool UI registry.
 *
 * Maps each toolId to its settings component, display mode, and capabilities.
 * Adding a new tool means adding one entry here instead of editing a 750-line file.
 */

import {
  AUDIO_INPUTS,
  CONVERSION_PRESETS,
  IMAGE_INPUTS,
  SUBTITLE_INPUTS,
  VIDEO_INPUTS,
} from "@snapotter/shared";
import type React from "react";
import { lazy } from "react";
import type { Crop } from "react-image-crop";
import type { BgPreviewState } from "@/components/common/image-viewer";
import type { EraserCanvasRef } from "@/components/tools/eraser-canvas";
import type { PreviewTransform } from "@/components/tools/rotate-settings";
import type { SignProps } from "@/components/tools/sign-pdf-settings";
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
    signProps?: SignProps;
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
const OcrPdfSettings = lazy(() =>
  import("@/components/tools/ocr-pdf-settings").then((m) => ({ default: m.OcrPdfSettings })),
);
const OcrPdfView = lazy(() =>
  import("@/components/tools/ocr-pdf-view").then((m) => ({ default: m.OcrPdfView })),
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
const TranscribeAudioSettings = lazy(() =>
  import("@/components/tools/transcribe-audio-settings").then((m) => ({
    default: m.TranscribeAudioSettings,
  })),
);
const AutoSubtitlesSettings = lazy(() =>
  import("@/components/tools/auto-subtitles-settings").then((m) => ({
    default: m.AutoSubtitlesSettings,
  })),
);
const BackgroundReplaceSettings = lazy(() =>
  import("@/components/tools/background-replace-settings").then((m) => ({
    default: m.BackgroundReplaceSettings,
  })),
);
const BlurBackgroundSettings = lazy(() =>
  import("@/components/tools/blur-background-settings").then((m) => ({
    default: m.BlurBackgroundSettings,
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
const ResizeVideoSettings = lazy(() =>
  import("@/components/tools/resize-video-settings").then((m) => ({
    default: m.ResizeVideoSettings,
  })),
);
const CropVideoSettings = lazy(() =>
  import("@/components/tools/crop-video-settings").then((m) => ({
    default: m.CropVideoSettings,
  })),
);
const RotateVideoSettings = lazy(() =>
  import("@/components/tools/rotate-video-settings").then((m) => ({
    default: m.RotateVideoSettings,
  })),
);
const ChangeFpsSettings = lazy(() =>
  import("@/components/tools/change-fps-settings").then((m) => ({
    default: m.ChangeFpsSettings,
  })),
);
const VideoColorSettings = lazy(() =>
  import("@/components/tools/video-color-settings").then((m) => ({
    default: m.VideoColorSettings,
  })),
);
const VideoSpeedSettings = lazy(() =>
  import("@/components/tools/video-speed-settings").then((m) => ({
    default: m.VideoSpeedSettings,
  })),
);
const ReverseVideoSettings = lazy(() =>
  import("@/components/tools/reverse-video-settings").then((m) => ({
    default: m.ReverseVideoSettings,
  })),
);
const VideoLoudnormSettings = lazy(() =>
  import("@/components/tools/video-loudnorm-settings").then((m) => ({
    default: m.VideoLoudnormSettings,
  })),
);
const AspectPadSettings = lazy(() =>
  import("@/components/tools/aspect-pad-settings").then((m) => ({
    default: m.AspectPadSettings,
  })),
);
const BlurPadSettings = lazy(() =>
  import("@/components/tools/blur-pad-settings").then((m) => ({
    default: m.BlurPadSettings,
  })),
);
const WatermarkVideoSettings = lazy(() =>
  import("@/components/tools/watermark-video-settings").then((m) => ({
    default: m.WatermarkVideoSettings,
  })),
);
const StabilizeVideoSettings = lazy(() =>
  import("@/components/tools/stabilize-video-settings").then((m) => ({
    default: m.StabilizeVideoSettings,
  })),
);
const GifToVideoSettings = lazy(() =>
  import("@/components/tools/gif-to-video-settings").then((m) => ({
    default: m.GifToVideoSettings,
  })),
);
const VideoToWebpSettings = lazy(() =>
  import("@/components/tools/video-to-webp-settings").then((m) => ({
    default: m.VideoToWebpSettings,
  })),
);
const VideoToFramesSettings = lazy(() =>
  import("@/components/tools/video-to-frames-settings").then((m) => ({
    default: m.VideoToFramesSettings,
  })),
);
const MergeVideosSettings = lazy(() =>
  import("@/components/tools/merge-videos-settings").then((m) => ({
    default: m.MergeVideosSettings,
  })),
);
const ReplaceAudioSettings = lazy(() =>
  import("@/components/tools/replace-audio-settings").then((m) => ({
    default: m.ReplaceAudioSettings,
  })),
);
const BurnSubtitlesSettings = lazy(() =>
  import("@/components/tools/burn-subtitles-settings").then((m) => ({
    default: m.BurnSubtitlesSettings,
  })),
);
const EmbedSubtitlesSettings = lazy(() =>
  import("@/components/tools/embed-subtitles-settings").then((m) => ({
    default: m.EmbedSubtitlesSettings,
  })),
);
const ExtractSubtitlesSettings = lazy(() =>
  import("@/components/tools/extract-subtitles-settings").then((m) => ({
    default: m.ExtractSubtitlesSettings,
  })),
);
const ImagesToVideoSettings = lazy(() =>
  import("@/components/tools/images-to-video-settings").then((m) => ({
    default: m.ImagesToVideoSettings,
  })),
);
const VideoMetadataSettings = lazy(() =>
  import("@/components/tools/video-metadata-settings").then((m) => ({
    default: m.VideoMetadataSettings,
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
const AudioChannelsSettings = lazy(() =>
  import("@/components/tools/audio-channels-settings").then((m) => ({
    default: m.AudioChannelsSettings,
  })),
);
const AudioMetadataSettings = lazy(() =>
  import("@/components/tools/audio-metadata-settings").then((m) => ({
    default: m.AudioMetadataSettings,
  })),
);
const AudioSpeedSettings = lazy(() =>
  import("@/components/tools/audio-speed-settings").then((m) => ({
    default: m.AudioSpeedSettings,
  })),
);
const FadeAudioSettings = lazy(() =>
  import("@/components/tools/fade-audio-settings").then((m) => ({
    default: m.FadeAudioSettings,
  })),
);
const MergeAudioSettings = lazy(() =>
  import("@/components/tools/merge-audio-settings").then((m) => ({
    default: m.MergeAudioSettings,
  })),
);
const NoiseReductionSettings = lazy(() =>
  import("@/components/tools/noise-reduction-settings").then((m) => ({
    default: m.NoiseReductionSettings,
  })),
);
const NormalizeAudioSettings = lazy(() =>
  import("@/components/tools/normalize-audio-settings").then((m) => ({
    default: m.NormalizeAudioSettings,
  })),
);
const PitchShiftSettings = lazy(() =>
  import("@/components/tools/pitch-shift-settings").then((m) => ({
    default: m.PitchShiftSettings,
  })),
);
const ReverseAudioSettings = lazy(() =>
  import("@/components/tools/reverse-audio-settings").then((m) => ({
    default: m.ReverseAudioSettings,
  })),
);
const RingtoneMakerSettings = lazy(() =>
  import("@/components/tools/ringtone-maker-settings").then((m) => ({
    default: m.RingtoneMakerSettings,
  })),
);
const SilenceRemovalSettings = lazy(() =>
  import("@/components/tools/silence-removal-settings").then((m) => ({
    default: m.SilenceRemovalSettings,
  })),
);
const SplitAudioSettings = lazy(() =>
  import("@/components/tools/split-audio-settings").then((m) => ({
    default: m.SplitAudioSettings,
  })),
);
const VolumeAdjustSettings = lazy(() =>
  import("@/components/tools/volume-adjust-settings").then((m) => ({
    default: m.VolumeAdjustSettings,
  })),
);
const WaveformImageSettings = lazy(() =>
  import("@/components/tools/waveform-image-settings").then((m) => ({
    default: m.WaveformImageSettings,
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
const ExtractPagesSettings = lazy(() =>
  import("@/components/tools/extract-pages-settings").then((m) => ({
    default: m.ExtractPagesSettings,
  })),
);
const RemovePagesSettings = lazy(() =>
  import("@/components/tools/remove-pages-settings").then((m) => ({
    default: m.RemovePagesSettings,
  })),
);
const OrganizePdfSettings = lazy(() =>
  import("@/components/tools/organize-pdf-settings").then((m) => ({
    default: m.OrganizePdfSettings,
  })),
);
const ProtectPdfSettings = lazy(() =>
  import("@/components/tools/protect-pdf-settings").then((m) => ({
    default: m.ProtectPdfSettings,
  })),
);
const UnlockPdfSettings = lazy(() =>
  import("@/components/tools/unlock-pdf-settings").then((m) => ({
    default: m.UnlockPdfSettings,
  })),
);
const RepairPdfSettings = lazy(() =>
  import("@/components/tools/repair-pdf-settings").then((m) => ({
    default: m.RepairPdfSettings,
  })),
);
const CropPdfSettings = lazy(() =>
  import("@/components/tools/crop-pdf-settings").then((m) => ({
    default: m.CropPdfSettings,
  })),
);
const NupPdfSettings = lazy(() =>
  import("@/components/tools/nup-pdf-settings").then((m) => ({
    default: m.NupPdfSettings,
  })),
);
const BookletPdfSettings = lazy(() =>
  import("@/components/tools/booklet-pdf-settings").then((m) => ({
    default: m.BookletPdfSettings,
  })),
);
const WatermarkPdfSettings = lazy(() =>
  import("@/components/tools/watermark-pdf-settings").then((m) => ({
    default: m.WatermarkPdfSettings,
  })),
);
const PdfPageNumbersSettings = lazy(() =>
  import("@/components/tools/pdf-page-numbers-settings").then((m) => ({
    default: m.PdfPageNumbersSettings,
  })),
);
const LinearizePdfSettings = lazy(() =>
  import("@/components/tools/linearize-pdf-settings").then((m) => ({
    default: m.LinearizePdfSettings,
  })),
);
const GrayscalePdfSettings = lazy(() =>
  import("@/components/tools/grayscale-pdf-settings").then((m) => ({
    default: m.GrayscalePdfSettings,
  })),
);
const PdfaConvertSettings = lazy(() =>
  import("@/components/tools/pdfa-convert-settings").then((m) => ({
    default: m.PdfaConvertSettings,
  })),
);
const FlattenPdfSettings = lazy(() =>
  import("@/components/tools/flatten-pdf-settings").then((m) => ({
    default: m.FlattenPdfSettings,
  })),
);
const RedactPdfSettings = lazy(() =>
  import("@/components/tools/redact-pdf-settings").then((m) => ({
    default: m.RedactPdfSettings,
  })),
);
const SignPdfSettings = lazy(() =>
  import("@/components/tools/sign-pdf-settings").then((m) => ({ default: m.SignPdfSettings })),
);
const PdfToTextSettings = lazy(() =>
  import("@/components/tools/pdf-to-text-settings").then((m) => ({
    default: m.PdfToTextSettings,
  })),
);
const PdfToWordSettings = lazy(() =>
  import("@/components/tools/pdf-to-word-settings").then((m) => ({
    default: m.PdfToWordSettings,
  })),
);
const PdfMetadataSettings = lazy(() =>
  import("@/components/tools/pdf-metadata-settings").then((m) => ({
    default: m.PdfMetadataSettings,
  })),
);
const HtmlToPdfSettings = lazy(() =>
  import("@/components/tools/html-to-pdf-settings").then((m) => ({
    default: m.HtmlToPdfSettings,
  })),
);
const MarkdownToPdfSettings = lazy(() =>
  import("@/components/tools/markdown-to-pdf-settings").then((m) => ({
    default: m.MarkdownToPdfSettings,
  })),
);
const ExcelToPdfSettings = lazy(() =>
  import("@/components/tools/excel-to-pdf-settings").then((m) => ({
    default: m.ExcelToPdfSettings,
  })),
);
const PowerpointToPdfSettings = lazy(() =>
  import("@/components/tools/powerpoint-to-pdf-settings").then((m) => ({
    default: m.PowerpointToPdfSettings,
  })),
);
const ConvertDocumentSettings = lazy(() =>
  import("@/components/tools/convert-document-settings").then((m) => ({
    default: m.ConvertDocumentSettings,
  })),
);
const ConvertSpreadsheetSettings = lazy(() =>
  import("@/components/tools/convert-spreadsheet-settings").then((m) => ({
    default: m.ConvertSpreadsheetSettings,
  })),
);
const ConvertPresentationSettings = lazy(() =>
  import("@/components/tools/convert-presentation-settings").then((m) => ({
    default: m.ConvertPresentationSettings,
  })),
);
const MarkdownToHtmlSettings = lazy(() =>
  import("@/components/tools/markdown-to-html-settings").then((m) => ({
    default: m.MarkdownToHtmlSettings,
  })),
);
const MarkdownToDocxSettings = lazy(() =>
  import("@/components/tools/markdown-to-docx-settings").then((m) => ({
    default: m.MarkdownToDocxSettings,
  })),
);
const EpubConvertSettings = lazy(() =>
  import("@/components/tools/epub-convert-settings").then((m) => ({
    default: m.EpubConvertSettings,
  })),
);
const ToEpubSettings = lazy(() =>
  import("@/components/tools/to-epub-settings").then((m) => ({
    default: m.ToEpubSettings,
  })),
);
const MergeCsvsSettings = lazy(() =>
  import("@/components/tools/merge-csvs-settings").then((m) => ({
    default: m.MergeCsvsSettings,
  })),
);
const YamlJsonSettings = lazy(() =>
  import("@/components/tools/yaml-json-settings").then((m) => ({
    default: m.YamlJsonSettings,
  })),
);
const XmlToCsvSettings = lazy(() =>
  import("@/components/tools/xml-to-csv-settings").then((m) => ({
    default: m.XmlToCsvSettings,
  })),
);
const CreateZipSettings = lazy(() =>
  import("@/components/tools/create-zip-settings").then((m) => ({
    default: m.CreateZipSettings,
  })),
);
const ExtractZipSettings = lazy(() =>
  import("@/components/tools/extract-zip-settings").then((m) => ({
    default: m.ExtractZipSettings,
  })),
);

// Wave 5a: Image gap-fill tools
const BarcodeGenerateSettings = lazy(() =>
  import("@/components/tools/barcode-generate-settings").then((m) => ({
    default: m.BarcodeGenerateSettings,
  })),
);
const ChartMakerSettings = lazy(() =>
  import("@/components/tools/chart-maker-settings").then((m) => ({
    default: m.ChartMakerSettings,
  })),
);
const CircleCropSettings = lazy(() =>
  import("@/components/tools/circle-crop-settings").then((m) => ({
    default: m.CircleCropSettings,
  })),
);
const DuotoneSettings = lazy(() =>
  import("@/components/tools/duotone-settings").then((m) => ({
    default: m.DuotoneSettings,
  })),
);
const GifWebpSettings = lazy(() =>
  import("@/components/tools/gif-webp-settings").then((m) => ({
    default: m.GifWebpSettings,
  })),
);
const HistogramSettings = lazy(() =>
  import("@/components/tools/histogram-settings").then((m) => ({
    default: m.HistogramSettings,
  })),
);
const ImagePadSettings = lazy(() =>
  import("@/components/tools/image-pad-settings").then((m) => ({
    default: m.ImagePadSettings,
  })),
);
const LqipPlaceholderSettings = lazy(() =>
  import("@/components/tools/lqip-placeholder-settings").then((m) => ({
    default: m.LqipPlaceholderSettings,
  })),
);
const PixelateSettings = lazy(() =>
  import("@/components/tools/pixelate-settings").then((m) => ({
    default: m.PixelateSettings,
  })),
);
const SpriteSheetSettings = lazy(() =>
  import("@/components/tools/sprite-sheet-settings").then((m) => ({
    default: m.SpriteSheetSettings,
  })),
);
const VignetteSettings = lazy(() =>
  import("@/components/tools/vignette-settings").then((m) => ({
    default: m.VignetteSettings,
  })),
);

// One settings component shared by every conversion preset (jpg-to-png, etc.).
const ConversionPresetSettings = lazy(() =>
  import("@/components/tools/conversion-preset-settings").then((m) => ({
    default: m.ConversionPresetSettings,
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
  ["barcode-generate", { Settings: BarcodeGenerateSettings }],
  ["image-to-base64", { Settings: ImageToBase64Settings, ResultsPanel: ImageToBase64Results }],

  // Layout & Composition
  ["collage", { Settings: CollageSettings, ResultsPanel: CollagePreview }],
  ["stitch", { Settings: StitchSettings }],
  ["split", { Settings: SplitSettings, ResultsPanel: SplitCanvas }],
  ["border", { livePreview: true, Settings: BorderSettings as never }],
  ["beautify", { livePreview: true, Settings: BeautifySettings as never }],
  ["circle-crop", { livePreview: true, Settings: CircleCropSettings }],
  ["duotone", { livePreview: true, Settings: DuotoneSettings }],
  ["image-pad", { livePreview: true, Settings: ImagePadSettings }],
  ["pixelate", { livePreview: true, Settings: PixelateSettings }],
  ["sprite-sheet", { Settings: SpriteSheetSettings }],
  ["vignette", { livePreview: true, Settings: VignetteSettings }],

  // Image utilities (wave 5a)
  ["gif-webp", { livePreview: true, accept: ".gif,.webp", Settings: GifWebpSettings }],
  ["histogram", { Settings: HistogramSettings }],
  ["lqip-placeholder", { Settings: LqipPlaceholderSettings }],

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
  ["ocr-pdf", { accept: ".pdf", Settings: OcrPdfSettings, ResultsPanel: OcrPdfView }],
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
  ["transcribe-audio", { accept: AUDIO_INPUTS.join(","), Settings: TranscribeAudioSettings }],
  ["auto-subtitles", { accept: VIDEO_INPUTS.join(","), Settings: AutoSubtitlesSettings }],
  ["background-replace", { Settings: BackgroundReplaceSettings }],
  ["blur-background", { Settings: BlurBackgroundSettings }],

  // Video tools
  ["convert-video", { accept: VIDEO_INPUTS.join(","), Settings: ConvertVideoSettings }],
  ["compress-video", { accept: VIDEO_INPUTS.join(","), Settings: CompressVideoSettings }],
  ["trim-video", { accept: VIDEO_INPUTS.join(","), Settings: TrimVideoSettings }],
  ["mute-video", { accept: VIDEO_INPUTS.join(","), Settings: MuteVideoSettings }],
  ["video-to-gif", { accept: VIDEO_INPUTS.join(","), Settings: VideoToGifSettings }],
  ["resize-video", { accept: VIDEO_INPUTS.join(","), Settings: ResizeVideoSettings }],
  ["crop-video", { accept: VIDEO_INPUTS.join(","), Settings: CropVideoSettings }],
  ["rotate-video", { accept: VIDEO_INPUTS.join(","), Settings: RotateVideoSettings }],
  ["change-fps", { accept: VIDEO_INPUTS.join(","), Settings: ChangeFpsSettings }],
  ["video-color", { accept: VIDEO_INPUTS.join(","), Settings: VideoColorSettings }],
  ["video-speed", { accept: VIDEO_INPUTS.join(","), Settings: VideoSpeedSettings }],
  ["reverse-video", { accept: VIDEO_INPUTS.join(","), Settings: ReverseVideoSettings }],
  ["video-loudnorm", { accept: VIDEO_INPUTS.join(","), Settings: VideoLoudnormSettings }],
  ["aspect-pad", { accept: VIDEO_INPUTS.join(","), Settings: AspectPadSettings }],
  ["blur-pad", { accept: VIDEO_INPUTS.join(","), Settings: BlurPadSettings }],
  ["watermark-video", { accept: VIDEO_INPUTS.join(","), Settings: WatermarkVideoSettings }],
  ["stabilize-video", { accept: VIDEO_INPUTS.join(","), Settings: StabilizeVideoSettings }],
  ["gif-to-video", { accept: ".gif", Settings: GifToVideoSettings }],
  ["video-to-webp", { accept: VIDEO_INPUTS.join(","), Settings: VideoToWebpSettings }],
  ["video-to-frames", { accept: VIDEO_INPUTS.join(","), Settings: VideoToFramesSettings }],
  ["merge-videos", { accept: VIDEO_INPUTS.join(","), Settings: MergeVideosSettings }],
  [
    "replace-audio",
    {
      accept: `${VIDEO_INPUTS.join(",")},${AUDIO_INPUTS.join(",")}`,
      Settings: ReplaceAudioSettings,
    },
  ],
  [
    "burn-subtitles",
    {
      accept: `${VIDEO_INPUTS.join(",")},${SUBTITLE_INPUTS.join(",")}`,
      Settings: BurnSubtitlesSettings,
    },
  ],
  [
    "embed-subtitles",
    {
      accept: `${VIDEO_INPUTS.join(",")},${SUBTITLE_INPUTS.join(",")}`,
      Settings: EmbedSubtitlesSettings,
    },
  ],
  ["extract-subtitles", { accept: VIDEO_INPUTS.join(","), Settings: ExtractSubtitlesSettings }],
  ["images-to-video", { accept: IMAGE_INPUTS.join(","), Settings: ImagesToVideoSettings }],
  ["video-metadata", { accept: VIDEO_INPUTS.join(","), Settings: VideoMetadataSettings }],

  // Audio tools
  ["convert-audio", { accept: AUDIO_INPUTS.join(","), Settings: ConvertAudioSettings }],
  ["trim-audio", { accept: AUDIO_INPUTS.join(","), Settings: TrimAudioSettings }],
  ["extract-audio", { accept: VIDEO_INPUTS.join(","), Settings: ExtractAudioSettings }],

  // Audio depth tools
  ["audio-channels", { accept: AUDIO_INPUTS.join(","), Settings: AudioChannelsSettings }],
  ["audio-metadata", { accept: AUDIO_INPUTS.join(","), Settings: AudioMetadataSettings }],
  ["audio-speed", { accept: AUDIO_INPUTS.join(","), Settings: AudioSpeedSettings }],
  ["fade-audio", { accept: AUDIO_INPUTS.join(","), Settings: FadeAudioSettings }],
  ["merge-audio", { accept: AUDIO_INPUTS.join(","), Settings: MergeAudioSettings }],
  ["noise-reduction", { accept: AUDIO_INPUTS.join(","), Settings: NoiseReductionSettings }],
  ["normalize-audio", { accept: AUDIO_INPUTS.join(","), Settings: NormalizeAudioSettings }],
  ["pitch-shift", { accept: AUDIO_INPUTS.join(","), Settings: PitchShiftSettings }],
  ["reverse-audio", { accept: AUDIO_INPUTS.join(","), Settings: ReverseAudioSettings }],
  ["ringtone-maker", { accept: AUDIO_INPUTS.join(","), Settings: RingtoneMakerSettings }],
  ["silence-removal", { accept: AUDIO_INPUTS.join(","), Settings: SilenceRemovalSettings }],
  ["split-audio", { accept: AUDIO_INPUTS.join(","), Settings: SplitAudioSettings }],
  ["volume-adjust", { accept: AUDIO_INPUTS.join(","), Settings: VolumeAdjustSettings }],
  ["waveform-image", { accept: AUDIO_INPUTS.join(","), Settings: WaveformImageSettings }],

  // PDF & Document tools
  ["merge-pdf", { accept: ".pdf", Settings: MergePdfSettings }],
  ["split-pdf", { accept: ".pdf", Settings: SplitPdfSettings }],
  ["compress-pdf", { accept: ".pdf", Settings: CompressPdfSettings }],
  ["rotate-pdf", { accept: ".pdf", Settings: RotatePdfSettings }],
  ["word-to-pdf", { accept: ".docx,.doc,.odt,.rtf,.txt", Settings: WordToPdfSettings }],
  ["excel-to-pdf", { accept: ".xlsx,.xls,.ods,.csv", Settings: ExcelToPdfSettings }],
  ["powerpoint-to-pdf", { accept: ".pptx,.ppt,.odp", Settings: PowerpointToPdfSettings }],
  ["convert-document", { accept: ".docx,.doc,.odt,.rtf,.txt", Settings: ConvertDocumentSettings }],
  ["convert-spreadsheet", { accept: ".xlsx,.xls,.ods,.csv", Settings: ConvertSpreadsheetSettings }],
  ["convert-presentation", { accept: ".pptx,.ppt,.odp", Settings: ConvertPresentationSettings }],
  ["markdown-to-html", { accept: ".md,.markdown", Settings: MarkdownToHtmlSettings }],
  ["markdown-to-docx", { accept: ".md,.markdown", Settings: MarkdownToDocxSettings }],
  ["epub-convert", { accept: ".epub", Settings: EpubConvertSettings }],
  ["to-epub", { accept: ".docx,.md,.html,.txt", Settings: ToEpubSettings }],

  // PDF depth tools (organize, secure, pdfcpu, layout)
  ["extract-pages", { accept: ".pdf", Settings: ExtractPagesSettings }],
  ["remove-pages", { accept: ".pdf", Settings: RemovePagesSettings }],
  ["organize-pdf", { accept: ".pdf", Settings: OrganizePdfSettings }],
  ["protect-pdf", { accept: ".pdf", Settings: ProtectPdfSettings }],
  ["unlock-pdf", { accept: ".pdf", Settings: UnlockPdfSettings }],
  ["repair-pdf", { accept: ".pdf", Settings: RepairPdfSettings }],
  ["crop-pdf", { accept: ".pdf", Settings: CropPdfSettings }],
  ["nup-pdf", { accept: ".pdf", Settings: NupPdfSettings }],
  ["booklet-pdf", { accept: ".pdf", Settings: BookletPdfSettings }],
  ["watermark-pdf", { accept: ".pdf", Settings: WatermarkPdfSettings }],
  ["pdf-page-numbers", { accept: ".pdf", Settings: PdfPageNumbersSettings }],

  // PDF convert and optimize tools
  ["linearize-pdf", { accept: ".pdf", Settings: LinearizePdfSettings }],
  ["grayscale-pdf", { accept: ".pdf", Settings: GrayscalePdfSettings }],
  ["pdfa-convert", { accept: ".pdf", Settings: PdfaConvertSettings }],
  ["flatten-pdf", { accept: ".pdf", Settings: FlattenPdfSettings }],
  ["redact-pdf", { accept: ".pdf", Settings: RedactPdfSettings }],
  ["sign-pdf", { accept: ".pdf", Settings: SignPdfSettings }],
  ["pdf-to-text", { accept: ".pdf", Settings: PdfToTextSettings }],
  ["pdf-to-word", { accept: ".pdf", Settings: PdfToWordSettings }],
  ["pdf-metadata", { accept: ".pdf", Settings: PdfMetadataSettings }],
  ["html-to-pdf", { accept: ".html,.htm", Settings: HtmlToPdfSettings }],
  ["markdown-to-pdf", { accept: ".md,.markdown", Settings: MarkdownToPdfSettings }],

  // File tools
  ["chart-maker", { accept: ".csv,.json", Settings: ChartMakerSettings }],
  ["csv-excel", { accept: ".csv,.tsv,.xlsx", Settings: CsvExcelSettings }],
  ["csv-json", { accept: ".csv,.tsv,.json", Settings: CsvJsonSettings }],
  ["json-xml", { accept: ".json,.xml", Settings: JsonXmlSettings }],
  ["split-csv", { accept: ".csv,.tsv", Settings: SplitCsvSettings }],
  ["merge-csvs", { accept: ".csv,.tsv", Settings: MergeCsvsSettings }],
  ["yaml-json", { accept: ".yaml,.yml,.json", Settings: YamlJsonSettings }],
  ["xml-to-csv", { accept: ".xml", Settings: XmlToCsvSettings }],
  ["create-zip", { Settings: CreateZipSettings }],
  ["extract-zip", { accept: ".zip", Settings: ExtractZipSettings }],
];

// Conversion presets all share ConversionPresetSettings; each narrows the
// file picker to its own source inputs. Generated from shared metadata so the
// list stays in lockstep with the catalog.
const PRESET_ENTRIES: ReadonlyArray<[string, RegistryEntryConfig]> = CONVERSION_PRESETS.map(
  (p) => [p.id, { accept: p.sourceInputs.join(","), Settings: ConversionPresetSettings }] as const,
);

const ALL_ENTRIES: ReadonlyArray<[string, RegistryEntryConfig]> = [
  ...ENTRY_CONFIG,
  ...PRESET_ENTRIES,
];

export const toolRegistry = new Map<string, ToolRegistryEntry>(
  ALL_ENTRIES.map(([toolId, entry]) => {
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
