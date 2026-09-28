import { formatTargetKb, kbToBytes } from "@snapotter/shared";
import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";
import { CompressControls } from "./compress-settings";

export function CompressPdfSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["compress-pdf"];
  const { files, entries, currentEntry } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("compress-pdf");
  const [settings, setSettings] = useState<Record<string, unknown>>({});

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;
  // Quality mode is always runnable; target-size needs a positive target.
  const canProcess =
    settings.mode === "quality" ||
    (settings.mode === "targetSize" && Number(settings.targetSizeKb) > 0);

  // Honest reporting for target-size mode: whether we actually hit the ceiling.
  // The verdict is the selected file's own (#1292): single runs and batches
  // both store it on the entry, so it can't describe another file or a run
  // that's been cleared.
  const done = currentEntry?.status === "completed";
  const notes = done ? currentEntry.resultNotes : null;
  const targetMet = notes?.targetMet;
  const targetKb = notes?.targetKb;
  const processedSize = done ? currentEntry.processedSize : null;
  // Same decimal KB the server measured against, exact to the byte, so a miss
  // can't read as "couldn't reach 100 KB, smallest was 98 KB" (#1272).
  const targetLabel = targetKb != null ? formatTargetKb(kbToBytes(targetKb)) : "";
  const achievedLabel = processedSize != null ? formatTargetKb(processedSize) : "";
  const missed = entries.filter(
    (entry) => entry.status === "completed" && entry.resultNotes?.targetMet === false,
  );
  const missedKb = missed[0]?.resultNotes?.targetKb;

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

      {entries.length > 1 && missed.length > 0 && missedKb != null && (
        <p
          className="text-xs font-medium text-amber-700 dark:text-amber-400"
          data-testid="compress-pdf-missed-summary"
        >
          {format(s.batchMissed, {
            count: missed.length,
            total: entries.length,
            target: formatTargetKb(kbToBytes(missedKb)),
          })}
        </p>
      )}
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
