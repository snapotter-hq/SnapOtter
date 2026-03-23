import { useState, useEffect } from "react";
import { useFileStore } from "@/stores/file-store";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import {
  Download,
  RotateCcw,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
} from "lucide-react";
import { ProgressCard } from "@/components/common/progress-card";

export interface PreviewTransform {
  rotate: number;
  flipH: boolean;
  flipV: boolean;
}

interface RotateSettingsProps {
  onPreviewTransform?: (transform: PreviewTransform) => void;
}

export function RotateSettings({ onPreviewTransform }: RotateSettingsProps) {
  const { files } = useFileStore();
  const { processFiles, processing, error, downloadUrl, progress } =
    useToolProcessor("rotate");

  const [angle, setAngle] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);

  // Emit preview transform on every change
  useEffect(() => {
    onPreviewTransform?.({ rotate: angle, flipH, flipV });
  }, [angle, flipH, flipV, onPreviewTransform]);

  const rotateLeft = () => setAngle((a) => (a - 90 + 360) % 360);
  const rotateRight = () => setAngle((a) => (a + 90) % 360);

  const handleProcess = () => {
    processFiles(files, {
      angle,
      horizontal: flipH,
      vertical: flipV,
    });
  };

  const hasFile = files.length > 0;
  const hasChanges = angle !== 0 || flipH || flipV;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (hasFile && hasChanges && !processing) handleProcess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Quick rotate buttons */}
      <div>
        <label className="text-xs text-muted-foreground">Quick Rotate</label>
        <div className="flex gap-2 mt-1">
          <button
            type="button"
            onClick={rotateLeft}
            className="flex-1 flex items-center justify-center gap-1 py-2 rounded bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-colors text-sm"
          >
            <RotateCcw className="h-4 w-4" />
            90 Left
          </button>
          <button
            type="button"
            onClick={rotateRight}
            className="flex-1 flex items-center justify-center gap-1 py-2 rounded bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-colors text-sm"
          >
            <RotateCw className="h-4 w-4" />
            90 Right
          </button>
        </div>
      </div>

      {/* Angle slider */}
      <div>
        <div className="flex justify-between items-center">
          <label className="text-xs text-muted-foreground">Angle</label>
          <span className="text-xs font-mono text-foreground">{angle} deg</span>
        </div>
        <input
          type="range"
          min={0}
          max={360}
          value={angle}
          onChange={(e) => setAngle(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      {/* Flip buttons */}
      <div>
        <label className="text-xs text-muted-foreground">Flip</label>
        <div className="flex gap-2 mt-1">
          <button
            type="button"
            onClick={() => setFlipH(!flipH)}
            className={`flex-1 flex items-center justify-center gap-1 py-2 rounded text-sm transition-colors ${
              flipH
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-primary/10"
            }`}
          >
            <FlipHorizontal className="h-4 w-4" />
            Horizontal
          </button>
          <button
            type="button"
            onClick={() => setFlipV(!flipV)}
            className={`flex-1 flex items-center justify-center gap-1 py-2 rounded text-sm transition-colors ${
              flipV
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-primary/10"
            }`}
          >
            <FlipVertical className="h-4 w-4" />
            Vertical
          </button>
        </div>
      </div>

      {/* Error */}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Process */}
      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label="Applying"
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="submit"
          disabled={!hasFile || !hasChanges || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          Apply
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
    </form>
  );
}
