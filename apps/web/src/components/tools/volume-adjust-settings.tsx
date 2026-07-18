import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

export function VolumeAdjustSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["volume-adjust"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("volume-adjust");

  const [gainDb, setGainDb] = useState(3);

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleProcess = () => {
    const settings = { gainDb };
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="va-gain" className="text-xs text-muted-foreground">
          {s["gain-db"]}
        </label>
        <input
          id="va-gain"
          type="number"
          min={-30}
          max={30}
          step={0.5}
          value={gainDb}
          onChange={(e) => setGainDb(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      {error && <p className="text-xs text-destructive-ink">{error}</p>}

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
          data-testid="volume-adjust-submit"
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

export interface VolumeAdjustControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function VolumeAdjustControls({ settings: initial, onChange }: VolumeAdjustControlsProps) {
  const { t } = useTranslation();
  const s = t.toolSettings["volume-adjust"];
  const [gainDb, setGainDb] = useState(3);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initial || initializedRef.current) return;
    initializedRef.current = true;
    if (initial.gainDb != null) setGainDb(Number(initial.gainDb));
  }, [initial]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    onChangeRef.current?.({ gainDb });
  }, [gainDb]);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="vap-gain" className="text-xs text-muted-foreground">
          {s["gain-db"]}
        </label>
        <input
          id="vap-gain"
          type="number"
          min={-30}
          max={30}
          step={0.5}
          value={gainDb}
          onChange={(e) => setGainDb(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>
    </div>
  );
}
