import { Download, Lasso, Loader2, Paintbrush, Redo, Sparkles, Trash2, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { ResultDownloadLink } from "@/components/common/result-download-link";
import { useTranslation } from "@/contexts/i18n-context";
import { useAuth } from "@/hooks/use-auth";
import { formatHeaders } from "@/lib/api";
import { appUrl, resolveServerUrls } from "@/lib/app-url";
import { bundleName } from "@/lib/bundle-i18n";
import { FeedbackCategoryError, feedbackCategoryOf } from "@/lib/feedback";
import { format, formatFileSize } from "@/lib/format";
import {
  checkToolResult,
  frameFailure,
  type JobFailure,
  jobFailureMessage,
  type ProgressFrame,
  parseResultBody,
  reportMalformedResult,
} from "@/lib/progress-frames";
import { reportRunEndFailure } from "@/lib/run-end-report";
import { generateId } from "@/lib/utils";
import { useFeaturesStore } from "@/stores/features-store";
import { useFileStore } from "@/stores/file-store";
import type { EraserCanvasRef } from "./eraser-canvas";

type QualityMode = "fast" | "hq";
const HQ_BUNDLE_ID = "inpaint-hq";

const OUTPUT_FORMATS = [
  "png",
  "jpg",
  "webp",
  "avif",
  "tiff",
  "gif",
  "heic",
  "heif",
  "jxl",
] as const;
const LOSSY_FORMATS = ["jpg", "jpeg", "webp", "avif", "heic", "heif", "jxl"];

const SSE_STALL_TIMEOUT_MS = 5 * 60_000;

interface ProgressHandlers {
  onProgress?: (percent: number) => void;
  onComplete: (result: Record<string, unknown>) => void;
  onFailed: (failure: JobFailure) => void;
  onStall: () => void;
}

/**
 * Subscribe to async (202) job progress with the same resilience as the
 * standard tool processor (PRs #203/#204). The original eraser opened a bare
 * EventSource with no recovery: if SSE silently died (mobile backgrounding,
 * flaky network, proxy buffering) the UI hung forever at the last percent
 * (~25%) even though the backend job had finished and saved its result.
 *
 * This reconnects on tab refocus -- the progress endpoint replays the terminal
 * frame from Redis and, after that cache expires, from the durable job record,
 * so a job that completed while SSE was dead still resolves -- and arms a stall
 * timeout that fails gracefully instead of hanging. Returns a cleanup the
 * caller must invoke on sync completion, error, or unmount.
 */
export function subscribeEraseObjectJobProgress(
  clientJobId: string,
  handlers: ProgressHandlers,
): () => void {
  let es: EventSource | null = null;
  let stall: ReturnType<typeof setTimeout> | null = null;
  let done = false;

  const onVisible = () => {
    if (done || document.visibilityState !== "visible") return;
    if (es && es.readyState === EventSource.OPEN) return;
    setTimeout(open, 500);
  };

  const cleanup = () => {
    if (done) return;
    done = true;
    if (stall) clearTimeout(stall);
    stall = null;
    if (es) es.close();
    es = null;
    document.removeEventListener("visibilitychange", onVisible);
  };

  const resetStall = () => {
    if (stall) clearTimeout(stall);
    stall = setTimeout(() => {
      cleanup();
      handlers.onStall();
    }, SSE_STALL_TIMEOUT_MS);
  };

  function open() {
    if (done) return;
    if (es && es.readyState === EventSource.OPEN) return;
    if (es) es.close();
    try {
      es = new EventSource(appUrl(`/api/v1/jobs/${clientJobId}/progress`));
    } catch {
      return;
    }
    es.onmessage = (event) => {
      // Only an unparseable frame is ignorable. A throw past the parse is our
      // own handling failing, and it must end the run (#1287).
      let data: ProgressFrame;
      try {
        data = resolveServerUrls(JSON.parse(event.data));
      } catch {
        return;
      }
      // A completed frame with nothing to download is the server's bug, the
      // twin of a sync 2xx body with no downloadUrl (#1740): the worker builds
      // every result with one. It ends the run outside the catch below, so a
      // throw while showing the error can't relabel it as ours (#1830).
      let completed: Record<string, unknown> | null = null;
      if (data.type === "single" && data.phase === "complete") {
        try {
          completed = checkToolResult<Record<string, unknown>>(data.result);
        } catch (err) {
          cleanup();
          // Reported first: a throw from onFailed's store writes must not lose it.
          reportMalformedResult(err, { toolId: "erase-object" });
          handlers.onFailed({ reason: "invalidResponse" });
          return;
        }
      }
      try {
        if (data.type === "heartbeat") {
          resetStall();
          return;
        }
        if (data.type !== "single") return;
        resetStall();
        if (completed) {
          cleanup();
          handlers.onComplete(completed);
          return;
        }
        if (data.phase === "failed") {
          cleanup();
          handlers.onFailed(frameFailure(data.error, data.details));
          return;
        }
        if (typeof data.percent === "number") handlers.onProgress?.(data.percent);
      } catch (err) {
        // cleanup() already ran if onComplete threw, taking the stall timer
        // with it, so nothing else would ever settle the run.
        cleanup();
        try {
          handlers.onFailed({ reason: "trackingFailed" });
        } catch {
          // onFailed may be what threw; the original error is rethrown below.
        }
        throw err;
      }
    };
    // A transient drop triggers the browser's built-in reconnect; on reconnect
    // the backend replays the terminal frame, so a completed job still resolves.
    es.onerror = () => {};
  }

  document.addEventListener("visibilitychange", onVisible);
  open();
  resetStall();
  return cleanup;
}

interface EraseObjectSettingsProps {
  eraserRef: React.RefObject<EraserCanvasRef | null>;
  hasStrokes: boolean;
  brushSize: number;
  onBrushSizeChange: (size: number) => void;
  mode: "brush" | "lasso";
  onModeChange: (mode: "brush" | "lasso") => void;
  onMaskCenter?: (centerPct: number) => void;
  maskedFileCount: number;
}

export function EraseObjectSettings({
  eraserRef,
  hasStrokes,
  brushSize,
  onBrushSizeChange: setBrushSize,
  mode,
  onModeChange,
  onMaskCenter,
  maskedFileCount,
}: EraseObjectSettingsProps) {
  const { t } = useTranslation();
  const { files, entries, processing, error, setProcessing, setError, currentEntry } =
    useFileStore();
  const [progressPhase, setProgressPhase] = useState<"idle" | "uploading" | "processing">("idle");
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressStage, setProgressStage] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressCleanupRef = useRef<(() => void) | null>(null);

  // Tear down any live progress subscription if the component unmounts mid-job.
  useEffect(() => {
    return () => {
      progressCleanupRef.current?.();
      if (elapsedRef.current) clearInterval(elapsedRef.current);
    };
  }, []);

  const [outputFormat, setOutputFormat] = useState("png");
  const [quality, setQuality] = useState(95);
  const [qualityMode, setQualityMode] = useState<QualityMode>("fast");

  // High-Quality (diffusion) mode is backed by the optional inpaint-hq bundle.
  // Mirrors the OCR quality control: pick the mode, and if the pack is missing
  // show the standard install prompt instead of silently running the fast path.
  const { hasPermission } = useAuth();
  const hqBundle = useFeaturesStore((s) => s.bundles.find((b) => b.id === HQ_BUNDLE_ID));
  const hqInstalled = hqBundle?.status === "installed";
  const installBundle = useFeaturesStore((s) => s.installBundle);
  const hqInstalling = useFeaturesStore((s) => s.installing[HQ_BUNDLE_ID]);
  const hqQueued = useFeaturesStore((s) => s.queued.includes(HQ_BUNDLE_ID));
  const hqInstallError = useFeaturesStore((s) => s.errors[HQ_BUNDLE_ID]);
  const needsHqPack = qualityMode === "hq" && !hqInstalled;
  const isAdmin = hasPermission("features:manage");
  const hqSizeBytes = hqBundle?.missingDownloadBytes ?? hqBundle?.downloadBytes;
  const hqSize = hqSizeBytes ? formatFileSize(hqSizeBytes) : (hqBundle?.estimatedSize ?? "5-7 GB");

  const processOneFile = (
    entryIndex: number,
    file: File,
    maskBlob: Blob,
    onProgress: (percent: number) => void,
  ): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      const clientJobId = generateId();

      const applyResult = (r: Record<string, unknown>) => {
        useFileStore.getState().updateEntry(entryIndex, {
          processedUrl: r.downloadUrl as string,
          processedPreviewUrl: (r.previewUrl as string) ?? null,
          processedFilename: null,
          status: "completed",
          originalSize: r.originalSize as number,
          processedSize: r.processedSize as number,
        });
      };

      const stopProgress = subscribeEraseObjectJobProgress(clientJobId, {
        onProgress,
        onComplete: (r) => {
          applyResult(r);
          resolve();
        },
        onFailed: (failure) => reject(new Error(jobFailureMessage(failure, t.errors))),
        onStall: () =>
          reject(new FeedbackCategoryError(t.toolSettings["erase-object"].stallBatch, "timeout")),
      });

      const maskFile = new File([maskBlob], "mask.png", { type: "image/png" });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mask", maskFile);
      formData.append("clientJobId", clientJobId);
      formData.append("format", outputFormat);
      formData.append("quality", String(quality));
      formData.append("qualityMode", qualityMode);

      const xhr = new XMLHttpRequest();
      xhr.timeout = 600_000;
      xhr.onload = () => {
        if (xhr.status === 202) return;
        stopProgress();
        if (xhr.status >= 200 && xhr.status < 300) {
          // Only a body that isn't a result is the server's fault, and it gets
          // reported (#1740). A throw while landing a good one is our own store
          // write failing: it fails this file the way the progress stream's
          // handling error does, and still surfaces (#1734, after #1354).
          let result: Record<string, unknown>;
          try {
            result = parseResultBody<Record<string, unknown>>(xhr.responseText);
          } catch (err) {
            reject(new Error(t.errors.invalidResponse));
            reportMalformedResult(err, { status: xhr.status, toolId: "erase-object" });
            return;
          }
          try {
            applyResult(result);
          } catch (err) {
            reject(new Error(jobFailureMessage({ reason: "trackingFailed" }, t.errors)));
            throw err;
          }
          resolve();
        } else {
          try {
            const body = JSON.parse(xhr.responseText);
            reject(
              new Error(
                typeof body.error === "string"
                  ? body.error
                  : typeof body.details === "string"
                    ? body.details
                    : format(t.errors.failedWithStatus, { status: xhr.status }),
              ),
            );
          } catch {
            reject(new Error(format(t.errors.processingFailedWithStatus, { status: xhr.status })));
          }
        }
      };
      xhr.onerror = () => {
        stopProgress();
        reject(new Error(t.errors.network));
      };
      xhr.ontimeout = () => {
        stopProgress();
        reject(new FeedbackCategoryError(t.errors.requestTimedOut, "timeout"));
      };
      xhr.open("POST", appUrl("/api/v1/tools/image/erase-object"));
      for (const [key, value] of formatHeaders()) {
        xhr.setRequestHeader(key, value);
      }
      xhr.send(formData);
    });
  };

  const handleProcess = async () => {
    if (files.length === 0 || !eraserRef.current) return;

    const capturedIndex = useFileStore.getState().selectedIndex;
    // Library file this single-file run derives from (#565). Batch runs
    // (handleProcessAll) never auto-save, matching the standard processor.
    const capturedEntry = useFileStore.getState().entries[capturedIndex];
    const saveMode = useFileStore.getState().librarySaveMode;
    useFileStore.getState().setLastSavedLibraryFileId(null);

    const maskBlob = await eraserRef.current.exportMask();
    if (!maskBlob) return;

    // Record where the user painted so the comparison slider starts at that location
    const maskCenter = eraserRef.current.getMaskCenter();
    if (maskCenter !== null && onMaskCenter) {
      onMaskCenter(maskCenter);
    }

    setError(null);
    setProcessing(true);
    setProgressPhase("uploading");
    setProgressPercent(0);
    setElapsed(0);

    const startTime = Date.now();
    elapsedRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    const clientJobId = generateId();

    const applyResult = (r: Record<string, unknown>) => {
      if (r.savedFileId) {
        useFileStore.getState().setLastSavedLibraryFileId(r.savedFileId as string);
      }
      useFileStore.getState().updateEntry(capturedIndex, {
        processedUrl: r.downloadUrl as string,
        processedPreviewUrl: (r.previewUrl as string) ?? null,
        processedFilename: null,
        status: "completed",
        originalSize: r.originalSize as number,
        processedSize: r.processedSize as number,
        ...(r.savedFileId && saveMode === "overwrite"
          ? { serverFileId: r.savedFileId as string }
          : {}),
      });
      // An auto-saved result is already in the library, so it was never at risk.
      // Must follow the updateEntry above; see the `claimed` invariant in file-store.
      if (r.savedFileId) useFileStore.getState().markClaimed(capturedIndex);
    };

    const finishUi = () => {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      setProcessing(false);
      setProgressPhase("idle");
      setProgressStage(null);
    };

    const stopProgress = subscribeEraseObjectJobProgress(clientJobId, {
      onProgress: (percent) => {
        setProgressPhase("processing");
        setProgressPercent(15 + (percent / 100) * 85);
      },
      onComplete: (r) => {
        progressCleanupRef.current = null;
        applyResult(r);
        finishUi();
      },
      onFailed: (failure) => {
        progressCleanupRef.current = null;
        // setError is a store write, and the stream has already let go of the
        // run: a throw from it must not skip finishUi and leave the run at
        // processing for good (#1830). It still surfaces, after the teardown.
        try {
          setError(jobFailureMessage(failure, t.errors));
        } finally {
          finishUi();
        }
      },
      onStall: () => {
        progressCleanupRef.current = null;
        setError(t.toolSettings["erase-object"].stall);
        finishUi();
      },
    });
    progressCleanupRef.current = stopProgress;

    const maskFile = new File([maskBlob], "mask.png", { type: "image/png" });

    const formData = new FormData();
    formData.append("file", entries[capturedIndex].file);
    formData.append("mask", maskFile);
    formData.append("clientJobId", clientJobId);
    formData.append("format", outputFormat);
    formData.append("quality", String(quality));
    formData.append("qualityMode", qualityMode);
    if (capturedEntry?.serverFileId) {
      formData.append("fileId", capturedEntry.serverFileId);
      formData.append("saveMode", saveMode);
    }

    const xhr = new XMLHttpRequest();
    xhr.timeout = 600_000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setProgressPercent((e.loaded / e.total) * 15);
      }
    };
    xhr.upload.onload = () => {
      setProgressPhase("processing");
      setProgressPercent(15);
    };
    xhr.onload = () => {
      // 202 = async: the progress subscription drives completion via SSE.
      if (xhr.status === 202) return;

      stopProgress();
      progressCleanupRef.current = null;

      if (xhr.status >= 200 && xhr.status < 300) {
        // Same split as the batch path in processOneFile (#1734).
        let result: Record<string, unknown> | null = null;
        try {
          result = parseResultBody<Record<string, unknown>>(xhr.responseText);
        } catch (err) {
          // Reported first: a throw from the store write below must not lose it.
          reportMalformedResult(err, { status: xhr.status, toolId: "erase-object" });
          setError(t.errors.invalidResponse);
        }
        if (result) {
          try {
            applyResult(result);
          } catch (err) {
            // Both are store writes, so each is guarded on its own: a second
            // throw from setError must not leave the run stuck at processing.
            let teardownError: { cause: unknown } | null = null;
            for (const teardown of [
              () => setError(jobFailureMessage({ reason: "trackingFailed" }, t.errors)),
              finishUi,
            ]) {
              try {
                teardown();
              } catch (teardownErr) {
                console.error("Ending the run after a result handling error failed", teardownErr);
                teardownError ??= { cause: teardownErr };
              }
            }
            // Once per run, with the first throw: the console alone never
            // reaches Sentry (#1882).
            if (teardownError) {
              reportRunEndFailure(
                "Ending an Erase Object run after a result handling error failed",
                teardownError.cause,
                "erase-object",
              );
            }
            throw err;
          }
        }
      } else {
        try {
          const body = JSON.parse(xhr.responseText);
          setError(
            typeof body.error === "string"
              ? body.error
              : typeof body.details === "string"
                ? body.details
                : format(t.errors.failedWithStatus, { status: xhr.status }),
          );
        } catch {
          setError(format(t.errors.processingFailedWithStatus, { status: xhr.status }));
        }
      }
      finishUi();
    };
    xhr.onerror = () => {
      stopProgress();
      progressCleanupRef.current = null;
      setError(t.errors.network);
      finishUi();
    };
    xhr.ontimeout = () => {
      stopProgress();
      progressCleanupRef.current = null;
      setError(t.toolSettings["erase-object"].timeoutOverloaded);
      finishUi();
    };
    xhr.open("POST", appUrl("/api/v1/tools/image/erase-object"));
    formatHeaders().forEach((value, key) => {
      xhr.setRequestHeader(key, value);
    });
    xhr.send(formData);
  };

  const handleProcessAll = async () => {
    if (!eraserRef.current) return;

    const masks = await eraserRef.current.exportAllMasks();
    if (masks.size === 0) return;

    const { entries: currentEntries } = useFileStore.getState();

    // Map blobUrl -> entry index
    const blobToIndex = new Map<string, number>();
    for (let i = 0; i < currentEntries.length; i++) {
      blobToIndex.set(currentEntries[i].blobUrl, i);
    }

    const work: { index: number; file: File; maskBlob: Blob }[] = [];
    for (const [blobUrl, maskBlob] of masks) {
      const idx = blobToIndex.get(blobUrl);
      if (idx !== undefined) {
        work.push({ index: idx, file: currentEntries[idx].file, maskBlob });
      }
    }
    if (work.length === 0) return;

    // A store write that throws anywhere in here (#1354) ends the batch: a
    // store that can't record a file's outcome gets no more files sent to it.
    // The teardown below runs whatever threw, so the run can't stay at
    // processing with its elapsed counter ticking (#1810).
    let batchError: { cause: unknown } | null = null;
    try {
      setError(null);
      setProcessing(true);
      setProgressPhase("uploading");
      setProgressPercent(0);
      setElapsed(0);

      const startTime = Date.now();
      elapsedRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);

      for (let wi = 0; wi < work.length; wi++) {
        const { index, file, maskBlob } = work[wi];
        const basePercent = (wi / work.length) * 100;
        const sliceWeight = 100 / work.length;

        setProgressPhase("processing");
        setProgressPercent(basePercent);
        setProgressStage(
          format(t.toolSettings["erase-object"].erasingProgress, {
            current: wi + 1,
            total: work.length,
          }),
        );

        useFileStore.getState().updateEntry(index, { status: "processing", error: null });

        try {
          await processOneFile(index, file, maskBlob, (pct) => {
            setProgressPercent(basePercent + (pct / 100) * sliceWeight);
          });
        } catch (err) {
          useFileStore.getState().updateEntry(index, {
            status: "failed",
            error: err instanceof Error ? err.message : t.errors.processingFailedNoDetail,
            errorCategory: feedbackCategoryOf(err),
          });
        }
      }
    } catch (cause) {
      batchError = { cause };
    }

    // Each teardown write in its own guard, so one that throws can't skip
    // the rest. The first error is rethrown once the run is over, where
    // Sentry's global handler picks it up. A teardown throw behind a batch
    // error would be lost to that rethrow, so it's reported here instead,
    // once (#1812).
    const trackingFailed = jobFailureMessage({ reason: "trackingFailed" }, t.errors);
    let teardownError: { cause: unknown } | null = null;
    for (const teardown of [
      () => {
        if (elapsedRef.current) clearInterval(elapsedRef.current);
      },
      () => setProcessing(false),
      () => setProgressPhase("idle"),
      () => setProgressStage(null),
      // A batch that stopped early says so, as the single-file run does.
      () => {
        if (batchError) setError(trackingFailed);
      },
      // Last, after the run has ended (#1781): a file the stopped batch left
      // at "processing" would pulse for good. Fails only this batch's files.
      () => {
        if (!batchError) return;
        for (const { index } of work) {
          if (useFileStore.getState().entries[index]?.status === "processing") {
            useFileStore.getState().updateEntry(index, {
              status: "failed",
              error: trackingFailed,
              errorCategory: null,
            });
          }
        }
      },
    ]) {
      try {
        teardown();
      } catch (err) {
        console.error("Ending an Erase Object batch failed", err);
        teardownError ??= { cause: err };
      }
    }
    if (batchError) {
      if (teardownError) {
        reportRunEndFailure(
          "Ending an Erase Object batch after a store error failed",
          teardownError.cause,
          "erase-object",
        );
      }
      throw batchError.cause;
    }
    if (teardownError) throw teardownError.cause;
  };

  const hasFile = files.length > 0;

  return (
    <div className="space-y-4">
      {/* Mode: brush vs lasso */}
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        <button
          type="button"
          data-testid="eraser-mode-brush"
          aria-pressed={mode === "brush"}
          onClick={() => onModeChange("brush")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
            mode === "brush"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Paintbrush className="h-3.5 w-3.5" />
          {t.toolSettings["erase-object"].brushMode}
        </button>
        <button
          type="button"
          data-testid="eraser-mode-lasso"
          aria-pressed={mode === "lasso"}
          onClick={() => onModeChange("lasso")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
            mode === "lasso"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Lasso className="h-3.5 w-3.5" />
          {t.toolSettings["erase-object"].lassoMode}
        </button>
      </div>

      {/* Quality: Fast (LaMa, always available) vs High quality (diffusion, inpaint-hq) */}
      <div>
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          <button
            type="button"
            data-testid="eraser-quality-fast"
            aria-pressed={qualityMode === "fast"}
            disabled={processing}
            onClick={() => setQualityMode("fast")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50 ${
              qualityMode === "fast"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Zap className="h-3.5 w-3.5" />
            {t.toolSettings["erase-object"].qualityFast}
          </button>
          <button
            type="button"
            data-testid="eraser-quality-hq"
            aria-pressed={qualityMode === "hq"}
            disabled={processing}
            onClick={() => setQualityMode("hq")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50 ${
              qualityMode === "hq"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {t.toolSettings["erase-object"].qualityHq}
          </button>
        </div>

        {qualityMode === "hq" && (
          <p className="mt-1 text-[10px] text-muted-foreground">
            {t.toolSettings["erase-object"].qualityHint}
          </p>
        )}

        {needsHqPack && (
          <div className="mt-2 rounded-lg border border-border bg-muted/40 p-3 text-start">
            <p className="text-xs text-muted-foreground">
              {format(t.features.requiresDownload, { size: hqSize })}
            </p>
            {isAdmin ? (
              <button
                type="button"
                data-testid="eraser-install-hq"
                onClick={() => installBundle(HQ_BUNDLE_ID)}
                disabled={!!hqInstalling || hqQueued}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {hqInstalling || hqQueued ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {hqInstalling || hqQueued
                  ? t.settings.aiFeatures.installing
                  : format(t.features.enableButton, {
                      name: bundleName(
                        t,
                        hqBundle ?? { id: HQ_BUNDLE_ID, name: t.featureBundles["inpaint-hq"].name },
                      ),
                    })}
              </button>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                {t.features.notEnabledDescription}
              </p>
            )}
            {hqInstallError && <p className="mt-1 text-xs text-destructive">{hqInstallError}</p>}
          </div>
        )}
      </div>

      {/* Brush size (brush mode only) */}
      {mode === "brush" && (
        <div>
          <div className="flex justify-between items-center">
            <label htmlFor="eraser-brush-size" className="text-xs text-muted-foreground">
              {t.toolSettings["erase-object"].brushSize}
            </label>
            <span className="text-xs font-mono text-foreground">{brushSize}px</span>
          </div>
          <input
            id="eraser-brush-size"
            type="range"
            min={5}
            max={100}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="w-full mt-1"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
            <span>{t.toolSettings["erase-object"].fine}</span>
            <span>{t.toolSettings["erase-object"].wide}</span>
          </div>
        </div>
      )}

      {/* Clear / Undo */}
      {hasStrokes && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => eraserRef.current?.undo()}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-muted text-muted-foreground hover:bg-primary/10 text-xs"
          >
            <Redo className="h-3.5 w-3.5" />
            {t.toolSettings["erase-object"].undo}
          </button>
          <button
            type="button"
            onClick={() => eraserRef.current?.clear()}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-muted text-muted-foreground hover:bg-primary/10 text-xs"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t.toolSettings["erase-object"].clear}
          </button>
        </div>
      )}

      {/* Output Format */}
      <div>
        <label htmlFor="eraser-format" className="text-xs text-muted-foreground">
          {t.toolSettings["erase-object"].outputFormat}
        </label>
        <select
          id="eraser-format"
          value={outputFormat}
          onChange={(e) => setOutputFormat(e.target.value)}
          className="w-full mt-1 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          {OUTPUT_FORMATS.map((f) => (
            <option key={f} value={f}>
              {f.toUpperCase()}
            </option>
          ))}
        </select>
      </div>

      {/* Quality (lossy formats only) */}
      {LOSSY_FORMATS.includes(outputFormat) && (
        <div>
          <div className="flex justify-between items-center">
            <label htmlFor="eraser-quality" className="text-xs text-muted-foreground">
              {t.toolSettings["erase-object"].quality}
            </label>
            <span className="text-xs font-mono text-foreground">{quality}</span>
          </div>
          <input
            id="eraser-quality"
            type="range"
            min={1}
            max={100}
            step={1}
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
            className="w-full mt-1"
          />
        </div>
      )}

      {/* Hint */}
      {hasFile && !hasStrokes && (
        <p className="text-[10px] text-muted-foreground">
          {mode === "lasso"
            ? t.toolSettings["erase-object"].lassoHint
            : t.toolSettings["erase-object"].paintHint}
        </p>
      )}

      {/* Error */}
      {error && <p className="text-xs text-destructive-ink">{error}</p>}

      {/* Size info */}
      {currentEntry?.originalSize != null &&
        currentEntry?.processedSize != null &&
        currentEntry?.status === "completed" && (
          <div className="text-xs text-muted-foreground space-y-0.5">
            <p>
              {format(t.toolSettings["erase-object"].originalKb, {
                size: (currentEntry.originalSize / 1024).toFixed(1),
              })}
            </p>
            <p>
              {format(t.toolSettings["erase-object"].processedKb, {
                size: (currentEntry.processedSize / 1024).toFixed(1),
              })}
            </p>
          </div>
        )}

      {/* Process button */}
      {processing ? (
        <ProgressCard
          active={processing}
          phase={progressPhase === "idle" ? "uploading" : progressPhase}
          label={progressStage || t.toolSettings["erase-object"].progressLabel}
          percent={progressPercent}
          elapsed={elapsed}
        />
      ) : (
        <button
          type="button"
          data-testid="erase-object-submit"
          onClick={maskedFileCount > 1 ? handleProcessAll : handleProcess}
          disabled={!hasFile || (!hasStrokes && maskedFileCount === 0) || processing || needsHqPack}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {maskedFileCount > 1
            ? format(t.toolSettings["erase-object"].submitBatch, { count: maskedFileCount })
            : t.toolSettings["erase-object"].submit}
        </button>
      )}

      {/* Download */}
      {currentEntry?.processedUrl && (
        <ResultDownloadLink href={currentEntry.processedUrl} testId="erase-object-download" />
      )}
    </div>
  );
}
