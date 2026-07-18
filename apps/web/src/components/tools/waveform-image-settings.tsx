import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

export function WaveformImageSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["waveform-image"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("waveform-image");

  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(256);
  const [color, setColor] = useState("#4f46e5");

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleProcess = () => {
    const settings = { width, height, color };
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="wi-width" className="text-xs text-muted-foreground">
          {s.width}
        </label>
        <input
          id="wi-width"
          type="number"
          min={256}
          max={3840}
          step={1}
          value={width}
          onChange={(e) => setWidth(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      <div>
        <label htmlFor="wi-height" className="text-xs text-muted-foreground">
          {s.height}
        </label>
        <input
          id="wi-height"
          type="number"
          min={64}
          max={1080}
          step={1}
          value={height}
          onChange={(e) => setHeight(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      <div>
        <label htmlFor="wi-color" className="text-xs text-muted-foreground">
          {s.color}
        </label>
        <input
          id="wi-color"
          type="text"
          maxLength={7}
          value={color}
          onChange={(e) => setColor(e.target.value)}
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
          data-testid="waveform-image-submit"
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
