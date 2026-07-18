import { Download } from "lucide-react";
import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

function formatKB(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function GifWebpSettings() {
  const { t } = useTranslation();
  const { files } = useFileStore();
  const {
    processFiles,
    processAllFiles,
    processing,
    error,
    downloadUrl,
    progress,
    originalSize,
    processedSize,
  } = useToolProcessor("gif-webp");

  const [quality, setQuality] = useState(80);
  const [lossless, setLossless] = useState(false);
  const [resizePercent, setResizePercent] = useState(100);

  const handleProcess = () => {
    const settings = { quality, lossless, resizePercent };
    if (files.length > 1) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  const hasFile = files.length > 0;
  const canProcess = hasFile && !processing;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canProcess) handleProcess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Converts GIF to WebP and WebP to GIF, preserving all animation frames. Direction is
        determined automatically by the input file format.
      </p>

      {/* Lossless toggle */}
      <div>
        <span className="text-xs text-muted-foreground">Compression</span>
        <div className="flex gap-1 mt-1">
          <button
            type="button"
            onClick={() => setLossless(false)}
            className={`flex-1 text-xs py-1.5 rounded ${!lossless ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            Lossy
          </button>
          <button
            type="button"
            onClick={() => setLossless(true)}
            className={`flex-1 text-xs py-1.5 rounded ${lossless ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            Lossless
          </button>
        </div>
      </div>

      {/* Quality slider (hidden when lossless) */}
      {!lossless && (
        <div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Quality</span>
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
        </div>
      )}

      {/* Resize slider */}
      <div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Resize</span>
          <span className="text-xs font-mono text-foreground">{resizePercent}%</span>
        </div>
        <input
          type="range"
          min={10}
          max={100}
          value={resizePercent}
          onChange={(e) => setResizePercent(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      {error && <p className="text-xs text-destructive-ink">{error}</p>}

      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={t.toolSettings["gif-webp"].progressLabel}
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="submit"
          data-testid="gif-webp-submit"
          disabled={!canProcess}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1
            ? t.toolSettings["gif-webp"].submitBatch.replace("{count}", String(files.length))
            : t.toolSettings["gif-webp"].submit}
        </button>
      )}

      {downloadUrl && (
        <>
          <a
            href={downloadUrl}
            download
            data-testid="gif-webp-download"
            className="w-full py-2.5 rounded-lg border border-primary text-primary-ink font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
          >
            <Download className="h-4 w-4" />
            {t.common.download}
          </a>
          {originalSize != null && processedSize != null && (
            <p className="text-xs text-muted-foreground text-center">
              {formatKB(originalSize)} &rarr; {formatKB(processedSize)}
            </p>
          )}
        </>
      )}
    </form>
  );
}
