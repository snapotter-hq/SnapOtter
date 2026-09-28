import { COMPRESS_PRESET_BY_ID, formatTargetKb } from "@snapotter/shared";
import { useParams } from "react-router";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

/**
 * compress-pdf-to-N presets (#1070): compress-pdf with its target-size mode
 * locked. The server ignores any settings sent here, so the panel only shows
 * the target and reports honestly whether the file got under it.
 */
export function CompressPdfPresetSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["compress-pdf"];
  const params = useParams<{ toolId: string }>();
  const toolId = params.toolId ?? "";
  const preset = COMPRESS_PRESET_BY_ID[toolId];

  const { files, entries, currentEntry } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } = useToolProcessor(toolId);

  if (preset?.base !== "compress-pdf") {
    throw new Error(`No PDF compress preset registered for tool "${toolId}"`);
  }

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  // Same reporting as compress-pdf's own target-size mode: a text-heavy PDF may
  // not get under the target at all, and the result has to say so. The verdict
  // is the selected file's own (#1292): single runs and batches both store it
  // on the entry, so it can't describe another file or an earlier run.
  const done = currentEntry?.status === "completed";
  const achieved = done ? currentEntry.processedSize : null;
  const targetMet = done && achieved != null ? currentEntry.resultNotes?.targetMet : undefined;
  const missed = entries.filter(
    (entry) => entry.status === "completed" && entry.resultNotes?.targetMet === false,
  );
  const targetLabel = preset.label;
  // Report the result in the target's own unit, so "1 MB" isn't set against "1049.673 KB".
  const achievedLabel =
    achieved == null
      ? ""
      : preset.targetSizeKb >= 1000
        ? `${Number((achieved / 1_000_000).toFixed(3))} MB`
        : formatTargetKb(achieved);

  const handleProcess = () => {
    if (hasMultiple) {
      processAllFiles(files, {});
    } else {
      processFiles(files, {});
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/40 p-3">
        <div className="flex justify-between items-center text-xs">
          <span className="text-muted-foreground">{t.toolSettings.compress.targetSize}</span>
          <span className="font-semibold font-mono text-foreground">{preset.label}</span>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">{s.bestEffortHint}</p>

      {error && <p className="text-xs text-destructive-ink">{error}</p>}

      {entries.length > 1 && missed.length > 0 && (
        <p
          className="text-xs font-medium text-amber-700 dark:text-amber-400"
          data-testid="compress-pdf-missed-summary"
        >
          {format(s.batchMissed, {
            count: missed.length,
            total: entries.length,
            target: targetLabel,
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
          data-testid="compress-pdf-preset-submit"
          onClick={handleProcess}
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {hasMultiple
            ? format(s.submitBatch, { count: files.length })
            : format(s.submitTarget, { size: preset.label })}
        </button>
      )}
    </div>
  );
}
