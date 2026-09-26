import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";
import { CompressControls } from "./compress-settings";

// Mirrors BYTES_PER_KB in packages/shared/src/target-size.ts. Imported directly,
// that module landed in this lazy chunk and the shared chunk imported it back,
// a chunk cycle that blanked the production app on load (#1296).
const BYTES_PER_KB = 1000;

export function CompressPdfSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["compress-pdf"];
  const { files } = useFileStore();
  const {
    processFiles,
    processAllFiles,
    processing,
    error,
    progress,
    resultPayload,
    processedSize,
  } = useToolProcessor("compress-pdf");
  const [settings, setSettings] = useState<Record<string, unknown>>({});

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;
  // Quality mode is always runnable; target-size needs a positive target.
  const canProcess =
    settings.mode === "quality" ||
    (settings.mode === "targetSize" && Number(settings.targetSizeKb) > 0);

  // Honest reporting for target-size mode: whether we actually hit the ceiling.
  const targetMet = resultPayload?.targetMet as boolean | undefined;
  const targetKb = resultPayload?.targetKb as number | undefined;
  // Same decimal KB the server measured against, exact to the byte, so a miss
  // can't read as "couldn't reach 100 KB, smallest was 98 KB" (#1272).
  const targetLabel = targetKb != null ? `${targetKb} KB` : "";
  const achievedLabel =
    processedSize != null ? `${Number((processedSize / BYTES_PER_KB).toFixed(3))} KB` : "";

  const handleProcess = () => {
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      {/* Same quality / target-size controls as the image compress tool */}
      <CompressControls onChange={setSettings} />

      {settings.mode === "targetSize" && (
        <p className="text-[11px] text-muted-foreground">{s.bestEffortHint}</p>
      )}

      {error && <p className="text-xs text-destructive-ink">{error}</p>}

      {targetMet === false && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {format(s.targetMissed, { target: targetLabel, size: achievedLabel })}
        </p>
      )}
      {targetMet === true && (
        <p className="text-xs text-success-ink">
          {format(s.targetReached, { target: targetLabel, size: achievedLabel })}
        </p>
      )}

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
          data-testid="compress-pdf-submit"
          onClick={handleProcess}
          disabled={!hasFile || !canProcess || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {hasMultiple ? format(s.submitBatch, { count: files.length }) : s.submit}
        </button>
      )}
    </div>
  );
}
