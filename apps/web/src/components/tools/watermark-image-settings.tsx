import { ANALYTICS_EVENTS } from "@snapotter/shared";
import { Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { ResultDownloadLink } from "@/components/common/result-download-link";
import { useTranslation } from "@/contexts/i18n-context";
import { useSettleOnUnmount } from "@/hooks/use-settle-on-unmount";
import { track } from "@/lib/analytics";
import { failedAnswerMessage, formatHeaders } from "@/lib/api";
import { appUrl, resolveServerUrls } from "@/lib/app-url";
import { FeedbackCategoryError, feedbackCategoryOf } from "@/lib/feedback";
import { format } from "@/lib/format";
import { reportRunEndFailure } from "@/lib/run-end-report";
import { runEndWrites } from "@/lib/run-teardown";
import { useFileStore } from "@/stores/file-store";

type Position = "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

interface WatermarkImageEntryResult {
  downloadUrl: string;
  originalSize: number | null;
  processedSize: number | null;
}

interface WatermarkImageResponse {
  jobId?: string | null;
  downloadUrl: string;
  previewUrl?: string | null;
  originalSize?: number | null;
  processedSize?: number | null;
}

function isOptionalUrl(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || (typeof value === "string" && value.length > 0);
}

function isOptionalSize(value: unknown): value is number | null | undefined {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0)
  );
}

function isWatermarkImageResponse(value: unknown): value is WatermarkImageResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return (
    typeof data.downloadUrl === "string" &&
    data.downloadUrl.length > 0 &&
    isOptionalUrl(data.previewUrl) &&
    isOptionalSize(data.originalSize) &&
    isOptionalSize(data.processedSize)
  );
}

