import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { useFileStore } from "@/stores/file-store";

function getToken(): string {
  return localStorage.getItem("stirling-token") || "";
}

type Layout = "2x2" | "3x3" | "1x3" | "2x1" | "3x1" | "1x2";

const LAYOUTS: { value: Layout; label: string }[] = [
  { value: "2x2", label: "2 x 2" },
  { value: "3x3", label: "3 x 3" },
  { value: "1x3", label: "1 x 3" },
  { value: "3x1", label: "3 x 1" },
  { value: "2x1", label: "2 x 1" },
  { value: "1x2", label: "1 x 2" },
];

export function CollageSettings() {
  const { files, processing, error, setProcessing, setError, setProcessedUrl, setSizes, setJobId } =
    useFileStore();
  const [layout, setLayout] = useState<Layout>("2x2");
  const [gap, setGap] = useState(4);
  const [backgroundColor, setBackgroundColor] = useState("#FFFFFF");
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
      for (const file of files) {
        formData.append("file", file);
      }
      formData.append("settings", JSON.stringify({ layout, gap, backgroundColor }));

      const res = await fetch("/api/v1/tools/collage", {
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
      setError(err instanceof Error ? err.message : "Collage failed");
    } finally {
      setProcessing(false);
    }
  };

  const hasFiles = files.length > 0;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-muted-foreground">Layout</p>
        <div className="grid grid-cols-3 gap-1 mt-1">
          {LAYOUTS.map((l) => (
            <button
              type="button"
              key={l.value}
              onClick={() => setLayout(l.value)}
              className={`text-xs py-1.5 rounded ${layout === l.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="collage-gap" className="text-xs text-muted-foreground">
            Gap
          </label>
          <span className="text-xs font-mono text-foreground">{gap}px</span>
        </div>
        <input
          id="collage-gap"
          type="range"
          min={0}
          max={50}
          value={gap}
          onChange={(e) => setGap(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      <div>
        <label htmlFor="collage-background-color" className="text-xs text-muted-foreground">
          Background Color
        </label>
        <input
          id="collage-background-color"
          type="color"
          value={backgroundColor}
          onChange={(e) => setBackgroundColor(e.target.value)}
          className="w-full mt-0.5 h-8 rounded border border-border"
        />
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {originalSize != null && processedSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>Input total: {(originalSize / 1024).toFixed(1)} KB</p>
          <p>Collage: {(processedSize / 1024).toFixed(1)} KB</p>
        </div>
      )}

      <button
        type="button"
        data-testid="collage-submit"
        onClick={handleProcess}
        disabled={!hasFiles || processing}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {processing && <Loader2 className="h-4 w-4 animate-spin" />}
        {processing ? "Creating..." : `Create Collage (${files.length} images)`}
      </button>

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="collage-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download Collage
        </a>
      )}
    </div>
  );
}
