import { Download } from "lucide-react";
import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

type Position = "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right" | "tiled";

export function WatermarkTextSettings() {
  const { files } = useFileStore();
  const {
    processFiles,
    processAllFiles,
    processing,
    error,
    downloadUrl,
    originalSize,
    processedSize,
    progress,
  } = useToolProcessor("watermark-text");

  const [text, setText] = useState("Sample Watermark");
  const [fontSize, setFontSize] = useState(48);
  const [color, setColor] = useState("#000000");
  const [opacity, setOpacity] = useState(50);
  const [position, setPosition] = useState<Position>("center");
  const [rotation, setRotation] = useState(0);

  const handleProcess = () => {
    const settings = { text, fontSize, color, opacity, position, rotation };
    if (files.length > 1) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  const hasFile = files.length > 0;

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="watermark-text-text" className="text-xs text-muted-foreground">
          Watermark Text
        </label>
        <input
          id="watermark-text-text"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="watermark-text-font-size" className="text-xs text-muted-foreground">
            Font Size
          </label>
          <span className="text-xs font-mono text-foreground">{fontSize}px</span>
        </div>
        <input
          id="watermark-text-font-size"
          type="range"
          min={8}
          max={200}
          value={fontSize}
          onChange={(e) => setFontSize(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label htmlFor="watermark-text-color" className="text-xs text-muted-foreground">
            Color
          </label>
          <input
            id="watermark-text-color"
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-full mt-0.5 h-8 rounded border border-border"
          />
        </div>
        <div className="flex-1">
          <div className="flex justify-between items-center">
            <label htmlFor="watermark-text-opacity" className="text-xs text-muted-foreground">
              Opacity
            </label>
            <span className="text-xs font-mono text-foreground">{opacity}%</span>
          </div>
          <input
            id="watermark-text-opacity"
            type="range"
            min={0}
            max={100}
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            className="w-full mt-1"
          />
        </div>
      </div>

      <div>
        <label htmlFor="watermark-text-position" className="text-xs text-muted-foreground">
          Position
        </label>
        <select
          id="watermark-text-position"
          value={position}
          onChange={(e) => setPosition(e.target.value as Position)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="center">Center</option>
          <option value="top-left">Top Left</option>
          <option value="top-right">Top Right</option>
          <option value="bottom-left">Bottom Left</option>
          <option value="bottom-right">Bottom Right</option>
          <option value="tiled">Tiled (Repeating)</option>
        </select>
      </div>

      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="watermark-text-rotation" className="text-xs text-muted-foreground">
            Rotation
          </label>
          <span className="text-xs font-mono text-foreground">{rotation}&deg;</span>
        </div>
        <input
          id="watermark-text-rotation"
          type="range"
          min={-180}
          max={180}
          value={rotation}
          onChange={(e) => setRotation(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {originalSize != null && processedSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>Original: {(originalSize / 1024).toFixed(1)} KB</p>
          <p>Processed: {(processedSize / 1024).toFixed(1)} KB</p>
        </div>
      )}

      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label="Adding watermark"
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="button"
          data-testid="watermark-text-submit"
          onClick={handleProcess}
          disabled={!hasFile || processing || !text}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1 ? `Apply Watermark (${files.length} files)` : "Apply Watermark"}
        </button>
      )}

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="watermark-text-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      )}
    </div>
  );
}
