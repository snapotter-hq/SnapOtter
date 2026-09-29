import { ANALYTICS_EVENTS, isSafeMessageError, SafeError } from "@snapotter/shared";
import { AlertCircle, ArrowLeft, CheckCircle2, Download, FileText, FolderPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "@/contexts/i18n-context";
import { captureHandledError } from "@/lib/analytics";
import { formatHeaders } from "@/lib/api";
import { appUrl } from "@/lib/app-url";
import { formatFileSize, triggerDownload } from "@/lib/download";
import { classifyFeedbackError } from "@/lib/feedback";
import { format } from "@/lib/format";
import { IGNORE_ERRORS } from "@/lib/sentry-scrub";
import { cn } from "@/lib/utils";
import { useFileStore } from "@/stores/file-store";
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

/**
 * Save failures about the user's own account (signed out, not allowed, over
 * quota). The panel still shows them; there's nothing in them to fix.
 */
const UNREPORTED_SAVE_STATUSES = new Set([401, 403, 413]);

/**
 * fetch() rejects without a response when the browser is offline or the
 * connection drops. Sentry's IGNORE_ERRORS already drops those; wrapping one
 * in a SafeError would carry it past that filter, so match it here first.
 */
function isIgnoredNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const texts = [err.message, `${err.name}: ${err.message}`];
  return IGNORE_ERRORS.some((pattern) =>
    texts.some((text) =>
      typeof pattern === "string" ? text.includes(pattern) : pattern.test(text),
    ),
  );
}

/**
 * Why a save failed, when the server said. "expired" (the result is gone) and
 * "tooLarge" (over the upload limit) can't succeed on a retry; "quota" can,
 * once the user frees some space. "generic" is everything else (#1350).
 */
type SaveFailure = "expired" | "quota" | "tooLarge" | "generic";

