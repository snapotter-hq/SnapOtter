import { lazy, Suspense } from "react";

type ControlProps = {
  settings: Record<string, unknown>;
  onChange: (settings: Record<string, unknown>) => void;
};

// Lazy-load every control so these modules are not pulled into the main bundle.
// The pipeline builder wraps this component in <Suspense> so each control
// loads on demand when the user selects a step in the pipeline.
const CONTROLS: Record<string, React.LazyExoticComponent<React.FC<ControlProps>>> = {
  resize: lazy(() => import("./resize-settings").then((m) => ({ default: m.ResizeControls }))),
  crop: lazy(() => import("./crop-settings").then((m) => ({ default: m.CropControls }))),
  rotate: lazy(() => import("./rotate-settings").then((m) => ({ default: m.RotateControls }))),
  convert: lazy(() => import("./convert-settings").then((m) => ({ default: m.ConvertControls }))),
  compress: lazy(() =>
    import("./compress-settings").then((m) => ({ default: m.CompressControls })),
  ),
  "strip-metadata": lazy(() =>
    import("./strip-metadata-settings").then((m) => ({ default: m.StripMetadataControls })),
  ),
  border: lazy(() => import("./border-settings").then((m) => ({ default: m.BorderControls }))),
  "watermark-text": lazy(() =>
    import("./watermark-text-settings").then((m) => ({ default: m.WatermarkTextControls })),
  ),
  "text-overlay": lazy(() =>
    import("./text-overlay-settings").then((m) => ({ default: m.TextOverlayControls })),
  ),
  "replace-color": lazy(() =>
    import("./replace-color-settings").then((m) => ({ default: m.ReplaceColorControls })),
  ),
  "smart-crop": lazy(() =>
    import("./smart-crop-settings").then((m) => ({ default: m.SmartCropControls })),
  ),
  "gif-tools": lazy(() =>
    import("./gif-tools-settings").then((m) => ({ default: m.GifToolsControls })),
  ),
  upscale: lazy(() => import("./upscale-settings").then((m) => ({ default: m.UpscaleControls }))),
  "blur-faces": lazy(() =>
    import("./blur-faces-settings").then((m) => ({ default: m.BlurFacesControls })),
  ),
  "enhance-faces": lazy(() =>
    import("./enhance-faces-settings").then((m) => ({ default: m.EnhanceFacesControls })),
  ),
  "remove-background": lazy(() =>
    import("./remove-bg-settings").then((m) => ({ default: m.RemoveBgControls })),
  ),
  "noise-removal": lazy(() =>
    import("./noise-removal-settings").then((m) => ({ default: m.NoiseRemovalControls })),
  ),
  "convert-audio": lazy(() =>
    import("./convert-audio-settings").then((m) => ({ default: m.ConvertAudioControls })),
  ),
  "convert-video": lazy(() =>
    import("./convert-video-settings").then((m) => ({ default: m.ConvertVideoControls })),
  ),
  "compress-video": lazy(() =>
    import("./compress-video-settings").then((m) => ({ default: m.CompressVideoControls })),
  ),
  "trim-video": lazy(() =>
    import("./trim-video-settings").then((m) => ({ default: m.TrimVideoControls })),
  ),
  "video-to-gif": lazy(() =>
    import("./video-to-gif-settings").then((m) => ({ default: m.VideoToGifControls })),
  ),
  "video-to-webp": lazy(() =>
    import("./video-to-webp-settings").then((m) => ({ default: m.VideoToWebpControls })),
  ),
  "resize-video": lazy(() =>
    import("./resize-video-settings").then((m) => ({ default: m.ResizeVideoControls })),
  ),
  "crop-video": lazy(() =>
    import("./crop-video-settings").then((m) => ({ default: m.CropVideoControls })),
  ),
  "rotate-video": lazy(() =>
    import("./rotate-video-settings").then((m) => ({ default: m.RotateVideoControls })),
  ),
  "change-fps": lazy(() =>
    import("./change-fps-settings").then((m) => ({ default: m.ChangeFpsControls })),
  ),
  "video-color": lazy(() =>
    import("./video-color-settings").then((m) => ({ default: m.VideoColorControls })),
  ),
  "video-speed": lazy(() =>
    import("./video-speed-settings").then((m) => ({ default: m.VideoSpeedControls })),
  ),
  "aspect-pad": lazy(() =>
    import("./aspect-pad-settings").then((m) => ({ default: m.AspectPadControls })),
  ),
  "blur-pad": lazy(() =>
    import("./blur-pad-settings").then((m) => ({ default: m.BlurPadControls })),
  ),
  "watermark-video": lazy(() =>
    import("./watermark-video-settings").then((m) => ({ default: m.WatermarkVideoControls })),
  ),
  "trim-audio": lazy(() =>
    import("./trim-audio-settings").then((m) => ({ default: m.TrimAudioControls })),
  ),
  "volume-adjust": lazy(() =>
    import("./volume-adjust-settings").then((m) => ({ default: m.VolumeAdjustControls })),
  ),
  "audio-speed": lazy(() =>
    import("./audio-speed-settings").then((m) => ({ default: m.AudioSpeedControls })),
  ),
  "pitch-shift": lazy(() =>
    import("./pitch-shift-settings").then((m) => ({ default: m.PitchShiftControls })),
  ),
  "audio-channels": lazy(() =>
    import("./audio-channels-settings").then((m) => ({ default: m.AudioChannelsControls })),
  ),
  "ringtone-maker": lazy(() =>
    import("./ringtone-maker-settings").then((m) => ({ default: m.RingtoneMakerControls })),
  ),
  "audio-metadata": lazy(() =>
    import("./audio-metadata-settings").then((m) => ({ default: m.AudioMetadataControls })),
  ),
  "rotate-pdf": lazy(() =>
    import("./rotate-pdf-settings").then((m) => ({ default: m.RotatePdfControls })),
  ),
  "convert-document": lazy(() =>
    import("./convert-document-settings").then((m) => ({ default: m.ConvertDocumentControls })),
  ),
  "convert-presentation": lazy(() =>
    import("./convert-presentation-settings").then((m) => ({
      default: m.ConvertPresentationControls,
    })),
  ),
  "convert-spreadsheet": lazy(() =>
    import("./convert-spreadsheet-settings").then((m) => ({
      default: m.ConvertSpreadsheetControls,
    })),
  ),
  "extract-pages": lazy(() =>
    import("./extract-pages-settings").then((m) => ({ default: m.ExtractPagesControls })),
  ),
  "remove-pages": lazy(() =>
    import("./remove-pages-settings").then((m) => ({ default: m.RemovePagesControls })),
  ),
  "organize-pdf": lazy(() =>
    import("./organize-pdf-settings").then((m) => ({ default: m.OrganizePdfControls })),
  ),
  "nup-pdf": lazy(() => import("./nup-pdf-settings").then((m) => ({ default: m.NupPdfControls }))),
  "watermark-pdf": lazy(() =>
    import("./watermark-pdf-settings").then((m) => ({ default: m.WatermarkPdfControls })),
  ),
  "redact-pdf": lazy(() =>
    import("./redact-pdf-settings").then((m) => ({ default: m.RedactPdfControls })),
  ),
  "pdf-metadata": lazy(() =>
    import("./pdf-metadata-settings").then((m) => ({ default: m.PdfMetadataControls })),
  ),
  "epub-convert": lazy(() =>
    import("./epub-convert-settings").then((m) => ({ default: m.EpubConvertControls })),
  ),
  "compress-pdf": lazy(() =>
    import("./compress-settings").then((m) => ({ default: m.CompressControls })),
  ),
  "chart-maker": lazy(() =>
    import("./chart-maker-settings").then((m) => ({ default: m.ChartMakerControls })),
  ),
};

const COLOR_TOOL_IDS = new Set(["adjust-colors"]);

// ColorControls needs an extra toolId prop so it lives outside the shared map.
const LazyColorControls = lazy(() =>
  import("./color-settings").then((m) => ({ default: m.ColorControls })),
);

interface PipelineStepSettingsProps {
  toolId: string;
  settings: Record<string, unknown>;
  onChange: (settings: Record<string, unknown>) => void;
}

export function PipelineStepSettings({ toolId, settings, onChange }: PipelineStepSettingsProps) {
  const Control = CONTROLS[toolId];

  if (Control) {
    return (
      <Suspense fallback={null}>
        <Control settings={settings} onChange={onChange} />
      </Suspense>
    );
  }

  if (COLOR_TOOL_IDS.has(toolId)) {
    return (
      <Suspense fallback={null}>
        <LazyColorControls toolId={toolId} settings={settings} onChange={onChange} />
      </Suspense>
    );
  }

  return (
    <p className="text-xs text-muted-foreground italic">
      No configurable settings. Defaults will be used.
    </p>
  );
}
