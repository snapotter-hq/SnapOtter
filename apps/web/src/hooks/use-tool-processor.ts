import { useCallback, useState, useRef, useEffect } from "react";
import { useFileStore } from "@/stores/file-store";

function getToken(): string {
  return localStorage.getItem("stirling-token") || "";
}

interface ProcessResult {
  jobId: string;
  downloadUrl: string;
  originalSize: number;
  processedSize: number;
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
const AI_PYTHON_TOOLS = new Set([
  "remove-background", "upscale", "blur-faces", "erase-object", "ocr",
]);

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

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
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
      const clientJobId = crypto.randomUUID();

      // For AI tools, open SSE before uploading
      if (isAiTool) {
        try {
          const es = new EventSource(
            `/api/v1/jobs/${clientJobId}/progress`,
          );
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

      // Use XHR for upload progress tracking
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;

      // For AI tools: upload = 0-15%, processing = 15-100% (continuous, no reset)
      // For fast tools: upload = 0-100%, processing = brief 100% hold
      const UPLOAD_WEIGHT = isAiTool ? 15 : 100;

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
      };

      xhr.onload = () => {
        if (elapsedRef.current) clearInterval(elapsedRef.current);
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
          } catch {
            setError("Invalid response from server");
          }
        } else {
          try {
            const body = JSON.parse(xhr.responseText);
            setError(body.error || body.details || `Processing failed: ${xhr.status}`);
          } catch {
            setError(`Processing failed: ${xhr.status}`);
          }
        }

        setProcessing(false);
        setProgress(IDLE_PROGRESS);
      };

      xhr.onerror = () => {
        if (elapsedRef.current) clearInterval(elapsedRef.current);
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        setError("Network error — check your connection");
        setProcessing(false);
        setProgress(IDLE_PROGRESS);
      };

      xhr.open("POST", `/api/v1/tools/${toolId}`);
      const token = getToken();
      if (token) {
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      }
      xhr.send(formData);
    },
    [toolId, isAiTool, setProcessing, setError, setProcessedUrl, setSizes, setJobId],
  );

  return {
    processFiles,
    processing,
    error,
    downloadUrl: processedUrl,
    originalSize,
    processedSize,
    progress,
  };
}
