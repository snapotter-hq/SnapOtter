import { NO_TEXT_LAYER_CODE, TOOLS } from "@snapotter/shared";
import { useNavigate } from "react-router";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

const OCR_TOOL = TOOLS.find((tool) => tool.id === "ocr-pdf");

export function PdfToTextSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["pdf-to-text"];
  const { files, errorCode } = useFileStore();
  const navigate = useNavigate();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("pdf-to-text");

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

  // One file only: a batch reports its failures per file, and the handoff
  // carries the whole selection into a tool that would OCR the readable ones too.
  const offerOcr =
    OCR_TOOL !== undefined && !hasMultiple && !!error && errorCode === NO_TEXT_LAYER_CODE;

  // The files stay in the store across the navigation (`fromLibrary`), so OCR
  // starts with the PDF already loaded and nothing is uploaded until it runs.
  const handoffToOcr = () => {
    if (!OCR_TOOL) return;
    const store = useFileStore.getState();
    store.setError(null);
    store.entries.forEach((entry) => {
      store.updateEntryById(entry.id, { status: "pending", error: null });
    });
    navigate(OCR_TOOL.route, { state: { fromLibrary: true } });
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-xs text-destructive-ink">{error}</p>}
      {offerOcr && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{s.scannedHint}</p>
          <button
            type="button"
            data-testid="pdf-to-text-run-ocr"
            onClick={handoffToOcr}
            className="w-full py-2.5 rounded-lg border border-border font-medium hover:bg-muted"
          >
            {s.runOcr}
          </button>
        </div>
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
