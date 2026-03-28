import { Download, Redo, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useFileStore } from "@/stores/file-store";
import type { EraserCanvasRef } from "./eraser-canvas";

function getToken(): string {
  return localStorage.getItem("stirling-token") || "";
}

interface EraseObjectSettingsProps {
  eraserRef: React.RefObject<EraserCanvasRef | null>;
  hasStrokes: boolean;
  brushSize: number;
  onBrushSizeChange: (size: number) => void;
}

export function EraseObjectSettings({
  eraserRef,
  hasStrokes,
  brushSize,
  onBrushSizeChange: setBrushSize,
}: EraseObjectSettingsProps) {
  const { files, processing, error, setProcessing, setError, setProcessedUrl, setSizes } =
    useFileStore();
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [originalSize, setOriginalSize] = useState<number | null>(null);
  const [processedSize, setProcessedSize] = useState<number | null>(null);
  const [progressPhase, setProgressPhase] = useState<"idle" | "uploading" | "processing">("idle");
  const [progressPercent, setProgressPercent] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleProcess = async () => {
    if (files.length === 0 || !eraserRef.current) return;

    const maskBlob = await eraserRef.current.exportMask();
    if (!maskBlob) return;

    setError(null);
    setDownloadUrl(null);
    setProcessing(true);
    setProgressPhase("uploading");
    setProgressPercent(0);
    setElapsed(0);

    const startTime = Date.now();
    elapsedRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    const clientJobId = crypto.randomUUID();

    const es = new EventSource(`/api/v1/jobs/${clientJobId}/progress`);
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "single" && typeof data.percent === "number") {
          setProgressPhase("processing");
          setProgressPercent(15 + (data.percent / 100) * 85);
        }
      } catch {}
    };
    es.onerror = () => es.close();

    const maskFile = new File([maskBlob], "mask.png", { type: "image/png" });

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
          setProcessedUrl(data.downloadUrl);
          setSizes(data.originalSize, data.processedSize);
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
      {/* Brush size */}
      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="eraser-brush-size" className="text-xs text-muted-foreground">
            Brush Size
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
          <span>Fine</span>
          <span>Wide</span>
        </div>
      </div>

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

      {/* Hint */}
      {hasFile && !hasStrokes && (
        <p className="text-[10px] text-muted-foreground">
          Paint over the objects you want to remove on the image.
        </p>
      )}

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
          percent={progressPercent}
          elapsed={elapsed}
        />
      ) : (
        <button
          type="button"
          data-testid="erase-object-submit"
          onClick={handleProcess}
          disabled={!hasFile || !hasStrokes || processing}
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
          data-testid="erase-object-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      )}
    </div>
  );
}
