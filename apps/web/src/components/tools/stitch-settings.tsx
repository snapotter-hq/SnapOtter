import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { formatHeaders } from "@/lib/api";
import { useFileStore } from "@/stores/file-store";

type Direction = "horizontal" | "vertical" | "grid";
type ResizeMode = "fit" | "original" | "stretch" | "crop";
type Alignment = "start" | "center" | "end";
type OutputFormat = "png" | "jpeg" | "webp" | "avif" | "jxl";

export function StitchSettings() {
  const { t } = useTranslation();
  const { files, processing, error, setProcessing, setError, setProcessedUrl, setSizes, setJobId } =
    useFileStore();

  const [direction, setDirection] = useState<Direction>("horizontal");
  const [gridColumns, setGridColumns] = useState(3);
  const [resizeMode, setResizeMode] = useState<ResizeMode>("fit");
  const [alignment, setAlignment] = useState<Alignment>("center");
  const [gap, setGap] = useState(0);
  const [border, setBorder] = useState(0);
  const [cornerRadius, setCornerRadius] = useState(0);
  const [backgroundColor, setBackgroundColor] = useState("#FFFFFF");
  const [format, setFormat] = useState<OutputFormat>("png");
  const [quality, setQuality] = useState(90);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleProcess = async () => {
    if (files.length < 2) return;

    setError(null);
    setProcessing(true);
    setDownloadUrl(null);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append("file", file);
      }
      formData.append(
        "settings",
        JSON.stringify({
          direction,
          gridColumns,
          resizeMode,
          alignment,
          gap,
          border,
          cornerRadius,
          backgroundColor,
          format,
          quality,
        }),
      );

      const result = await new Promise<{
        jobId: string;
        downloadUrl: string;
        originalSize: number;
        processedSize: number;
      }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/v1/tools/stitch");

        const headers = formatHeaders();
        headers.forEach((value, key) => {
          xhr.setRequestHeader(key, value);
        });

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch {
              reject(new Error("Invalid response"));
            }
          } else {
            try {
              const body = JSON.parse(xhr.responseText);
              reject(new Error(body.error || `Failed: ${xhr.status}`));
            } catch {
              reject(new Error(`Failed: ${xhr.status}`));
            }
          }
        };

        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(formData);
      });

      setJobId(result.jobId);
      setProcessedUrl(result.downloadUrl);
      setDownloadUrl(result.downloadUrl);
      setSizes(result.originalSize, result.processedSize);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stitch failed");
    } finally {
      setProcessing(false);
    }
  };

  const hasEnoughFiles = files.length >= 2;

  return (
    <div className="space-y-4">
      {/* Layout */}
      <div>
        <p className="text-xs text-muted-foreground">Direction</p>
        <div className="grid grid-cols-3 gap-1 mt-1">
          {(["horizontal", "vertical", "grid"] as const).map((d) => (
            <button
              type="button"
              key={d}
              onClick={() => setDirection(d)}
              className={`capitalize text-xs py-1.5 rounded ${direction === d ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {direction === "grid" && (
        <div>
          <div className="flex justify-between items-center">
            <label htmlFor="stitch-grid-columns" className="text-xs text-muted-foreground">
              Grid Columns
            </label>
            <span className="text-xs font-mono text-foreground">{gridColumns}</span>
          </div>
          <input
            id="stitch-grid-columns"
            type="range"
            min={2}
            max={10}
            value={gridColumns}
            onChange={(e) => setGridColumns(Number(e.target.value))}
            className="w-full mt-1"
          />
        </div>
      )}

      <div className="border-t border-border" />

      {/* Size Handling */}
      <div>
        <p className="text-xs text-muted-foreground">Resize Mode</p>
        <div className="grid grid-cols-4 gap-1 mt-1">
          {(["fit", "original", "stretch", "crop"] as const).map((m) => (
            <button
              type="button"
              key={m}
              onClick={() => setResizeMode(m)}
              className={`capitalize text-xs py-1.5 rounded ${resizeMode === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs text-muted-foreground">Alignment</p>
        <div className="grid grid-cols-3 gap-1 mt-1">
          {(["start", "center", "end"] as const).map((a) => (
            <button
              type="button"
              key={a}
              onClick={() => setAlignment(a)}
              className={`capitalize text-xs py-1.5 rounded ${alignment === a ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-border" />

      {/* Spacing & Border */}
      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="stitch-gap" className="text-xs text-muted-foreground">
            Gap
          </label>
          <span className="text-xs font-mono text-foreground">{gap}px</span>
        </div>
        <input
          id="stitch-gap"
          type="range"
          min={0}
          max={200}
          value={gap}
          onChange={(e) => setGap(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="stitch-border" className="text-xs text-muted-foreground">
            Border
          </label>
          <span className="text-xs font-mono text-foreground">{border}px</span>
        </div>
        <input
          id="stitch-border"
          type="range"
          min={0}
          max={50}
          value={border}
          onChange={(e) => setBorder(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="stitch-corner-radius" className="text-xs text-muted-foreground">
            Corner Radius
          </label>
          <span className="text-xs font-mono text-foreground">{cornerRadius}px</span>
        </div>
        <input
          id="stitch-corner-radius"
          type="range"
          min={0}
          max={50}
          value={cornerRadius}
          onChange={(e) => setCornerRadius(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      <div>
        <label htmlFor="stitch-background-color" className="text-xs text-muted-foreground">
          Background Color
        </label>
        <input
          id="stitch-background-color"
          type="color"
          value={backgroundColor}
          onChange={(e) => setBackgroundColor(e.target.value)}
          className="w-full mt-0.5 h-8 rounded border border-border"
        />
      </div>

      <div className="border-t border-border" />

      {/* Output */}
      <div>
        <p className="text-xs text-muted-foreground">Format</p>
        <div className="grid grid-cols-3 gap-1 mt-1">
          {(["png", "jpeg", "webp", "avif", "jxl"] as const).map((f) => (
            <button
              type="button"
              key={f}
              onClick={() => setFormat(f)}
              className={`uppercase text-xs py-1.5 rounded ${format === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {(format === "jpeg" || format === "webp" || format === "avif" || format === "jxl") && (
        <div>
          <div className="flex justify-between items-center">
            <label htmlFor="stitch-quality" className="text-xs text-muted-foreground">
              Quality
            </label>
            <span className="text-xs font-mono text-foreground">{quality}%</span>
          </div>
          <input
            id="stitch-quality"
            type="range"
            min={1}
            max={100}
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
            className="w-full mt-1"
          />
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      {processing && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{uploadProgress < 100 ? "Uploading..." : "Stitching..."}</span>
            {uploadProgress < 100 && <span>{uploadProgress}%</span>}
          </div>
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            {uploadProgress < 100 ? (
              <div
                className="h-full bg-primary rounded-full transition-[width] duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            ) : (
              <div className="h-full bg-primary rounded-full animate-pulse" />
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        data-testid="stitch-submit"
        onClick={handleProcess}
        disabled={!hasEnoughFiles || processing}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {processing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {processing
          ? uploadProgress < 100
            ? `Uploading... ${uploadProgress}%`
            : "Stitching..."
          : `Stitch ${files.length} images`}
      </button>

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="stitch-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download Stitched Image
        </a>
      )}
    </div>
  );
}
