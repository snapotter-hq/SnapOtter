import { Download } from "lucide-react";
import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

export function PixelateSettings() {
  const { t } = useTranslation();
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, downloadUrl, progress } =
    useToolProcessor("pixelate");

  const [blockSize, setBlockSize] = useState(12);

  const handleProcess = () => {
    const settings = { blockSize };
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
      {/* Block Size */}
      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="pixelate-block-size" className="text-xs text-muted-foreground">
            {t.toolSettings.pixelate.blockSize}
          </label>
          <span className="text-xs font-mono text-foreground">{blockSize}px</span>
        </div>
        <input
          id="pixelate-block-size"
          type="range"
          min={2}
          max={128}
          value={blockSize}
          onChange={(e) => setBlockSize(Number(e.target.value))}
          className="w-full mt-1"
        />
        <p className="text-[10px] text-muted-foreground mt-1">
          Applies pixelation to the full image
        </p>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={t.toolSettings.pixelate.progressLabel}
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="submit"
          data-testid="pixelate-submit"
          disabled={!canProcess}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1
            ? t.toolSettings.pixelate.submitBatch.replace("{count}", String(files.length))
            : t.toolSettings.pixelate.submit}
        </button>
      )}

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="pixelate-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          {t.common.download}
        </a>
      )}
    </form>
  );
}
