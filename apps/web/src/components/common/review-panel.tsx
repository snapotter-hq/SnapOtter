import { ANALYTICS_EVENTS } from "@snapotter/shared";
import { AlertCircle, ArrowLeft, CheckCircle2, Download, FileText, FolderPlus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "@/contexts/i18n-context";
import { formatHeaders } from "@/lib/api";
import { formatFileSize, triggerDownload } from "@/lib/download";
import { classifyFeedbackError } from "@/lib/feedback";
import { format } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ToolFeedbackPrompt } from "../feedback/tool-feedback-prompt";

/** Tools whose primary output is text/data, not a downloadable file. */
const DATA_OUTPUT_TOOLS = new Set([
  "ocr",
  "barcode-read",
  "info",
  "histogram",
  "color-palette",
  "transcribe-audio",
  "extract-subtitles",
  "image-to-base64",
  "pdf-to-text",
  "pdf-metadata",
  "audio-metadata",
  "video-metadata",
]);

/** Tools that produce multiple output files bundled as a ZIP. */
const MULTI_OUTPUT_TOOLS = new Set([
  "split",
  "favicon",
  "pdf-to-image",
  "video-to-frames",
  "split-audio",
  "split-csv",
]);

interface ReviewPanelProps {
  filename: string;
  fileSize: number;
  fileType: string;
  originalSize: number;
  downloadUrl: string;
  onUndo: () => void;
  onStartOver: () => void;
  currentToolId: string;
  totalCount?: number;
  successCount?: number;
  failedCount?: number;
  /** Library id of the auto-saved result (#495); replaces the manual save link. */
  savedLibraryFileId?: string | null;
}

