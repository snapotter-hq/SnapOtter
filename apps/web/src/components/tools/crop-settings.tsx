import { useState } from "react";
import { useFileStore } from "@/stores/file-store";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { Download, Loader2 } from "lucide-react";

const ASPECT_PRESETS = [
  { label: "1:1", w: 1, h: 1 },
  { label: "4:3", w: 4, h: 3 },
  { label: "16:9", w: 16, h: 9 },
  { label: "2:3", w: 2, h: 3 },
  { label: "4:5", w: 4, h: 5 },
];

export function CropSettings() {
  const { files } = useFileStore();
  const { processFiles, processing, error, downloadUrl, originalSize, processedSize } =
    useToolProcessor("crop");

  const [left, setLeft] = useState("0");
  const [top, setTop] = useState("0");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");

  const applyAspect = (w: number, h: number) => {
    // If width is set, calculate height from aspect ratio
    const currentW = Number(width);
    if (currentW > 0) {
      setHeight(String(Math.round((currentW * h) / w)));
    }
  };

  const handleProcess = () => {
    processFiles(files, {
      left: Number(left),
      top: Number(top),
      width: Number(width),
      height: Number(height),
    });
  };

  const hasFile = files.length > 0;
  const hasSize = Number(width) > 0 && Number(height) > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (hasFile && hasSize && !processing) handleProcess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Position */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground">Left (px)</label>
          <input
            type="number"
            value={left}
            onChange={(e) => setLeft(e.target.value)}
            min={0}
            className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Top (px)</label>
          <input
            type="number"
            value={top}
            onChange={(e) => setTop(e.target.value)}
            min={0}
            className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
          />
        </div>
      </div>

      {/* Size */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground">Width (px)</label>
          <input
            type="number"
            value={width}
            onChange={(e) => setWidth(e.target.value)}
            min={1}
            className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Height (px)</label>
          <input
            type="number"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            min={1}
            className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
          />
        </div>
      </div>

      {/* Aspect ratio presets */}
      <div>
        <label className="text-xs text-muted-foreground">Aspect Ratio</label>
        <div className="flex gap-1 mt-1">
          {ASPECT_PRESETS.map(({ label, w, h }) => (
            <button
              type="button"
              key={label}
              onClick={() => applyAspect(w, h)}
              className="flex-1 text-xs py-1.5 rounded bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Size info */}
      {originalSize != null && processedSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>Original: {(originalSize / 1024).toFixed(1)} KB</p>
          <p>Processed: {(processedSize / 1024).toFixed(1)} KB</p>
        </div>
      )}

      {/* Process */}
      <button
        type="submit"
        disabled={!hasFile || !hasSize || processing}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {processing && <Loader2 className="h-4 w-4 animate-spin" />}
        {processing ? "Processing..." : "Crop"}
      </button>

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
