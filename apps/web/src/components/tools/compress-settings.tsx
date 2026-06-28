import { Download, Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

type CompressMode = "quality" | "targetSize";
type SizeUnit = "KB" | "MB";

export interface CompressControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

/** Stable serialization (sorted keys) for comparing two settings payloads. */
function canonicalSettings(settings: Record<string, unknown>): string {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(settings).sort()) {
    sorted[key] = settings[key];
  }
  return JSON.stringify(sorted);
}

export function CompressControls({ settings: initialSettings, onChange }: CompressControlsProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<CompressMode>("targetSize");
  const [quality, setQuality] = useState(75);
  const [targetSizeValue, setTargetSizeValue] = useState("");
  const [sizeUnit, setSizeUnit] = useState<SizeUnit>("KB");

  // Seed local state from preloaded settings exactly once (a pipeline step can
  // mount this control with non-default settings). One-time, not a re-sync: a
  // re-sync would keep pulling the store's value back into local state and fight
  // the emit effect below, ping-ponging into an infinite render loop (React
  // error #185). Mirrors resize-settings / convert-settings.
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initialSettings || initializedRef.current) return;
    initializedRef.current = true;
    if (initialSettings.mode != null) setMode(initialSettings.mode as CompressMode);
    if (initialSettings.quality != null) setQuality(Number(initialSettings.quality));
    if (initialSettings.targetSizeKb != null)
      setTargetSizeValue(String(initialSettings.targetSizeKb));
  }, [initialSettings]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // Emit settings on change. Once local state has converged on initialSettings
  // (a preloaded pipeline step), the computed payload equals initialSettings, so
  // we skip the echo. A genuine user edit produces a payload that differs, so it
  // still emits. This idempotent guard replaces an earlier one-shot flag that
  // could dangle and silently swallow a real edit when the sync effect's
  // setState calls were no-ops; it has no such failure mode.
  useEffect(() => {
    const next: Record<string, unknown> =
      mode === "quality"
        ? { mode, quality }
        : {
            mode,
            targetSizeKb:
              sizeUnit === "MB" ? Number(targetSizeValue) * 1024 : Number(targetSizeValue),
          };

    if (initialSettings && canonicalSettings(next) === canonicalSettings(initialSettings)) {
      return;
    }

    onChangeRef.current?.(next);
  }, [mode, quality, targetSizeValue, sizeUnit, initialSettings]);

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div>
        <p className="text-sm font-medium text-muted-foreground">
          {t.toolSettings.compress.compressionMode}
        </p>
        <div className="flex gap-1 mt-1">
          <button
            type="button"
            onClick={() => setMode("targetSize")}
            className={`flex-1 text-xs py-1.5 rounded ${mode === "targetSize" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            {t.toolSettings.compress.targetSize}
          </button>
          <button
            type="button"
            onClick={() => setMode("quality")}
            className={`flex-1 text-xs py-1.5 rounded ${mode === "quality" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            {t.toolSettings.compress.quality}
          </button>
        </div>
      </div>

      {mode === "targetSize" ? (
        <div>
          <label htmlFor="compress-target-size" className="text-xs text-muted-foreground">
            {t.toolSettings.compress.targetSize}
          </label>
          <div className="flex gap-1.5 mt-0.5">
            <input
              id="compress-target-size"
              type="number"
              value={targetSizeValue}
              onChange={(e) => setTargetSizeValue(e.target.value)}
              min={1}
              placeholder={sizeUnit === "KB" ? "e.g. 200" : "e.g. 2"}
              className="flex-1 min-w-0 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <select
              value={sizeUnit}
              onChange={(e) => setSizeUnit(e.target.value as SizeUnit)}
              className="px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
            >
              <option value="KB">KB</option>
              <option value="MB">MB</option>
            </select>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex justify-between items-center">
            <label htmlFor="compress-quality" className="text-xs text-muted-foreground">
              Quality
            </label>
            <span className="text-xs font-mono text-foreground">{quality}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <button
              type="button"
              onClick={() => setQuality((q) => Math.max(1, q - 1))}
              disabled={quality <= 1}
              className="p-1 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
            >
              <Minus className="h-3 w-3" />
            </button>
            <input
              id="compress-quality"
              type="range"
              min={1}
              max={100}
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              className="flex-1 min-w-0"
            />
            <button
              type="button"
              onClick={() => setQuality((q) => Math.min(100, q + 1))}
              disabled={quality >= 100}
              className="p-1 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
            <span>{t.toolSettings.compress.smallestFile}</span>
            <span>{t.toolSettings.compress.bestQuality}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function CompressSettings() {
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
  } = useToolProcessor("compress");
  const [settings, setSettings] = useState<Record<string, unknown>>({});

  const handleProcess = () => {
    if (files.length > 1) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  const hasFile = files.length > 0;
  const canProcess =
    settings.mode === "quality" ||
    (settings.mode === "targetSize" && Number(settings.targetSizeKb) > 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (hasFile && canProcess && !processing) handleProcess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <CompressControls onChange={setSettings} />

      {/* Error */}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Size info */}
      {originalSize != null && processedSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>
            {format(t.toolSettings.compress.original, { size: (originalSize / 1024).toFixed(1) })}
          </p>
          <p>
            {format(t.toolSettings.compress.processed, { size: (processedSize / 1024).toFixed(1) })}
          </p>
          <p className="font-medium text-foreground">
            {format(t.toolSettings.compress.saved, {
              percent:
                originalSize > 0 ? ((1 - processedSize / originalSize) * 100).toFixed(1) : "0",
            })}
          </p>
        </div>
      )}

      {/* Process */}
      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={t.toolSettings.compress.progressLabel}
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="submit"
          data-testid="compress-submit"
          disabled={!hasFile || !canProcess || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1
            ? format(t.toolSettings.compress.submitBatch, { count: files.length })
            : t.toolSettings.compress.submit}
        </button>
      )}

      {/* Download */}
      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="compress-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          {t.common.download}
        </a>
      )}
    </form>
  );
}
