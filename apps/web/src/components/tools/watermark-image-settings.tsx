import { Download, Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { formatHeaders } from "@/lib/api";
import { useFileStore } from "@/stores/file-store";

type Position = "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
export function WatermarkImageSettings() {
  const { files, processing, error, setProcessing, setError, setProcessedUrl, setSizes, setJobId } =
    useFileStore();
  const [position, setPosition] = useState<Position>("bottom-right");
  const [opacity, setOpacity] = useState(50);
  const [scale, setScale] = useState(25);
  const [watermarkFile, setWatermarkFile] = useState<File | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [originalSize, setOriginalSize] = useState<number | null>(null);
  const [processedSize, setProcessedSize] = useState<number | null>(null);
  const watermarkInputRef = useRef<HTMLInputElement>(null);

  const handleProcess = async () => {
    if (files.length === 0 || !watermarkFile) return;

    setProcessing(true);
    setError(null);
    setDownloadUrl(null);

    try {
      const formData = new FormData();
      formData.append("file", files[0]);
      formData.append("watermark", watermarkFile);
      formData.append("settings", JSON.stringify({ position, opacity, scale }));

      const res = await fetch("/api/v1/tools/watermark-image", {
        method: "POST",
        headers: formatHeaders(),
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Processing failed: ${res.status}`);
      }

      const result = await res.json();
      setJobId(result.jobId);
      setProcessedUrl(result.downloadUrl);
      setDownloadUrl(result.downloadUrl);
      setOriginalSize(result.originalSize);
      setProcessedSize(result.processedSize);
      setSizes(result.originalSize, result.processedSize);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Processing failed");
    } finally {
      setProcessing(false);
    }
  };

  const hasFile = files.length > 0;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-muted-foreground">Watermark Image</p>
        <input
          ref={watermarkInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => setWatermarkFile(e.target.files?.[0] ?? null)}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => watermarkInputRef.current?.click()}
          className="w-full mt-0.5 px-2 py-2 rounded border border-dashed border-border bg-background text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-2"
        >
          <Upload className="h-4 w-4" />
          {watermarkFile ? watermarkFile.name : "Choose watermark image"}
        </button>
      </div>

      <div>
        <label htmlFor="watermark-image-position" className="text-xs text-muted-foreground">
          Position
        </label>
        <select
          id="watermark-image-position"
          value={position}
          onChange={(e) => setPosition(e.target.value as Position)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="center">Center</option>
          <option value="top-left">Top Left</option>
          <option value="top-right">Top Right</option>
          <option value="bottom-left">Bottom Left</option>
          <option value="bottom-right">Bottom Right</option>
        </select>
      </div>

      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="watermark-image-opacity" className="text-xs text-muted-foreground">
            Opacity
          </label>
          <span className="text-xs font-mono text-foreground">{opacity}%</span>
        </div>
        <input
          id="watermark-image-opacity"
          type="range"
          min={0}
          max={100}
          value={opacity}
          onChange={(e) => setOpacity(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="watermark-image-scale" className="text-xs text-muted-foreground">
            Scale
          </label>
          <span className="text-xs font-mono text-foreground">{scale}%</span>
        </div>
        <input
          id="watermark-image-scale"
          type="range"
          min={5}
          max={100}
          value={scale}
          onChange={(e) => setScale(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {originalSize != null && processedSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>Original: {(originalSize / 1024).toFixed(1)} KB</p>
          <p>Processed: {(processedSize / 1024).toFixed(1)} KB</p>
        </div>
      )}

      <button
        type="button"
        data-testid="watermark-image-submit"
        onClick={handleProcess}
        disabled={!hasFile || !watermarkFile || processing}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {processing && <Loader2 className="h-4 w-4 animate-spin" />}
        {processing ? "Processing..." : "Apply Watermark"}
      </button>

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="watermark-image-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      )}
    </div>
  );
}
