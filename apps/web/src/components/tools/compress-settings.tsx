import { useState } from "react";
import { useFileStore } from "@/stores/file-store";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { Download } from "lucide-react";
import { ProgressCard } from "@/components/common/progress-card";

type CompressMode = "quality" | "targetSize";

export function CompressSettings() {
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, downloadUrl, originalSize, processedSize, progress } =
    useToolProcessor("compress");

  const [mode, setMode] = useState<CompressMode>("quality");
  const [quality, setQuality] = useState(75);
  const [targetSizeKb, setTargetSizeKb] = useState("");

  const handleProcess = () => {
    const settings: Record<string, unknown> = { mode };
    if (mode === "quality") {
      settings.quality = quality;
    } else {
      settings.targetSizeKb = Number(targetSizeKb);
    }
    if (files.length > 1) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  const hasFile = files.length > 0;
  const canProcess =
    mode === "quality" || (mode === "targetSize" && Number(targetSizeKb) > 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (hasFile && canProcess && !processing) handleProcess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Mode toggle */}
      <div>
        <label className="text-sm font-medium text-muted-foreground">Compression Mode</label>
        <div className="flex gap-1 mt-1">
          <button
            type="button"
            onClick={() => setMode("quality")}
            className={`flex-1 text-xs py-1.5 rounded ${mode === "quality" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            Quality
          </button>
          <button
            type="button"
            onClick={() => setMode("targetSize")}
            className={`flex-1 text-xs py-1.5 rounded ${mode === "targetSize" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            Target Size
          </button>
        </div>
      </div>

      {mode === "quality" ? (
        <div>
          <div className="flex justify-between items-center">
            <label className="text-xs text-muted-foreground">Quality</label>
            <span className="text-xs font-mono text-foreground">{quality}</span>
          </div>
          <input
            type="range"
            min={1}
            max={100}
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
            className="w-full mt-1"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
            <span>Smallest file</span>
            <span>Best quality</span>
          </div>
        </div>
      ) : (
        <div>
          <label className="text-xs text-muted-foreground">Target Size (KB)</label>
          <input
            type="number"
            value={targetSizeKb}
            onChange={(e) => setTargetSizeKb(e.target.value)}
            min={1}
            placeholder="e.g. 200"
            className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
          />
        </div>
      )}

      {/* Error */}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Size info */}
      {originalSize != null && processedSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>Original: {(originalSize / 1024).toFixed(1)} KB</p>
          <p>Processed: {(processedSize / 1024).toFixed(1)} KB</p>
          <p className="font-medium text-foreground">
            Saved:{" "}
            {originalSize > 0
              ? ((1 - processedSize / originalSize) * 100).toFixed(1)
              : "0"}
            %
          </p>
        </div>
      )}

      {/* Process */}
      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label="Compressing"
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="submit"
          disabled={!hasFile || !canProcess || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1 ? `Compress (${files.length} files)` : "Compress"}
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
