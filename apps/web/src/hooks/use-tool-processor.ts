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
// After degrading a dead POST to the async path (#722), how long to wait for
// any SSE frame proving the job reached the server. Only armed when no frame
// arrived before the degrade; the progress route replays live queued and
// processing rows on connect, so a silent 30s on a fresh SSE means the
// request tail never arrived and no job exists.
const JOB_EVIDENCE_TIMEOUT_MS = 30_000;

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
  const activeEntryIndexRef = useRef<number | null>(null);
  const asyncModeRef = useRef(false);
  const reconnectSSERef = useRef<(force?: boolean) => void>(() => {});
  // Save mode captured at run start (#495). Only "overwrite" re-anchors
  // serverFileId to the saved result, so "new" keeps deriving from the
  // original library file on re-runs.
  const saveModeRef = useRef<"new" | "overwrite">("new");
  const jobEvidenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Whether any single-type SSE frame arrived for the current run: proof the
  // job reached the server, consulted when a dead POST degrades (#722).
  const sawJobEvidenceRef = useRef(false);

  const isAiTool = AI_PYTHON_TOOLS.has(toolId);
  const toolName = TOOLS.find((t) => t.id === toolId)?.name ?? toolId;

  const clearActiveJob = useCallback(() => {
    activeJobIdRef.current = null;
    activeEntryIndexRef.current = null;
    setActiveJob(null, null);
  }, [setActiveJob]);

  const clearStallTimer = useCallback(() => {
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  }, []);

  const resetStallTimer = useCallback(() => {
    clearStallTimer();
    stallTimerRef.current = setTimeout(() => {
      stallTimerRef.current = null;
      if (!activeJobIdRef.current || !asyncModeRef.current) return;
      reconnectSSERef.current(true);
    }, SSE_STALL_TIMEOUT_MS);
  }, [clearStallTimer]);

  const clearJobEvidenceTimer = useCallback(() => {
    if (jobEvidenceTimerRef.current) {
      clearTimeout(jobEvidenceTimerRef.current);
      jobEvidenceTimerRef.current = null;
    }
  }, []);

  // Armed only when a dead POST degrades to the async path (#722): heartbeats
  // alone must not keep the client in "processing" forever for a job the
  // server never received.
  const startJobEvidenceTimer = useCallback(() => {
    clearJobEvidenceTimer();
    jobEvidenceTimerRef.current = setTimeout(() => {
      jobEvidenceTimerRef.current = null;
      if (!activeJobIdRef.current) return;
      clearStallTimer();
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      clearActiveJob();
      setError(
        "Processing was interrupted and the server never confirmed the job. Retry when reconnected.",
      );
      setProcessing(false);
      setProgress(IDLE_PROGRESS);
    }, JOB_EVIDENCE_TIMEOUT_MS);
  }, [clearJobEvidenceTimer, clearStallTimer, clearActiveJob, setError, setProcessing]);

  const cancelCurrentJob = useCallback(async () => {
    const jobId = activeJobIdRef.current;
    if (!jobId) return;
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}/cancel`, {
        method: "POST",
        headers: formatHeaders(),
      });
      // 404 means no job exists server-side (possible in the degraded #722
      // state when the request tail never arrived). Nothing will ever emit a
      // frame, so settle locally as canceled instead of blaming the network
      // 30 seconds later.
      if (res.status === 404 && activeJobIdRef.current === jobId) {
        clearJobEvidenceTimer();
        clearStallTimer();
        if (elapsedRef.current) clearInterval(elapsedRef.current);
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        clearActiveJob();
        setError("Canceled");
        setProcessing(false);
        setProgress(IDLE_PROGRESS);
      }
    } catch {
      // Cancel request failed; SSE handler will clean up
    }
  }, [clearJobEvidenceTimer, clearStallTimer, clearActiveJob, setError, setProcessing]);

  const reconnectSSE = useCallback(
    (force = false) => {
      const jobId = activeJobIdRef.current;
      if (!jobId) return;
      if (
        !force &&
        eventSourceRef.current &&
        eventSourceRef.current.readyState === EventSource.OPEN
      ) {
        return;
      }

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      try {
        const es = new EventSource(`/api/v1/jobs/${jobId}/progress`);
        eventSourceRef.current = es;
        if (asyncModeRef.current) resetStallTimer();

        es.onmessage = (event) => {
          if (eventSourceRef.current !== es) return;
          try {
            const data = JSON.parse(event.data);
            if (data.type === "heartbeat") {
              if (asyncModeRef.current) resetStallTimer();
              return;
            }
            if (data.type !== "single") return;

            // Any single frame proves the job reached the server (#722).
            sawJobEvidenceRef.current = true;
            clearJobEvidenceTimer();
            if (asyncModeRef.current) resetStallTimer();

            if (data.phase === "complete" && data.result) {
              clearStallTimer();
              if (elapsedRef.current) clearInterval(elapsedRef.current);
              es.close();
              eventSourceRef.current = null;
              // The SSE settles the run; a still-open sync POST (half-dead
              // proxy, no RST) must not fire a late onerror/ontimeout over
              // this result. abort() only emits onabort, which stays silent.
              xhrRef.current?.abort();
              const idx = activeEntryIndexRef.current ?? useFileStore.getState().selectedIndex;

              const result = data.result as ProcessResult;
              setWarning(result.warning ?? null);
              setResultPayload(result as unknown as Record<string, unknown>);
              if (result.savedFileId) {
                useFileStore.getState().setLastSavedLibraryFileId(result.savedFileId);
              }
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
              clearActiveJob();
              setProcessing(false);
              setProgress(IDLE_PROGRESS);
              return;
            }

            if (data.phase === "failed") {
              clearStallTimer();
              if (elapsedRef.current) clearInterval(elapsedRef.current);
              es.close();
              eventSourceRef.current = null;
              // Settle the still-open POST so its late onerror/ontimeout
              // cannot replace this specific error with a generic one.
              xhrRef.current?.abort();
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
            if (eventSourceRef.current === es) {
              eventSourceRef.current = null;
            }
          }
        };
      } catch {
        // EventSource creation failed
      }
    },
    [
      clearActiveJob,
      clearStallTimer,
      clearJobEvidenceTimer,
      resetStallTimer,
      setError,
      setProcessing,
    ],
  );

  useEffect(() => {
    reconnectSSERef.current = reconnectSSE;
  }, [reconnectSSE]);

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
      if (jobEvidenceTimerRef.current) clearTimeout(jobEvidenceTimerRef.current);
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
      // A stale evidence timer from a previous degraded run must not fire
      // into this run, and evidence never carries across runs (#722).
      clearJobEvidenceTimer();
      sawJobEvidenceRef.current = false;

      const startTime = Date.now();
      elapsedRef.current = setInterval(() => {
        setProgress((prev) => ({
          ...prev,
          elapsed: Math.floor((Date.now() - startTime) / 1000),
        }));
      }, 1000);

      const clientJobId = generateId();
      activeJobIdRef.current = clientJobId;
      activeEntryIndexRef.current = capturedIndex;
      asyncModeRef.current = false;

      // Open SSE for real-time progress from the server (all tools)
      reconnectSSE(true);

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

      let uploadedFully = false;
      xhr.upload.onload = () => {
        uploadedFully = true;
        setProgress((prev) => ({
          ...prev,
          phase: "processing",
          percent: UPLOAD_WEIGHT,
          stage: "Processing...",
        }));
      };

      // The POST socket died or timed out after the whole body left the
      // browser: the job is running server-side under clientJobId (the sync
      // wait is only an observer; BullMQ does not care about this socket) and
      // SSE still delivers its result. Degrade to the async path exactly as a
      // 202 would, instead of abandoning a live job (#722). A proxy idle
      // timeout on the sync wait otherwise reproduces the failure on every
      // retry while every "failed" job actually completes.
      const degradeToAsync = () => {
        if (!uploadedFully || activeJobIdRef.current !== clientJobId) return false;
        asyncModeRef.current = true;
        setActiveJob(clientJobId, cancelCurrentJob);
        // Force a fresh SSE: the event that got us here says the network
        // path just died, and a half-open source keeps readyState OPEN while
        // delivering nothing. The server replays terminal state and live
        // queued/processing rows on connect, so the swap loses nothing.
        reconnectSSE(true);
        resetStallTimer();
        // Heartbeats alone must not hold "processing" forever if the request
        // tail never reached the server. A frame seen before the degrade
        // already proves the job exists; queued jobs can then stay silent
        // far longer than any timeout we could pick here.
        if (!sawJobEvidenceRef.current) {
          startJobEvidenceTimer();
        }
        return true;
      };

      xhr.onload = () => {
        if (xhr.status === 202) {
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
        // This run already settled (SSE delivered its terminal frame) or a
        // newer run took over: a late socket event must neither error a
        // finished result nor tear down the successor's state.
        if (activeJobIdRef.current !== clientJobId) return;
        if (degradeToAsync()) return;
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
        if (activeJobIdRef.current !== clientJobId) return;
        if (degradeToAsync()) return;
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
      clearStallTimer,
      reconnectSSE,
      resetStallTimer,
      clearJobEvidenceTimer,
      startJobEvidenceTimer,
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
      // A stale evidence timer from a previous degraded run must not fire
      // into this run, and evidence never carries across runs (#722).
      clearJobEvidenceTimer();
      sawJobEvidenceRef.current = false;

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
    [
      toolId,
      processFiles,
      setProcessing,
      setError,
      clearActiveJob,
      clearJobEvidenceTimer,
      toolName,
    ],
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
