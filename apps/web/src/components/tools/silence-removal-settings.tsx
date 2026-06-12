import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

export function SilenceRemovalSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["silence-removal"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("silence-removal");

  const [thresholdDb, setThresholdDb] = useState(-50);
  const [minSilenceS, setMinSilenceS] = useState(0.5);

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleProcess = () => {
    const settings = { thresholdDb, minSilenceS };
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="sr-threshold" className="text-xs text-muted-foreground">
          {s["threshold-db"]}
        </label>
        <input
          id="sr-threshold"
          type="number"
          min={-80}
          max={-20}
          step={1}
          value={thresholdDb}
          onChange={(e) => setThresholdDb(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      <div>
        <label htmlFor="sr-minsilence" className="text-xs text-muted-foreground">
          {s["min-silence-s"]}
        </label>
        <input
          id="sr-minsilence"
          type="number"
          min={0.1}
          max={5}
          step={0.1}
          value={minSilenceS}
          onChange={(e) => setMinSilenceS(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

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
          type="button"
          data-testid="silence-removal-submit"
          onClick={handleProcess}
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {hasMultiple ? format(s.submitBatch, { count: files.length }) : s.submit}
        </button>
      )}
    </div>
  );
}
