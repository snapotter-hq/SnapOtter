import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

const QUICK_SCALES = [2, 3, 4, 6, 8];
const MODEL_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "realesrgan", label: "AI" },
  { value: "lanczos", label: "Fast" },
] as const;
const FORMAT_OPTIONS = ["png", "jpeg", "webp"] as const;

export interface UpscaleControlsProps {
  onChange?: (settings: Record<string, unknown>) => void;
}

export function UpscaleControls({ onChange }: UpscaleControlsProps) {
  const [scale, setScale] = useState(2);
  const [model, setModel] = useState<"auto" | "realesrgan" | "lanczos">("auto");
  const [faceEnhance, setFaceEnhance] = useState(false);
  const [denoise, setDenoise] = useState(0);
  const [outputFormat, setOutputFormat] = useState<"png" | "jpeg" | "webp">("png");
  const [quality, setQuality] = useState(95);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    onChangeRef.current?.({
      scale,
      model,
      faceEnhance,
      denoise,
      format: outputFormat,
      quality,
    });
  }, [scale, model, faceEnhance, denoise, outputFormat, quality]);

  return (
    <div className="space-y-4">
      {/* Scale factor */}
      <div>
        <div className="flex justify-between items-center">
          <p className="text-sm font-medium text-muted-foreground">Scale Factor</p>
          <span className="text-sm font-mono font-medium">{scale}x</span>
        </div>
        <div className="flex gap-1 mt-1.5">
          {QUICK_SCALES.map((s) => (
            <button
              key={s}
              type="button"
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
        <input
          type="range"
          min={2}
          max={8}
          step={1}
          value={scale}
          onChange={(e) => setScale(Number(e.target.value))}
          className="w-full mt-2"
        />
      </div>

      {/* Model */}
      <div>
        <p className="text-sm font-medium text-muted-foreground mb-1.5">Model</p>
        <div className="flex gap-1">
          {MODEL_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setModel(value)}
              className={`flex-1 text-xs py-1.5 rounded ${
                model === value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground/70 mt-1">
          {model === "auto" && "AI when available, falls back to fast resize"}
          {model === "realesrgan" && "Real-ESRGAN neural network upscaling"}
          {model === "lanczos" && "Fast Lanczos interpolation resize"}
        </p>
      </div>

      {/* Face Enhancement */}
      {model !== "lanczos" && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={faceEnhance}
            onChange={(e) => setFaceEnhance(e.target.checked)}
            className="rounded border-border"
          />
          <span className="text-sm text-foreground">Enhance faces</span>
        </label>
      )}

      {/* Denoise */}
      <div>
        <div className="flex justify-between items-center">
          <p className="text-sm font-medium text-muted-foreground">Denoise</p>
          <span className="text-sm font-mono font-medium">
            {denoise === 0 ? "Off" : denoise.toFixed(1)}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={denoise}
          onChange={(e) => setDenoise(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      {/* Output Format */}
      <div>
        <p className="text-sm font-medium text-muted-foreground mb-1.5">Output Format</p>
        <div className="flex gap-1">
          {FORMAT_OPTIONS.map((fmt) => (
            <button
              key={fmt}
              type="button"
              onClick={() => setOutputFormat(fmt)}
              className={`flex-1 text-xs py-1.5 rounded uppercase ${
                outputFormat === fmt
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {fmt}
            </button>
          ))}
        </div>
      </div>

      {/* Quality (JPEG/WebP only) */}
      {outputFormat !== "png" && (
        <div>
          <div className="flex justify-between items-center">
            <p className="text-sm font-medium text-muted-foreground">Quality</p>
            <span className="text-sm font-mono font-medium">{quality}</span>
          </div>
          <input
            type="range"
            min={1}
            max={100}
            step={1}
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
            className="w-full mt-1"
          />
        </div>
      )}
    </div>
  );
}

export function UpscaleSettings() {
  const { files, entries } = useFileStore();
  const { processFiles, processing, error, downloadUrl, originalSize, processedSize, progress } =
    useToolProcessor("upscale");
  const [settings, setSettings] = useState<Record<string, unknown>>({});

  // Queue mode for "Upscale All" - processes files sequentially
  const queueRef = useRef(false);
  const settingsRef = useRef(settings);
  const prevProcessingRef = useRef(processing);

  useEffect(() => {
    settingsRef.current = settings;
  });

  // Auto-advance to next file when current one finishes
  useEffect(() => {
    if (prevProcessingRef.current && !processing && queueRef.current) {
      const currentEntries = useFileStore.getState().entries;
      const nextPending = currentEntries.findIndex((e) => e.status === "pending");
      if (nextPending >= 0) {
        useFileStore.getState().setSelectedIndex(nextPending);
        setTimeout(() => processFiles(useFileStore.getState().files, settingsRef.current), 0);
      } else {
        queueRef.current = false;
      }
    }
    prevProcessingRef.current = processing;
  }, [processing, processFiles]);

  const handleProcess = () => {
    processFiles(files, settings);
  };

  const handleProcessAll = () => {
    queueRef.current = true;
    const currentEntries = useFileStore.getState().entries;
    const firstPending = currentEntries.findIndex((e) => e.status === "pending");
    if (firstPending >= 0) {
      useFileStore.getState().setSelectedIndex(firstPending);
      setTimeout(() => processFiles(useFileStore.getState().files, settings), 0);
    }
  };

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;
  const completedCount = entries.filter((e) => e.status === "completed").length;
  const pendingCount = entries.filter((e) => e.status === "pending").length;
  const allDone = entries.length > 0 && pendingCount === 0;
  const isQueueActive = queueRef.current && processing;

  return (
    <div className="space-y-4">
      <UpscaleControls onChange={setSettings} />

      {/* Error */}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Multi-file progress summary */}
      {hasMultiple && completedCount > 0 && (
        <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
          {completedCount} of {entries.length} images upscaled
        </div>
      )}

      {/* Size info */}
      {originalSize != null && processedSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>Original: {(originalSize / 1024).toFixed(1)} KB</p>
          <p>Upscaled: {(processedSize / 1024).toFixed(1)} KB</p>
        </div>
      )}

      {/* Process buttons / progress */}
      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={
            isQueueActive
              ? `Upscaling ${completedCount + 1} of ${entries.length}`
              : "Upscaling image"
          }
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            data-testid="upscale-submit"
            onClick={handleProcess}
            disabled={!hasFile || processing}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {`Upscale ${(settings.scale as number) ?? 2}x`}
          </button>
          {hasMultiple && !allDone && (
            <button
              type="button"
              onClick={handleProcessAll}
              disabled={processing}
              className="w-full py-2 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5 disabled:opacity-50"
            >
              Upscale All ({pendingCount} remaining)
            </button>
          )}
        </div>
      )}

      {/* Download */}
      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="upscale-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      )}
    </div>
  );
}
