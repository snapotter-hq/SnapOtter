import { ProgressCard } from "@/components/common/progress-card";
import {
  ScannedPdfOcrHandoff,
  UnreadablePagesOcrHandoff,
} from "@/components/common/scanned-pdf-ocr-handoff";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

export function PdfToTextSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["pdf-to-text"];
  const { files, currentEntry } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("pdf-to-text");

  // The .txt keeps those pages as extracted, so say they're there rather than
  // let the junk pass as text (#954), whole pages or lines within one (#4947).
  const notes = currentEntry?.status === "completed" ? currentEntry.resultNotes : undefined;
  const unreadablePages = notes?.unreadablePages;
  const partlyUnreadablePages = notes?.partlyUnreadablePages;

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleProcess = () => {
    const settings = {};
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-xs text-destructive-ink">{error}</p>}
      <ScannedPdfOcrHandoff hint={s.scannedHint} label={s.runOcr} testId="pdf-to-text-run-ocr" />

      {unreadablePages && (
        <p className="text-xs text-muted-foreground" data-testid="pdf-to-text-unreadable-pages">
          {format(s.unreadablePages, {
            count: unreadablePages.count,
            total: unreadablePages.total,
          })}
        </p>
      )}
      <UnreadablePagesOcrHandoff label={s.runOcr} testId="pdf-to-text-run-ocr-unreadable" />

      {partlyUnreadablePages && (
        <p
          className="text-xs text-muted-foreground"
          data-testid="pdf-to-text-partly-unreadable-pages"
        >
          {format(s.partlyUnreadablePages, {
            count: partlyUnreadablePages.count,
            total: partlyUnreadablePages.total,
          })}
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
          data-testid="pdf-to-text-submit"
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
