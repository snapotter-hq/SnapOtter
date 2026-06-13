import { Download } from "lucide-react";
import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

export function BackgroundReplaceSettings() {
  const { t } = useTranslation();
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, downloadUrl, progress } =
    useToolProcessor("background-replace");

  const [color, setColor] = useState("#ffffff");

  const ts = t.toolSettings["background-replace"];
  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleProcess = () => {
    const settings = { color };
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
      {/* Color */}
      <div>
        <label htmlFor="bg-replace-color" className="mb-1.5 block text-sm font-medium">
          {ts.color}
        </label>
        <div className="flex items-center gap-3">
          <input
            id="bg-replace-color"
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-10 w-14 cursor-pointer rounded-md border border-border"
          />
          <input
            type="text"
            value={color}
            onChange={(e) => {
              const v = e.target.value;
              if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setColor(v);
            }}
            className="border-border bg-background w-28 rounded-md border px-3 py-2 font-mono text-sm"
            maxLength={7}
          />
        </div>
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
