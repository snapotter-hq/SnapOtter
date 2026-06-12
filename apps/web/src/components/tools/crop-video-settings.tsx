import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

export function CropVideoSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["crop-video"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("crop-video");

  const [width, setWidth] = useState<number | "">("");
  const [height, setHeight] = useState<number | "">("");
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;
  const dimsValid = width !== "" && height !== "";

  const handleProcess = () => {
    const settings = { width, height, x, y };
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="crv-width" className="text-xs text-muted-foreground">
          {s.width}
        </label>
        <input
          id="crv-width"
          type="number"
          min={16}
          value={width}
          onChange={(e) => setWidth(e.target.value === "" ? "" : Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      <div>
        <label htmlFor="crv-height" className="text-xs text-muted-foreground">
          {s.height}
        </label>
        <input
          id="crv-height"
          type="number"
          min={16}
          value={height}
          onChange={(e) => setHeight(e.target.value === "" ? "" : Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      <div>
        <label htmlFor="crv-x" className="text-xs text-muted-foreground">
          {s.x}
        </label>
        <input
          id="crv-x"
          type="number"
          min={0}
          value={x}
          onChange={(e) => setX(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      <div>
        <label htmlFor="crv-y" className="text-xs text-muted-foreground">
          {s.y}
        </label>
        <input
          id="crv-y"
          type="number"
          min={0}
          value={y}
          onChange={(e) => setY(Number(e.target.value))}
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
          data-testid="crop-video-submit"
          onClick={handleProcess}
          disabled={!hasFile || processing || !dimsValid}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {hasMultiple ? format(s.submitBatch, { count: files.length }) : s.submit}
        </button>
      )}
    </div>
  );
}
