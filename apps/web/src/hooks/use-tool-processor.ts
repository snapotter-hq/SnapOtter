import { PYTHON_SIDECAR_TOOLS } from "@stirling-image/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatHeaders } from "@/lib/api";
import { generateId } from "@/lib/utils";
import { useFileStore } from "@/stores/file-store";

interface ProcessResult {
  jobId: string;
  downloadUrl: string;
  originalSize: number;
  processedSize: number;
  savedFileId?: string;
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

// AI tools that go through Python/bridge.ts and can emit SSE progress.
// smart-crop is category "ai" but uses Sharp (no Python), so it's excluded.
const AI_PYTHON_TOOLS = new Set<string>(PYTHON_SIDECAR_TOOLS);

// Tools that take a few seconds (not instant like Sharp, not minutes like AI).
// Uses a smoother progress: upload 0-40%, then a gradual fill during processing.
const MEDIUM_TOOLS = new Set(["content-aware-resize"]);

export function useToolProcessor(toolId: string) {
  const {
    processing,
    error,
    processedUrl,
    originalSize,
    processedSize,
    setProcessing,
    setError,
    setProcessedUrl,
    setSizes,
    setJobId,
  } = useFileStore();

  const [progress, setProgress] = useState<ToolProgress>(IDLE_PROGRESS);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const isAiTool = AI_PYTHON_TOOLS.has(toolId);
  const isMediumTool = MEDIUM_TOOLS.has(toolId);
  const processingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      if (processingTimerRef.current) clearInterval(processingTimerRef.current);
      if (eventSourceRef.current) eventSourceRef.current.close();
      if (xhrRef.current) xhrRef.current.abort();
    };
  }, []);

  const processFiles = useCallback(
    (files: File[], settings: Record<string, unknown>) => {
      if (files.length === 0) {
        setError("No files selected");
        return;
      }

      setError(null);
      setProcessedUrl(null);
      setProcessing(true);
      setProgress({ phase: "uploading", percent: 0, elapsed: 0 });

      // Start elapsed timer
      const startTime = Date.now();
      elapsedRef.current = setInterval(() => {
        setProgress((prev) => ({
          ...prev,
          elapsed: Math.floor((Date.now() - startTime) / 1000),
        }));
      }, 1000);

      // Generate client job ID for SSE correlation
      const clientJobId = generateId();

      // For AI tools, open SSE before uploading
      if (isAiTool) {
        try {
          const es = new EventSource(`/api/v1/jobs/${clientJobId}/progress`);
          eventSourceRef.current = es;

          es.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              if (data.type === "single" && typeof data.percent === "number") {
                // Scale server progress (0-100) into 15-100 range
                const scaled = 15 + (data.percent / 100) * 85;
                setProgress((prev) => ({
                  ...prev,
                  phase: "processing",
                  percent: scaled,
                  stage: data.stage,
                }));
              }
            } catch {
              // Ignore malformed SSE
            }
          };

          es.onerror = () => {
            es.close();
            eventSourceRef.current = null;
          };
        } catch {
          // EventSource creation failed — proceed without SSE
        }
      }

      // Build form data
      const formData = new FormData();
      formData.append("file", files[0]);
      formData.append("settings", JSON.stringify(settings));
      if (isAiTool) {
        formData.append("clientJobId", clientJobId);
      }

      // If this file came from the Files page, include its ID for version tracking
      const currentEntry = useFileStore.getState().currentEntry;
      if (currentEntry?.serverFileId) {
        formData.append("fileId", currentEntry.serverFileId);
      }

      // Use XHR for upload progress tracking
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;

      // Timeout: 60s for fast/medium tools, 5 min for AI tools
      xhr.timeout = isAiTool ? 300_000 : 60_000;

      // For AI tools: upload = 0-15%, processing = 15-100% (SSE-driven)
      // For medium tools: upload = 0-40%, processing = 40-95% (gradual fill)
      // For fast tools: upload = 0-100%, processing = brief 100% hold
      const UPLOAD_WEIGHT = isAiTool ? 15 : isMediumTool ? 40 : 100;

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
          stage: isAiTool ? "Starting..." : "Processing...",
        }));

        // Medium tools: gradually fill from upload weight to 95% over ~15s
        if (isMediumTool) {
          const start = UPLOAD_WEIGHT;
          const target = 95;
          const step = (target - start) / 30; // 30 ticks over ~15s
          processingTimerRef.current = setInterval(() => {
            setProgress((prev) => {
              if (prev.phase !== "processing") return prev;
              const next = Math.min(target, prev.percent + step);
              return { ...prev, percent: next };
            });
          }, 500);
        }
      };

      xhr.onload = () => {
        if (elapsedRef.current) clearInterval(elapsedRef.current);
        if (processingTimerRef.current) clearInterval(processingTimerRef.current);
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const result: ProcessResult = JSON.parse(xhr.responseText);
            setJobId(result.jobId);
            setProcessedUrl(result.downloadUrl);
            setSizes(result.originalSize, result.processedSize);
            // Update serverFileId if a new version was saved
            if (result.savedFileId) {
              const state = useFileStore.getState();
              if (state.entries[state.selectedIndex]) {
                state.updateEntry(state.selectedIndex, { serverFileId: result.savedFileId });
              }
            }
          } catch {
            setError("Invalid response from server");
          }
        } else {
          try {
            const body = JSON.parse(xhr.responseText);
            const msg = body.details
              ? `${body.error}: ${body.details}`
              : body.error || `Processing failed: ${xhr.status}`;
            setError(msg);
          } catch {
            setError(`Processing failed: ${xhr.status}`);
          }
        }

        setProcessing(false);
        setProgress(IDLE_PROGRESS);
      };

      xhr.onerror = () => {
        if (elapsedRef.current) clearInterval(elapsedRef.current);
        if (processingTimerRef.current) clearInterval(processingTimerRef.current);
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        setError("Network error - check your connection");
        setProcessing(false);
        setProgress(IDLE_PROGRESS);
      };

      xhr.ontimeout = () => {
        if (elapsedRef.current) clearInterval(elapsedRef.current);
        if (processingTimerRef.current) clearInterval(processingTimerRef.current);
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        setError("Request timed out - the server may be overloaded. Try again.");
        setProcessing(false);
        setProgress(IDLE_PROGRESS);
      };

      xhr.open("POST", `/api/v1/tools/${toolId}`);
      formatHeaders().forEach((value, key) => {
        xhr.setRequestHeader(key, value);
      });
      xhr.send(formData);
    },
    [toolId, isAiTool, isMediumTool, setProcessing, setError, setProcessedUrl, setSizes, setJobId],
  );

  const processAllFiles = useCallback(
    async (files: File[], settings: Record<string, unknown>) => {
      if (files.length === 0) {
        setError("No files selected");
        return;
      }
      if (files.length === 1) {
        processFiles(files, settings);
        return;
      }

      const { updateEntry, setBatchZip } = useFileStore.getState();

      setError(null);
      setProcessing(true);
      setProgress({ phase: "uploading", percent: 0, elapsed: 0 });

      const startTime = Date.now();
      elapsedRef.current = setInterval(() => {
        setProgress((prev) => ({ ...prev, elapsed: Math.floor((Date.now() - startTime) / 1000) }));
      }, 1000);

      const clientJobId = generateId();

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
        const response = await fetch(`/api/v1/tools/${toolId}/batch`, {
          method: "POST",
          headers: formatHeaders(),
          body: formData,
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
            errorMsg = body.details
              ? `${body.error}: ${body.details}`
              : body.error || `Batch processing failed: ${response.status}`;
          } catch {
            errorMsg = `Batch processing failed: ${response.status}`;
          }
          setError(errorMsg);
          setProcessing(false);
          setProgress(IDLE_PROGRESS);
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
          fileResults = JSON.parse(response.headers.get("X-File-Results") ?? "{}");
        } catch {
          // Malformed header - fall back to empty mapping, all entries marked failed
        }

        for (let i = 0; i < entries.length; i++) {
          const processedName = fileResults[String(i)];
          if (processedName && extracted[processedName]) {
            const blob = new Blob([extracted[processedName] as BlobPart]);
            updateEntry(i, {
              processedUrl: URL.createObjectURL(blob),
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
      } catch (err) {
        if (elapsedRef.current) clearInterval(elapsedRef.current);
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        setError(err instanceof Error ? err.message : "Batch processing failed");
        setProcessing(false);
        setProgress(IDLE_PROGRESS);
      }
    },
    [toolId, processFiles, setProcessing, setError],
  );

  return {
    processFiles,
    processAllFiles,
    processing,
    error,
    downloadUrl: processedUrl,
    originalSize,
    processedSize,
    progress,
  };
}
