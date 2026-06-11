import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

type Angle = 90 | 180 | 270;

export function RotatePdfSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["rotate-pdf"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("rotate-pdf");

  const [angle, setAngle] = useState<Angle>(90);
  const [range, setRange] = useState("1-z");

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleProcess = () => {
    const settings = { angle, range };
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="rpdf-angle" className="text-xs text-muted-foreground">
          {s.angle}
        </label>
        <select
          id="rpdf-angle"
          value={angle}
          onChange={(e) => setAngle(Number(e.target.value) as Angle)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value={90}>90</option>
          <option value={180}>180</option>
          <option value={270}>270</option>
        </select>
      </div>

      <div>
        <label htmlFor="rpdf-range" className="text-xs text-muted-foreground">
          {s.range}
        </label>
        <input
          id="rpdf-range"
          type="text"
          value={range}
          onChange={(e) => setRange(e.target.value)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
        <p className="text-[10px] text-muted-foreground mt-0.5">{s.rangeHint}</p>
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
          data-testid="rotate-pdf-submit"
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
