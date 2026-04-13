import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

const LOSSY_FORMATS = new Set(["jpeg", "webp"]);

export interface RedEyeRemovalControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function RedEyeRemovalControls({
  settings: initialSettings,
  onChange,
}: RedEyeRemovalControlsProps) {
  const [sensitivity, setSensitivity] = useState(50);
  const [strength, setStrength] = useState(70);
  const [outputFormat, setOutputFormat] = useState<"original" | "png" | "jpeg" | "webp">(
    "original",
  );
  const [quality, setQuality] = useState(90);

  // One-time init from pipeline settings
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initialSettings || initializedRef.current) return;
    initializedRef.current = true;
    if (initialSettings.sensitivity != null) setSensitivity(Number(initialSettings.sensitivity));
    if (initialSettings.strength != null) setStrength(Number(initialSettings.strength));
    if (initialSettings.format != null)
      setOutputFormat(initialSettings.format as "original" | "png" | "jpeg" | "webp");
    if (initialSettings.quality != null) setQuality(Number(initialSettings.quality));
  }, [initialSettings]);

  // Emit settings on change
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    onChangeRef.current?.({
      sensitivity,
      strength,
      format: outputFormat,
      quality,
    });
  }, [sensitivity, strength, outputFormat, quality]);

  const tabClass = (active: boolean) =>
    `flex-1 text-xs py-1.5 rounded ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`;

  return (
    <div className="space-y-4">
      {/* Sensitivity slider */}
      <div>
        <div className="flex justify-between items-center">
          <p className="text-sm font-medium text-muted-foreground">Sensitivity</p>
          <span className="text-sm font-mono tabular-nums font-medium">{sensitivity}</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={sensitivity}
          onChange={(e) => setSensitivity(Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none bg-muted accent-primary"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
          <span>Strict</span>
          <span>Aggressive</span>
        </div>
      </div>

      {/* Correction Strength slider */}
      <div>
        <div className="flex justify-between items-center">
          <p className="text-sm font-medium text-muted-foreground">Correction Strength</p>
          <span className="text-sm font-mono tabular-nums font-medium">{strength}</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={strength}
          onChange={(e) => setStrength(Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none bg-muted accent-primary"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
          <span>Subtle</span>
          <span>Dark</span>
        </div>
      </div>

      <div className="border-t border-border pt-3" />

      {/* Output format */}
      <div>
        <p className="text-xs text-muted-foreground mb-1">Output Format</p>
        <div className="grid grid-cols-4 gap-1">
          {(["original", "png", "jpeg", "webp"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setOutputFormat(f)}
              className={tabClass(outputFormat === f)}
            >
              {f === "original" ? "Original" : f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Quality slider (lossy formats only) */}
      {LOSSY_FORMATS.has(outputFormat) && (
        <div>
          <div className="flex justify-between items-center">
            <p className="text-sm font-medium text-muted-foreground">Quality</p>
            <span className="text-sm font-mono tabular-nums font-medium">{quality}</span>
          </div>
          <input
            type="range"
            min={1}
            max={100}
            step={1}
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none bg-muted accent-primary"
          />
        </div>
      )}
    </div>
  );
}

export function RedEyeRemovalSettings() {
  const { files } = useFileStore();
  const {
    processFiles,
    processAllFiles,
    processing,
    error,
    downloadUrl,
    originalSize,
    processedSize,
    progress,
  } = useToolProcessor("red-eye-removal");
  const [settings, setSettings] = useState<Record<string, unknown>>({});

  const handleProcess = () => {
    if (files.length > 1) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  return (
    <div className="space-y-4">
      <RedEyeRemovalControls onChange={setSettings} />

      {/* Error */}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Size info */}
      {originalSize != null && processedSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>Original: {(originalSize / 1024).toFixed(1)} KB</p>
          <p>Fixed: {(processedSize / 1024).toFixed(1)} KB</p>
        </div>
      )}

      {/* Process button / progress */}
      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={hasMultiple ? `Fixing red eye in ${files.length} images` : "Fixing red eye"}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="button"
          data-testid="red-eye-removal-submit"
          onClick={handleProcess}
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {hasMultiple ? `Fix Red Eye (${files.length} files)` : "Fix Red Eye"}
        </button>
      )}

      {/* Download (single file - batch uses Download All ZIP in tool-page) */}
      {!hasMultiple && downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="red-eye-removal-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      )}
    </div>
  );
}
