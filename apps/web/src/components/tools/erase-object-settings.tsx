import { Download, Lasso, Loader2, Paintbrush, Redo, Sparkles, Trash2, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useAuth } from "@/hooks/use-auth";
import { formatHeaders } from "@/lib/api";
import { format, formatFileSize } from "@/lib/format";
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
  onFailed: (error: string) => void;
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
      es = new EventSource(`/api/v1/jobs/${clientJobId}/progress`);
    } catch {
      return;
    }
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "heartbeat") {
          resetStall();
          return;
        }
        if (data.type !== "single") return;
        resetStall();
        if (data.phase === "complete" && data.result) {
          cleanup();
          handlers.onComplete(data.result as Record<string, unknown>);
          return;
        }
        if (data.phase === "failed") {
          cleanup();
          handlers.onFailed(typeof data.error === "string" ? data.error : "Processing failed");
          return;
        }
        if (typeof data.percent === "number") handlers.onProgress?.(data.percent);
      } catch {
        // Ignore malformed SSE frames
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
        onFailed: (err) => reject(new Error(err)),
        onStall: () =>
          reject(new Error("Processing timed out. The result may have saved -- check your files.")),
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
          try {
            applyResult(JSON.parse(xhr.responseText));
            resolve();
          } catch {
            reject(new Error("Invalid response"));
          }
        } else {
          try {
            const body = JSON.parse(xhr.responseText);
            reject(
              new Error(
                typeof body.error === "string"
                  ? body.error
                  : typeof body.details === "string"
                    ? body.details
                    : `Failed: ${xhr.status}`,
              ),
            );
          } catch {
            reject(new Error(`Processing failed: ${xhr.status}`));
          }
        }
      };
      xhr.onerror = () => {
        stopProgress();
        reject(new Error("Network error"));
      };
      xhr.ontimeout = () => {
        stopProgress();
        reject(new Error("Request timed out"));
      };
      xhr.open("POST", "/api/v1/tools/image/erase-object");
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
      onFailed: (err) => {
        progressCleanupRef.current = null;
        setError(err);
        finishUi();
      },
      onStall: () => {
        progressCleanupRef.current = null;
        setError(
          "Processing timed out with no progress. The result may have saved to your files -- otherwise, try again.",
        );
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
        try {
          applyResult(JSON.parse(xhr.responseText));
        } catch {
          setError("Invalid response");
        }
      } else {
        try {
          const body = JSON.parse(xhr.responseText);
          setError(
            typeof body.error === "string"
              ? body.error
              : typeof body.details === "string"
                ? body.details
                : `Failed: ${xhr.status}`,
          );
        } catch {
          setError(`Processing failed: ${xhr.status}`);
        }
      }
      finishUi();
    };
    xhr.onerror = () => {
      stopProgress();
      progressCleanupRef.current = null;
      setError("Network error");
      finishUi();
    };
    xhr.ontimeout = () => {
      stopProgress();
      progressCleanupRef.current = null;
      setError("Request timed out - the server may be overloaded. Try again.");
      finishUi();
    };
    xhr.open("POST", "/api/v1/tools/image/erase-object");
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
      setProgressStage(`Erasing ${wi + 1}/${work.length}`);

      useFileStore.getState().updateEntry(index, { status: "processing", error: null });

      try {
        await processOneFile(index, file, maskBlob, (pct) => {
          setProgressPercent(basePercent + (pct / 100) * sliceWeight);
        });
      } catch (err) {
        useFileStore.getState().updateEntry(index, {
          status: "failed",
          error: err instanceof Error ? err.message : "Processing failed",
        });
      }
    }

    if (elapsedRef.current) clearInterval(elapsedRef.current);
    setProcessing(false);
    setProgressPhase("idle");
    setProgressStage(null);
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
                      name: hqBundle?.name ?? "High-Quality Inpainting",
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
            Undo
          </button>
          <button
            type="button"
            onClick={() => eraserRef.current?.clear()}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-muted text-muted-foreground hover:bg-primary/10 text-xs"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </button>
        </div>
      )}

      {/* Output Format */}
      <div>
        <label htmlFor="eraser-format" className="text-xs text-muted-foreground">
          Output Format
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
              Quality
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
            <p>Original: {(currentEntry.originalSize / 1024).toFixed(1)} KB</p>
            <p>Processed: {(currentEntry.processedSize / 1024).toFixed(1)} KB</p>
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
        <a
          href={currentEntry.processedUrl}
          download
          data-testid="erase-object-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary-ink font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      )}
    </div>
  );
}
