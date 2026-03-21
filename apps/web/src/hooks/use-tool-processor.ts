import { useCallback } from "react";
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

  const processFiles = useCallback(
    async (files: File[], settings: Record<string, unknown>) => {
      if (files.length === 0) {
        setError("No files selected");
        return;
      }

      setProcessing(true);
      setError(null);
      setProcessedUrl(null);

      try {
        // Build multipart form with the file and settings
        const formData = new FormData();
        formData.append("file", files[0]);
        formData.append("settings", JSON.stringify(settings));

        const res = await fetch(`/api/v1/tools/${toolId}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${getToken()}` },
          body: formData,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            body.error || body.details || `Processing failed: ${res.status}`,
          );
        }

        const result: ProcessResult = await res.json();

        setJobId(result.jobId);
        setProcessedUrl(result.downloadUrl);
        setSizes(result.originalSize, result.processedSize);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Processing failed");
      } finally {
        setProcessing(false);
      }
    },
    [toolId, setProcessing, setError, setProcessedUrl, setSizes, setJobId],
  );

  return {
    processFiles,
    processing,
    error,
    downloadUrl: processedUrl,
    originalSize,
    processedSize,
  };
}
