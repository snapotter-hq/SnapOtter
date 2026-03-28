import { FlipHorizontal, FlipVertical, Minus, Plus, RotateCcw, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

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
  const { processFiles, processAllFiles, processing, error, progress } = useToolProcessor("rotate");

  // Quick rotation in 90° steps: 0, 90, 180, 270
  const [rotation, setRotation] = useState(0);
  // Fine straighten adjustment: -45 to +45
  const [straighten, setStraighten] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);

  const totalAngle = rotation + straighten;

  // Emit preview transform on every change
  useEffect(() => {
    onPreviewTransform?.({ rotate: totalAngle, flipH, flipV });
  }, [totalAngle, flipH, flipV, onPreviewTransform]);

  // Reset controls after successful processing
  const prevProcessing = useRef(processing);
  useEffect(() => {
    if (prevProcessing.current && !processing && !error) {
      setRotation(0);
      setStraighten(0);
      setFlipH(false);
      setFlipV(false);
    }
    prevProcessing.current = processing;
  }, [processing, error]);

  // Display angle normalized to 0-359
  const displayAngle = ((totalAngle % 360) + 360) % 360;

  const [angleInput, setAngleInput] = useState(String(displayAngle));
  const prevDisplayAngle = useRef(displayAngle);
  if (prevDisplayAngle.current !== displayAngle) {
    prevDisplayAngle.current = displayAngle;
    setAngleInput(String(displayAngle));
  }

  const rotateLeft = () => setRotation((r) => r - 90);
  const rotateRight = () => setRotation((r) => r + 90);

  const commitAngleInput = () => {
    const parsed = Number.parseInt(angleInput, 10);
    if (!Number.isNaN(parsed)) {
      const normalized = ((parsed % 360) + 360) % 360;
      setAngleInput(String(normalized));
      setRotation(normalized - straighten);
    } else {
      setAngleInput(String(displayAngle));
    }
  };

  const handleProcess = () => {
    const backendAngle = ((totalAngle % 360) + 360) % 360;
    const settings = {
      angle: backendAngle,
      horizontal: flipH,
      vertical: flipV,
    };
    if (files.length > 1) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  const hasFile = files.length > 0;
  const hasChanges = totalAngle !== 0 || flipH || flipV;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (hasFile && hasChanges && !processing) handleProcess();
  };

  const handleReset = () => {
    setRotation(0);
    setStraighten(0);
    setFlipH(false);
    setFlipV(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Quick rotate */}
      <div>
        <p className="text-xs text-muted-foreground">Rotate</p>
        <div className="flex items-center gap-2 mt-1">
          <button
            type="button"
            data-testid="rotate-left"
            onClick={rotateLeft}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-colors text-sm font-medium"
            title="Rotate 90° counter-clockwise"
          >
            <RotateCcw className="h-4 w-4" />
            Left
          </button>
          <button
            type="button"
            onClick={() => setRotation((r) => r - 1)}
            className="p-2 rounded-lg bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
            title="Decrease 1°"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <div className="relative flex items-center">
            <input
              type="text"
              inputMode="numeric"
              value={angleInput}
              onChange={(e) => setAngleInput(e.target.value)}
              onBlur={commitAngleInput}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitAngleInput();
                }
              }}
              className="w-14 text-center text-sm font-mono font-medium tabular-nums py-1.5 rounded-md bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 pr-4"
            />
            <span className="absolute right-2 text-sm font-mono text-muted-foreground pointer-events-none">
              °
            </span>
          </div>
          <button
            type="button"
            onClick={() => setRotation((r) => r + 1)}
            className="p-2 rounded-lg bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
            title="Increase 1°"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            data-testid="rotate-right"
            onClick={rotateRight}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-colors text-sm font-medium"
            title="Rotate 90° clockwise"
          >
            Right
            <RotateCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Straighten */}
      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="rotate-straighten" className="text-xs text-muted-foreground">
            Straighten
          </label>
          <span className="text-xs font-mono tabular-nums text-muted-foreground">
            {straighten > 0 ? "+" : ""}
            {straighten}°
          </span>
        </div>
        <input
          id="rotate-straighten"
          type="range"
          min={-45}
          max={45}
          step={0.5}
          value={straighten}
          onChange={(e) => setStraighten(Number(e.target.value))}
          className="w-full mt-1"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
          <span>-45°</span>
          <span>0°</span>
          <span>+45°</span>
        </div>
      </div>

      {/* Flip buttons */}
      <div>
        <p className="text-xs text-muted-foreground">Flip</p>
        <div className="flex gap-2 mt-1">
          <button
            type="button"
            data-testid="rotate-flip-h"
            onClick={() => setFlipH(!flipH)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
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
            data-testid="rotate-flip-v"
            onClick={() => setFlipV(!flipV)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
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

      {/* Reset all */}
      {hasChanges && (
        <button
          type="button"
          onClick={handleReset}
          className="w-full text-xs text-muted-foreground hover:text-foreground py-1"
        >
          Reset all changes
        </button>
      )}

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
          data-testid="rotate-submit"
          disabled={!hasFile || !hasChanges || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1 ? `Apply (${files.length} files)` : "Apply"}
        </button>
      )}
    </form>
  );
}
