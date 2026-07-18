import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

export function CsvExcelSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["csv-excel"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("csv-excel");

  const [sheet, setSheet] = useState(1);

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const firstFileName = files[0]?.name ?? "";
  const isXlsx = firstFileName.toLowerCase().endsWith(".xlsx");

  const handleProcess = () => {
    const settings = isXlsx ? { sheet } : {};
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      {isXlsx && (
        <div>
          <label htmlFor="ce-sheet" className="text-xs text-muted-foreground">
            {s.sheet}
          </label>
          <input
            id="ce-sheet"
            type="number"
            min={1}
            step={1}
            value={sheet}
            onChange={(e) => setSheet(Number(e.target.value))}
            className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
          />
        </div>
      )}

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
          type="button"
          data-testid="csv-excel-submit"
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
