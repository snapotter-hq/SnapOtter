import { Download } from "lucide-react";
import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

export function DuotoneSettings() {
  const { t } = useTranslation();
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, downloadUrl, progress } =
    useToolProcessor("duotone");

  const [shadow, setShadow] = useState("#1e3a8a");
  const [highlight, setHighlight] = useState("#fbbf24");

  const handleProcess = () => {
    const settings = { shadow, highlight };
    if (files.length > 1) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  const hasFile = files.length > 0;
  const canProcess = hasFile && !processing;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canProcess) handleProcess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Shadow Color */}
      <div>
        <label htmlFor="duotone-shadow" className="text-xs text-muted-foreground">
          {t.toolSettings.duotone.shadow}
        </label>
        <div className="flex items-center gap-2 mt-0.5">
          <input
            id="duotone-shadow"
            type="color"
            value={shadow}
            onChange={(e) => setShadow(e.target.value)}
            className="w-8 h-8 rounded border border-border shrink-0"
          />
          <input
            type="text"
            value={shadow}
            onChange={(e) => setShadow(e.target.value)}
            className="flex-1 px-2 py-1 rounded border border-border bg-background text-xs text-foreground font-mono"
          />
        </div>
      </div>

      {/* Highlight Color */}
      <div>
        <label htmlFor="duotone-highlight" className="text-xs text-muted-foreground">
          {t.toolSettings.duotone.highlight}
        </label>
        <div className="flex items-center gap-2 mt-0.5">
          <input
            id="duotone-highlight"
            type="color"
            value={highlight}
            onChange={(e) => setHighlight(e.target.value)}
            className="w-8 h-8 rounded border border-border shrink-0"
          />
          <input
            type="text"
            value={highlight}
            onChange={(e) => setHighlight(e.target.value)}
            className="flex-1 px-2 py-1 rounded border border-border bg-background text-xs text-foreground font-mono"
          />
        </div>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={t.toolSettings.duotone.progressLabel}
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="submit"
          data-testid="duotone-submit"
          disabled={!canProcess}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1
            ? t.toolSettings.duotone.submitBatch.replace("{count}", String(files.length))
            : t.toolSettings.duotone.submit}
        </button>
      )}

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="duotone-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          {t.common.download}
        </a>
      )}
    </form>
  );
}
