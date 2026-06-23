import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

export function VideoToWebpSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["video-to-webp"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("video-to-webp");

  const [fps, setFps] = useState(12);
  const [width, setWidth] = useState(480);
  const [quality, setQuality] = useState(75);
  const [loop, setLoop] = useState(true);

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleProcess = () => {
    const settings = { fps, width, quality, loop };
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="v2w-fps" className="text-xs text-muted-foreground">
          {s.fps}
        </label>
        <input
          id="v2w-fps"
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
        <label htmlFor="v2w-width" className="text-xs text-muted-foreground">
          {s.width}
        </label>
        <input
          id="v2w-width"
          type="number"
          min={16}
          max={1920}
          step={1}
          value={width}
          onChange={(e) => setWidth(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      <div>
        <label htmlFor="v2w-quality" className="text-xs text-muted-foreground">
          {s.quality}
        </label>
        <input
          id="v2w-quality"
          type="number"
          min={1}
          max={100}
          step={1}
          value={quality}
          onChange={(e) => setQuality(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={loop}
          onChange={(e) => setLoop(e.target.checked)}
          className="rounded"
        />
        {s.loop}
      </label>

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
          data-testid="video-to-webp-submit"
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

export interface VideoToWebpControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function VideoToWebpControls({ settings: initial, onChange }: VideoToWebpControlsProps) {
  const { t } = useTranslation();
  const s = t.toolSettings["video-to-webp"];
  const [fps, setFps] = useState(12);
  const [width, setWidth] = useState(480);
  const [quality, setQuality] = useState(75);
  const [loop, setLoop] = useState(true);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initial || initializedRef.current) return;
    initializedRef.current = true;
    if (initial.fps != null) setFps(Number(initial.fps));
    if (initial.width != null) setWidth(Number(initial.width));
    if (initial.quality != null) setQuality(Number(initial.quality));
    if (initial.loop != null) setLoop(Boolean(initial.loop));
  }, [initial]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    onChangeRef.current?.({ fps, width, quality, loop });
  }, [fps, width, quality, loop]);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="v2wp-fps" className="text-xs text-muted-foreground">
          {s.fps}
        </label>
        <input
          id="v2wp-fps"
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
        <label htmlFor="v2wp-width" className="text-xs text-muted-foreground">
          {s.width}
        </label>
        <input
          id="v2wp-width"
          type="number"
          min={16}
          max={1920}
          step={1}
          value={width}
          onChange={(e) => setWidth(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>
      <div>
        <label htmlFor="v2wp-quality" className="text-xs text-muted-foreground">
          {s.quality}
        </label>
        <input
          id="v2wp-quality"
          type="number"
          min={1}
          max={100}
          step={1}
          value={quality}
          onChange={(e) => setQuality(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={loop}
          onChange={(e) => setLoop(e.target.checked)}
          className="rounded"
        />
        {s.loop}
      </label>
    </div>
  );
}
