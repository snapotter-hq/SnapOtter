import { ANALYTICS_EVENTS, apiToolPath, PYTHON_SIDECAR_TOOLS, TOOLS } from "@snapotter/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { track } from "@/lib/analytics";
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

interface BatchProgressFrame {
  status: "processing" | "completed" | "failed";
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  errors?: Array<{ filename: string; error: string }>;
  currentFile?: string;
  /** Terminal frames carry the durable batch result (#750). */
  result?: Record<string, unknown>;
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
  // Whether any single- or batch-type SSE frame arrived for the current run:
  // proof the job reached the server, consulted when a dead POST degrades
  // (#722, #750).
  const sawJobEvidenceRef = useRef(false);
  // Installed by processAllFiles so the SSE handler can settle a degraded
  // batch run from its terminal frame (#750) and the cancel path can record
  // intent or settle a run the server never saw (#767). Null outside batch
  // runs. cancelLocally reports whether it acted: a stale closure from an
  // already-settled run refuses, and the caller must fall through to the
  // single-run settle instead of treating the cancel as handled.
  const batchRunRef = useRef<{
    onTerminal: (frame: BatchProgressFrame) => void;
    markCanceled: () => void;
    cancelLocally: () => boolean;
  } | null>(null);

  const isAiTool = AI_PYTHON_TOOLS.has(toolId);
  const toolName = TOOLS.find((t) => t.id === toolId)?.name ?? toolId;

