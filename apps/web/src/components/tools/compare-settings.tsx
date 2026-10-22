import { Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { ResultDownloadLink } from "@/components/common/result-download-link";
import { useTranslation } from "@/contexts/i18n-context";
import { useSettleOnUnmount } from "@/hooks/use-settle-on-unmount";
import { failedAnswerMessage, formatHeaders } from "@/lib/api";
import { appUrl, resolveServerUrls } from "@/lib/app-url";
import { FeedbackCategoryError, feedbackCategoryOf } from "@/lib/feedback";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

interface CompareEntryResult {
  similarity: number;
  downloadUrl: string;
}

function isCompareResponse(value: unknown): value is CompareEntryResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return (
    typeof data.downloadUrl === "string" &&
    data.downloadUrl.length > 0 &&
    typeof data.similarity === "number" &&
    Number.isFinite(data.similarity)
  );
}

export function CompareSettings() {
  const { t } = useTranslation();
  const { files, currentEntry, processing, error, setProcessing, setError } = useFileStore();
  const [secondFile, setSecondFile] = useState<File | null>(null);
  const [resultsByEntry, setResultsByEntry] = useState<Record<string, CompareEntryResult>>({});
  const secondInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useSettleOnUnmount(
    () => abortRef.current !== null,
    () => abortRef.current?.abort(),
  );

  const handleProcess = async () => {
    if (files.length === 0 || !secondFile) return;
    const { entries, selectedIndex } = useFileStore.getState();
    const capturedEntry = entries[selectedIndex] ?? entries[0];
    if (!capturedEntry) return;
    const entryId = capturedEntry.id;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setProcessing(true);
    setError(null);
    setResultsByEntry((prev) => {
      if (!(entryId in prev)) return prev;
      const next = { ...prev };
      delete next[entryId];
      return next;
    });
    if (
      capturedEntry.processedUrl !== null ||
      capturedEntry.processedPreviewUrl !== null ||
      capturedEntry.processedSize !== null ||
      capturedEntry.status !== "pending" ||
      capturedEntry.error !== null
    ) {
      if (capturedEntry.processedUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(capturedEntry.processedUrl);
      }
      useFileStore.getState().updateEntryById(entryId, {
        processedUrl: null,
        processedPreviewUrl: null,
        processedFilename: null,
        processedSize: null,
        status: "pending",
        error: null,
      });
    }

    let storeReset = false;
    const unsubscribe = useFileStore.subscribe((state) => {
      if (
        !state.processing ||
        !state.entries.some((e) => e.id === capturedEntry.id && e.file === capturedEntry.file)
      ) {
        storeReset = true;
        if (abortRef.current === controller) abortRef.current = null;
        unsubscribe();
        if (state.processing) {
          setProcessing(false);
        }
        controller.abort();
      }
    });

    try {
      const formData = new FormData();
      formData.append("file", capturedEntry.file);
      formData.append("file", secondFile);

      const res = await fetch(appUrl("/api/v1/tools/image/compare"), {
        method: "POST",
        headers: formatHeaders(),
        body: formData,
        signal: controller.signal,
      }).catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") throw err;
        throw new FeedbackCategoryError(
          err instanceof Error ? err.message : t.errors.network,
          "upload_error",
        );
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const message = failedAnswerMessage(
          t,
          body,
          res.status,
          format(t.errors.failedWithStatus, { status: res.status }),
        );
        throw res.status === 413
          ? new FeedbackCategoryError(message, "upload_error")
          : new Error(message);
      }

      const raw = await res.json().catch((err: unknown) => {
        if (err instanceof SyntaxError) return null;
        throw err;
      });
      if (controller.signal.aborted || storeReset) return;
      const result = resolveServerUrls(raw);
      if (!isCompareResponse(result)) {
        throw new FeedbackCategoryError(t.errors.invalidServerResponse, "processing_error");
      }
      // Show the second image in the slider (not the diff) so the user can
      // visually compare their two originals. The diff is still downloadable.
      const currentTarget = useFileStore.getState().entries.find((entry) => entry.id === entryId);
      if (currentTarget) {
        if (currentTarget.processedUrl?.startsWith("blob:")) {
          URL.revokeObjectURL(currentTarget.processedUrl);
        }
        const nextUrl = URL.createObjectURL(secondFile);
        try {
          useFileStore.getState().updateEntryById(entryId, {
            processedUrl: nextUrl,
            processedPreviewUrl: null,
            processedFilename: null,
            status: "completed",
          });
        } catch (err) {
          if (!useFileStore.getState().entries.some((e) => e.processedUrl === nextUrl)) {
            URL.revokeObjectURL(nextUrl);
          }
          throw err;
        }
        setResultsByEntry((prev) => ({
          ...prev,
          [entryId]: {
            similarity: result.similarity,
            downloadUrl: result.downloadUrl,
          },
        }));
      }
    } catch (err) {
      if (
        controller.signal.aborted ||
        storeReset ||
        (err instanceof DOMException && err.name === "AbortError")
      ) {
        return;
      }
      unsubscribe();
      const failedTarget = useFileStore.getState().entries.find((entry) => entry.id === entryId);
      if (failedTarget?.processedUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(failedTarget.processedUrl);
      }
      useFileStore.getState().updateEntryById(entryId, {
        processedUrl: null,
        processedPreviewUrl: null,
        processedFilename: null,
        processedSize: null,
        status: "failed",
        error: err instanceof Error ? err.message : t.toolSettings.compare.comparisonFailed,
        errorCategory: feedbackCategoryOf(err),
      });
    } finally {
      unsubscribe();
      if (abortRef.current === controller) abortRef.current = null;
      if (!controller.signal.aborted && !storeReset) {
        setProcessing(false);
      }
    }
  };

  const hasFile = files.length > 0;
  const displayError = currentEntry?.error ?? error;
  const activeEntryResult =
    currentEntry && currentEntry.processedUrl !== null
      ? resultsByEntry[currentEntry.id]
      : undefined;
  const similarity = activeEntryResult?.similarity ?? null;
  const downloadUrl = activeEntryResult?.downloadUrl ?? null;

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="compare-second-image" className="text-xs text-muted-foreground">
          {t.toolSettings.compare.secondImage}
        </label>
        <input
          id="compare-second-image"
          ref={secondInputRef}
          type="file"
          accept="image/*,.avif,.heic,.heif,.hif"
          onChange={(e) => setSecondFile(e.target.files?.[0] ?? null)}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => secondInputRef.current?.click()}
          className="w-full mt-0.5 px-2 py-2 rounded border border-dashed border-border bg-background text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-2"
        >
          <Upload className="h-4 w-4" />
          {secondFile ? secondFile.name : t.toolSettings.compare.chooseSecondImage}
        </button>
      </div>

      {displayError && <p className="text-xs text-destructive-ink">{displayError}</p>}

      {similarity !== null && (
        <div className="p-3 rounded-lg bg-muted">
          <p className="text-sm text-foreground font-medium">
            {format(t.toolSettings.compare.similarity, { percent: similarity.toFixed(1) })}
          </p>
          <div className="mt-1 h-2 bg-background rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-primary" style={{ width: `${similarity}%` }} />
          </div>
        </div>
      )}

      <button
        type="button"
        data-testid="compare-submit"
        onClick={handleProcess}
        disabled={!hasFile || !secondFile || processing}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {processing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {processing ? t.toolSettings.compare.comparing : t.toolSettings.compare.submit}
      </button>

      {downloadUrl && (
        <ResultDownloadLink
          href={downloadUrl}
          testId="compare-download"
          label={t.toolSettings.compare.downloadDiffImage}
          claimEntryId={currentEntry?.id}
        />
      )}
    </div>
  );
}
