import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

export function VideoToGifSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["video-to-gif"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("video-to-gif");

  const [fps, setFps] = useState(12);
  const [width, setWidth] = useState(480);
  const [startS, setStartS] = useState(0);
  const [durationS, setDurationS] = useState(5);

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleProcess = () => {
    const settings = { fps, width, startS, durationS };
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="vtg-fps" className="text-xs text-muted-foreground">
          {s.fps}
        </label>
        <input
          id="vtg-fps"
          type="number"
          min={1}
          max={30}
          step={1}
          value={fps}
          onChange={(e) => setFps(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      <div>
        <label htmlFor="vtg-width" className="text-xs text-muted-foreground">
          {s.width}
        </label>
        <input
          id="vtg-width"
          type="number"
          min={64}
          max={1280}
          step={1}
          value={width}
          onChange={(e) => setWidth(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      <div>
        <label htmlFor="vtg-start" className="text-xs text-muted-foreground">
          {s.start}
        </label>
        <input
          id="vtg-start"
          type="number"
          min={0}
          step={0.1}
          value={startS}
          onChange={(e) => setStartS(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      <div>
        <label htmlFor="vtg-duration" className="text-xs text-muted-foreground">
          {s.duration}
        </label>
        <input
          id="vtg-duration"
          type="number"
          min={0.1}
          max={60}
          step={0.1}
          value={durationS}
          onChange={(e) => setDurationS(Number(e.target.value))}
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
          data-testid="video-to-gif-submit"
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

export interface VideoToGifControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function VideoToGifControls({ settings: initial, onChange }: VideoToGifControlsProps) {
  const { t } = useTranslation();
  const s = t.toolSettings["video-to-gif"];
  const [fps, setFps] = useState(12);
  const [width, setWidth] = useState(480);
  const [startS, setStartS] = useState(0);
  const [durationS, setDurationS] = useState(5);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initial || initializedRef.current) return;
    initializedRef.current = true;
    if (initial.fps != null) setFps(Number(initial.fps));
    if (initial.width != null) setWidth(Number(initial.width));
    if (initial.startS != null) setStartS(Number(initial.startS));
    if (initial.durationS != null) setDurationS(Number(initial.durationS));
  }, [initial]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    onChangeRef.current?.({ fps, width, startS, durationS });
  }, [fps, width, startS, durationS]);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="vtgp-fps" className="text-xs text-muted-foreground">
          {s.fps}
        </label>
        <input
          id="vtgp-fps"
          type="number"
          min={1}
          max={30}
          step={1}
          value={fps}
          onChange={(e) => setFps(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>
      <div>
        <label htmlFor="vtgp-width" className="text-xs text-muted-foreground">
          {s.width}
        </label>
        <input
          id="vtgp-width"
          type="number"
          min={64}
          max={1280}
          step={1}
          value={width}
          onChange={(e) => setWidth(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>
      <div>
        <label htmlFor="vtgp-start" className="text-xs text-muted-foreground">
          {s.start}
        </label>
        <input
          id="vtgp-start"
          type="number"
          min={0}
          step={0.1}
          value={startS}
          onChange={(e) => setStartS(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>
      <div>
        <label htmlFor="vtgp-duration" className="text-xs text-muted-foreground">
          {s.duration}
        </label>
        <input
          id="vtgp-duration"
          type="number"
          min={0.1}
          max={60}
          step={0.1}
          value={durationS}
          onChange={(e) => setDurationS(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>
    </div>
  );
}
