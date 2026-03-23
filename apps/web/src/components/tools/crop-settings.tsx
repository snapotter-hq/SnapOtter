import { useCallback } from "react";
import { useFileStore } from "@/stores/file-store";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { Download, ArrowLeftRight, Grid3x3 } from "lucide-react";
import { ProgressCard } from "@/components/common/progress-card";
import type { Crop } from "react-image-crop";

const ASPECT_PRESETS = [
  { label: "Free", value: undefined as number | undefined },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:2", value: 3 / 2 },
  { label: "16:9", value: 16 / 9 },
  { label: "2:3", value: 2 / 3 },
  { label: "4:5", value: 4 / 5 },
  { label: "9:16", value: 9 / 16 },
];

export interface CropSettingsProps {
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

export function CropSettings({
  cropState,
  onCropChange,
  onAspectChange,
  onGridToggle,
}: CropSettingsProps) {
  const { files } = useFileStore();
  const {
    processFiles,
    processAllFiles,
    processing,
    error,
    downloadUrl,
    progress,
  } = useToolProcessor("crop");

  const { crop, aspect, showGrid, imgDimensions } = cropState;

  // Convert percentage crop to pixel values
  const toPixels = useCallback(
    (c: Crop) => {
      if (!imgDimensions) return { left: 0, top: 0, width: 0, height: 0 };
      return {
        left: Math.round((c.x / 100) * imgDimensions.width),
        top: Math.round((c.y / 100) * imgDimensions.height),
        width: Math.round((c.width / 100) * imgDimensions.width),
        height: Math.round((c.height / 100) * imgDimensions.height),
      };
    },
    [imgDimensions],
  );

  // Convert pixel value change back to percentage crop
  const handlePixelChange = useCallback(
    (field: "left" | "top" | "width" | "height", value: number) => {
      if (!imgDimensions) return;
      const newCrop = { ...crop };
      if (field === "left") {
        newCrop.x = Math.max(
          0,
          Math.min((value / imgDimensions.width) * 100, 100 - newCrop.width),
        );
      } else if (field === "top") {
        newCrop.y = Math.max(
          0,
          Math.min((value / imgDimensions.height) * 100, 100 - newCrop.height),
        );
      } else if (field === "width") {
        const pct = Math.max(0, Math.min((value / imgDimensions.width) * 100, 100 - newCrop.x));
        newCrop.width = pct;
        if (aspect) {
          newCrop.height = Math.min(
            (pct / 100) * imgDimensions.width * (1 / aspect) * (100 / imgDimensions.height),
            100 - newCrop.y,
          );
          newCrop.y = Math.max(0, Math.min(newCrop.y, 100 - newCrop.height));
        }
      } else if (field === "height") {
        const pct = Math.max(0, Math.min((value / imgDimensions.height) * 100, 100 - newCrop.y));
        newCrop.height = pct;
        if (aspect) {
          newCrop.width = Math.min(
            (pct / 100) * imgDimensions.height * aspect * (100 / imgDimensions.width),
            100 - newCrop.x,
          );
          newCrop.x = Math.max(0, Math.min(newCrop.x, 100 - newCrop.width));
        }
      }
      onCropChange(newCrop);
    },
    [crop, imgDimensions, aspect, onCropChange],
  );

  const handleAspectSelect = useCallback(
    (value: number | undefined) => {
      onAspectChange(value);
      // When selecting an aspect ratio, adjust the current crop to match
      if (value && imgDimensions) {
        const imgAspect = imgDimensions.width / imgDimensions.height;
        let newWidth: number;
        let newHeight: number;
        if (value > imgAspect) {
          // Desired ratio is wider than image — use full width, shrink height
          newWidth = 100;
          newHeight = (imgDimensions.width / value / imgDimensions.height) * 100;
        } else {
          // Desired ratio is taller than image — use full height, shrink width
          newHeight = 100;
          newWidth = (imgDimensions.height * value / imgDimensions.width) * 100;
        }
        onCropChange({
          unit: "%",
          x: (100 - newWidth) / 2,
          y: (100 - newHeight) / 2,
          width: newWidth,
          height: newHeight,
        });
      }
    },
    [onAspectChange, onCropChange, imgDimensions],
  );

  const handleSwapAspect = useCallback(() => {
    if (aspect) {
      handleAspectSelect(1 / aspect);
    }
  }, [aspect, handleAspectSelect]);

  const pixels = toPixels(crop);

  const handleProcess = () => {
    const settings = {
      left: pixels.left,
      top: pixels.top,
      width: Math.max(1, pixels.width),
      height: Math.max(1, pixels.height),
    };
    if (files.length > 1) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  const hasFile = files.length > 0;
  const hasSize = pixels.width > 0 && pixels.height > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (hasFile && hasSize && !processing) handleProcess();
  };

  // Find which preset label matches the current aspect
  const activePresetLabel = ASPECT_PRESETS.find((p) => {
    if (p.value === undefined && aspect === undefined) return true;
    if (p.value !== undefined && aspect !== undefined) {
      return Math.abs(p.value - aspect) < 0.01;
    }
    return false;
  })?.label;

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-crop-form>
      {/* Aspect Ratio */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-muted-foreground">Aspect Ratio</label>
          {aspect !== undefined && (
            <button
              type="button"
              onClick={handleSwapAspect}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              title="Swap width/height"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {ASPECT_PRESETS.map(({ label, value }) => (
            <button
              type="button"
              key={label}
              onClick={() => handleAspectSelect(value)}
              className={`px-2 py-1.5 rounded text-xs transition-colors ${
                activePresetLabel === label
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-primary/20 hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Position & Size */}
      <div>
        <label className="text-xs text-muted-foreground">Position & Size</label>
        <div className="grid grid-cols-2 gap-2 mt-1">
          <div>
            <label className="text-[10px] text-muted-foreground">
              X{imgDimensions ? ` (of ${imgDimensions.width})` : ""}
            </label>
            <input
              type="number"
              value={pixels.left}
              onChange={(e) =>
                handlePixelChange("left", Number(e.target.value))
              }
              min={0}
              max={imgDimensions ? imgDimensions.width - 1 : undefined}
              className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground tabular-nums"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">
              Y{imgDimensions ? ` (of ${imgDimensions.height})` : ""}
            </label>
            <input
              type="number"
              value={pixels.top}
              onChange={(e) =>
                handlePixelChange("top", Number(e.target.value))
              }
              min={0}
              max={imgDimensions ? imgDimensions.height - 1 : undefined}
              className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground tabular-nums"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">
              Width{imgDimensions ? ` (of ${imgDimensions.width})` : ""}
            </label>
            <input
              type="number"
              value={pixels.width}
              onChange={(e) =>
                handlePixelChange("width", Number(e.target.value))
              }
              min={1}
              max={imgDimensions ? imgDimensions.width : undefined}
              className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground tabular-nums"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">
              Height{imgDimensions ? ` (of ${imgDimensions.height})` : ""}
            </label>
            <input
              type="number"
              value={pixels.height}
              onChange={(e) =>
                handlePixelChange("height", Number(e.target.value))
              }
              min={1}
              max={imgDimensions ? imgDimensions.height : undefined}
              className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground tabular-nums"
            />
          </div>
        </div>
      </div>

      {/* Grid overlay toggle */}
      <button
        type="button"
        onClick={() => onGridToggle(!showGrid)}
        className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs transition-colors ${
          showGrid
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground hover:text-foreground"
        }`}
      >
        <Grid3x3 className="h-3.5 w-3.5" />
        Rule of Thirds
      </button>

      {/* Error */}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Process */}
      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label="Cropping"
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="submit"
          disabled={!hasFile || !hasSize || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1 ? `Crop (${files.length} files)` : "Crop"}
        </button>
      )}

      {/* Download */}
      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      )}
    </form>
  );
}
