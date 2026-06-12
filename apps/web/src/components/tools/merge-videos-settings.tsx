import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

export function MergeVideosSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["merge-videos"];
  const { files } = useFileStore();
  const { processFiles, processing, error, progress } = useToolProcessor("merge-videos");

  const hasEnough = files.length >= 2;

  const handleProcess = () => {
    processFiles(files, {});
  };

  return (
    <div className="space-y-4">
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
          data-testid="merge-videos-submit"
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
