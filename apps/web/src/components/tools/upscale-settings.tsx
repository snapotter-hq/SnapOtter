import { cpuFitDimensions, cpuFitRefuses } from "@snapotter/shared";
import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { ResultDownloadLink } from "@/components/common/result-download-link";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFeaturesStore } from "@/stores/features-store";
import { type FileEntry, useFileStore } from "@/stores/file-store";

const QUICK_SCALES = [2, 3, 4, 6, 8];
const MODEL_OPTIONS = [
  { value: "lanczos", labelKey: "qualityFast" },
  { value: "auto", labelKey: "qualityBalanced" },
  { value: "realesrgan", labelKey: "qualityBest" },
] as const;
const OUTPUT_FORMATS = [
  "png",
  "jpg",
  "webp",
  "avif",
  "tiff",
  "gif",
  "heic",
  "heif",
  "jxl",
] as const;
const LOSSY_FORMATS = ["jpg", "jpeg", "webp", "avif", "heic", "heif", "jxl"];

export interface UpscaleControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function UpscaleControls({ settings: initialSettings, onChange }: UpscaleControlsProps) {
  const { t } = useTranslation();
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
      <p className="text-xs text-muted-foreground" data-testid="upscale-cpu-note">
        {t.toolSettings.upscale.cpuNote}
      </p>
      {/* Scale factor */}
      <div>
        <div className="flex justify-between items-center">
          <p className="text-sm font-medium text-muted-foreground">
            {t.toolSettings.upscale.scaleFactor}
          </p>
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
        <p className="text-sm font-medium text-muted-foreground mb-1.5">
          {t.toolSettings.upscale.quality}
        </p>
        <div className="flex gap-1">
          {MODEL_OPTIONS.map(({ value, labelKey }) => (
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
              {t.toolSettings.upscale[labelKey]}
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
          <span className="text-sm text-foreground">{t.toolSettings.upscale.enhanceFaces}</span>
        </label>
      )}

      {/* Noise Reduction */}
      <div>
        <div className="flex justify-between items-center">
          <p className="text-sm font-medium text-muted-foreground">
            {t.toolSettings.upscale.noiseReduction}
          </p>
          <span className="text-sm font-mono font-medium">
            {denoise === 0 ? t.toolSettings.upscale.off : denoise.toFixed(1)}
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
        <p className="text-[11px] text-muted-foreground mt-1">
          {t.toolSettings.upscale.noiseReductionHint}
        </p>
      </div>

      {/* Output Format */}
      <div>
        <label htmlFor="upscale-format" className="text-sm font-medium text-muted-foreground">
          {t.toolSettings.upscale.outputFormat}
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
            <p className="text-sm font-medium text-muted-foreground">
              {t.toolSettings.upscale.quality}
            </p>
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

/**
 * Says when a CPU-only server reduced the input before upscaling it (#4820),
 * so a result smaller than expected isn't a mystery.
 */
export function UpscaleCpuResizeNote({ resizedTo }: { resizedTo: unknown }) {
  const { t } = useTranslation();
  const size = resizedTo as { width?: unknown; height?: unknown } | null | undefined;
  if (typeof size?.width !== "number" || typeof size?.height !== "number") return null;
  return (
    <p className="text-xs text-foreground" data-testid="upscale-cpu-resized-note">
      {format(t.toolSettings.upscale.cpuResizedNote, { width: size.width, height: size.height })}
    </p>
  );
}

interface UpscaleCpuFitHintProps {
  width: number | null;
  height: number | null;
  scale: number;
  model: string | undefined;
  /** The server's CPU ceiling; null when a GPU may run it or the server didn't say. */
  maxCpuMp: number | null;
}

/**
 * Warns before the run that a CPU-only server will reduce this image first
 * (#5036), using the server's own fit so 6x and 8x match too. Silent when the
 * image fits, when a GPU may run it, or when the server will refuse instead
 * (its error explains that). The server stays the source of truth: right
 * after boot it can still be guessing about the GPU.
 */
export function UpscaleCpuFitHint({
  width,
  height,
  scale,
  model,
  maxCpuMp,
}: UpscaleCpuFitHintProps) {
  const { t } = useTranslation();
  if (maxCpuMp == null || !width || !height) return null;
  const fit = cpuFitDimensions(width, height, scale, model, maxCpuMp);
  if (!fit || cpuFitRefuses(width, height, scale, fit)) return null;
  return (
    <p className="text-xs text-foreground" data-testid="upscale-cpu-fit-hint">
      {format(t.toolSettings.upscale.cpuFitHint, { width: fit.width, height: fit.height })}
    </p>
  );
}

/**
 * The selected image's pixel size. Server-preview formats (HEIC, RAW) carry
 * the original size on the entry because their blobUrl is a capped preview;
 * plain formats are probed from the blobUrl, which is the file itself.
 */
function useEntryDimensions(entry: FileEntry | undefined) {
  const blobUrl = entry?.blobUrl ?? null;
  const [probed, setProbed] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    setProbed(null);
    if (!blobUrl) return;
    const img = new Image();
    img.onload = () => setProbed({ width: img.naturalWidth, height: img.naturalHeight });
    img.src = blobUrl;
    return () => {
      img.onload = null;
    };
  }, [blobUrl]);
  if (entry?.originalWidth != null && entry?.originalHeight != null) {
    return { width: entry.originalWidth, height: entry.originalHeight };
  }
  return probed;
}

export function UpscaleSettings() {
  const { t } = useTranslation();
  const { files, currentEntry } = useFileStore();
  const upscaleCpuMaxMp = useFeaturesStore((s) => s.upscaleCpuMaxMp);
  const dimensions = useEntryDimensions(currentEntry);
  const {
    processFiles,
    processAllFiles,
    processing,
    error,
    downloadUrl,
    originalSize,
    processedSize,
    progress,
    resultPayload,
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

      <UpscaleCpuFitHint
        width={dimensions?.width ?? null}
        height={dimensions?.height ?? null}
        scale={(settings.scale as number) ?? 2}
        model={settings.model as string | undefined}
        maxCpuMp={upscaleCpuMaxMp}
      />

      {/* Error */}
      {error && <p className="text-xs text-destructive-ink">{error}</p>}

      {/* Size info */}
      {originalSize != null && processedSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>
            {format(t.toolSettings.upscale.originalKb, { size: (originalSize / 1024).toFixed(1) })}
          </p>
          <p>
            {format(t.toolSettings.upscale.upscaledKb, { size: (processedSize / 1024).toFixed(1) })}
          </p>
        </div>
      )}

      {/* Single-file only, like the download link; resultPayload outlives a file swap, downloadUrl does not */}
      {!hasMultiple && downloadUrl && (
        <UpscaleCpuResizeNote resizedTo={resultPayload?.inputResizedTo} />
      )}

      {/* Process buttons / progress */}
      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={t.toolSettings.upscale.progressLabel}
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
            ? format(t.toolSettings.upscale.submitBatch, {
                scale: (settings.scale as number) ?? 2,
                count: files.length,
              })
            : format(t.toolSettings.upscale.submit, { scale: (settings.scale as number) ?? 2 })}
        </button>
      )}

      {/* Download (single file - batch uses Download All ZIP in tool-page) */}
      {!hasMultiple && downloadUrl && (
        <ResultDownloadLink href={downloadUrl} testId="upscale-download" />
      )}
    </div>
  );
}
