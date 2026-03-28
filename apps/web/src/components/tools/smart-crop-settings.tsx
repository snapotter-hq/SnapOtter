import { Download } from "lucide-react";
import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

const ASPECT_PRESETS = [
  { label: "1:1 Square", w: 1080, h: 1080 },
  { label: "16:9 Landscape", w: 1920, h: 1080 },
  { label: "9:16 Portrait", w: 1080, h: 1920 },
  { label: "4:3 Standard", w: 1440, h: 1080 },
  { label: "3:2 Photo", w: 1620, h: 1080 },
  { label: "Custom", w: 0, h: 0 },
];

export function SmartCropSettings() {
  const { files } = useFileStore();
  const { processFiles, processing, error, downloadUrl, originalSize, processedSize, progress } =
    useToolProcessor("smart-crop");

  const [width, setWidth] = useState("1080");
  const [height, setHeight] = useState("1080");
  const [preset, setPreset] = useState("1:1 Square");

  const handlePreset = (label: string) => {
    setPreset(label);
    const p = ASPECT_PRESETS.find((a) => a.label === label);
    if (p && p.w > 0) {
      setWidth(String(p.w));
      setHeight(String(p.h));
    }
  };

  const handleProcess = () => {
    const w = Number(width);
    const h = Number(height);
    if (w > 0 && h > 0) {
      processFiles(files, { width: w, height: h });
    }
  };

  const hasFile = files.length > 0;
  const canProcess = Number(width) > 0 && Number(height) > 0;

  return (
    <div className="space-y-4">
      {/* Aspect ratio preset */}
      <div>
        <label htmlFor="smart-crop-preset" className="text-sm font-medium text-muted-foreground">
          Target Aspect Ratio
        </label>
        <select
          id="smart-crop-preset"
          value={preset}
          onChange={(e) => handlePreset(e.target.value)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          {ASPECT_PRESETS.map((p) => (
            <option key={p.label} value={p.label}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {/* Width / Height */}
      <div className="flex gap-2">
        <div className="flex-1">
          <label htmlFor="smart-crop-width" className="text-xs text-muted-foreground">
            Width (px)
          </label>
          <input
            id="smart-crop-width"
            type="number"
            value={width}
            onChange={(e) => {
              setWidth(e.target.value);
              setPreset("Custom");
            }}
            min={1}
            className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
          />
        </div>
        <div className="flex-1">
          <label htmlFor="smart-crop-height" className="text-xs text-muted-foreground">
            Height (px)
          </label>
          <input
            id="smart-crop-height"
            type="number"
            value={height}
            onChange={(e) => {
              setHeight(e.target.value);
              setPreset("Custom");
            }}
            min={1}
            className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
          />
        </div>
      </div>

      {/* Info */}
      <p className="text-[10px] text-muted-foreground">
        Uses entropy-based attention detection to find the most interesting region of the image and
        crops to it.
      </p>

      {/* Error */}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Size info */}
      {originalSize != null && processedSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>Original: {(originalSize / 1024).toFixed(1)} KB</p>
          <p>Cropped: {(processedSize / 1024).toFixed(1)} KB</p>
        </div>
      )}

      {/* Process button */}
      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label="Smart cropping"
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="button"
          data-testid="smart-crop-submit"
          onClick={handleProcess}
          disabled={!hasFile || !canProcess || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          Smart Crop
        </button>
      )}

      {/* Download */}
      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="smart-crop-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      )}
    </div>
  );
}
