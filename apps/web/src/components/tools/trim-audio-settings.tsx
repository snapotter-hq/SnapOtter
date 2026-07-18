import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

export function TrimAudioSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["trim-audio"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("trim-audio");

  const [startS, setStartS] = useState(0);
  const [endS, setEndS] = useState(10);

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;
  const rangeValid = endS > startS;

  const handleProcess = () => {
    const settings = { startS, endS };
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="ta-start" className="text-xs text-muted-foreground">
          {s.start}
        </label>
        <input
          id="ta-start"
          type="number"
          min={0}
          step={0.1}
          value={startS}
          onChange={(e) => setStartS(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      <div>
        <label htmlFor="ta-end" className="text-xs text-muted-foreground">
          {s.end}
        </label>
        <input
          id="ta-end"
          type="number"
          min={0}
          step={0.1}
          value={endS}
          onChange={(e) => setEndS(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
        {!rangeValid && (
          <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5">
            End time must be after start time
          </p>
        )}
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
          data-testid="trim-audio-submit"
          onClick={handleProcess}
          disabled={!hasFile || processing || !rangeValid}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {hasMultiple ? format(s.submitBatch, { count: files.length }) : s.submit}
        </button>
      )}
    </div>
  );
}

export interface TrimAudioControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function TrimAudioControls({ settings: initial, onChange }: TrimAudioControlsProps) {
  const { t } = useTranslation();
  const s = t.toolSettings["trim-audio"];
  const [startS, setStartS] = useState(0);
  const [endS, setEndS] = useState(0);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initial || initializedRef.current) return;
    initializedRef.current = true;
    if (initial.startS != null) setStartS(Number(initial.startS));
    if (initial.endS != null) setEndS(Number(initial.endS));
  }, [initial]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    onChangeRef.current?.({ startS, endS });
  }, [startS, endS]);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="tap-start" className="text-xs text-muted-foreground">
          {s.start}
        </label>
        <input
          id="tap-start"
          type="number"
          min={0}
          step={0.1}
          value={startS}
          onChange={(e) => setStartS(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>
      <div>
        <label htmlFor="tap-end" className="text-xs text-muted-foreground">
          {s.end}
        </label>
        <input
          id="tap-end"
          type="number"
          min={0}
          step={0.1}
          value={endS}
          onChange={(e) => setEndS(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>
    </div>
  );
}
