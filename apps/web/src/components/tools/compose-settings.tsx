import { Download, Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useFileStore } from "@/stores/file-store";

function getToken(): string {
  return localStorage.getItem("stirling-token") || "";
}

export function ComposeSettings() {
  const { files, processing, error, setProcessing, setError, setProcessedUrl, setSizes, setJobId } =
    useFileStore();
  const [overlayFile, setOverlayFile] = useState<File | null>(null);
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [opacity, setOpacity] = useState(100);
  const [blendMode, setBlendMode] = useState("over");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [originalSize, setOriginalSize] = useState<number | null>(null);
  const [processedSize, setProcessedSize] = useState<number | null>(null);
  const overlayInputRef = useRef<HTMLInputElement>(null);

  const handleProcess = async () => {
    if (files.length === 0 || !overlayFile) return;

    setProcessing(true);
    setError(null);
    setDownloadUrl(null);

    try {
      const formData = new FormData();
      formData.append("file", files[0]);
      formData.append("overlay", overlayFile);
      formData.append("settings", JSON.stringify({ x, y, opacity, blendMode }));

      const res = await fetch("/api/v1/tools/compose", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
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
        <label htmlFor="compose-overlay-image" className="text-xs text-muted-foreground">
          Overlay Image
        </label>
        <input
          id="compose-overlay-image"
          ref={overlayInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => setOverlayFile(e.target.files?.[0] ?? null)}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => overlayInputRef.current?.click()}
          className="w-full mt-0.5 px-2 py-2 rounded border border-dashed border-border bg-background text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-2"
        >
          <Upload className="h-4 w-4" />
          {overlayFile ? overlayFile.name : "Choose overlay image"}
        </button>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label htmlFor="compose-x-position" className="text-xs text-muted-foreground">
            X Position
          </label>
          <input
            id="compose-x-position"
            type="number"
            value={x}
            onChange={(e) => setX(Number(e.target.value))}
            min={0}
            className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
          />
        </div>
        <div className="flex-1">
          <label htmlFor="compose-y-position" className="text-xs text-muted-foreground">
            Y Position
          </label>
          <input
            id="compose-y-position"
            type="number"
            value={y}
            onChange={(e) => setY(Number(e.target.value))}
            min={0}
            className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
          />
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="compose-opacity" className="text-xs text-muted-foreground">
            Opacity
          </label>
          <span className="text-xs font-mono text-foreground">{opacity}%</span>
        </div>
        <input
          id="compose-opacity"
          type="range"
          min={0}
          max={100}
          value={opacity}
          onChange={(e) => setOpacity(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      <div>
        <label htmlFor="compose-blend-mode" className="text-xs text-muted-foreground">
          Blend Mode
        </label>
        <select
          id="compose-blend-mode"
          value={blendMode}
          onChange={(e) => setBlendMode(e.target.value)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="over">Normal</option>
          <option value="multiply">Multiply</option>
          <option value="screen">Screen</option>
          <option value="overlay">Overlay</option>
          <option value="darken">Darken</option>
          <option value="lighten">Lighten</option>
          <option value="hard-light">Hard Light</option>
          <option value="soft-light">Soft Light</option>
          <option value="difference">Difference</option>
          <option value="exclusion">Exclusion</option>
        </select>
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
        data-testid="compose-submit"
        onClick={handleProcess}
        disabled={!hasFile || !overlayFile || processing}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {processing && <Loader2 className="h-4 w-4 animate-spin" />}
        {processing ? "Processing..." : "Compose"}
      </button>

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="compose-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      )}
    </div>
  );
}
