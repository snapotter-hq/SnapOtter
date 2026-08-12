import { ANALYTICS_EVENTS } from "@snapotter/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { formatHeaders, parseApiError } from "@/lib/api";
import { generateId } from "@/lib/utils";
import { useFileStore } from "@/stores/file-store";
import type { PipelineStep } from "@/stores/pipeline-store";

interface ProcessResult {
  jobId: string;
  downloadUrl: string;
  previewUrl?: string;
  originalSize: number;
  processedSize: number;
  savedFileId?: string;
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

export interface PipelineProgress {
  phase: "idle" | "uploading" | "processing" | "complete";
  percent: number;
  stage?: string;
  elapsed: number;
}

const IDLE_PROGRESS: PipelineProgress = {
  phase: "idle",
  percent: 0,
  elapsed: 0,
};

const UPLOAD_WEIGHT = 15;
const SSE_STALL_TIMEOUT_MS = 300_000;
// After degrading a dead POST to the async path, how long to wait for any SSE
// frame proving the flow reached the server. Only armed when no frame arrived
// before the degrade; the progress route replays live rows on connect (#722),
// so a silent 30s on a fresh SSE means the request tail never arrived.
const JOB_EVIDENCE_TIMEOUT_MS = 30_000;

/**
 * Pipeline twin of use-tool-processor's #722/#750 recovery machinery. A dead
 * response after the upload finished does not mean a dead flow: the terminal
 * SSE frame settles the run instead (the single frame carries the pipeline
 * result; the batch frame carries the durable ZIP's download URL).
 */
export function usePipelineProcessor() {
  const { processing, error, processedUrl, originalSize, processedSize, setProcessing, setError } =
    useFileStore();

  const [progress, setProgress] = useState<PipelineProgress>(IDLE_PROGRESS);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jobEvidenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeJobIdRef = useRef<string | null>(null);
  const activeEntryIndexRef = useRef<number | null>(null);
  const asyncModeRef = useRef(false);
  const sawJobEvidenceRef = useRef(false);
  // Installed by processAll so the SSE handler can settle a degraded batch
  // run from its terminal frame. Null outside batch runs.
  const batchRunRef = useRef<{ onTerminal: (frame: BatchProgressFrame) => void } | null>(null);
  const reconnectSSERef = useRef<(force?: boolean) => void>(() => {});

  // Operator-visible record of a sync wait falling back to the async path
  // (#750). Static import: the analytics module is light (posthog-js loads
  // lazily inside it).
  const trackDegrade = useCallback(
    (trigger: "socket" | "timeout" | "http-502" | "http-504", isBatch: boolean) => {
      track(ANALYTICS_EVENTS.TOOL_RUN_DEGRADED, {
        tool_id: "pipeline",
        is_batch: isBatch,
        trigger,
        had_evidence: sawJobEvidenceRef.current,
      });
    },
    [],
  );

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
      activeJobIdRef.current = null;
      batchRunRef.current = null;
      setError(
        "Processing was interrupted and the server never confirmed the job. Retry when reconnected.",
      );
      setProcessing(false);
      setProgress(IDLE_PROGRESS);
    }, JOB_EVIDENCE_TIMEOUT_MS);
  }, [clearJobEvidenceTimer, clearStallTimer, setError, setProcessing]);

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
              // Any batch frame proves the flow reached the server.
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
              // frame always precedes the streamed ZIP.
              if (!asyncModeRef.current) return;
              clearStallTimer();
              es.close();
              eventSourceRef.current = null;
              xhrRef.current?.abort();
              const run = batchRunRef.current;
              if (run) {
                run.onTerminal(frame);
              } else {
                // Unreachable by construction; fail visibly instead of
                // leaving the run in silent limbo.
                clearJobEvidenceTimer();
                if (elapsedRef.current) clearInterval(elapsedRef.current);
                activeJobIdRef.current = null;
                setError("Processing was interrupted. Retry when reconnected.");
                setProcessing(false);
                setProgress(IDLE_PROGRESS);
              }
              return;
            }
            if (data.type !== "single") return;

            // Any single frame proves the flow reached the server.
            sawJobEvidenceRef.current = true;
            clearJobEvidenceTimer();
            if (asyncModeRef.current) resetStallTimer();

            if (data.phase === "complete" && data.result) {
              clearStallTimer();
              if (elapsedRef.current) clearInterval(elapsedRef.current);
              es.close();
              eventSourceRef.current = null;
              // The SSE settles the run; a still-open sync POST must not
              // fire a late onerror/ontimeout over this result.
              xhrRef.current?.abort();
              const idx = activeEntryIndexRef.current ?? useFileStore.getState().selectedIndex;

              const result = data.result as ProcessResult;
              useFileStore.getState().updateEntry(idx, {
                processedUrl: result.downloadUrl,
                processedPreviewUrl: result.previewUrl ?? null,
                processedFilename: null,
                status: "completed",
                originalSize: result.originalSize,
                processedSize: result.processedSize,
                ...(result.savedFileId ? { serverFileId: result.savedFileId } : {}),
              });
              activeJobIdRef.current = null;
              activeEntryIndexRef.current = null;
              batchRunRef.current = null;
              setProcessing(false);
              setProgress(IDLE_PROGRESS);
              return;
            }

            if (data.phase === "failed") {
              clearStallTimer();
              if (elapsedRef.current) clearInterval(elapsedRef.current);
              es.close();
              eventSourceRef.current = null;
              xhrRef.current?.abort();
              activeJobIdRef.current = null;
              activeEntryIndexRef.current = null;
              batchRunRef.current = null;
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
    [clearStallTimer, clearJobEvidenceTimer, resetStallTimer, setError, setProcessing],
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
      setTimeout(() => reconnectSSERef.current(), 500);
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
  }, []);

  const processSingle = useCallback(
    (file: File, steps: PipelineStep[]) => {
      const capturedIndex = useFileStore.getState().selectedIndex;

      setError(null);
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
      // into this run, and evidence never carries across runs.
      clearJobEvidenceTimer();
      sawJobEvidenceRef.current = false;
      asyncModeRef.current = false;
      batchRunRef.current = null;

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

      // Open SSE for real-time progress from the server
      reconnectSSE(true);

      const pipeline = {
        steps: steps.map((s) => ({ toolId: s.toolId, settings: s.settings })),
      };

      const formData = new FormData();
      formData.append("file", file);
      formData.append("pipeline", JSON.stringify(pipeline));
      formData.append("clientJobId", clientJobId);

      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;

      // The server holds this response for up to its 10-minute sync wait and
      // then answers 202; a client wall-clock cap would always fire first,
      // turning every legitimately long pipeline into a spurious degrade.
      // Liveness is owned by the SSE settle plus the evidence and stall
      // timers.
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

      // A dead response after a finished upload does not mean a dead flow:
      // the pipeline keeps running under clientJobId and the terminal single
      // frame carries the full result (#766, mirroring #722).
      const degradeToAsync = (trigger: "socket" | "timeout" | "http-502" | "http-504") => {
        if (!uploadedFully || activeJobIdRef.current !== clientJobId) return false;
        asyncModeRef.current = true;
        trackDegrade(trigger, false);
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
          // The server's sync wait expired while the flow keeps running;
          // ride the SSE to the terminal frame. Force a fresh source: a
          // sync-mode SSE error during the wait nulls the ref.
          asyncModeRef.current = true;
          reconnectSSE(true);
          resetStallTimer();
          return;
        }

        // An unparseable 502/504 body is an intermediary answering for a
        // dead sync wait, not the app (app 5xx always carries JSON).
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
            useFileStore.getState().updateEntry(capturedIndex, {
              processedUrl: result.downloadUrl,
              processedPreviewUrl: result.previewUrl ?? null,
              processedFilename: null,
              status: "completed",
              originalSize: result.originalSize,
              processedSize: result.processedSize,
              ...(result.savedFileId ? { serverFileId: result.savedFileId } : {}),
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
                `The "${parsed.featureName}" feature is not installed. Enable it in Settings → AI Features.`,
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
        activeJobIdRef.current = null;
        activeEntryIndexRef.current = null;
      };

      xhr.onerror = () => {
        // Settled runs and successor runs must not be touched by late socket
        // events (#722 run-identity guard).
        if (activeJobIdRef.current !== clientJobId) return;
        if (degradeToAsync("socket")) return;
        clearStallTimer();
        if (elapsedRef.current) clearInterval(elapsedRef.current);
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        setError("Processing was interrupted. Retry when reconnected.");
        setProcessing(false);
        setProgress(IDLE_PROGRESS);
        activeJobIdRef.current = null;
        activeEntryIndexRef.current = null;
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
        setError("Request timed out - the server may be overloaded. Try again.");
        setProcessing(false);
        setProgress(IDLE_PROGRESS);
        activeJobIdRef.current = null;
        activeEntryIndexRef.current = null;
      };

      xhr.open("POST", "/api/v1/pipeline/execute");
      formatHeaders().forEach((value, key) => {
        xhr.setRequestHeader(key, value);
      });
      xhr.send(formData);
    },
    [
      setProcessing,
      setError,
      clearJobEvidenceTimer,
      clearStallTimer,
      reconnectSSE,
      resetStallTimer,
      startJobEvidenceTimer,
      trackDegrade,
    ],
  );

  const processAll = useCallback(
    async (files: File[], steps: PipelineStep[]) => {
      if (files.length === 0) {
        setError("No files selected");
        return;
      }
      if (files.length === 1) {
        processSingle(files[0], steps);
        return;
      }

      const { updateEntry, setBatchZip } = useFileStore.getState();

      setError(null);
      setProcessing(true);
      setProgress({ phase: "uploading", percent: 0, elapsed: 0 });
      clearJobEvidenceTimer();
      sawJobEvidenceRef.current = false;
      asyncModeRef.current = false;

      const startTime = Date.now();
      elapsedRef.current = setInterval(() => {
        setProgress((prev) => ({ ...prev, elapsed: Math.floor((Date.now() - startTime) / 1000) }));
      }, 1000);

      const clientJobId = generateId();
      activeJobIdRef.current = clientJobId;
      activeEntryIndexRef.current = null;

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
        activeJobIdRef.current = null;
        setProcessing(false);
        setProgress(IDLE_PROGRESS);
      };

      const failRun = (message: string) => {
        setError(message);
        finishRun();
      };

      const settleFromZip = async (zipBlob: Blob, fileResults: Record<string, string>) => {
        setBatchZip(zipBlob, "batch-pipeline.zip");

        // Extract files from ZIP using fflate
        const { unzipSync } = await import("fflate");
        const zipBuffer = new Uint8Array((await zipBlob.arrayBuffer()) as ArrayBuffer);
        const extracted = unzipSync(zipBuffer);

        const entries = useFileStore.getState().entries;
        for (let i = 0; i < entries.length; i++) {
          const processedName = fileResults[String(i)];
          if (processedName && extracted[processedName]) {
            const blob = new Blob([extracted[processedName] as BlobPart]);
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

        finishRun();
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
            // A 4xx is deterministic: retrying cannot help, and the message
            // must not blame the network.
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
            // No durable result to recover from: the ZIP only ever existed
            // on the response this run lost.
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

      // Open SSE before the upload; the unified handler also gives batch
      // runs the visibility-change recovery path.
      reconnectSSE(true);

      const pipeline = {
        steps: steps.map((s) => ({ toolId: s.toolId, settings: s.settings })),
      };

      const formData = new FormData();
      for (const file of files) formData.append("file", file);
      formData.append("pipeline", JSON.stringify(pipeline));
      formData.append("clientJobId", clientJobId);

      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      xhr.responseType = "blob";
      // Pipeline batches legitimately hold the sync response for many
      // minutes; the stall and evidence timers own liveness.
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
          try {
            const body = JSON.parse(text);
            if (body.errors && Array.isArray(body.errors) && body.errors.length > 0) {
              // Show the first file's step-level error (all files typically fail at the same step)
              const first = body.errors[0];
              errorMsg = first.error;
              if (body.errors.length > 1) {
                errorMsg += ` (${body.errors.length} files failed)`;
              }
            } else {
              const parsed = parseApiError(body, xhr.status);
              if (typeof parsed === "object" && parsed.type === "feature_not_installed") {
                errorMsg = `The "${parsed.featureName}" feature is not installed. Enable it in Settings → AI Features.`;
              } else {
                errorMsg = parsed as string;
              }
            }
          } catch {
            // An unparseable 502/504 body is an intermediary answering for a
            // dead sync wait, not the app.
            if (
              (xhr.status === 502 || xhr.status === 504) &&
              degradeToAsync(xhr.status === 502 ? "http-502" : "http-504")
            ) {
              return;
            }
            errorMsg = `Batch processing failed: ${xhr.status}`;
          }
          failRun(errorMsg);
        })();
      };

      xhr.onerror = () => {
        if (activeJobIdRef.current !== clientJobId) return;
        if (degradeToAsync("socket")) return;
        failRun("Processing was interrupted. Retry when reconnected.");
      };

      xhr.ontimeout = () => {
        if (activeJobIdRef.current !== clientJobId) return;
        if (degradeToAsync("timeout")) return;
        failRun("Request timed out - the server may be overloaded. Try again.");
      };

      xhr.open("POST", "/api/v1/pipeline/batch");
      formatHeaders().forEach((value, key) => {
        xhr.setRequestHeader(key, value);
      });
      xhr.send(formData);
    },
    [
      processSingle,
      setProcessing,
      setError,
      clearJobEvidenceTimer,
      clearStallTimer,
      reconnectSSE,
      resetStallTimer,
      startJobEvidenceTimer,
      trackDegrade,
    ],
  );

  return {
    processSingle,
    processAll,
    processing,
    error,
    downloadUrl: processedUrl,
    originalSize,
    processedSize,
    progress,
  };
}