  // Operator-visible record of a sync wait falling back to the async path:
  // the fallback masks the network failure from the user by design, so this
  // event is the only signal a reverse proxy is killing sync waits (#750).
  const trackDegrade = useCallback(
    (trigger: "socket" | "timeout" | "http-502" | "http-504", isBatch: boolean) => {
      track(ANALYTICS_EVENTS.TOOL_RUN_DEGRADED, {
        tool_id: toolId,
        is_batch: isBatch,
        trigger,
        had_evidence: sawJobEvidenceRef.current,
      });
    },
    [toolId],
  );

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
      // This teardown ends whatever run armed it; a batch closure left
      // behind would swallow a later run's cancel-404 settle (#767).
      batchRunRef.current = null;
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
      // Record intent only once the server acknowledged the cancel: a failed
      // or refused POST must not repaint the run's real outcome as canceled
      // (#767). The ack always precedes the terminal frame (the finalize
      // still has children to drain), so labeling cannot race it.
      if (res.ok) {
        const body = (await res.json().catch(() => null)) as { canceled?: boolean } | null;
        if (body?.canceled === true && activeJobIdRef.current === jobId) {
          batchRunRef.current?.markCanceled();
        }
      }
      // 404 means no job exists server-side (possible in the degraded #722
      // state when the request tail never arrived). Nothing will ever emit a
      // frame, so settle locally as canceled instead of blaming the network
      // 30 seconds later.
      if (res.status === 404 && activeJobIdRef.current === jobId) {
        // A batch upload may still be in flight; its settle path also has to
        // abort the XHR and tear down the run's own state (#767). A refusal
        // means the closure belongs to an earlier run: fall through and
        // settle the live run the single-run way.
        if (batchRunRef.current?.cancelLocally()) return;
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
            if (data.type === "batch") {
              // Any batch frame proves the batch reached the server (#750).
              sawJobEvidenceRef.current = true;
              clearJobEvidenceTimer();
              if (asyncModeRef.current) resetStallTimer();

              const frame = data as BatchProgressFrame;
              if (frame.status !== "completed" && frame.status !== "failed") {
                const pct =
                  frame.totalFiles > 0
                    ? UPLOAD_WEIGHT +
                      (frame.completedFiles / frame.totalFiles) * (100 - UPLOAD_WEIGHT)
                    : UPLOAD_WEIGHT;
                setProgress((prev) => ({
                  ...prev,
                  phase: "processing",
                  percent: pct,
                  stage: frame.currentFile
                    ? `Processing ${frame.currentFile} (${frame.completedFiles}/${frame.totalFiles})`
                    : `Processing ${frame.completedFiles}/${frame.totalFiles}`,
                }));
                return;
              }
              // In sync mode the XHR response owns settling: the terminal
              // frame always precedes the streamed ZIP, so acting on it here
              // would settle the run twice.
              if (!asyncModeRef.current) return;
              clearStallTimer();
              es.close();
              eventSourceRef.current = null;
              xhrRef.current?.abort();
              const run = batchRunRef.current;
              if (run) {
                run.onTerminal(frame);
              } else {
                // Unreachable by construction (async mode implies a batch run
                // installed the handler); if the invariant ever breaks, fail
                // visibly instead of leaving the run in silent limbo.
                clearJobEvidenceTimer();
                if (elapsedRef.current) clearInterval(elapsedRef.current);
                clearActiveJob();
                setError("Processing was interrupted. Retry when reconnected.");
                setProcessing(false);
                setProgress(IDLE_PROGRESS);
              }
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
      const degradeToAsync = (trigger: "socket" | "timeout" | "http-502" | "http-504") => {
        if (!uploadedFully || activeJobIdRef.current !== clientJobId) return false;
        asyncModeRef.current = true;
        trackDegrade(trigger, false);
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

      // A real failure must settle the entry the kickoff reset to
      // "processing": the tool page derives the pulse from
      // status === "processing" and gates the failure screen on
      // status === "failed", so an unsettled entry pulses on the untouched
      // original forever (#799, the single-file twin of #798's failRun).
      const failEntry = (message: string) => {
        if (useFileStore.getState().entries[capturedIndex]?.status === "processing") {
          useFileStore.getState().updateEntry(capturedIndex, {
            status: "failed",
            error: message,
          });
        }
      };

      xhr.onload = () => {
        if (xhr.status === 202) {
          asyncModeRef.current = true;
          setActiveJob(clientJobId, cancelCurrentJob);
          resetStallTimer();
          return;
        }

        // A 502/504 whose body is not JSON is an intermediary answering for
        // a dead sync wait, not the app: app-emitted 5xx always carries a
        // JSON error body (html-to-image's own 504 stays precise below).
        // Post-upload the job is live server-side, so degrade instead of
        // erroring (#750).
        if (xhr.status === 502 || xhr.status === 504) {
          let appSpoke = true;
          try {
            JSON.parse(xhr.responseText);
          } catch {
            appSpoke = false;
          }
          if (!appSpoke && degradeToAsync(xhr.status === 502 ? "http-502" : "http-504")) {
            return;
          }
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
          let message: string;
          try {
            const body = JSON.parse(xhr.responseText);
            const parsed = parseApiError(body, xhr.status);
            if (typeof parsed === "object" && parsed.type === "feature_not_installed") {
              message = `${toolName} requires the "${parsed.featureName}" feature. Enable it in Settings → AI Features.`;
            } else {
              message = parsed as string;
            }
          } catch {
            message = `Processing failed: ${xhr.status}`;
          }
          setError(message);
          failEntry(message);
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
        if (degradeToAsync("socket")) return;
        clearStallTimer();
        if (elapsedRef.current) clearInterval(elapsedRef.current);
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        const message = "Processing was interrupted. Retry when reconnected.";
        setError(message);
        failEntry(message);
        setProcessing(false);
        setProgress(IDLE_PROGRESS);
        clearActiveJob();
      };

      xhr.ontimeout = () => {
        if (activeJobIdRef.current !== clientJobId) return;
        if (degradeToAsync("timeout")) return;
        clearStallTimer();
        if (elapsedRef.current) clearInterval(elapsedRef.current);
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        const message = "Request timed out - the server may be overloaded. Try again.";
        setError(message);
        failEntry(message);
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
      trackDegrade,
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
      const trackBatch = (status: "completed" | "failed" | "canceled") =>
        void import("@/lib/analytics").then(({ track }) =>
          track(ANALYTICS_EVENTS.BATCH_PROCESSED, {
            tool_id: toolId,
            file_count: files.length,
            status,
          }),
        );

      // Set on the user's cancel click; drives outcome labeling and the
      // batch_processed status. The server keeps its own truth in the row
      // status; this flag only shapes what this client shows (#767).
      let canceledByUser = false;

      const { updateEntry, setBatchZip } = useFileStore.getState();

      setError(null);
      // Batch runs never auto-save to the library (no fileId is sent), so a
      // previous single run's saved indicator must not survive into this one.
      useFileStore.getState().setLastSavedLibraryFileId(null);
      // Mirror the single-file reset: clear every entry's stale processed state
      // before this run uploads, so a failed or absent result can't render a
      // previous run's output under the new run's filename and size (#746).
      // Revoke stale result blob URLs so they don't leak.
      const priorEntries = useFileStore.getState().entries;
      for (let i = 0; i < priorEntries.length; i++) {
        const staleUrl = priorEntries[i]?.processedUrl;
        if (staleUrl?.startsWith("blob:")) URL.revokeObjectURL(staleUrl);
        updateEntry(i, {
          processedUrl: null,
          processedPreviewUrl: null,
          processedFilename: null,
          processedSize: null,
          status: "processing",
          error: null,
        });
      }
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
      activeEntryIndexRef.current = null;
      asyncModeRef.current = false;
      // The cancel button lives behind the store's activeJob handle. Batch
      // runs arm it for the whole run, sync wait included: since #750 the
      // HTTP response is only an observer, so without this the only exit
      // from a long unwanted batch was closing the tab, which stopped
      // nothing server-side (#767).
      setActiveJob(clientJobId, cancelCurrentJob);

      // Tear down the run without touching the outcome state; callers set
      // the result or error first.
      const finishRun = () => {
        clearJobEvidenceTimer();
        clearStallTimer();
        if (elapsedRef.current) clearInterval(elapsedRef.current);
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        batchRunRef.current = null;
        clearActiveJob();
        setProcessing(false);
        setProgress(IDLE_PROGRESS);
      };

      const failRun = (message: string) => {
        // Entries were set to "processing" at kickoff (the reset loop above). A
        // whole-run failure that never reached settleFromZip must settle them,
        // or the result pane keeps pulsing on the stale original because the
        // entry never leaves "processing" (#746).
        const runEntries = useFileStore.getState().entries;
        for (let i = 0; i < runEntries.length; i++) {
          if (runEntries[i]?.status === "processing") {
            updateEntry(i, { status: "failed", error: message });
          }
        }
        setError(message);
        finishRun();
        trackBatch(canceledByUser ? "canceled" : "failed");
      };

      const settleFromZip = async (zipBlob: Blob, fileResults: Record<string, string>) => {
        setBatchZip(zipBlob, `batch-${toolId}.zip`);

        // Extract files from ZIP using fflate
        const { unzipSync } = await import("fflate");
        const zipBuffer = new Uint8Array((await zipBlob.arrayBuffer()) as ArrayBuffer);
        const extracted = unzipSync(zipBuffer);

        const entries = useFileStore.getState().entries;
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
              // Batch results come from the ZIP, not a server preview; clear any
              // stale processedPreviewUrl so an earlier single run's preview
              // can't win over this result (displayUrl prefers it) (#746).
              processedPreviewUrl: null,
              status: "completed",
              error: null,
            });
          } else {
            // After a user cancel, a missing result is the cancel doing its
            // job, not a lookup failure.
            updateEntry(i, {
              // Clear the result so hasProcessed goes false and the failure
              // screen (guarded by !hasProcessed) renders instead of a stale
              // previous result (#746).
              processedUrl: null,
              processedPreviewUrl: null,
              status: "failed",
              error: canceledByUser ? "Canceled" : "File not found in batch results",
            });
          }
        }

        finishRun();
        trackBatch(canceledByUser ? "canceled" : "completed");
      };

      // A degraded run settles here: download the durable ZIP the terminal
      // frame points at. Retried, because the reason we are on this path is
      // that the network just proved flaky.
      const downloadAndSettle = async (result: Record<string, unknown>) => {
        const url = String(result.downloadUrl);
        const fileResults = (result.fileResults ?? {}) as Record<string, string>;
        for (let attempt = 0; attempt < 3; attempt++) {
          if (activeJobIdRef.current !== clientJobId) return;
          try {
            const res = await fetch(url, { headers: formatHeaders() });
            // A 4xx is deterministic: the result is gone or this session may
            // not read it. Retrying cannot help, and the message must not
            // blame the network.
            if (res.status >= 400 && res.status < 500) {
              if (activeJobIdRef.current !== clientJobId) return;
              failRun(
                res.status === 404
                  ? "Completed result is no longer available. Run the job again."
                  : "The finished batch could not be downloaded. Refresh and try again.",
              );
              return;
            }
            if (!res.ok) throw new Error(`Batch download failed: ${res.status}`);
            const blob = await res.blob();
            if (activeJobIdRef.current !== clientJobId) return;
            await settleFromZip(blob, fileResults);
            return;
          } catch {
            if (attempt < 2) {
              await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 2_000 : 5_000));
            }
          }
        }
        if (activeJobIdRef.current !== clientJobId) return;
        failRun("Processing was interrupted. Retry when reconnected.");
      };

      batchRunRef.current = {
        markCanceled: () => {
          canceledByUser = true;
        },
        cancelLocally: () => {
          if (activeJobIdRef.current !== clientJobId) return false;
          canceledByUser = true;
          // The upload may still be in flight; aborting it is what actually
          // stops ingress when no job row exists server-side yet.
          xhrRef.current?.abort();
          failRun("Canceled");
          return true;
        },
        onTerminal: (frame) => {
          if (activeJobIdRef.current !== clientJobId) return;
          if (
            frame.status === "completed" &&
            frame.result &&
            typeof frame.result.downloadUrl === "string"
          ) {
            void downloadAndSettle(frame.result);
            return;
          }
          if (frame.status === "completed") {
            // A batch route without a durable result (custom sub-routes like
            // pdf-to-image): its ZIP only ever existed on the response this
            // run lost, so the outcome matches a plain interruption.
            failRun("Processing was interrupted. Retry when reconnected.");
            return;
          }
          // Replay-synthesized failures carry their message in a blank-name
          // errors entry (packaging failure, expired result).
          const syntheticError = frame.errors?.find((e) => e.filename === "")?.error;
          failRun(
            syntheticError ??
              (frame.totalFiles > 0 && frame.failedFiles >= frame.totalFiles
                ? "All files failed processing"
                : "Batch processing failed"),
          );
        },
      };

      // Open SSE before the upload. The unified handler in reconnectSSE also
      // gives batch runs the visibility-change recovery path.
      reconnectSSE(true);

      const formData = new FormData();
      for (const file of files) formData.append("file", file);
      formData.append("settings", JSON.stringify(settings));
      formData.append("clientJobId", clientJobId);

      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      xhr.responseType = "blob";
      // Batches legitimately hold the sync response for many minutes; the
      // stall and evidence timers own liveness, not a wall-clock cap.
      xhr.timeout = 0;

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

      // Same shape as the single-run degrade (#722): a dead response after a
      // finished upload does not mean a dead batch. The flow keeps running
      // server-side and the terminal SSE frame carries the durable ZIP's
      // download URL, so the run can settle without the HTTP response (#750).
      const degradeToAsync = (trigger: "socket" | "timeout" | "http-502" | "http-504") => {
        if (!uploadedFully || activeJobIdRef.current !== clientJobId) return false;
        asyncModeRef.current = true;
        trackDegrade(trigger, true);
        reconnectSSE(true);
        resetStallTimer();
        if (!sawJobEvidenceRef.current) {
          startJobEvidenceTimer();
        }
        return true;
      };

      xhr.onload = () => {
        if (activeJobIdRef.current !== clientJobId) return;

        if (xhr.status === 202) {
          // The server's sync wait expired while the batch keeps running;
          // ride the SSE to the terminal frame like any degraded run. Force
          // a fresh source: a sync-mode SSE error during the long wait nulls
          // the ref, and the replay-on-connect recovers anything missed.
          asyncModeRef.current = true;
          reconnectSSE(true);
          resetStallTimer();
          return;
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          let fileResults: Record<string, string> = {};
          try {
            fileResults = JSON.parse(
              decodeURIComponent(xhr.getResponseHeader("X-File-Results") ?? "%7B%7D"),
            );
          } catch {
            // Malformed header - fall back to empty mapping, all entries marked failed
          }
          const zipBlob = xhr.response as Blob;
          void (async () => {
            try {
              if (activeJobIdRef.current !== clientJobId) return;
              await settleFromZip(zipBlob, fileResults);
            } catch {
              if (activeJobIdRef.current !== clientJobId) return;
              failRun("Batch processing failed");
            }
          })();
          return;
        }

        void (async () => {
          let text = "";
          try {
            text = await (xhr.response instanceof Blob
              ? xhr.response.text()
              : Promise.resolve(String(xhr.response ?? "")));
          } catch {
            // Unreadable body; fall through to the status-based handling.
          }
          if (activeJobIdRef.current !== clientJobId) return;
          let errorMsg: string;
          let serverCanceled = false;
          try {
            const body = JSON.parse(text);
            // The route marks a fully canceled batch structurally; only that
            // settles as a cancellation. A real failure after a cancel click
            // (the cancel lost the race, a 500) keeps its own message
            // instead of being repainted as "Canceled".
            serverCanceled = (body as { canceled?: boolean } | null)?.canceled === true;
            const parsed = parseApiError(body, xhr.status);
            if (typeof parsed === "object" && parsed.type === "feature_not_installed") {
              errorMsg = `${toolName} requires the "${parsed.featureName}" feature. Enable it in Settings → AI Features.`;
            } else {
              errorMsg = parsed as string;
            }
          } catch {
            // An unparseable 502/504 body is an intermediary answering for a
            // dead sync wait, not the app (app 5xx always carries JSON).
            if (
              (xhr.status === 502 || xhr.status === 504) &&
              degradeToAsync(xhr.status === 502 ? "http-502" : "http-504")
            ) {
              return;
            }
            errorMsg = `Batch processing failed: ${xhr.status}`;
          }
          // "Canceled" (not the route's message) so the existing i18n
          // mapping renders it localized.
          failRun(serverCanceled ? "Canceled" : errorMsg);
        })();
      };

      xhr.onerror = () => {
        // Settled runs and successor runs must not be touched by late socket
        // events (#722 run-identity guard).
        if (activeJobIdRef.current !== clientJobId) return;
        if (degradeToAsync("socket")) return;
        failRun("Processing was interrupted. Retry when reconnected.");
      };

      xhr.ontimeout = () => {
        if (activeJobIdRef.current !== clientJobId) return;
        if (degradeToAsync("timeout")) return;
        failRun("Request timed out - the server may be overloaded. Try again.");
      };

      xhr.open("POST", `${apiToolPath(toolId)}/batch`);
      formatHeaders().forEach((value, key) => {
        xhr.setRequestHeader(key, value);
      });
      xhr.send(formData);
    },
    [
      toolId,
      processFiles,
      setProcessing,
      setError,
      setActiveJob,
      cancelCurrentJob,
      clearActiveJob,
      clearJobEvidenceTimer,
      clearStallTimer,
      reconnectSSE,
      resetStallTimer,
      startJobEvidenceTimer,
      trackDegrade,
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
