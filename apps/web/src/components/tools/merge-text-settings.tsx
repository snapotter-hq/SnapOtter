import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

type Separator = "blank-line" | "rule" | "filename-heading";

export function MergeTextSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["merge-text"];
  const { files } = useFileStore();
  const { processFiles, processing, error, progress } = useToolProcessor("merge-text");

  const [separator, setSeparator] = useState<Separator>("blank-line");

  const hasEnough = files.length >= 2;

  const handleProcess = () => {
    processFiles(files, { separator });
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="merge-text-separator" className="text-xs text-muted-foreground">
          {s.separator}
        </label>
        <select
          id="merge-text-separator"
          value={separator}
          onChange={(e) => setSeparator(e.target.value as Separator)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="blank-line">{s.separatorBlankLine}</option>
          <option value="rule">{s.separatorRule}</option>
          <option value="filename-heading">{s.separatorFilenameHeading}</option>
        </select>
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
          type="button"
          data-testid="merge-text-submit"
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
