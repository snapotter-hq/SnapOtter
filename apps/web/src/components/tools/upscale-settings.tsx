import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

const QUICK_SCALES = [2, 3, 4, 6, 8];
const MODEL_OPTIONS = [
  { value: "lanczos", label: "Fast" },
  { value: "auto", label: "Balanced" },
  { value: "realesrgan", label: "Best" },
] as const;
const OUTPUT_FORMATS = ["png", "jpg", "webp", "avif", "tiff", "gif", "heic", "heif"] as const;
const LOSSY_FORMATS = ["jpg", "jpeg", "webp", "avif", "heic", "heif"];

export interface UpscaleControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function UpscaleControls({ settings: initialSettings, onChange }: UpscaleControlsProps) {
  const [scale, setScale] = useState(2);
  const [model, setModel] = useState<"auto" | "realesrgan" | "lanczos">("auto");
  const [faceEnhance, setFaceEnhance] = useState(false);
  const [denoise, setDenoise] = useState(0);
  const [outputFormat, setOutputFormat] = useState<string>("png");
  const [quality, setQuality] = useState(95);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initialSettings || initializedRef.current) return;
    initializedRef.current = true;
    if (initialSettings.scale != null) setScale(Number(initialSettings.scale));
    if (initialSettings.model != null)
      setModel(initialSettings.model as "auto" | "realesrgan" | "lanczos");
    if (initialSettings.faceEnhance != null) setFaceEnhance(Boolean(initialSettings.faceEnhance));
    if (initialSettings.denoise != null) setDenoise(Number(initialSettings.denoise));
    if (initialSettings.format != null) setOutputFormat(String(initialSettings.format));
    if (initialSettings.quality != null) setQuality(Number(initialSettings.quality));
  }, [initialSettings]);

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

      {/* Quality */}
      <div>
        <p className="text-sm font-medium text-muted-foreground mb-1.5">Quality</p>
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

      {/* Noise Reduction */}
      <div>
        <div className="flex justify-between items-center">
          <p className="text-sm font-medium text-muted-foreground">Noise Reduction</p>
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
        <p className="text-[11px] text-muted-foreground/70 mt-1">
          Smooths out grain and noise. Higher values remove more noise but may soften details.
        </p>
      </div>

      {/* Output Format */}
      <div>
        <label htmlFor="upscale-format" className="text-sm font-medium text-muted-foreground">
          Output Format
        </label>
        <select
          id="upscale-format"
          value={outputFormat}
          onChange={(e) => setOutputFormat(e.target.value)}
          className="w-full mt-1 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          {OUTPUT_FORMATS.map((f) => (
            <option key={f} value={f}>
              {f.toUpperCase()}
            </option>
          ))}
        </select>
      </div>

      {/* Quality (lossy formats only) */}
      {LOSSY_FORMATS.includes(outputFormat) && (
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
  } = useToolProcessor("upscale");
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
      <UpscaleControls onChange={setSettings} />

      {/* Error */}
      {error && <p className="text-xs text-red-500">{error}</p>}

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
          label={hasMultiple ? `Upscaling ${files.length} images` : "Upscaling image"}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="button"
          data-testid="upscale-submit"
          onClick={handleProcess}
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {hasMultiple
            ? `Upscale ${(settings.scale as number) ?? 2}x (${files.length} files)`
            : `Upscale ${(settings.scale as number) ?? 2}x`}
        </button>
      )}

      {/* Download (single file - batch uses Download All ZIP in tool-page) */}
      {!hasMultiple && downloadUrl && (
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
