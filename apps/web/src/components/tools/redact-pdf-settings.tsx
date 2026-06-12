import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

export function RedactPdfSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["redact-pdf"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("redact-pdf");

  const [termsText, setTermsText] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const terms = termsText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const handleProcess = () => {
    const settings = { terms, caseSensitive };
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="rp-terms" className="text-xs text-muted-foreground">
          {s.terms}
        </label>
        <textarea
          id="rp-terms"
          rows={5}
          value={termsText}
          onChange={(e) => setTermsText(e.target.value)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
        <p className="text-[10px] text-muted-foreground mt-0.5">{s.termsHint}</p>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="rp-case"
          type="checkbox"
          checked={caseSensitive}
          onChange={(e) => setCaseSensitive(e.target.checked)}
          className="rounded border-border"
        />
        <label htmlFor="rp-case" className="text-xs text-muted-foreground">
          {s.caseSensitive}
        </label>
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
          data-testid="redact-pdf-submit"
          onClick={handleProcess}
          disabled={!hasFile || processing || terms.length === 0}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {hasMultiple ? format(s.submitBatch, { count: files.length }) : s.submit}
        </button>
      )}
    </div>
  );
}
