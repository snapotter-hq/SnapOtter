import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

type SplitMode = "range" | "every";

export function SplitPdfSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["split-pdf"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("split-pdf");

  const [mode, setMode] = useState<SplitMode>("range");
  const [range, setRange] = useState("1-3,5");
  const [everyN, setEveryN] = useState(1);

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleProcess = () => {
    const settings = mode === "range" ? { mode, range } : { mode, everyN };
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="sp-mode" className="text-xs text-muted-foreground">
          {s.mode}
        </label>
        <select
          id="sp-mode"
          value={mode}
          onChange={(e) => setMode(e.target.value as SplitMode)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="range">{s.range}</option>
          <option value="every">{s.everyN}</option>
        </select>
      </div>

      {mode === "range" && (
        <div>
          <label htmlFor="sp-range" className="text-xs text-muted-foreground">
            {s.range}
          </label>
          <input
            id="sp-range"
            type="text"
            value={range}
            placeholder="1-3,5"
            onChange={(e) => setRange(e.target.value)}
            className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
          />
          <p className="text-[10px] text-muted-foreground mt-0.5">{s.rangeHint}</p>
        </div>
      )}

      {mode === "every" && (
        <div>
          <label htmlFor="sp-every" className="text-xs text-muted-foreground">
            {s.everyN}
          </label>
          <input
            id="sp-every"
            type="number"
            min={1}
            step={1}
            value={everyN}
            onChange={(e) => setEveryN(Number(e.target.value))}
            className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
          />
        </div>
      )}

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
          data-testid="split-pdf-submit"
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
