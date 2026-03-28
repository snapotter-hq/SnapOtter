import { Download } from "lucide-react";
import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

export function GifToolsSettings() {
  const { files } = useFileStore();
  const { processFiles, processing, error, downloadUrl, originalSize, processedSize, progress } =
    useToolProcessor("gif-tools");

  const [mode, setMode] = useState<"resize" | "extract">("resize");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [extractFrame, setExtractFrame] = useState("0");
  const [optimize, setOptimize] = useState(false);

  const handleProcess = () => {
    const settings: Record<string, unknown> = {};
    if (mode === "extract") {
      settings.extractFrame = Number(extractFrame);
    } else {
      if (width) settings.width = Number(width);
      if (height) settings.height = Number(height);
      settings.optimize = optimize;
    }
    processFiles(files, settings);
  };

  const hasFile = files.length > 0;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-muted-foreground">Mode</p>
        <div className="flex gap-1 mt-1">
          <button
            type="button"
            onClick={() => setMode("resize")}
            className={`flex-1 text-xs py-1.5 rounded ${mode === "resize" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            Resize
          </button>
          <button
            type="button"
            onClick={() => setMode("extract")}
            className={`flex-1 text-xs py-1.5 rounded ${mode === "extract" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            Extract Frame
          </button>
        </div>
      </div>

      {mode === "resize" ? (
        <>
          <div className="flex gap-2">
            <div className="flex-1">
              <label htmlFor="gif-tools-width" className="text-xs text-muted-foreground">
                Width (px)
              </label>
              <input
                id="gif-tools-width"
                type="number"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                placeholder="Auto"
                className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="gif-tools-height" className="text-xs text-muted-foreground">
                Height (px)
              </label>
              <input
                id="gif-tools-height"
                type="number"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                placeholder="Auto"
                className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
              />
            </div>
          </div>

          <label
            htmlFor="gif-tools-optimize"
            className="flex items-center gap-2 text-sm text-foreground"
          >
            <input
              id="gif-tools-optimize"
              type="checkbox"
              checked={optimize}
              onChange={(e) => setOptimize(e.target.checked)}
              className="rounded"
            />
            Optimize file size
          </label>
        </>
      ) : (
        <div>
          <label htmlFor="gif-tools-frame" className="text-xs text-muted-foreground">
            Frame Number
          </label>
          <input
            id="gif-tools-frame"
            type="number"
            value={extractFrame}
            onChange={(e) => setExtractFrame(e.target.value)}
            min={0}
            className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
          />
          <p className="text-[10px] text-muted-foreground mt-0.5">Frame 0 is the first frame</p>
        </div>
      )}

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
          label="Processing GIF"
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="button"
          data-testid="gif-tools-submit"
          onClick={handleProcess}
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          Process
        </button>
      )}

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="gif-tools-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      )}
    </div>
  );
}
