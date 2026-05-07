import { Download, Info } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

function HintIcon({ text }: { text: string }) {
  return (
    <span className="relative group">
      <Info className="h-3 w-3 text-muted-foreground" />
      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-48 rounded bg-foreground px-2 py-1.5 text-[11px] leading-tight text-background opacity-0 transition-opacity group-hover:opacity-100 z-10">
        {text}
      </span>
    </span>
  );
}

export interface ContentAwareResizeControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function ContentAwareResizeControls({
  settings: initialSettings,
  onChange,
}: ContentAwareResizeControlsProps) {
  const [width, setWidth] = useState<string>("");
  const [height, setHeight] = useState<string>("");
  const [protectFaces, setProtectFaces] = useState(false);
  const [blurRadius, setBlurRadius] = useState(4);
  const [sobelThreshold, setSobelThreshold] = useState(2);
  const [squareMode, setSquareMode] = useState(false);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initialSettings || initializedRef.current) return;
    initializedRef.current = true;
    if (initialSettings.width != null) setWidth(String(initialSettings.width));
    if (initialSettings.height != null) setHeight(String(initialSettings.height));
    if (initialSettings.protectFaces != null)
      setProtectFaces(Boolean(initialSettings.protectFaces));
    if (initialSettings.blurRadius != null) setBlurRadius(Number(initialSettings.blurRadius));
    if (initialSettings.sobelThreshold != null)
      setSobelThreshold(Number(initialSettings.sobelThreshold));
    if (initialSettings.square != null) setSquareMode(Boolean(initialSettings.square));
  }, [initialSettings]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    const settings: Record<string, unknown> = {};
    if (!squareMode) {
      if (width) settings.width = Number(width);
      if (height) settings.height = Number(height);
    }
    settings.protectFaces = protectFaces;
    settings.blurRadius = blurRadius;
    settings.sobelThreshold = sobelThreshold;
    settings.square = squareMode;
    onChangeRef.current?.(settings);
  }, [width, height, protectFaces, blurRadius, sobelThreshold, squareMode]);

  return (
    <div className="space-y-4">
      {/* Dimensions */}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor="car-width" className="text-xs text-muted-foreground">
            Width (px)
          </label>
          <input
            id="car-width"
            type="number"
            value={width}
            onChange={(e) => setWidth(e.target.value)}
            placeholder="Auto"
            disabled={squareMode}
            className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground disabled:opacity-50"
          />
        </div>
        <div className="flex-1">
          <label htmlFor="car-height" className="text-xs text-muted-foreground">
            Height (px)
          </label>
          <input
            id="car-height"
            type="number"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            placeholder="Auto"
            disabled={squareMode}
            className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground disabled:opacity-50"
          />
        </div>
      </div>

      {/* Square mode */}
      <label className="flex items-center gap-2 text-xs text-foreground">
        <input
          type="checkbox"
          checked={squareMode}
          onChange={(e) => setSquareMode(e.target.checked)}
          className="rounded"
        />
        Resize to square
      </label>

      {/* Face protection */}
      <label className="flex items-center gap-2 text-xs text-foreground">
        <input
          type="checkbox"
          checked={protectFaces}
          onChange={(e) => setProtectFaces(e.target.checked)}
          className="rounded"
        />
        <span>Protect faces</span>
        <HintIcon text="Detect and protect face regions from seam removal using face detection" />
      </label>

      {/* Blur radius */}
      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="car-blur-radius" className="text-xs text-muted-foreground">
            Smoothing
          </label>
          <span className="text-xs tabular-nums text-muted-foreground">{blurRadius}</span>
        </div>
        <input
          id="car-blur-radius"
          type="range"
          min={0}
          max={20}
          value={blurRadius}
          onChange={(e) => setBlurRadius(Number(e.target.value))}
          className="w-full mt-1 h-1.5 rounded-full appearance-none bg-muted accent-primary"
        />
      </div>

      {/* Sobel threshold */}
      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="car-sobel-threshold" className="text-xs text-muted-foreground">
            Edge sensitivity
          </label>
          <span className="text-xs tabular-nums text-muted-foreground">{sobelThreshold}</span>
        </div>
        <input
          id="car-sobel-threshold"
          type="range"
          min={1}
          max={20}
          value={sobelThreshold}
          onChange={(e) => setSobelThreshold(Number(e.target.value))}
          className="w-full mt-1 h-1.5 rounded-full appearance-none bg-muted accent-primary"
        />
      </div>
    </div>
  );
}

export function ContentAwareResizeSettings() {
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, downloadUrl, progress } =
    useToolProcessor("content-aware-resize");
  const [settings, setSettings] = useState<Record<string, unknown>>({});

  const handleSettingsChange = useCallback((newSettings: Record<string, unknown>) => {
    setSettings(newSettings);
  }, []);

  const handleProcess = () => {
    if (files.length > 1) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  const hasFile = files.length > 0;
  const canProcess =
    hasFile &&
    !processing &&
    (Boolean(settings.width) || Boolean(settings.height) || Boolean(settings.square));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canProcess) handleProcess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <ContentAwareResizeControls onChange={handleSettingsChange} />

      {error && <p className="text-xs text-red-500">{error}</p>}

      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label="Content-aware resizing"
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="submit"
          data-testid="content-aware-resize-submit"
          disabled={!canProcess}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1 ? `Resize (${files.length} files)` : "Resize"}
        </button>
      )}

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="content-aware-resize-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      )}
    </form>
  );
}
