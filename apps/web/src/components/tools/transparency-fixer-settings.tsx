import { ChevronDown, ChevronRight, Droplets } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

type OutputFormat = "png" | "webp";

// ── Shared controls (used by both standalone page and pipeline steps) ──

export interface TransparencyFixerControlsProps {
  settings: Record<string, unknown>;
  onChange: (settings: Record<string, unknown>) => void;
}

export function TransparencyFixerControls({
  settings: _settings,
  onChange,
}: TransparencyFixerControlsProps) {
  const { t } = useTranslation();
  const [defringe, setDefringe] = useState(30);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("png");
  const [removeWatermark, setRemoveWatermark] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    onChangeRef.current({ defringe, outputFormat, removeWatermark });
  }, [defringe, outputFormat, removeWatermark]);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Upload a PNG with a fake transparent background and we'll fix it in one click.
      </p>

      {/* Remove Watermark toggle */}
      <div className="flex items-center justify-between py-1">
        <div className="flex items-center gap-2">
          <Droplets className="h-3.5 w-3.5 text-muted-foreground" />
          <div>
            <p className="text-xs font-medium">Remove Watermark</p>
            <p className="text-[10px] text-muted-foreground">
              Detect and remove semi-transparent watermarks
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          data-testid="remove-watermark-toggle"
          aria-checked={removeWatermark}
          onClick={() => setRemoveWatermark(!removeWatermark)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            removeWatermark ? "bg-primary" : "bg-muted"
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
              removeWatermark ? "translate-x-4.5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {/* Advanced toggle */}
      <button
        type="button"
        onClick={() => setAdvancedOpen(!advancedOpen)}
        className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground w-full pt-1"
      >
        {advancedOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Advanced
      </button>

      {advancedOpen && (
        <div className="space-y-3 ps-1">
          {/* Defringe slider */}
          <div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Defringe</span>
              <span className="text-xs font-mono text-foreground tabular-nums w-8 text-end">
                {defringe}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={defringe}
              onChange={(e) => setDefringe(Number(e.target.value))}
              className="w-full mt-0.5"
            />
          </div>

          {/* Output Format dropdown */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Output Format
            </p>
            <select
              value={outputFormat}
              onChange={(e) => setOutputFormat(e.target.value as OutputFormat)}
              className="px-2 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground"
            >
              <option value="png">PNG</option>
              <option value="webp">WebP</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Standalone tool page wrapper ──

export function TransparencyFixerSettings() {
  const { t } = useTranslation();
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("transparency-fixer");
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
      <TransparencyFixerControls settings={settings} onChange={setSettings} />

      {/* Error */}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Process button / progress */}
      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={
            hasMultiple ? `Fixing transparency (${files.length} files)` : "Fixing transparency"
          }
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="button"
          data-testid="transparency-fixer-submit"
          onClick={handleProcess}
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {hasMultiple
            ? format(t.toolSettings["transparency-fixer"].submitBatch, { count: files.length })
            : t.toolSettings["transparency-fixer"].submit}
        </button>
      )}
    </div>
  );
}
