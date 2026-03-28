import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { useFileStore } from "@/stores/file-store";

function getToken(): string {
  return localStorage.getItem("stirling-token") || "";
}

export function VectorizeSettings() {
  const { files, processing, error, setProcessing, setError, setProcessedUrl, setSizes, setJobId } =
    useFileStore();
  const [colorMode, setColorMode] = useState<"bw" | "color">("bw");
  const [threshold, setThreshold] = useState(128);
  const [detail, setDetail] = useState<"low" | "medium" | "high">("medium");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [originalSize, setOriginalSize] = useState<number | null>(null);
  const [processedSize, setProcessedSize] = useState<number | null>(null);

  const handleProcess = async () => {
    if (files.length === 0) return;

    setProcessing(true);
    setError(null);
    setDownloadUrl(null);

    try {
      const formData = new FormData();
      formData.append("file", files[0]);
      formData.append("settings", JSON.stringify({ colorMode, threshold, detail }));

      const res = await fetch("/api/v1/tools/vectorize", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed: ${res.status}`);
      }

      const result = await res.json();
      setJobId(result.jobId);
      setProcessedUrl(result.downloadUrl);
      setDownloadUrl(result.downloadUrl);
      setOriginalSize(result.originalSize);
      setProcessedSize(result.processedSize);
      setSizes(result.originalSize, result.processedSize);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vectorization failed");
    } finally {
      setProcessing(false);
    }
  };

  const hasFile = files.length > 0;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-muted-foreground">Color Mode</p>
        <div className="flex gap-1 mt-1">
          <button
            type="button"
            onClick={() => setColorMode("bw")}
            className={`flex-1 text-xs py-1.5 rounded ${colorMode === "bw" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            Black & White
          </button>
          <button
            type="button"
            onClick={() => setColorMode("color")}
            className={`flex-1 text-xs py-1.5 rounded ${colorMode === "color" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            Color
          </button>
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="vectorize-threshold" className="text-xs text-muted-foreground">
            Threshold
          </label>
          <span className="text-xs font-mono text-foreground">{threshold}</span>
        </div>
        <input
          id="vectorize-threshold"
          type="range"
          min={0}
          max={255}
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      <div>
        <label htmlFor="vectorize-detail" className="text-xs text-muted-foreground">
          Detail Level
        </label>
        <select
          id="vectorize-detail"
          value={detail}
          onChange={(e) => setDetail(e.target.value as "low" | "medium" | "high")}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="low">Low (simpler, smaller SVG)</option>
          <option value="medium">Medium</option>
          <option value="high">High (detailed, larger SVG)</option>
        </select>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {originalSize != null && processedSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>Original: {(originalSize / 1024).toFixed(1)} KB</p>
          <p>SVG: {(processedSize / 1024).toFixed(1)} KB</p>
        </div>
      )}

      <button
        type="button"
        data-testid="vectorize-submit"
        onClick={handleProcess}
        disabled={!hasFile || processing}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {processing && <Loader2 className="h-4 w-4 animate-spin" />}
        {processing ? "Vectorizing..." : "Vectorize"}
      </button>

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="vectorize-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download SVG
        </a>
      )}
    </div>
  );
}
