import { ANALYTICS_EVENTS, apiToolPath, PYTHON_SIDECAR_TOOLS, TOOLS } from "@snapotter/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { formatHeaders, parseApiError } from "@/lib/api";
import { MULTI_FILE_TOOLS } from "@/lib/tool-display-modes";
import { generateId } from "@/lib/utils";
import { useFileStore } from "@/stores/file-store";

interface ProcessResult {
  jobId: string;
  downloadUrl: string;
  previewUrl?: string;
  originalSize: number;
  processedSize: number;
  savedFileId?: string;
  warning?: string;
}

export interface ToolProgress {
  phase: "idle" | "uploading" | "processing" | "complete";
  percent: number;
  stage?: string;
  elapsed: number;
}

const IDLE_PROGRESS: ToolProgress = {
  phase: "idle",
  percent: 0,
  elapsed: 0,
};

// AI tools return 202 and deliver results via SSE (not XHR response).
const AI_PYTHON_TOOLS = new Set<string>(PYTHON_SIDECAR_TOOLS);

// Tools that are not Python sidecar but still need an extended XHR timeout.
const LONG_RUNNING_TOOLS = new Set<string>(["content-aware-resize", "ai-canvas-expand"]);

const UPLOAD_WEIGHT = 15;
const SSE_STALL_TIMEOUT_MS = 300_000;

/** Extension to MIME type for batch ZIP blob construction. Falls back to undefined (generic). */
const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  ogv: "video/ogg",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
  m4a: "audio/mp4",
  aac: "audio/aac",
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
  xml: "application/xml",
  html: "text/html",
  zip: "application/zip",
};

