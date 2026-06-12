import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

export function BurnSubtitlesSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["burn-subtitles"];
  const { files } = useFileStore();
  const { processFiles, processing, error, progress } = useToolProcessor("burn-subtitles");

  const [fontSize, setFontSize] = useState(24);

  const hasEnough = files.length >= 2;

  const handleProcess = () => {
    processFiles(files, { fontSize });
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="bs-font-size" className="text-xs text-muted-foreground">
          {s.fontSize}
        </label>
        <input
          id="bs-font-size"
          type="number"
          min={8}
          max={72}
          step={1}
          value={fontSize}
          onChange={(e) => setFontSize(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      <p className="text-[10px] text-muted-foreground">{s.hint}</p>

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
          data-testid="burn-subtitles-submit"
          onClick={handleProcess}
          disabled={!hasEnough || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {s.submit}
        </button>
      )}
    </div>
  );
}
