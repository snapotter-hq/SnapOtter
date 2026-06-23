import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

export function RingtoneMakerSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["ringtone-maker"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("ringtone-maker");

  const [startS, setStartS] = useState(0);
  const [durationS, setDurationS] = useState(30);

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleProcess = () => {
    const settings = { startS, durationS };
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="rm-start" className="text-xs text-muted-foreground">
          {s["start-s"]}
        </label>
        <input
          id="rm-start"
          type="number"
          min={0}
          step={0.5}
          value={startS}
          onChange={(e) => setStartS(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      <div>
        <label htmlFor="rm-duration" className="text-xs text-muted-foreground">
          {s["duration-s"]}
        </label>
        <input
          id="rm-duration"
          type="number"
          min={1}
          max={30}
          step={0.5}
          value={durationS}
          onChange={(e) => setDurationS(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
        <p className="text-[10px] text-muted-foreground mt-0.5">{s["max-hint"]}</p>
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
          data-testid="ringtone-maker-submit"
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

export interface RingtoneMakerControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function RingtoneMakerControls({ settings: initial, onChange }: RingtoneMakerControlsProps) {
  const { t } = useTranslation();
  const s = t.toolSettings["ringtone-maker"];
  const [startS, setStartS] = useState(0);
  const [durationS, setDurationS] = useState(30);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initial || initializedRef.current) return;
    initializedRef.current = true;
    if (initial.startS != null) setStartS(Number(initial.startS));
    if (initial.durationS != null) setDurationS(Number(initial.durationS));
  }, [initial]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    onChangeRef.current?.({ startS, durationS });
  }, [startS, durationS]);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="rmp-start" className="text-xs text-muted-foreground">
          {s["start-s"]}
        </label>
        <input
          id="rmp-start"
          type="number"
          min={0}
          step={0.5}
          value={startS}
          onChange={(e) => setStartS(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>
      <div>
        <label htmlFor="rmp-duration" className="text-xs text-muted-foreground">
          {s["duration-s"]}
        </label>
        <input
          id="rmp-duration"
          type="number"
          min={1}
          max={30}
          step={0.5}
          value={durationS}
          onChange={(e) => setDurationS(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>
    </div>
  );
}
