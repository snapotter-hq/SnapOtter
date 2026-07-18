import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

export function VignetteSettings({
  onImageStyle,
  onImageOverlay,
}: {
  onImageStyle?: (style: React.CSSProperties | null) => void;
  onImageOverlay?: (node: React.ReactNode) => void;
}) {
  const { t } = useTranslation();
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, downloadUrl, progress } =
    useToolProcessor("vignette");

  const [strength, setStrength] = useState(0.5);
  const [color, setColor] = useState("#000000");
  const [radius, setRadius] = useState(70);
  const [softness, setSoftness] = useState(50);
  const [roundness, setRoundness] = useState(100);
  const [centerX, setCenterX] = useState(50);
  const [centerY, setCenterY] = useState(50);

  // Stable refs for the preview callbacks to avoid re-render loops
  const onOverlayRef = useRef(onImageOverlay);
  useEffect(() => {
    onOverlayRef.current = onImageOverlay;
  });
  const onStyleRef = useRef(onImageStyle);
  useEffect(() => {
    onStyleRef.current = onImageStyle;
  });

  // Live preview overlay via onImageOverlay
  useEffect(() => {
    const outerR = radius / 100;
    const innerStop = Math.max(0, Math.min(1, outerR * (1 - softness / 100)));
    const innerPct = (innerStop * 100).toFixed(1);

    const shape = roundness === 100 ? "circle" : "ellipse";
    const gradientColor = `${color}`;

    const bg = `radial-gradient(${shape} at ${centerX}% ${centerY}%, transparent ${innerPct}%, ${gradientColor} ${(outerR * 100).toFixed(1)}%)`;

    const overlay = (
      <div
        data-testid="vignette-overlay"
        style={{
          position: "absolute",
          inset: 0,
          background: bg,
          opacity: strength,
          pointerEvents: "none",
          borderRadius: "inherit",
        }}
      />
    );

    // onImageStyle activates the wrapper branch in image-viewer so the overlay
    // child actually mounts; without it the overlay node is never rendered.
    onStyleRef.current?.({});
    onOverlayRef.current?.(overlay);
    return () => {
      onStyleRef.current?.(null);
      onOverlayRef.current?.(null);
    };
  }, [strength, color, radius, softness, roundness, centerX, centerY]);

  const handleProcess = () => {
    const settings = { strength, color, radius, softness, roundness, centerX, centerY };
    if (files.length > 1) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  const hasFile = files.length > 0;
  const canProcess = hasFile && !processing;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canProcess) handleProcess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Strength */}
      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="vignette-strength" className="text-xs text-muted-foreground">
            {t.toolSettings.vignette.strength}
          </label>
          <span className="text-xs font-mono text-foreground">{strength.toFixed(2)}</span>
        </div>
        <input
          id="vignette-strength"
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={strength}
          onChange={(e) => setStrength(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      {/* Radius */}
      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="vignette-radius" className="text-xs text-muted-foreground">
            Radius
          </label>
          <span className="text-xs font-mono text-foreground">{radius}%</span>
        </div>
        <input
          id="vignette-radius"
          type="range"
          min={0}
          max={100}
          step={1}
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      {/* Softness */}
      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="vignette-softness" className="text-xs text-muted-foreground">
            Softness
          </label>
          <span className="text-xs font-mono text-foreground">{softness}%</span>
        </div>
        <input
          id="vignette-softness"
          type="range"
          min={0}
          max={100}
          step={1}
          value={softness}
          onChange={(e) => setSoftness(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      {/* Roundness */}
      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="vignette-roundness" className="text-xs text-muted-foreground">
            Roundness
          </label>
          <span className="text-xs font-mono text-foreground">{roundness}%</span>
        </div>
        <input
          id="vignette-roundness"
          type="range"
          min={0}
          max={100}
          step={1}
          value={roundness}
          onChange={(e) => setRoundness(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      {/* Center X */}
      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="vignette-centerX" className="text-xs text-muted-foreground">
            Center X
          </label>
          <span className="text-xs font-mono text-foreground">{centerX}%</span>
        </div>
        <input
          id="vignette-centerX"
          type="range"
          min={0}
          max={100}
          step={1}
          value={centerX}
          onChange={(e) => setCenterX(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      {/* Center Y */}
      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="vignette-centerY" className="text-xs text-muted-foreground">
            Center Y
          </label>
          <span className="text-xs font-mono text-foreground">{centerY}%</span>
        </div>
        <input
          id="vignette-centerY"
          type="range"
          min={0}
          max={100}
          step={1}
          value={centerY}
          onChange={(e) => setCenterY(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      {/* Vignette Color */}
      <div>
        <label htmlFor="vignette-color" className="text-xs text-muted-foreground">
          {t.toolSettings.vignette.color}
        </label>
        <div className="flex items-center gap-2 mt-0.5">
          <input
            id="vignette-color"
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-8 h-8 rounded border border-border shrink-0"
          />
          <input
            type="text"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="flex-1 px-2 py-1 rounded border border-border bg-background text-xs text-foreground font-mono"
          />
        </div>
      </div>

      {error && <p className="text-xs text-destructive-ink">{error}</p>}

      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={t.toolSettings.vignette.progressLabel}
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="submit"
          data-testid="vignette-submit"
          disabled={!canProcess}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1
            ? t.toolSettings.vignette.submitBatch.replace("{count}", String(files.length))
            : t.toolSettings.vignette.submit}
        </button>
      )}

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="vignette-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary-ink font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          {t.common.download}
        </a>
      )}
    </form>
  );
}
