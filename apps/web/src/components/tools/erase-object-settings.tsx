import { useState, useRef } from "react";
import { useFileStore } from "@/stores/file-store";
import { ProgressCard } from "@/components/common/progress-card";
import { Download, Upload } from "lucide-react";

function getToken(): string {
  return localStorage.getItem("stirling-token") || "";
}

export function EraseObjectSettings() {
  const { files, processing, error, setProcessing, setError } = useFileStore();

  const [maskFile, setMaskFile] = useState<File | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [originalSize, setOriginalSize] = useState<number | null>(null);
  const [processedSize, setProcessedSize] = useState<number | null>(null);
  const [progressPhase, setProgressPhase] = useState<"idle" | "uploading" | "processing">("idle");
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressStage, setProgressStage] = useState<string | undefined>();
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleMaskSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) setMaskFile(selected);
  };

  const handleProcess = async () => {
    if (files.length === 0 || !maskFile) return;

    setError(null);
    setDownloadUrl(null);
    setProcessing(true);
    setProgressPhase("uploading");
    setProgressPercent(0);
    setProgressStage(undefined);
    setElapsed(0);

    const startTime = Date.now();
    elapsedRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    const clientJobId = crypto.randomUUID();

    // Open SSE for server-side progress
    const es = new EventSource(`/api/v1/jobs/${clientJobId}/progress`);
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "single" && typeof data.percent === "number") {
          setProgressPhase("processing");
          setProgressPercent(15 + (data.percent / 100) * 85);
          setProgressStage(data.stage);
        }
      } catch {}
    };
    es.onerror = () => es.close();

    const formData = new FormData();
    formData.append("file", files[0]);
    formData.append("mask", maskFile);
    formData.append("clientJobId", clientJobId);

    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setProgressPercent((e.loaded / e.total) * 15);
      }
    };
    xhr.upload.onload = () => {
      setProgressPhase("processing");
      setProgressPercent(15);
      setProgressStage("Starting...");
    };
    xhr.onload = () => {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      es.close();
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          setDownloadUrl(data.downloadUrl);
          setOriginalSize(data.originalSize);
          setProcessedSize(data.processedSize);
        } catch {
          setError("Invalid response");
        }
      } else {
        try {
          const body = JSON.parse(xhr.responseText);
          setError(body.error || body.details || `Failed: ${xhr.status}`);
        } catch {
          setError(`Processing failed: ${xhr.status}`);
        }
      }
      setProcessing(false);
      setProgressPhase("idle");
    };
    xhr.onerror = () => {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      es.close();
      setError("Network error");
      setProcessing(false);
      setProgressPhase("idle");
    };
    xhr.open("POST", "/api/v1/tools/erase-object");
    xhr.setRequestHeader("Authorization", `Bearer ${getToken()}`);
    xhr.send(formData);
  };

  const hasFile = files.length > 0;

  return (
    <div className="space-y-4">
      {/* Mask upload */}
      <div>
        <label className="text-sm font-medium text-muted-foreground">Mask Image</label>
        <p className="text-[10px] text-muted-foreground mt-0.5 mb-1.5">
          Upload a black &amp; white mask where white areas will be erased. Create the mask in any image editor.
        </p>
        <label className="flex items-center gap-2 px-3 py-2 rounded border border-dashed border-border cursor-pointer hover:border-primary">
          <Upload className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {maskFile ? maskFile.name : "Select mask image..."}
          </span>
          <input
            type="file"
            accept="image/*"
            onChange={handleMaskSelect}
            className="hidden"
          />
        </label>
      </div>

      {/* Info */}
      <div className="p-2 rounded bg-muted text-[10px] text-muted-foreground space-y-1">
        <p>How to create a mask:</p>
        <ol className="list-decimal list-inside space-y-0.5">
          <li>Open your image in any editor</li>
          <li>Paint white over areas to erase</li>
          <li>Keep the rest black</li>
          <li>Export as PNG and upload here</li>
        </ol>
      </div>

      {/* Error */}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Size info */}
      {originalSize != null && processedSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>Original: {(originalSize / 1024).toFixed(1)} KB</p>
          <p>Processed: {(processedSize / 1024).toFixed(1)} KB</p>
        </div>
      )}

      {/* Process button */}
      {processing ? (
        <ProgressCard
          active={processing}
          phase={progressPhase === "idle" ? "uploading" : progressPhase}
          label="Erasing object"
          stage={progressStage}
          percent={progressPercent}
          elapsed={elapsed}
        />
      ) : (
        <button
          onClick={handleProcess}
          disabled={!hasFile || !maskFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          Erase Object
        </button>
      )}

      {/* Download */}
      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      )}
    </div>
  );
}
