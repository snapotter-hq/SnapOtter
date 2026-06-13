import { Download } from "lucide-react";
import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

const QUALITY_OPTIONS = [
  { value: "fast", label: "Fast" },
  { value: "balanced", label: "Balanced" },
  { value: "best", label: "Best" },
] as const;

const LANGUAGE_OPTIONS = [
  { value: "auto", labelKey: "autoDetect" },
  { value: "en", label: "English" },
  { value: "de", label: "German" },
  { value: "fr", label: "French" },
  { value: "es", label: "Spanish" },
  { value: "zh", label: "Chinese" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
] as const;

export function OcrPdfSettings() {
  const { t } = useTranslation();
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, downloadUrl, progress } =
    useToolProcessor("ocr-pdf");

  const [quality, setQuality] = useState("balanced");
  const [language, setLanguage] = useState("auto");
  const [pages, setPages] = useState("all");

  const ts = t.toolSettings["ocr-pdf"];
  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleProcess = () => {
    const settings = { quality, language, pages };
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleProcess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Quality */}
      <div>
        <label htmlFor="ocrpdf-quality" className="mb-1.5 block text-sm font-medium">
          {ts.quality}
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          {QUALITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setQuality(opt.value)}
              className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
                quality === opt.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Language */}
      <div>
        <label htmlFor="ocrpdf-language" className="mb-1.5 block text-sm font-medium">
          {ts.language}
        </label>
        <select
          id="ocrpdf-language"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="border-border bg-background w-full rounded-md border px-3 py-2 text-sm"
        >
          {LANGUAGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {"labelKey" in opt ? (ts as Record<string, string>)[opt.labelKey] : opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Pages */}
      <div>
        <label htmlFor="ocrpdf-pages" className="mb-1.5 block text-sm font-medium">
          {ts.pages}
        </label>
        <input
          id="ocrpdf-pages"
          type="text"
          value={pages}
          onChange={(e) => setPages(e.target.value)}
          placeholder={ts.pagesPlaceholder}
          className="border-border bg-background w-full rounded-md border px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-muted-foreground">{ts.pagesHint}</p>
      </div>

      {/* Progress / Submit */}
      {processing && progress ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={ts.progressLabel}
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="submit"
          disabled={!hasFile || processing}
          className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted w-full rounded-md px-4 py-2 text-sm font-medium disabled:cursor-not-allowed"
        >
          {hasMultiple ? format(ts.submitBatch, { count: files.length }) : ts.submit}
        </button>
      )}

      {/* Error */}
      {error && (
        <div className="text-destructive rounded-md bg-red-50 p-3 text-sm dark:bg-red-950">
          {error}
        </div>
      )}

      {/* Download */}
      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium"
        >
          <Download className="h-4 w-4" />
          {t.common.download}
        </a>
      )}
    </form>
  );
}
