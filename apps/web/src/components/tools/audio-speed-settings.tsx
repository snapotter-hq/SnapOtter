import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

export function AudioSpeedSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["audio-speed"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("audio-speed");

  const [factor, setFactor] = useState(1.5);

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleProcess = () => {
    const settings = { factor };
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="as-factor" className="text-xs text-muted-foreground">
          {s.factor}
        </label>
        <input
          id="as-factor"
          type="number"
          min={0.25}
          max={4}
          step={0.25}
          value={factor}
          onChange={(e) => setFactor(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={s.progressLabel}
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="button"
          data-testid="audio-speed-submit"
          onClick={handleProcess}
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {hasMultiple ? format(s.submitBatch, { count: files.length }) : s.submit}
        </button>
      )}
    </div>
  );
}

export interface AudioSpeedControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function AudioSpeedControls({ settings: initial, onChange }: AudioSpeedControlsProps) {
  const { t } = useTranslation();
  const s = t.toolSettings["audio-speed"];
  const [factor, setFactor] = useState(1.5);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initial || initializedRef.current) return;
    initializedRef.current = true;
    if (initial.factor != null) setFactor(Number(initial.factor));
  }, [initial]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    onChangeRef.current?.({ factor });
  }, [factor]);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="asp-factor" className="text-xs text-muted-foreground">
          {s.factor}
        </label>
        <input
          id="asp-factor"
          type="number"
          min={0.25}
          max={4}
          step={0.25}
          value={factor}
          onChange={(e) => setFactor(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>
    </div>
  );
}
