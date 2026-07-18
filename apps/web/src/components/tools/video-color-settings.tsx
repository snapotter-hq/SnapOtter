import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

export function VideoColorSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["video-color"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("video-color");

  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(1);
  const [saturation, setSaturation] = useState(1);
  const [gamma, setGamma] = useState(1);

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleProcess = () => {
    const settings = { brightness, contrast, saturation, gamma };
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="vc-brightness" className="text-xs text-muted-foreground">
          {s.brightness}
        </label>
        <input
          id="vc-brightness"
          type="number"
          min={-1}
          max={1}
          step={0.05}
          value={brightness}
          onChange={(e) => setBrightness(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      <div>
        <label htmlFor="vc-contrast" className="text-xs text-muted-foreground">
          {s.contrast}
        </label>
        <input
          id="vc-contrast"
          type="number"
          min={0}
          max={4}
          step={0.1}
          value={contrast}
          onChange={(e) => setContrast(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      <div>
        <label htmlFor="vc-saturation" className="text-xs text-muted-foreground">
          {s.saturation}
        </label>
        <input
          id="vc-saturation"
          type="number"
          min={0}
          max={3}
          step={0.1}
          value={saturation}
          onChange={(e) => setSaturation(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      <div>
        <label htmlFor="vc-gamma" className="text-xs text-muted-foreground">
          {s.gamma}
        </label>
        <input
          id="vc-gamma"
          type="number"
          min={0.1}
          max={10}
          step={0.1}
          value={gamma}
          onChange={(e) => setGamma(Number(e.target.value))}
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
          data-testid="video-color-submit"
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

export interface VideoColorControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function VideoColorControls({ settings: initial, onChange }: VideoColorControlsProps) {
  const { t } = useTranslation();
  const s = t.toolSettings["video-color"];
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(1);
  const [saturation, setSaturation] = useState(1);
  const [gamma, setGamma] = useState(1);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initial || initializedRef.current) return;
    initializedRef.current = true;
    if (initial.brightness != null) setBrightness(Number(initial.brightness));
    if (initial.contrast != null) setContrast(Number(initial.contrast));
    if (initial.saturation != null) setSaturation(Number(initial.saturation));
    if (initial.gamma != null) setGamma(Number(initial.gamma));
  }, [initial]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    onChangeRef.current?.({ brightness, contrast, saturation, gamma });
  }, [brightness, contrast, saturation, gamma]);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="vcp-brightness" className="text-xs text-muted-foreground">
          {s.brightness}
        </label>
        <input
          id="vcp-brightness"
          type="number"
          min={-1}
          max={1}
          step={0.05}
          value={brightness}
          onChange={(e) => setBrightness(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>
      <div>
        <label htmlFor="vcp-contrast" className="text-xs text-muted-foreground">
          {s.contrast}
        </label>
        <input
          id="vcp-contrast"
          type="number"
          min={0}
          max={4}
          step={0.1}
          value={contrast}
          onChange={(e) => setContrast(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>
      <div>
        <label htmlFor="vcp-saturation" className="text-xs text-muted-foreground">
          {s.saturation}
        </label>
        <input
          id="vcp-saturation"
          type="number"
          min={0}
          max={3}
          step={0.1}
          value={saturation}
          onChange={(e) => setSaturation(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>
      <div>
        <label htmlFor="vcp-gamma" className="text-xs text-muted-foreground">
          {s.gamma}
        </label>
        <input
          id="vcp-gamma"
          type="number"
          min={0.1}
          max={10}
          step={0.1}
          value={gamma}
          onChange={(e) => setGamma(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>
    </div>
  );
}
