import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

const OUTPUT_FORMATS = [
  "jpg",
  "png",
  "webp",
  "avif",
  "tiff",
  "gif",
  "heic",
  "heif",
  "jxl",
  "bmp",
  "ico",
  "jp2",
  "qoi",
  "ppm",
  "eps",
  "tga",
] as const;
const LOSSY_FORMATS = ["jpg", "jpeg", "webp", "avif", "heic", "heif", "jxl", "jp2"];

const FORMAT_LABELS: Record<string, string> = {
  jpg: "JPG",
  png: "PNG",
  webp: "WebP",
  avif: "AVIF",
  tiff: "TIFF",
  gif: "GIF",
  heic: "HEIC",
  heif: "HEIF",
  jxl: "JXL",
  bmp: "BMP",
  ico: "ICO",
  jp2: "JP2",
  qoi: "QOI",
  ppm: "PPM",
  eps: "EPS",
  tga: "TGA",
};

export interface ConvertControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function ConvertControls({ settings: initialSettings, onChange }: ConvertControlsProps) {
  const { t } = useTranslation();
  const [format, setFormat] = useState<string>("png");
  const [quality, setQuality] = useState(85);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initialSettings || initializedRef.current) return;
    initializedRef.current = true;
    if (initialSettings.format != null) setFormat(String(initialSettings.format));
    if (initialSettings.quality != null) setQuality(Number(initialSettings.quality));
  }, [initialSettings]);

  const isLossy = LOSSY_FORMATS.includes(format);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    const settings: Record<string, unknown> = { format };
    if (isLossy) {
      settings.quality = quality;
    }
    onChangeRef.current?.(settings);
  }, [format, quality, isLossy]);

  return (
    <div className="space-y-4">
      {/* Target format */}
      <div>
        <label htmlFor="convert-target-format" className="text-xs text-muted-foreground">
          {t.toolSettings.convert.targetFormat}
        </label>
        <select
          id="convert-target-format"
          value={format}
          onChange={(e) => setFormat(e.target.value)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          {OUTPUT_FORMATS.map((f) => (
            <option key={f} value={f}>
              {FORMAT_LABELS[f] ?? f.toUpperCase()}
            </option>
          ))}
        </select>
      </div>

      {/* Quality slider (lossy only) */}
      {isLossy && (
        <div>
          <div className="flex justify-between items-center">
            <label htmlFor="convert-quality" className="text-xs text-muted-foreground">
              Quality
            </label>
            <span className="text-xs font-mono text-foreground">{quality}</span>
          </div>
          <input
            id="convert-quality"
            type="range"
            min={1}
            max={100}
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
            className="w-full mt-1"
          />
        </div>
      )}
    </div>
  );
}

export function ConvertSettings() {
  const { t } = useTranslation();
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
  } = useToolProcessor("convert");
  const [settings, setSettings] = useState<Record<string, unknown>>({});

  // Detect source format from filename
  const sourceFile = files[0];
  const sourceExt = sourceFile
    ? sourceFile.name.split(".").pop()?.toLowerCase() || "unknown"
    : "none";

  const hasFile = files.length > 0;

  const handleProcess = () => {
    if (files.length > 1) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (hasFile && !processing) handleProcess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Source format */}
      {hasFile && (
        <div>
          <p className="text-xs text-muted-foreground">{t.toolSettings.convert.sourceFormat}</p>
          <div className="mt-0.5 px-2 py-1.5 rounded bg-muted text-sm text-foreground uppercase font-mono">
            {sourceExt}
          </div>
        </div>
      )}

      <ConvertControls onChange={setSettings} />

      {/* Error */}
      {error && <p className="text-xs text-destructive-ink">{error}</p>}

      {/* Size info */}
      {originalSize != null && processedSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>Original: {(originalSize / 1024).toFixed(1)} KB</p>
          <p>Processed: {(processedSize / 1024).toFixed(1)} KB</p>
        </div>
      )}

      {/* Process */}
      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={t.toolSettings.convert.progressLabel}
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="submit"
          data-testid="convert-submit"
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1
            ? format(t.toolSettings.convert.submitBatch, { count: files.length })
            : t.toolSettings.convert.submit}
        </button>
      )}

      {/* Download */}
      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="convert-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary-ink font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          {t.common.download}
        </a>
      )}
    </form>
  );
}
