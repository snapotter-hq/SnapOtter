import { Download } from "lucide-react";
import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

export function LqipPlaceholderSettings() {
  const { t } = useTranslation();
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, downloadUrl, progress } =
    useToolProcessor("lqip-placeholder");

  const [width, setWidth] = useState(16);
  const [blur, setBlur] = useState(2);

  const handleProcess = () => {
    const settings = { width, blur };
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
      {/* Width */}
      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="lqip-width" className="text-xs text-muted-foreground">
            {t.toolSettings["lqip-placeholder"].width}
          </label>
          <span className="text-xs font-mono text-foreground">{width}px</span>
        </div>
        <input
          id="lqip-width"
          type="range"
          min={4}
          max={64}
          value={width}
          onChange={(e) => setWidth(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      {/* Blur */}
      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="lqip-blur" className="text-xs text-muted-foreground">
            {t.toolSettings["lqip-placeholder"].blur}
          </label>
          <span className="text-xs font-mono text-foreground">{blur}</span>
        </div>
        <input
          id="lqip-blur"
          type="range"
          min={0}
          max={20}
          value={blur}
          onChange={(e) => setBlur(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      <p className="text-[10px] text-muted-foreground">
        The base64 data URI will appear in the result envelope.
      </p>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={t.toolSettings["lqip-placeholder"].progressLabel}
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="submit"
          data-testid="lqip-placeholder-submit"
          disabled={!canProcess}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1
            ? t.toolSettings["lqip-placeholder"].submitBatch.replace(
                "{count}",
                String(files.length),
              )
            : t.toolSettings["lqip-placeholder"].submit}
        </button>
      )}

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="lqip-placeholder-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          {t.common.download}
        </a>
      )}
    </form>
  );
}