/** What a failed library upload was about. Only 413s have a reason to show. */
async function uploadFailure(res: Response): Promise<SaveFailure> {
  if (res.status !== 413) return "generic";
  // Both the quota and the upload size limit answer 413; only the quota
  // carries this code. A reverse proxy's 413 is an HTML page: the size limit.
  if (!res.headers.get("content-type")?.includes("application/json")) return "tooLarge";
  try {
    const body: unknown = await res.json();
    return (body as { code?: unknown } | null)?.code === "STORAGE_QUOTA_EXCEEDED"
      ? "quota"
      : "tooLarge";
  } catch {
    // Our JSON answer, cut off before it could be read: it may have been the
    // quota, so don't claim a reason, and leave the retry open.
    return "generic";
  }
}

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
    useFileStore.getState().claimSelected();
  };

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveFailure, setSaveFailure] = useState<SaveFailure>("generic");
  // A generic error label resets itself after a few seconds. A retry clears
  // the pending reset, or it would flip a retry's "Saved" back to an enabled
  // button and invite a duplicate save.
  const errorResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => clearTimeout(errorResetRef.current ?? undefined), []);
  // The panel isn't remounted when it moves to another result (the thumbnail
  // strip, or a re-run). A failure with a reason stays up, and a save still in
  // flight would otherwise land its outcome on the new result, so both are
  // about the old one: clear them, and let a late save finish without
  // touching this panel's state.
  const shownUrlRef = useRef(downloadUrl);
  useEffect(() => {
    shownUrlRef.current = downloadUrl;
    clearTimeout(errorResetRef.current ?? undefined);
    setSaveStatus((status) => (status === "error" || status === "saving" ? "idle" : status));
  }, [downloadUrl]);

  const handleSaveToFiles = useCallback(async () => {
    // Capture before the awaits below: the thumbnail strip can move the
    // selection while the upload is in flight, and the claim must land on the
    // entry that was actually saved.
    const claimIndex = useFileStore.getState().selectedIndex;
    const stillShown = () => shownUrlRef.current === downloadUrl;
    clearTimeout(errorResetRef.current ?? undefined);
    setSaveStatus("saving");
    let failure: SaveFailure = "generic";
    try {
      const res = await fetch(downloadUrl);
      // An expired or missing result answers with an error page. Uploading
      // that body would put a broken file in the library and say "Saved"
      // (#1286). The status goes in the message because Sentry's scrubber
      // keeps a SafeError's message but drops its code.
      if (!res.ok) {
        if (res.status === 404 || res.status === 410) failure = "expired";
        throw new SafeError(`Save to Files could not fetch the result (HTTP ${res.status})`, {
          code: `save-result-fetch-${res.status}`,
          statusCode: res.status,
        });
      }
      const blob = await res.blob();
      const formData = new FormData();
      // Record which tool produced this file so the library shows it under
      // "Tools Used" (append before the file so the field is parsed first).
      if (currentToolId) formData.append("toolId", currentToolId);
      formData.append("file", new File([blob], filename, { type: fileType }));
      const uploadRes = await fetch(appUrl("/api/v1/files/upload"), {
        method: "POST",
        headers: formatHeaders(),
        body: formData,
      });
      if (!uploadRes.ok) {
        failure = await uploadFailure(uploadRes);
        throw new SafeError(`Save to Files upload failed (HTTP ${uploadRes.status})`, {
          code: `save-upload-${uploadRes.status}`,
          statusCode: uploadRes.status,
        });
      }
      if (stillShown()) setSaveStatus("saved");
      useFileStore.getState().markClaimed(claimIndex);
      // "Save to library" is the real success signal for a self-hosted tool
      // (there is no purchase). result_saved was defined + allowlisted but never
      // fired, so save-rate was unmeasurable.
      import("@/lib/analytics").then(({ track }) => {
        track(ANALYTICS_EVENTS.RESULT_SAVED, { tool_id: currentToolId });
      });
    } catch (err) {
      console.error("Save to Files failed", err);
      const reportable = isSafeMessageError(err)
        ? !UNREPORTED_SAVE_STATUSES.has(err.statusCode ?? 0)
        : !isIgnoredNetworkError(err);
      if (reportable) {
        void captureHandledError(
          isSafeMessageError(err)
            ? err
            : new SafeError("Save to Files request failed", { code: "save-request", cause: err }),
          { error_class: "operational", ...(currentToolId ? { tool_id: currentToolId } : {}) },
        );
      }
      if (!stillShown()) return;
      setSaveFailure(failure);
      setSaveStatus("error");
      // A reason stays on screen: it tells the user what to do, and the
      // generic label's reset would hand back a button that fails the same way.
      if (failure === "generic") {
        errorResetRef.current = setTimeout(() => setSaveStatus("idle"), 3000);
      }
    }
  }, [downloadUrl, filename, fileType, currentToolId]);

  const hasBatchStats =
    totalCount != null && totalCount > 1 && successCount != null && failedCount != null;

  return (
    <div className="space-y-3">
      <div className="border-t border-border" />

      {/* Success indicator */}
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-success-ink shrink-0" />
        <span className="text-sm font-medium text-foreground">{t.toolPage.conversionComplete}</span>
      </div>

      {/* Batch partial failure summary */}
      {hasBatchStats && failedCount > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 p-2.5 text-xs">
          <AlertCircle className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
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
              <span className="tabular-nums font-medium text-success-ink">{sizeDelta}%</span>
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
            className="w-full text-center text-xs text-primary-ink hover:text-primary-ink-strong underline underline-offset-2"
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
            ? format(t.reviewPanel.downloadAllZipSize, { size: formatFileSize(fileSize) })
            : hasBatchStats && successCount != null && successCount > 1
              ? format(t.reviewPanel.downloadFilesZipSize, {
                  count: successCount,
                  size: formatFileSize(fileSize),
                })
              : format(t.reviewPanel.downloadTypeSize, {
                  type: fileType,
                  size: formatFileSize(fileSize),
                })}
        </button>
      )}

      {/* Result already auto-saved to the library: show where it went
          instead of the manual save link (avoids duplicate saves). */}
      {!isDataOutput && savedLibraryFileId && (
        <div className="flex items-center justify-center gap-1.5 text-xs text-success-ink">
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
            disabled={
              saveStatus === "saving" ||
              saveStatus === "saved" ||
              (saveStatus === "error" && (saveFailure === "expired" || saveFailure === "tooLarge"))
            }
            className={cn(
              "text-xs flex items-center gap-1.5 transition-colors",
              saveStatus === "saved"
                ? "text-success-ink"
                : saveStatus === "error"
                  ? "text-destructive-ink"
                  : "text-muted-foreground hover:text-foreground disabled:opacity-50",
            )}
          >
            {saveStatus === "saved" ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : saveStatus === "error" ? (
              <AlertCircle className="h-3 w-3" />
            ) : saveStatus === "saving" ? (
              <div className="h-3 w-3 border-1.5 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <FolderPlus className="h-3 w-3" />
            )}
            {saveStatus === "saving"
              ? t.common.saving
              : saveStatus === "saved"
                ? t.toolPage.savedToFiles
                : saveStatus === "error"
                  ? {
                      expired: t.toolPage.resultExpired,
                      quota: t.toolPage.libraryFull,
                      tooLarge: t.errors.fileTooLarge,
                      generic: t.common.error,
                    }[saveFailure]
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
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" />
          {t.toolPage.backToTools}
        </Link>
      </div>
    </div>
  );
}
