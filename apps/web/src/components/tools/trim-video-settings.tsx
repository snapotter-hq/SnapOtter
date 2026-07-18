import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

export function TrimVideoSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["trim-video"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("trim-video");

  const [startS, setStartS] = useState(0);
  const [endS, setEndS] = useState(10);
  const [precise, setPrecise] = useState(false);

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;
  const rangeValid = endS > startS;

  const handleProcess = () => {
    const settings = { startS, endS, precise };
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="tv-start" className="text-xs text-muted-foreground">
          {s.start}
        </label>
        <input
          id="tv-start"
          type="number"
          min={0}
          step={0.1}
          value={startS}
          onChange={(e) => setStartS(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      <div>
        <label htmlFor="tv-end" className="text-xs text-muted-foreground">
          {s.end}
        </label>
        <input
          id="tv-end"
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

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={precise}
          onChange={(e) => setPrecise(e.target.checked)}
          className="rounded"
        />
        {s.precise}
      </label>

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
          data-testid="trim-video-submit"
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

export interface TrimVideoControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function TrimVideoControls({ settings: initial, onChange }: TrimVideoControlsProps) {
  const { t } = useTranslation();
  const s = t.toolSettings["trim-video"];
  const [startS, setStartS] = useState(0);
  const [endS, setEndS] = useState(0);
  const [precise, setPrecise] = useState(false);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initial || initializedRef.current) return;
    initializedRef.current = true;
    if (initial.startS != null) setStartS(Number(initial.startS));
    if (initial.endS != null) setEndS(Number(initial.endS));
    if (initial.precise != null) setPrecise(Boolean(initial.precise));
  }, [initial]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    onChangeRef.current?.({ startS, endS, precise });
  }, [startS, endS, precise]);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="tvp-start" className="text-xs text-muted-foreground">
          {s.start}
        </label>
        <input
          id="tvp-start"
          type="number"
          min={0}
          step={0.1}
          value={startS}
          onChange={(e) => setStartS(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>
      <div>
        <label htmlFor="tvp-end" className="text-xs text-muted-foreground">
          {s.end}
        </label>
        <input
          id="tvp-end"
          type="number"
          min={0}
          step={0.1}
          value={endS}
          onChange={(e) => setEndS(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={precise}
          onChange={(e) => setPrecise(e.target.checked)}
          className="rounded"
        />
        {s.precise}
      </label>
    </div>
  );
}