export function ReviewPanel({
  filename,
  fileSize,
  fileType,
  originalSize,
  downloadUrl,
  onUndo,
  onStartOver,
  currentToolId,
  totalCount,
  successCount,
  failedCount,
  savedLibraryFileId,
}: ReviewPanelProps) {
  const { t } = useTranslation();

  const isDataOutput = DATA_OUTPUT_TOOLS.has(currentToolId);
  const isMultiOutput = MULTI_OUTPUT_TOOLS.has(currentToolId);

  const sizeDelta = useMemo(() => {
    if (!originalSize || originalSize === 0) return 0;
    return Math.round((1 - fileSize / originalSize) * 100);
  }, [originalSize, fileSize]);

  const handleDownload = () => {
    import("@/lib/analytics").then(({ track }) => {
      track(ANALYTICS_EVENTS.RESULT_DOWNLOADED, { tool_id: currentToolId });
    });
    triggerDownload(downloadUrl, filename);
  };

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const handleSaveToFiles = useCallback(async () => {
    setSaveStatus("saving");
    try {
      const res = await fetch(downloadUrl);
      const blob = await res.blob();
      const formData = new FormData();
      // Record which tool produced this file so the library shows it under
      // "Tools Used" (append before the file so the field is parsed first).
      if (currentToolId) formData.append("toolId", currentToolId);
      formData.append("file", new File([blob], filename, { type: fileType }));
      const uploadRes = await fetch("/api/v1/files/upload", {
        method: "POST",
        headers: formatHeaders(),
        body: formData,
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
      setSaveStatus("saved");
      // "Save to library" is the real success signal for a self-hosted tool
      // (there is no purchase). result_saved was defined + allowlisted but never
      // fired, so save-rate was unmeasurable.
      import("@/lib/analytics").then(({ track }) => {
        track(ANALYTICS_EVENTS.RESULT_SAVED, { tool_id: currentToolId });
      });
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }, [downloadUrl, filename, fileType, currentToolId]);

  const hasBatchStats =
    totalCount != null && totalCount > 1 && successCount != null && failedCount != null;

  return (
    <div className="space-y-3">
      <div className="border-t border-border" />

      {/* Success indicator */}
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
        <span className="text-sm font-medium text-foreground">{t.toolPage.conversionComplete}</span>
      </div>

      {/* Batch partial failure summary */}
      {hasBatchStats && failedCount > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 p-2.5 text-xs">
          <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <span className="text-amber-800 dark:text-amber-300">
            {format(t.toolPage.batchPartialSuccess, {
              success: successCount,
              total: totalCount,
              failed: failedCount,
            })}
          </span>
        </div>
      )}

      {/* Size delta -- hidden for data-output tools */}
      {!isDataOutput && originalSize > 0 && (
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t.toolPage.original}</span>
            <span className="tabular-nums text-foreground">{formatFileSize(originalSize)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t.toolPage.processed}</span>
            <span className="tabular-nums text-foreground">{formatFileSize(fileSize)}</span>
          </div>
          {/* Only claim "Saved" when the output is actually smaller; growth or
              no-change is already visible from the Original/Processed sizes above. */}
          {sizeDelta > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t.toolPage.saved}</span>
              <span className="tabular-nums font-medium text-emerald-600">{sizeDelta}%</span>
            </div>
          )}
        </div>
      )}

      {/* Data-output tools: results hint + secondary download */}
      {isDataOutput && (
        <>
          <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-2.5 text-xs">
            <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <span className="text-muted-foreground">{t.toolPage.dataResultsHint}</span>
          </div>
          <button
            type="button"
            onClick={handleDownload}
            className="w-full text-center text-xs text-primary hover:text-primary/80 underline underline-offset-2"
          >
            {t.toolPage.downloadAsFile}
          </button>
        </>
      )}

      {/* Download button -- primary for non-data tools */}
      {!isDataOutput && (
        <button
          type="button"
          data-download-button
          onClick={handleDownload}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-2 hover:bg-primary/90"
        >
          <Download className="h-4 w-4" />
          {isMultiOutput
            ? `${t.toolPage.downloadAll} (ZIP, ${formatFileSize(fileSize)})`
            : hasBatchStats && successCount != null && successCount > 1
              ? `${format(t.toolPage.downloadFiles, { count: successCount })} (ZIP, ${formatFileSize(fileSize)})`
              : `${t.toolPage.download} ${fileType} (${formatFileSize(fileSize)})`}
        </button>
      )}

      {/* Result already auto-saved to the library: show where it went
          instead of the manual save link (avoids duplicate saves). */}
      {!isDataOutput && savedLibraryFileId && (
        <div className="flex items-center justify-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3 w-3" />
          {t.toolPage.savedToFiles}
          <Link to="/files" className="underline underline-offset-2 hover:text-foreground">
            {t.toolPage.viewInFiles}
          </Link>
        </div>
      )}

      {/* Save to Files -- subtle text link */}
      {!isDataOutput && !savedLibraryFileId && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={handleSaveToFiles}
            disabled={saveStatus === "saving" || saveStatus === "saved"}
            className={cn(
              "text-xs flex items-center gap-1.5 transition-colors",
              saveStatus === "saved"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-muted-foreground hover:text-foreground disabled:opacity-50",
            )}
          >
            {saveStatus === "saved" ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : saveStatus === "saving" ? (
              <div className="h-3 w-3 border-1.5 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <FolderPlus className="h-3 w-3" />
            )}
            {saveStatus === "saving"
              ? t.common.saving
              : saveStatus === "saved"
                ? t.toolPage.savedToFiles
                : t.toolPage.saveToFiles}
          </button>
        </div>
      )}

      <ToolFeedbackPrompt
        toolId={currentToolId}
        jobStatus={hasBatchStats && failedCount > 0 ? "failed" : "completed"}
        errorCategory={
          hasBatchStats && failedCount > 0
            ? classifyFeedbackError(t.toolPage.batchPartialSuccess)
            : undefined
        }
      />

      {/* Edit settings / New file -- side by side */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onUndo}
          className="py-2 rounded-lg border border-border text-foreground hover:bg-muted text-xs font-medium"
        >
          {t.toolPage.adjustSettings}
        </button>
        <button
          type="button"
          onClick={onStartOver}
          className="py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted text-xs font-medium"
        >
          {t.toolPage.newFile}
        </button>
      </div>

      {/* Back to Tools -- subtle link, hidden since breadcrumb handles this */}
      <div className="flex justify-center">
        <Link
          to="/"
          className="text-xs text-muted-foreground/60 hover:text-muted-foreground flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" />
          {t.toolPage.backToTools}
        </Link>
      </div>
    </div>
  );
}
