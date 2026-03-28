import { Download } from "lucide-react";
import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

export function BorderSettings() {
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
  } = useToolProcessor("border");

  const [borderWidth, setBorderWidth] = useState(10);
  const [borderColor, setBorderColor] = useState("#000000");
  const [cornerRadius, setCornerRadius] = useState(0);
  const [padding, setPadding] = useState(0);
  const [shadowBlur, setShadowBlur] = useState(0);

  const handleProcess = () => {
    const settings = { borderWidth, borderColor, cornerRadius, padding, shadowBlur };
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
        <div className="flex justify-between items-center">
          <label htmlFor="border-border-width" className="text-xs text-muted-foreground">
            Border Width
          </label>
          <span className="text-xs font-mono text-foreground">{borderWidth}px</span>
        </div>
        <input
          id="border-border-width"
          type="range"
          min={0}
          max={100}
          value={borderWidth}
          onChange={(e) => setBorderWidth(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      <div>
        <label htmlFor="border-border-color" className="text-xs text-muted-foreground">
          Border Color
        </label>
        <input
          id="border-border-color"
          type="color"
          value={borderColor}
          onChange={(e) => setBorderColor(e.target.value)}
          className="w-full mt-0.5 h-8 rounded border border-border"
        />
      </div>

      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="border-corner-radius" className="text-xs text-muted-foreground">
            Corner Radius
          </label>
          <span className="text-xs font-mono text-foreground">{cornerRadius}px</span>
        </div>
        <input
          id="border-corner-radius"
          type="range"
          min={0}
          max={200}
          value={cornerRadius}
          onChange={(e) => setCornerRadius(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="border-padding" className="text-xs text-muted-foreground">
            Padding
          </label>
          <span className="text-xs font-mono text-foreground">{padding}px</span>
        </div>
        <input
          id="border-padding"
          type="range"
          min={0}
          max={100}
          value={padding}
          onChange={(e) => setPadding(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="border-shadow" className="text-xs text-muted-foreground">
            Shadow
          </label>
          <span className="text-xs font-mono text-foreground">{shadowBlur}px</span>
        </div>
        <input
          id="border-shadow"
          type="range"
          min={0}
          max={50}
          value={shadowBlur}
          onChange={(e) => setShadowBlur(Number(e.target.value))}
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
          label="Adding border"
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="button"
          data-testid="border-submit"
          onClick={handleProcess}
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1 ? `Apply Border (${files.length} files)` : "Apply Border"}
        </button>
      )}

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="border-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      )}
    </div>
  );
}
