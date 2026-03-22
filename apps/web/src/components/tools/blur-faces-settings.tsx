import { useState } from "react";
import { useFileStore } from "@/stores/file-store";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { ProgressCard } from "@/components/common/progress-card";
import { Download } from "lucide-react";

export function BlurFacesSettings() {
  const { files } = useFileStore();
  const { processFiles, processing, error, downloadUrl, originalSize, processedSize, progress } =
    useToolProcessor("blur-faces");

  const [blurRadius, setBlurRadius] = useState(30);
  const [sensitivity, setSensitivity] = useState(50);

  const handleProcess = () => {
    processFiles(files, {
      blurRadius,
      sensitivity: sensitivity / 100,
    });
  };

  const hasFile = files.length > 0;

  return (
    <div className="space-y-4">
      {/* Blur radius */}
      <div>
        <div className="flex justify-between items-center">
          <label className="text-xs text-muted-foreground">Blur Radius</label>
          <span className="text-xs font-mono text-foreground">{blurRadius}</span>
        </div>
        <input
          type="range"
          min={5}
          max={80}
          value={blurRadius}
          onChange={(e) => setBlurRadius(Number(e.target.value))}
          className="w-full mt-1"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
          <span>Light</span>
          <span>Heavy</span>
        </div>
      </div>

      {/* Sensitivity */}
      <div>
        <div className="flex justify-between items-center">
          <label className="text-xs text-muted-foreground">Detection Sensitivity</label>
          <span className="text-xs font-mono text-foreground">{sensitivity}%</span>
        </div>
        <input
          type="range"
          min={10}
          max={90}
          value={sensitivity}
          onChange={(e) => setSensitivity(Number(e.target.value))}
          className="w-full mt-1"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
          <span>More faces</span>
          <span>Fewer false positives</span>
        </div>
      </div>

      {/* Info */}
      <p className="text-[10px] text-muted-foreground">
        Uses MediaPipe for face detection. Automatically detects and blurs all faces in the image.
      </p>

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
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label="Blurring faces"
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
          Blur Faces
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
