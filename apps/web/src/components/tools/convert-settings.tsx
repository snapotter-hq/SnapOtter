import { useState } from "react";
import { useFileStore } from "@/stores/file-store";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { Download, Loader2 } from "lucide-react";

const OUTPUT_FORMATS = ["jpg", "png", "webp", "avif", "tiff", "gif"] as const;
const LOSSY_FORMATS = new Set(["jpg", "webp", "avif"]);

export function ConvertSettings() {
  const { files } = useFileStore();
  const { processFiles, processing, error, downloadUrl, originalSize, processedSize } =
    useToolProcessor("convert");

  const [format, setFormat] = useState<string>("png");
  const [quality, setQuality] = useState(85);

  // Detect source format from filename
  const sourceFile = files[0];
  const sourceExt = sourceFile
    ? sourceFile.name.split(".").pop()?.toLowerCase() || "unknown"
    : "none";

  const isLossy = LOSSY_FORMATS.has(format);

  const handleProcess = () => {
    const settings: Record<string, unknown> = { format };
    if (isLossy) {
      settings.quality = quality;
    }
    processFiles(files, settings);
  };

  const hasFile = files.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (hasFile && !processing) handleProcess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Source format */}
      {hasFile && (
        <div>
          <label className="text-xs text-muted-foreground">Source Format</label>
          <div className="mt-0.5 px-2 py-1.5 rounded bg-muted text-sm text-foreground uppercase font-mono">
            {sourceExt}
          </div>
        </div>
      )}

      {/* Target format */}
      <div>
        <label className="text-xs text-muted-foreground">Target Format</label>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          {OUTPUT_FORMATS.map((f) => (
            <option key={f} value={f}>
              {f.toUpperCase()}
            </option>
          ))}
        </select>
      </div>

      {/* Quality slider (lossy only) */}
      {isLossy && (
        <div>
          <div className="flex justify-between items-center">
            <label className="text-xs text-muted-foreground">Quality</label>
            <span className="text-xs font-mono text-foreground">{quality}</span>
          </div>
          <input
            type="range"
            min={1}
            max={100}
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
            className="w-full mt-1"
          />
        </div>
      )}

      {/* Error */}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Size info */}
      {originalSize != null && processedSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>Original: {(originalSize / 1024).toFixed(1)} KB</p>
          <p>Processed: {(processedSize / 1024).toFixed(1)} KB</p>
          <p>
            Savings:{" "}
            {originalSize > 0
              ? ((1 - processedSize / originalSize) * 100).toFixed(1)
              : "0"}
            %
          </p>
        </div>
      )}

      {/* Process */}
      <button
        type="submit"
        disabled={!hasFile || processing}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {processing && <Loader2 className="h-4 w-4 animate-spin" />}
        {processing ? "Converting..." : `Convert to ${format.toUpperCase()}`}
      </button>

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
    </form>
  );
}
