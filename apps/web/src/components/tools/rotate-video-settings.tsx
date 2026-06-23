import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

type Transform = "cw90" | "ccw90" | "180" | "hflip" | "vflip";

export function RotateVideoSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["rotate-video"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("rotate-video");

  const [transform, setTransform] = useState<Transform>("cw90");

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleProcess = () => {
    const settings = { transform };
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="rtv-transform" className="text-xs text-muted-foreground">
          {s.transform}
        </label>
        <select
          id="rtv-transform"
          value={transform}
          onChange={(e) => setTransform(e.target.value as Transform)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="cw90">{s.cw90}</option>
          <option value="ccw90">{s.ccw90}</option>
          <option value="180">{s.rotate180}</option>
          <option value="hflip">{s.hflip}</option>
          <option value="vflip">{s.vflip}</option>
        </select>
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
          data-testid="rotate-video-submit"
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

export interface RotateVideoControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function RotateVideoControls({ settings: initial, onChange }: RotateVideoControlsProps) {
  const { t } = useTranslation();
  const s = t.toolSettings["rotate-video"];
  const [transform, setTransform] = useState<Transform>("cw90");

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initial || initializedRef.current) return;
    initializedRef.current = true;
    if (initial.transform != null) setTransform(initial.transform as Transform);
  }, [initial]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    onChangeRef.current?.({ transform });
  }, [transform]);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="rtvp-transform" className="text-xs text-muted-foreground">
          {s.transform}
        </label>
        <select
          id="rtvp-transform"
          value={transform}
          onChange={(e) => setTransform(e.target.value as Transform)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="cw90">{s.cw90}</option>
          <option value="ccw90">{s.ccw90}</option>
          <option value="180">{s.rotate180}</option>
          <option value="hflip">{s.hflip}</option>
          <option value="vflip">{s.vflip}</option>
        </select>
      </div>
    </div>
  );
}
