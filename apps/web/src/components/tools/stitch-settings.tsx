import { ChevronDown, ChevronUp, Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { formatHeaders } from "@/lib/api";
import { useFileStore } from "@/stores/file-store";

type Direction = "horizontal" | "vertical";
type ResizeMode = "fit" | "original";
type OutputFormat = "png" | "jpeg" | "webp";

export function StitchSettings() {
  const { files, processing, error, setProcessing, setError, setProcessedUrl, setSizes, setJobId } =
    useFileStore();
  const [direction, setDirection] = useState<Direction>("horizontal");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [resizeMode, setResizeMode] = useState<ResizeMode>("fit");
  const [gap, setGap] = useState(0);
  const [backgroundColor, setBackgroundColor] = useState("#FFFFFF");
  const [format, setFormat] = useState<OutputFormat>("png");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const handleProcess = async () => {
    if (files.length < 2) return;

    setProcessing(true);
    setError(null);
    setDownloadUrl(null);

    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append("file", file);
      }
      formData.append(
        "settings",
        JSON.stringify({ direction, resizeMode, gap, backgroundColor, format }),
      );

      const res = await fetch("/api/v1/tools/stitch", {
        method: "POST",
        headers: formatHeaders(),
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
      <div>
        <p className="text-xs text-muted-foreground">Direction</p>
        <div className="grid grid-cols-2 gap-1 mt-1">
          {(["horizontal", "vertical"] as const).map((d) => (
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

      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-1 text-xs text-muted-foreground"
      >
        Advanced
        {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {showAdvanced && (
        <div className="space-y-4 border border-border rounded-lg p-3">
          <div>
            <p className="text-xs text-muted-foreground">Resize Mode</p>
            <div className="grid grid-cols-2 gap-1 mt-1">
              {(["fit", "original"] as const).map((m) => (
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
              max={100}
              value={gap}
              onChange={(e) => setGap(Number(e.target.value))}
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

          <div>
            <p className="text-xs text-muted-foreground">Output Format</p>
            <div className="grid grid-cols-3 gap-1 mt-1">
              {(["png", "jpeg", "webp"] as const).map((f) => (
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
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <button
        type="button"
        data-testid="stitch-submit"
        onClick={handleProcess}
        disabled={!hasEnoughFiles || processing}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {processing && <Loader2 className="h-4 w-4 animate-spin" />}
        {processing ? "Stitching..." : `Stitch ${files.length} images`}
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
