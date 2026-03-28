import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { useFileStore } from "@/stores/file-store";

function getToken(): string {
  return localStorage.getItem("stirling-token") || "";
}

export function SvgToRasterSettings() {
  const { files, processing, error, setProcessing, setError, setProcessedUrl, setSizes, setJobId } =
    useFileStore();
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState("");
  const [backgroundColor, setBackgroundColor] = useState("#00000000");
  const [outputFormat, setOutputFormat] = useState<"png" | "jpg" | "webp">("png");
  const [transparent, setTransparent] = useState(true);
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
      const settings: Record<string, unknown> = {
        width,
        outputFormat,
        backgroundColor: transparent ? "#00000000" : backgroundColor,
      };
      if (height) settings.height = Number(height);
      formData.append("settings", JSON.stringify(settings));

      const res = await fetch("/api/v1/tools/svg-to-raster", {
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
      setError(err instanceof Error ? err.message : "Conversion failed");
    } finally {
      setProcessing(false);
    }
  };

  const hasFile = files.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="flex-1">
          <label htmlFor="svg-raster-width" className="text-xs text-muted-foreground">
            Width (px)
          </label>
          <input
            id="svg-raster-width"
            type="number"
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
            min={1}
            max={8192}
            className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
          />
        </div>
        <div className="flex-1">
          <label htmlFor="svg-raster-height" className="text-xs text-muted-foreground">
            Height (px)
          </label>
          <input
            id="svg-raster-height"
            type="number"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            placeholder="Auto"
            className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
          />
        </div>
      </div>

      <div>
        <label htmlFor="svg-raster-format" className="text-xs text-muted-foreground">
          Output Format
        </label>
        <select
          id="svg-raster-format"
          value={outputFormat}
          onChange={(e) => setOutputFormat(e.target.value as "png" | "jpg" | "webp")}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="png">PNG</option>
          <option value="jpg">JPEG</option>
          <option value="webp">WebP</option>
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={transparent}
          onChange={(e) => setTransparent(e.target.checked)}
          disabled={outputFormat === "jpg"}
          className="rounded"
        />
        Transparent background
      </label>

      {!transparent && (
        <div>
          <label htmlFor="svg-raster-bg-color" className="text-xs text-muted-foreground">
            Background Color
          </label>
          <input
            id="svg-raster-bg-color"
            type="color"
            value={backgroundColor.slice(0, 7)}
            onChange={(e) => setBackgroundColor(e.target.value)}
            className="w-full mt-0.5 h-8 rounded border border-border"
          />
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      {originalSize != null && processedSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>SVG: {(originalSize / 1024).toFixed(1)} KB</p>
          <p>Output: {(processedSize / 1024).toFixed(1)} KB</p>
        </div>
      )}

      <button
        type="button"
        data-testid="svg-to-raster-submit"
        onClick={handleProcess}
        disabled={!hasFile || processing}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {processing && <Loader2 className="h-4 w-4 animate-spin" />}
        {processing ? "Converting..." : "Convert SVG"}
      </button>

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="svg-to-raster-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      )}
    </div>
  );
}