export function useToolProcessor(toolId: string) {
  const { t } = useTranslation();
  const {
    processing,
    error,
    processedUrl,
    originalSize,
    processedSize,
    setProcessing,
    setError,
    setActiveJob,
  } = useFileStore();

  const [progress, setProgress] = useState<ToolProgress>(IDLE_PROGRESS);
  const [warning, setWarning] = useState<string | null>(null);
  // Extra fields the route spreads into the result envelope (e.g. histogram
  // bins, lqip dataUri, AI detection counts). Null until a job completes.
  const [resultPayload, setResultPayload] = useState<Record<string, unknown> | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeJobIdRef = useRef<string | null>(null);
  const asyncModeRef = useRef(false);
  // Save mode captured at run start (#495). Only "overwrite" re-anchors
  // serverFileId to the saved result, so "new" keeps deriving from the
  // original library file on re-runs.
  const saveModeRef = useRef<"new" | "overwrite">("new");

  const isAiTool = AI_PYTHON_TOOLS.has(toolId);
  const toolName = TOOLS.find((t) => t.id === toolId)?.name ?? toolId;

  const clearActiveJob = useCallback(() => {
    activeJobIdRef.current = null;
    setActiveJob(null, null);
  }, [setActiveJob]);

  const cancelCurrentJob = useCallback(async () => {
    const jobId = activeJobIdRef.current;
    if (!jobId) return;
    try {
      await fetch(`/api/v1/jobs/${jobId}/cancel`, {
        method: "POST",
        headers: formatHeaders(),
      });
    } catch {
      // Cancel request failed; SSE handler or stall timeout will clean up
    }
  }, []);

  const reconnectSSE = useCallback(() => {
    const jobId = activeJobIdRef.current;
    if (!jobId) return;
    if (eventSourceRef.current && eventSourceRef.current.readyState === EventSource.OPEN) {
      return;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    try {
      const es = new EventSource(`/api/v1/jobs/${jobId}/progress`);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "heartbeat") {
            if (asyncModeRef.current && stallTimerRef.current) {
              clearTimeout(stallTimerRef.current);
              stallTimerRef.current = setTimeout(() => {
                if (eventSourceRef.current) {
                  eventSourceRef.current.close();
                  eventSourceRef.current = null;
                }
                if (elapsedRef.current) clearInterval(elapsedRef.current);
                clearActiveJob();
                setError(
                  "Processing timed out after 5 minutes without an update from the server. Heavy tools run much slower on CPU than a GPU; try a smaller file, or retry if the connection dropped.",
                );
                setProcessing(false);
                setProgress(IDLE_PROGRESS);
              }, SSE_STALL_TIMEOUT_MS);
            }
            return;
          }
          if (data.type !== "single") return;

          if (asyncModeRef.current && stallTimerRef.current) {
            clearTimeout(stallTimerRef.current);
            stallTimerRef.current = setTimeout(() => {
              if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
              }
              if (elapsedRef.current) clearInterval(elapsedRef.current);
              clearActiveJob();
              setError(
                "Processing timed out after 5 minutes without an update from the server. Heavy tools run much slower on CPU than a GPU; try a smaller file, or retry if the connection dropped.",
              );
              setProcessing(false);
              setProgress(IDLE_PROGRESS);
            }, SSE_STALL_TIMEOUT_MS);
          }

          if (data.phase === "complete" && data.result) {
            if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
            if (elapsedRef.current) clearInterval(elapsedRef.current);
            es.close();
            eventSourceRef.current = null;
            clearActiveJob();

            const result = data.result as ProcessResult;
            setWarning(result.warning ?? null);
            setResultPayload(result as unknown as Record<string, unknown>);
            if (result.savedFileId) {
              useFileStore.getState().setLastSavedLibraryFileId(result.savedFileId);
            }
            const idx = useFileStore.getState().selectedIndex;
            useFileStore.getState().updateEntry(idx, {
              processedUrl: result.downloadUrl,
              processedPreviewUrl: result.previewUrl ?? null,
              processedFilename: null,
              status: "completed",
              originalSize: result.originalSize,
              processedSize: result.processedSize,
              ...(result.savedFileId && saveModeRef.current === "overwrite"
                ? { serverFileId: result.savedFileId }
                : {}),
            });
            setProcessing(false);
            setProgress(IDLE_PROGRESS);
            return;
          }

          if (data.phase === "failed") {
            if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
            if (elapsedRef.current) clearInterval(elapsedRef.current);
            es.close();
            eventSourceRef.current = null;
            clearActiveJob();
            setError(data.error || "Processing failed");
            setProcessing(false);
            setProgress(IDLE_PROGRESS);
            return;
          }

          if (typeof data.percent === "number") {
            const scaled = UPLOAD_WEIGHT + (data.percent / 100) * (100 - UPLOAD_WEIGHT);
            setProgress((prev) => ({
              ...prev,
              phase: "processing",
              percent: Math.max(prev.percent, scaled),
              stage: data.stage,
            }));
          }
        } catch {
          // Ignore malformed SSE
        }
      };

      es.onerror = () => {
        if (!asyncModeRef.current) {
          es.close();
          eventSourceRef.current = null;
        }
      };
    } catch {
      // EventSource creation failed
    }
  }, [clearActiveJob, setError, setProcessing]);

  // Reconnect SSE when tab becomes visible again (mobile tab recovery)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (!activeJobIdRef.current) return;
      if (eventSourceRef.current && eventSourceRef.current.readyState === EventSource.OPEN) {
        return;
      }
      setTimeout(() => reconnectSSE(), 500);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      if (eventSourceRef.current) eventSourceRef.current.close();
      if (xhrRef.current) xhrRef.current.abort();
      if (abortRef.current) abortRef.current.abort();
      if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
    };
  }, [reconnectSSE]);

  const processFiles = useCallback(
    (files: File[], settings: Record<string, unknown>, opts?: { skipLibrarySave?: boolean }) => {
      if (files.length === 0) {
        setError("No files selected");
        return;
      }

      import("@/lib/analytics").then(({ track }) => {
        track(ANALYTICS_EVENTS.TOOL_STARTED, {
          tool_id: toolId,
          is_batch: false,
          file_count: files.length,
        });
      });

      const capturedIndex = useFileStore.getState().selectedIndex;

      setError(null);
      setWarning(null);
      setResultPayload(null);
      useFileStore.getState().setLastSavedLibraryFileId(null);
      useFileStore.getState().updateEntry(capturedIndex, {
        processedUrl: null,
        processedPreviewUrl: null,
        processedFilename: null,
        status: "processing",
        error: null,
      });
      setProcessing(true);
      setProgress({ phase: "uploading", percent: 0, elapsed: 0 });

      const startTime = Date.now();
      elapsedRef.current = setInterval(() => {
        setProgress((prev) => ({
          ...prev,
          elapsed: Math.floor((Date.now() - startTime) / 1000),
        }));
      }, 1000);

      const clientJobId = generateId();
      activeJobIdRef.current = clientJobId;
      asyncModeRef.current = false;
      let asyncMode = false;

      const clearStallTimer = () => {
        if (stallTimerRef.current) {
          clearTimeout(stallTimerRef.current);
          stallTimerRef.current = null;
        }
      };

      const resetStallTimer = () => {
        clearStallTimer();
        stallTimerRef.current = setTimeout(() => {
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
          }
          if (elapsedRef.current) clearInterval(elapsedRef.current);
          clearActiveJob();
          useFileStore.getState().updateEntry(capturedIndex, {
            status: "failed",
            error: "Processing timed out",
          });
          setError(
            "Processing timed out after 5 minutes without an update from the server. Heavy tools run much slower on CPU than a GPU; try a smaller file, or retry if the connection dropped.",
          );
          setProcessing(false);
          setProgress(IDLE_PROGRESS);
        }, SSE_STALL_TIMEOUT_MS);
      };

      // Open SSE for real-time progress from the server (all tools)
      try {
        const es = new EventSource(`/api/v1/jobs/${clientJobId}/progress`);
        eventSourceRef.current = es;

        es.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "heartbeat") {
              if (asyncMode) resetStallTimer();
              return;
            }
            if (data.type !== "single") return;

            if (asyncMode) resetStallTimer();

            // AI tools deliver results via SSE (they return 202 from the XHR)
            if (data.phase === "complete" && data.result) {
              clearStallTimer();
              if (elapsedRef.current) clearInterval(elapsedRef.current);
              es.close();
              eventSourceRef.current = null;
              clearActiveJob();

              const result = data.result as ProcessResult;
              setWarning(result.warning ?? null);
              setResultPayload(result as unknown as Record<string, unknown>);
              if (result.savedFileId) {
                useFileStore.getState().setLastSavedLibraryFileId(result.savedFileId);
              }
              useFileStore.getState().updateEntry(capturedIndex, {
                processedUrl: result.downloadUrl,
                processedPreviewUrl: result.previewUrl ?? null,
                processedFilename: null,
                status: "completed",
                originalSize: result.originalSize,
                processedSize: result.processedSize,
                ...(result.savedFileId && saveModeRef.current === "overwrite"
                  ? { serverFileId: result.savedFileId }
                  : {}),
              });
              setProcessing(false);
              setProgress(IDLE_PROGRESS);
              return;
            }

            if (data.phase === "failed" && asyncMode) {
              clearStallTimer();
              if (elapsedRef.current) clearInterval(elapsedRef.current);
              es.close();
              eventSourceRef.current = null;
              clearActiveJob();
              setError(data.error || "Processing failed");
              setProcessing(false);
              setProgress(IDLE_PROGRESS);
              return;
            }

            if (typeof data.percent === "number") {
              const scaled = UPLOAD_WEIGHT + (data.percent / 100) * (100 - UPLOAD_WEIGHT);
              setProgress((prev) => ({
                ...prev,
                phase: "processing",
                percent: Math.max(prev.percent, scaled),
                stage: data.stage,
              }));
            }
          } catch {
            // Ignore malformed SSE
          }
        };

        es.onerror = () => {
          if (!asyncMode) {
            es.close();
            eventSourceRef.current = null;
          }
        };
      } catch {
        // EventSource creation failed -- proceed without SSE
      }

      // Build form data
      const cleanSettings = { ...settings };
      const bgImageFile = cleanSettings._bgImageFile as File | undefined;
      delete cleanSettings._bgImageFile;

      const formData = new FormData();
      if (MULTI_FILE_TOOLS.has(toolId) && files.length > 1) {
        for (const f of files) formData.append("file", f);
      } else {
        formData.append("file", files[capturedIndex] ?? files[0]);
      }
      formData.append("settings", JSON.stringify(cleanSettings));
      if (bgImageFile) {
        formData.append("backgroundImage", bgImageFile);
      }
      formData.append("clientJobId", clientJobId);

      const capturedEntry = useFileStore.getState().entries[capturedIndex];
      saveModeRef.current = useFileStore.getState().librarySaveMode;
      // skipLibrarySave lets a multi-phase tool suppress auto-saving an
      // intermediate output (e.g. remove-background's Phase 1 transparent
      // result) so the final phase owns the library save instead.
      if (!opts?.skipLibrarySave && capturedEntry?.serverFileId) {
        formData.append("fileId", capturedEntry.serverFileId);
        formData.append("saveMode", saveModeRef.current);
      }

      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;

      xhr.timeout = isAiTool || LONG_RUNNING_TOOLS.has(toolId) ? 600_000 : 120_000;

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const uploadPercent = (event.loaded / event.total) * UPLOAD_WEIGHT;
          setProgress((prev) => {
            if (prev.phase !== "uploading") return prev;
            return { ...prev, percent: uploadPercent };
          });
        }
      };

      xhr.upload.onload = () => {
        setProgress((prev) => ({
          ...prev,
          phase: "processing",
          percent: UPLOAD_WEIGHT,
          stage: "Processing...",
        }));
      };

      xhr.onload = () => {
        if (xhr.status === 202) {
          asyncMode = true;
          asyncModeRef.current = true;
          setActiveJob(clientJobId, cancelCurrentJob);
          resetStallTimer();
          return;
        }

        if (elapsedRef.current) clearInterval(elapsedRef.current);
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const result: ProcessResult = JSON.parse(xhr.responseText);
            setWarning(result.warning ?? null);
            setResultPayload(result as unknown as Record<string, unknown>);
            if (result.savedFileId) {
              useFileStore.getState().setLastSavedLibraryFileId(result.savedFileId);
            }
            useFileStore.getState().updateEntry(capturedIndex, {
              processedUrl: result.downloadUrl,
              processedPreviewUrl: result.previewUrl ?? null,
              processedFilename: null,
              status: "completed",
              originalSize: result.originalSize,
              processedSize: result.processedSize,
              ...(result.savedFileId && saveModeRef.current === "overwrite"
                ? { serverFileId: result.savedFileId }
                : {}),
            });
          } catch {
            setError("Invalid response from server");
          }
        } else {
          try {
            const body = JSON.parse(xhr.responseText);
            const parsed = parseApiError(body, xhr.status);
            if (typeof parsed === "object" && parsed.type === "feature_not_installed") {
              setError(
                `${toolName} requires the "${parsed.featureName}" feature. Enable it in Settings → AI Features.`,
              );
            } else {
              setError(parsed as string);
            }
          } catch {
            setError(`Processing failed: ${xhr.status}`);
          }
        }

        setProcessing(false);
        setProgress(IDLE_PROGRESS);
        clearActiveJob();
      };

      xhr.onerror = () => {
        clearStallTimer();
        if (elapsedRef.current) clearInterval(elapsedRef.current);
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        setError("Processing was interrupted. Retry when reconnected.");
        setProcessing(false);
        setProgress(IDLE_PROGRESS);
        clearActiveJob();
      };

      xhr.ontimeout = () => {
        clearStallTimer();
        if (elapsedRef.current) clearInterval(elapsedRef.current);
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        setError("Request timed out - the server may be overloaded. Try again.");
        setProcessing(false);
        setProgress(IDLE_PROGRESS);
        clearActiveJob();
      };

      xhr.open("POST", apiToolPath(toolId));
      formatHeaders().forEach((value, key) => {
        xhr.setRequestHeader(key, value);
      });
      xhr.send(formData);
    },
    [
      toolId,
      isAiTool,
      setProcessing,
      setError,
      setActiveJob,
      clearActiveJob,
      cancelCurrentJob,
      toolName,
    ],
  );

  const processAllFiles = useCallback(
    async (files: File[], settings: Record<string, unknown>) => {
      if (files.length === 0) {
        setError("No files selected");
        return;
      }

      import("@/lib/analytics").then(({ track }) => {
        track(ANALYTICS_EVENTS.TOOL_STARTED, {
          tool_id: toolId,
          is_batch: true,
          file_count: files.length,
        });
      });

      if (files.length === 1) {
        processFiles(files, settings);
        return;
      }

      // batch_processed fires once for the batch as a unit (distinct from the N
      // per-file tool_used events), so batch usage is separable from single runs.
      const trackBatch = (status: "completed" | "failed") =>
        void import("@/lib/analytics").then(({ track }) =>
          track(ANALYTICS_EVENTS.BATCH_PROCESSED, {
            tool_id: toolId,
            file_count: files.length,
            status,
          }),
        );

      const { updateEntry, setBatchZip } = useFileStore.getState();

      setError(null);
      // Batch runs never auto-save to the library (no fileId is sent), so a
      // previous single run's saved indicator must not survive into this one.
      useFileStore.getState().setLastSavedLibraryFileId(null);
      setProcessing(true);
      setProgress({ phase: "uploading", percent: 0, elapsed: 0 });

      const startTime = Date.now();
      elapsedRef.current = setInterval(() => {
        setProgress((prev) => ({ ...prev, elapsed: Math.floor((Date.now() - startTime) / 1000) }));
      }, 1000);

      const clientJobId = generateId();
      activeJobIdRef.current = clientJobId;

      // Open SSE before upload for real-time progress
      try {
        const es = new EventSource(`/api/v1/jobs/${clientJobId}/progress`);
        eventSourceRef.current = es;
        es.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "batch") {
              const pct =
                data.totalFiles > 0 ? 15 + (data.completedFiles / data.totalFiles) * 85 : 15;
              setProgress((prev) => ({
                ...prev,
                phase: "processing",
                percent: pct,
                stage: data.currentFile
                  ? `Processing ${data.currentFile} (${data.completedFiles}/${data.totalFiles})`
                  : `Processing ${data.completedFiles}/${data.totalFiles}`,
              }));
            }
          } catch {
            /* ignore malformed SSE */
          }
        };
        es.onerror = () => {
          es.close();
          eventSourceRef.current = null;
        };
      } catch {
        /* SSE failed, proceed without */
      }

      const formData = new FormData();
      for (const file of files) formData.append("file", file);
      formData.append("settings", JSON.stringify(settings));
      formData.append("clientJobId", clientJobId);

      try {
        abortRef.current = new AbortController();
        const response = await fetch(`${apiToolPath(toolId)}/batch`, {
          method: "POST",
          headers: formatHeaders(),
          body: formData,
          signal: abortRef.current.signal,
        });

        if (elapsedRef.current) clearInterval(elapsedRef.current);
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }

        if (!response.ok) {
          const text = await response.text();
          let errorMsg: string;
          try {
            const body = JSON.parse(text);
            const parsed = parseApiError(body, response.status);
            if (typeof parsed === "object" && parsed.type === "feature_not_installed") {
              errorMsg = `${toolName} requires the "${parsed.featureName}" feature. Enable it in Settings → AI Features.`;
            } else {
              errorMsg = parsed as string;
            }
          } catch {
            errorMsg = `Batch processing failed: ${response.status}`;
          }
          setError(errorMsg);
          setProcessing(false);
          setProgress(IDLE_PROGRESS);
          trackBatch("failed");
          return;
        }

        const zipBlob = await response.blob();
        setBatchZip(zipBlob, `batch-${toolId}.zip`);

        // Extract files from ZIP using fflate
        const { unzipSync } = await import("fflate");
        const zipBuffer = new Uint8Array((await zipBlob.arrayBuffer()) as ArrayBuffer);
        const extracted = unzipSync(zipBuffer);

        const entries = useFileStore.getState().entries;
        let fileResults: Record<string, string> = {};
        try {
          fileResults = JSON.parse(
            decodeURIComponent(response.headers.get("X-File-Results") ?? "%7B%7D"),
          );
        } catch {
          // Malformed header - fall back to empty mapping, all entries marked failed
        }

        for (let i = 0; i < entries.length; i++) {
          const processedName = fileResults[String(i)];
          if (processedName && extracted[processedName]) {
            const ext = processedName.split(".").pop()?.toLowerCase() ?? "";
            const blobType = MIME_BY_EXT[ext];
            const blob = new Blob(
              [extracted[processedName] as BlobPart],
              blobType ? { type: blobType } : undefined,
            );
            updateEntry(i, {
              processedUrl: URL.createObjectURL(blob),
              processedFilename: processedName,
              processedSize: blob.size,
              status: "completed",
              error: null,
            });
          } else {
            updateEntry(i, { status: "failed", error: "File not found in batch results" });
          }
        }

        setProcessing(false);
        setProgress(IDLE_PROGRESS);
        clearActiveJob();
        trackBatch("completed");
      } catch (err) {
        if (elapsedRef.current) clearInterval(elapsedRef.current);
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        setError(err instanceof Error ? err.message : "Batch processing failed");
        setProcessing(false);
        setProgress(IDLE_PROGRESS);
        clearActiveJob();
        trackBatch("failed");
      }
    },
    [toolId, processFiles, setProcessing, setError, clearActiveJob, toolName],
  );

  return {
    processFiles,
    processAllFiles,
    cancelCurrentJob,
    processing,
    error: error === "Canceled" ? t.tools.processing.canceled : error,
    warning,
    downloadUrl: processedUrl,
    originalSize,
    processedSize,
    progress,
    resultPayload,
  };
}
