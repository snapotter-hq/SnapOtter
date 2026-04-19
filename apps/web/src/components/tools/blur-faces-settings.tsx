import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

export interface BlurFacesControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function BlurFacesControls({ settings: initialSettings, onChange }: BlurFacesControlsProps) {
  const [blurRadius, setBlurRadius] = useState(30);
  const [sensitivity, setSensitivity] = useState(50);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initialSettings || initializedRef.current) return;
    initializedRef.current = true;
    if (initialSettings.blurRadius != null) setBlurRadius(Number(initialSettings.blurRadius));
    if (initialSettings.sensitivity != null)
      setSensitivity(Number(initialSettings.sensitivity) * 100);
  }, [initialSettings]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    onChangeRef.current?.({ blurRadius, sensitivity: sensitivity / 100 });
  }, [blurRadius, sensitivity]);

  return (
    <div className="space-y-4">
      {/* Blur radius */}
      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="blur-faces-blur-radius" className="text-xs text-muted-foreground">
            Blur Radius
          </label>
          <span className="text-xs font-mono text-foreground">{blurRadius}</span>
        </div>
        <input
          id="blur-faces-blur-radius"
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
          <label htmlFor="blur-faces-sensitivity" className="text-xs text-muted-foreground">
            Detection Sensitivity
          </label>
          <span className="text-xs font-mono text-foreground">{sensitivity}%</span>
        </div>
        <input
          id="blur-faces-sensitivity"
          type="range"
          min={10}
          max={90}
          value={sensitivity}
          onChange={(e) => setSensitivity(Number(e.target.value))}
          className="w-full mt-1"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
          <span>More faces</span>
          <span>Fewer faces</span>
        </div>
      </div>
    </div>
  );
}

export function BlurFacesSettings() {
  const { files } = useFileStore();
  const {
    processFiles,
    processAllFiles,
    processing,
    error,
    warning,
    downloadUrl,
    originalSize,
    processedSize,
    progress,
  } = useToolProcessor("blur-faces");
  const [settings, setSettings] = useState<Record<string, unknown>>({});

  const handleProcess = () => {
    if (files.length > 1) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  const hasFile = files.length > 0;

  return (
    <div className="space-y-4">
      <BlurFacesControls onChange={setSettings} />

      {error && <p className="text-xs text-red-500">{error}</p>}

      {warning && <p className="text-xs text-amber-600 dark:text-amber-400">{warning}</p>}

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
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="button"
          data-testid="blur-faces-submit"
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
          data-testid="blur-faces-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      )}
    </div>
  );
}
