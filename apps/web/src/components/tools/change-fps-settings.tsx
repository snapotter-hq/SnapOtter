import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

export function ChangeFpsSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["change-fps"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("change-fps");

  const [fps, setFps] = useState(30);

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleProcess = () => {
    const settings = { fps };
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="cfps-fps" className="text-xs text-muted-foreground">
          {s.fps}
        </label>
        <input
          id="cfps-fps"
          type="number"
          min={1}
          max={120}
          step={1}
          value={fps}
          onChange={(e) => setFps(Number(e.target.value))}
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
          data-testid="change-fps-submit"
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

export interface ChangeFpsControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function ChangeFpsControls({ settings: initial, onChange }: ChangeFpsControlsProps) {
  const { t } = useTranslation();
  const s = t.toolSettings["change-fps"];
  const [fps, setFps] = useState(30);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initial || initializedRef.current) return;
    initializedRef.current = true;
    if (initial.fps != null) setFps(Number(initial.fps));
  }, [initial]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    onChangeRef.current?.({ fps });
  }, [fps]);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="cfpsp-fps" className="text-xs text-muted-foreground">
          {s.fps}
        </label>
        <input
          id="cfpsp-fps"
          type="number"
          min={1}
          max={120}
          step={1}
          value={fps}
          onChange={(e) => setFps(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>
    </div>
  );
}
