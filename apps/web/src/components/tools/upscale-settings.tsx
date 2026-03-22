import { useState } from "react";
import { useFileStore } from "@/stores/file-store";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { ProgressCard } from "@/components/common/progress-card";
import { Download } from "lucide-react";

export function UpscaleSettings() {
  const { files } = useFileStore();
  const { processFiles, processing, error, downloadUrl, originalSize, processedSize, progress } =
    useToolProcessor("upscale");

  const [scale, setScale] = useState(2);

  const handleProcess = () => {
    processFiles(files, { scale });
  };

  const hasFile = files.length > 0;

  return (
    <div className="space-y-4">
      {/* Scale factor */}
      <div>
        <label className="text-sm font-medium text-muted-foreground">Scale Factor</label>
        <div className="flex gap-1 mt-1">
          {[2, 4].map((s) => (
            <button
              key={s}
              onClick={() => setScale(s)}
              className={`flex-1 text-xs py-1.5 rounded ${
                scale === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* Info */}
      <p className="text-[10px] text-muted-foreground">
        Uses Real-ESRGAN for AI upscaling when available, otherwise falls back to high-quality Lanczos interpolation.
      </p>

      {/* Error */}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Size info */}
      {originalSize != null && processedSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>Original: {(originalSize / 1024).toFixed(1)} KB</p>
          <p>Upscaled: {(processedSize / 1024).toFixed(1)} KB</p>
        </div>
      )}

      {/* Process button */}
      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label="Upscaling image"
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          onClick={handleProcess}
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {`Upscale ${scale}x`}
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
