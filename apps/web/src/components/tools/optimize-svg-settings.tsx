import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { ResultDownloadLink } from "@/components/common/result-download-link";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

export function OptimizeSvgSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["optimize-svg"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, downloadUrl, progress } =
    useToolProcessor("optimize-svg");

  const [precision, setPrecision] = useState(3);
  const [multipass, setMultipass] = useState(true);
  const [removeMetadata, setRemoveMetadata] = useState(true);
  const [pretty, setPretty] = useState(false);

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;
  const canProcess = hasFile && !processing;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canProcess) return;
    const settings = { precision, multipass, removeMetadata, pretty };
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="optimize-svg-precision" className="text-xs text-muted-foreground">
            {s.precision}
          </label>
          <span className="text-xs font-mono text-foreground">{precision}</span>
        </div>
        <input
          id="optimize-svg-precision"
          type="range"
          min={0}
          max={8}
          step={1}
          value={precision}
          onChange={(e) => setPrecision(Number(e.target.value))}
          className="w-full mt-1"
        />
        <p className="text-[10px] text-muted-foreground mt-1">{s.precisionHint}</p>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={removeMetadata}
            onChange={(e) => setRemoveMetadata(e.target.checked)}
            className="rounded"
          />
          {s.removeMetadata}
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={multipass}
            onChange={(e) => setMultipass(e.target.checked)}
            className="rounded"
          />
          {s.multipass}
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={pretty}
            onChange={(e) => setPretty(e.target.checked)}
            className="rounded"
          />
          {s.pretty}
        </label>
      </div>

      {error && <p className="text-xs text-destructive-ink">{error}</p>}

      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={s.progressLabel}
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="submit"
          data-testid="optimize-svg-submit"
          disabled={!canProcess}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {hasMultiple ? format(s.submitBatch, { count: files.length }) : s.submit}
        </button>
      )}

      {downloadUrl && <ResultDownloadLink href={downloadUrl} testId="optimize-svg-download" />}
    </form>
  );
}
