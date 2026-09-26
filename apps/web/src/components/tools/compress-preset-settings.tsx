import { COMPRESS_PRESET_BY_ID } from "@snapotter/shared";
import { useParams } from "react-router";
import { ProgressCard } from "@/components/common/progress-card";
import { ResultDownloadLink } from "@/components/common/result-download-link";
import { CompressResizeNote } from "@/components/tools/compress-settings";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

export function CompressPresetSettings() {
  const { t } = useTranslation();
  const params = useParams<{ toolId: string }>();
  const toolId = params.toolId ?? "";
  const preset = COMPRESS_PRESET_BY_ID[toolId];

  const { files } = useFileStore();
  const {
    processFiles,
    processAllFiles,
    processing,
    error,
    downloadUrl,
    originalSize,
    processedSize,
    progress,
    resultPayload,
  } = useToolProcessor(toolId);

  const hasFile = files.length > 0;

  const handleProcess = () => {
    if (files.length > 1) {
      processAllFiles(files, {});
    } else {
      processFiles(files, {});
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (hasFile && !processing) handleProcess();
  };

  if (!preset) {
    throw new Error(`No compress preset registered for tool "${toolId}"`);
  }
  const targetKb = preset.sizeKb;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Target size badge */}
      <div className="rounded-lg border border-border bg-muted/40 p-3">
        <div className="flex justify-between items-center text-xs">
          <span className="text-muted-foreground">{t.toolSettings.compress.targetSize}</span>
          <span className="font-semibold font-mono text-foreground">{targetKb} KB</span>
        </div>
      </div>

      {/* Error */}
      {error && <p className="text-xs text-destructive-ink">{error}</p>}

      {/* Size info when processed */}
      {originalSize != null && processedSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>
            {format(t.toolSettings.compress.original, { size: (originalSize / 1024).toFixed(1) })}
          </p>
          <p>
            {format(t.toolSettings.compress.processed, { size: (processedSize / 1024).toFixed(1) })}
          </p>
          <p className="font-medium text-foreground">
            {format(t.toolSettings.compress.saved, {
              percent:
                originalSize > 0 ? ((1 - processedSize / originalSize) * 100).toFixed(1) : "0",
            })}
          </p>
          <CompressResizeNote resultPayload={resultPayload} />
        </div>
      )}

      {/* Process button or Progress */}
      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={t.toolSettings.compress.progressLabel}
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="submit"
          data-testid="compress-preset-submit"
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1
            ? format(t.toolSettings.compress.submitBatch, { count: files.length })
            : format(t.toolSettings.compress.submitTarget, { size: targetKb })}
        </button>
      )}

      {/* Download */}
      {downloadUrl && <ResultDownloadLink href={downloadUrl} testId="compress-download" />}
    </form>
  );
}