export function WatermarkImageSettings() {
  const { t } = useTranslation();
  const { files, currentEntry, processing, error, setProcessing, setError, setJobId } =
    useFileStore();
  const [position, setPosition] = useState<Position>("bottom-right");
  const [opacity, setOpacity] = useState(50);
  const [scale, setScale] = useState(25);
  const [watermarkFile, setWatermarkFile] = useState<File | null>(null);
  const [resultsByEntry, setResultsByEntry] = useState<Record<string, WatermarkImageEntryResult>>(
    {},
  );
  const watermarkInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useSettleOnUnmount(
    () => abortRef.current !== null,
    () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      abortRef.current?.abort();
      abortRef.current = null;
      const store = useFileStore.getState();
      if (!store.processing) return;
      const writes: Array<() => void> = [];
      for (let i = 0; i < store.entries.length; i++) {
        if (store.entries[i].status === "processing") {
          const idx = i;
          writes.push(() => store.updateEntry(idx, { status: "pending", error: null }));
        }
      }
      const teardownError = runEndWrites(writes);
      if (teardownError) {
        reportRunEndFailure(
          "Failing a tool run's entries failed",
          teardownError.cause,
          "watermark-image",
        );
      }
    },
  );

  const handleProcess = async () => {
    if (files.length === 0 || !watermarkFile) return;
    const { entries: startEntries, selectedIndex } = useFileStore.getState();
    const capturedEntry =
      files.length === 1 ? (startEntries[selectedIndex] ?? startEntries[0]) : undefined;
    if (files.length === 1 && !capturedEntry) return;

    track(ANALYTICS_EVENTS.TOOL_STARTED, {
      tool_id: "watermark-image",
      is_batch: files.length > 1,
      file_count: files.length,
    });

    unsubscribeRef.current?.();
    abortRef.current?.abort();
    const controller = new AbortController();
    let activeBatchIndex = 0;
    let activeBatchEntry: { id: string; file: File } | null = null;
    let activeEntryController: AbortController | null = null;
    controller.signal.addEventListener("abort", () => {
      activeEntryController?.abort();
    });
    abortRef.current = controller;

    setProcessing(true);
    setError(null);

    let storeReset = false;
    const unsubscribe = useFileStore.subscribe((state) => {
      const hasRunEntry = capturedEntry
        ? state.entries.some((e) => e.id === capturedEntry.id && e.file === capturedEntry.file)
        : startEntries.length > 0
          ? startEntries
              .slice(activeBatchIndex)
              .some((b) => state.entries.some((e) => e.id === b.id && e.file === b.file))
          : state.entries.length > 0;
      if (!state.processing || !hasRunEntry) {
        storeReset = true;
        if (abortRef.current === controller) abortRef.current = null;
        if (unsubscribeRef.current === unsubscribe) unsubscribeRef.current = null;
        unsubscribe();
        controller.abort();
        const writes: Array<() => void> = [];
        if (state.processing) {
          writes.push(() => setProcessing(false));
        }
        if (!capturedEntry) {
          for (const b of startEntries) {
            if (
              useFileStore
                .getState()
                .entries.some(
                  (e) => e.id === b.id && e.file === b.file && e.status === "processing",
                )
            ) {
              writes.push(() =>
                useFileStore.getState().updateEntryById(b.id, { status: "pending", error: null }),
              );
            }
          }
        }
        const teardownError = runEndWrites(writes);
        if (teardownError) {
          reportRunEndFailure(
            "Failing a tool run's entries failed",
            teardownError.cause,
            "watermark-image",
          );
        }
      } else if (
        activeBatchEntry &&
        !state.entries.some(
          (e) => e.id === activeBatchEntry?.id && e.file === activeBatchEntry?.file,
        )
      ) {
        activeEntryController?.abort();
      }
    });
    unsubscribeRef.current = unsubscribe;

    const settingsJson = JSON.stringify({ position, opacity, scale });

    if (capturedEntry) {
      const entryId = capturedEntry.id;
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
      try {
        const formData = new FormData();
        formData.append("file", capturedEntry.file);
        formData.append("watermark", watermarkFile);
        formData.append("settings", settingsJson);

        const res = await fetch(appUrl("/api/v1/tools/image/watermark-image"), {
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
            format(t.errors.processingFailedWithStatus, { status: res.status }),
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
        if (!isWatermarkImageResponse(result)) {
          throw new FeedbackCategoryError(t.errors.invalidServerResponse, "processing_error");
        }
        if (typeof result.jobId === "string" && result.jobId) {
          setJobId(result.jobId);
        }
        useFileStore.getState().updateEntryById(entryId, {
          processedUrl: result.downloadUrl,
          processedPreviewUrl: result.previewUrl ?? null,
          processedFilename: null,
          status: "completed",
          ...(result.originalSize != null ? { originalSize: result.originalSize } : {}),
          processedSize: result.processedSize ?? null,
        });
        setResultsByEntry((prev) => ({
          ...prev,
          [entryId]: {
            downloadUrl: result.downloadUrl,
            originalSize: result.originalSize ?? capturedEntry.originalSize,
            processedSize: result.processedSize ?? null,
          },
        }));
      } catch (err) {
        if (
          controller.signal.aborted ||
          storeReset ||
          (err instanceof DOMException && err.name === "AbortError")
        ) {
          return;
        }
        unsubscribe();
        useFileStore.getState().updateEntryById(entryId, {
          processedUrl: null,
          processedPreviewUrl: null,
          processedFilename: null,
          processedSize: null,
          status: "failed",
          error: err instanceof Error ? err.message : t.errors.processingFailedNoDetail,
          errorCategory: feedbackCategoryOf(err),
        });
      } finally {
        if (unsubscribeRef.current === unsubscribe) unsubscribeRef.current = null;
        unsubscribe();
        if (abortRef.current === controller) abortRef.current = null;
        if (!controller.signal.aborted && !storeReset) {
          setProcessing(false);
        }
      }
    } else {
      // Multiple files: process each one individually, writing results to each entry
      setResultsByEntry({});
      const isEntryPresent = (id: string, file: File) =>
        useFileStore.getState().entries.some((e) => e.id === id && e.file === file);
      try {
        const store = useFileStore.getState();
        for (const entry of store.entries) {
          if (
            entry.processedUrl !== null ||
            entry.processedPreviewUrl !== null ||
            entry.processedSize !== null ||
            entry.status !== "pending" ||
            entry.error !== null
          ) {
            if (entry.processedUrl?.startsWith("blob:")) {
              URL.revokeObjectURL(entry.processedUrl);
            }
            store.updateEntryById(entry.id, {
              processedUrl: null,
              processedPreviewUrl: null,
              processedFilename: null,
              processedSize: null,
              status: "pending",
              error: null,
            });
          }
        }
        for (let i = 0; i < startEntries.length; i++) {
          activeBatchIndex = i;
          if (controller.signal.aborted || storeReset) break;
          const { id: entryId, file } = startEntries[i];
          if (!isEntryPresent(entryId, file)) continue;
          const entryController = new AbortController();
          activeBatchEntry = { id: entryId, file };
          activeEntryController = entryController;
          store.updateEntryById(entryId, { status: "processing", error: null });
          try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("watermark", watermarkFile);
            formData.append("settings", settingsJson);

            const res = await fetch(appUrl("/api/v1/tools/image/watermark-image"), {
              method: "POST",
              headers: formatHeaders(),
              body: formData,
              signal: entryController.signal,
            }).catch((err: unknown) => {
              if (err instanceof DOMException && err.name === "AbortError") throw err;
              throw new FeedbackCategoryError(
                err instanceof Error ? err.message : t.errors.network,
                "upload_error",
              );
            });

            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              if (controller.signal.aborted || storeReset) break;
              if (entryController.signal.aborted || !isEntryPresent(entryId, file)) continue;
              store.updateEntryById(entryId, {
                status: "failed",
                error: failedAnswerMessage(t, body, res.status, t.errors.processingFailedNoDetail),
                errorCategory: res.status === 413 ? "upload_error" : null,
              });
              continue;
            }

            const raw = await res.json().catch((err: unknown) => {
              if (err instanceof SyntaxError) return null;
              throw err;
            });
            if (controller.signal.aborted || storeReset) break;
            if (entryController.signal.aborted || !isEntryPresent(entryId, file)) continue;
            const result = resolveServerUrls(raw);
            if (!isWatermarkImageResponse(result)) {
              throw new FeedbackCategoryError(t.errors.invalidServerResponse, "processing_error");
            }
            store.updateEntryById(entryId, {
              processedUrl: result.downloadUrl,
              processedPreviewUrl: result.previewUrl ?? null,
              processedFilename: null,
              status: "completed",
              ...(result.originalSize != null ? { originalSize: result.originalSize } : {}),
              processedSize: result.processedSize ?? null,
            });
            setResultsByEntry((prev) => ({
              ...prev,
              [entryId]: {
                downloadUrl: result.downloadUrl,
                originalSize: result.originalSize ?? startEntries[i].originalSize,
                processedSize: result.processedSize ?? null,
              },
            }));
          } catch (err) {
            if (controller.signal.aborted || storeReset) {
              break;
            }
            if (entryController.signal.aborted || !isEntryPresent(entryId, file)) {
              if (isEntryPresent(entryId, file)) {
                store.updateEntryById(entryId, { status: "pending", error: null });
              }
              continue;
            }
            if (err instanceof DOMException && err.name === "AbortError") {
              store.updateEntryById(entryId, { status: "pending", error: null });
              break;
            }
            store.updateEntryById(entryId, {
              status: "failed",
              error: err instanceof Error ? err.message : t.errors.processingFailedNoDetail,
              errorCategory: feedbackCategoryOf(err),
            });
          }
        }
      } finally {
        activeBatchEntry = null;
        activeEntryController = null;
        if (unsubscribeRef.current === unsubscribe) unsubscribeRef.current = null;
        unsubscribe();
        if (abortRef.current === controller) abortRef.current = null;
        if (!controller.signal.aborted && !storeReset) {
          setProcessing(false);
        }
      }
    }
  };

  const hasFile = files.length > 0;
  const displayError = currentEntry?.error ?? error;
  const activeEntryResult =
    currentEntry && currentEntry.processedUrl !== null
      ? resultsByEntry[currentEntry.id]
      : undefined;
  const downloadUrl = activeEntryResult?.downloadUrl ?? null;
  const originalSize = activeEntryResult
    ? (activeEntryResult.originalSize ?? currentEntry?.originalSize ?? null)
    : null;
  const processedSize = activeEntryResult?.processedSize ?? null;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-muted-foreground">
          {t.toolSettings["watermark-image"].watermarkImage}
        </p>
        <input
          ref={watermarkInputRef}
          type="file"
          accept="image/*,.avif,.heic,.heif,.hif"
          onChange={(e) => setWatermarkFile(e.target.files?.[0] ?? null)}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => watermarkInputRef.current?.click()}
          className="w-full mt-0.5 px-2 py-2 rounded border border-dashed border-border bg-background text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-2"
        >
          <Upload className="h-4 w-4" />
          {watermarkFile
            ? watermarkFile.name
            : t.toolSettings["watermark-image"].chooseWatermarkImage}
        </button>
      </div>

      <div>
        <label htmlFor="watermark-image-position" className="text-xs text-muted-foreground">
          {t.toolSettings["watermark-image"].position}
        </label>
        <select
          id="watermark-image-position"
          value={position}
          onChange={(e) => setPosition(e.target.value as Position)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="center">{t.toolSettings["watermark-image"].center}</option>
          <option value="top-left">{t.toolSettings["watermark-image"].topLeft}</option>
          <option value="top-right">{t.toolSettings["watermark-image"].topRight}</option>
          <option value="bottom-left">{t.toolSettings["watermark-image"].bottomLeft}</option>
          <option value="bottom-right">{t.toolSettings["watermark-image"].bottomRight}</option>
        </select>
      </div>

      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="watermark-image-opacity" className="text-xs text-muted-foreground">
            {t.toolSettings["watermark-image"].opacity}
          </label>
          <span className="text-xs font-mono text-foreground">{opacity}%</span>
        </div>
        <input
          id="watermark-image-opacity"
          type="range"
          min={0}
          max={100}
          value={opacity}
          onChange={(e) => setOpacity(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="watermark-image-scale" className="text-xs text-muted-foreground">
            {t.toolSettings["watermark-image"].scale}
          </label>
          <span className="text-xs font-mono text-foreground">{scale}%</span>
        </div>
        <input
          id="watermark-image-scale"
          type="range"
          min={5}
          max={100}
          value={scale}
          onChange={(e) => setScale(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      {displayError && <p className="text-xs text-destructive-ink">{displayError}</p>}

      {originalSize != null && processedSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>
            {format(t.toolSettings["watermark-image"].originalKb, {
              size: (originalSize / 1024).toFixed(1),
            })}
          </p>
          <p>
            {format(t.toolSettings["watermark-image"].processedKb, {
              size: (processedSize / 1024).toFixed(1),
            })}
          </p>
        </div>
      )}

      <button
        type="button"
        data-testid="watermark-image-submit"
        onClick={handleProcess}
        disabled={!hasFile || !watermarkFile || processing}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {processing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {processing
          ? t.toolSettings["watermark-image"].processing
          : files.length > 1
            ? format(t.toolSettings["watermark-image"].submitBatch, { count: files.length })
            : t.toolSettings["watermark-image"].submit}
      </button>

      {downloadUrl && (
        <ResultDownloadLink
          href={downloadUrl}
          testId="watermark-image-download"
          claimEntryId={currentEntry?.id}
        />
      )}
    </div>
  );
}
