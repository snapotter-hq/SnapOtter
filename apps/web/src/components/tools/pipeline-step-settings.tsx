import { BlurFacesControls } from "./blur-faces-settings";
import { BorderControls } from "./border-settings";
import { ColorControls } from "./color-settings";
import { CompressControls } from "./compress-settings";
import { ConvertControls } from "./convert-settings";
import { CropControls } from "./crop-settings";
import { EnhanceFacesControls } from "./enhance-faces-settings";
import { GifToolsControls } from "./gif-tools-settings";
import { NoiseRemovalControls } from "./noise-removal-settings";
import { RemoveBgControls } from "./remove-bg-settings";
import { ReplaceColorControls } from "./replace-color-settings";
import { ResizeControls } from "./resize-settings";
import { RotateControls } from "./rotate-settings";
import { SmartCropControls } from "./smart-crop-settings";
import { StripMetadataControls } from "./strip-metadata-settings";
import { TextOverlayControls } from "./text-overlay-settings";
import { UpscaleControls } from "./upscale-settings";
import { WatermarkTextControls } from "./watermark-text-settings";

const COLOR_TOOL_IDS = new Set(["adjust-colors"]);

interface PipelineStepSettingsProps {
  toolId: string;
  settings: Record<string, unknown>;
  onChange: (settings: Record<string, unknown>) => void;
}

export function PipelineStepSettings({ toolId, settings, onChange }: PipelineStepSettingsProps) {
  if (toolId === "resize") return <ResizeControls settings={settings} onChange={onChange} />;
  if (toolId === "crop") return <CropControls settings={settings} onChange={onChange} />;
  if (toolId === "rotate") return <RotateControls settings={settings} onChange={onChange} />;
  if (toolId === "convert") return <ConvertControls settings={settings} onChange={onChange} />;
  if (toolId === "compress") return <CompressControls settings={settings} onChange={onChange} />;
  if (toolId === "strip-metadata")
    return <StripMetadataControls settings={settings} onChange={onChange} />;
  if (toolId === "border") return <BorderControls settings={settings} onChange={onChange} />;
  if (toolId === "watermark-text")
    return <WatermarkTextControls settings={settings} onChange={onChange} />;
  if (toolId === "text-overlay")
    return <TextOverlayControls settings={settings} onChange={onChange} />;
  if (toolId === "replace-color")
    return <ReplaceColorControls settings={settings} onChange={onChange} />;
  if (toolId === "smart-crop") return <SmartCropControls settings={settings} onChange={onChange} />;
  if (toolId === "gif-tools") return <GifToolsControls settings={settings} onChange={onChange} />;
  if (toolId === "upscale") return <UpscaleControls settings={settings} onChange={onChange} />;
  if (toolId === "blur-faces") return <BlurFacesControls settings={settings} onChange={onChange} />;
  if (toolId === "enhance-faces")
    return <EnhanceFacesControls settings={settings} onChange={onChange} />;
  if (toolId === "remove-background")
    return <RemoveBgControls settings={settings} onChange={onChange} />;
  if (toolId === "noise-removal")
    return <NoiseRemovalControls settings={settings} onChange={onChange} />;
  if (COLOR_TOOL_IDS.has(toolId))
    return <ColorControls toolId={toolId} settings={settings} onChange={onChange} />;

  return (
    <p className="text-xs text-muted-foreground italic">
      No configurable settings. Defaults will be used.
    </p>
  );
}
