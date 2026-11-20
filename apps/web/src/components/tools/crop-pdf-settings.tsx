import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

type CropMode = "uniform" | "sides" | "region";

const INPUT_CLASS =
  "w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground";

function PointsInput({
  id,
  label,
  value,
  onChange,
  min = 0,
  max,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max: number;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={INPUT_CLASS}
      />
    </div>
  );
}

export function CropPdfSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["crop-pdf"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("crop-pdf");

  const [mode, setMode] = useState<CropMode>("uniform");
  const [margin, setMargin] = useState(20);
  const [sides, setSides] = useState({ top: 0, right: 0, bottom: 0, left: 0 });
  // Defaults to a 4x6 in shipping label in the top-left corner (#4988).
  const [region, setRegion] = useState({ x: 0, y: 0, width: 288, height: 432 });

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleProcess = () => {
    const settings =
      mode === "uniform"
        ? { mode, margin }
        : mode === "sides"
          ? { mode, ...sides }
          : { mode, ...region };
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="cpdf-mode" className="text-xs text-muted-foreground">
          {s.mode}
        </label>
        <select
          id="cpdf-mode"
          value={mode}
          onChange={(e) => setMode(e.target.value as CropMode)}
          className={INPUT_CLASS}
        >
          <option value="uniform">{s.modeUniform}</option>
          <option value="sides">{s.modeSides}</option>
          <option value="region">{s.modeRegion}</option>
        </select>
      </div>

      {mode === "uniform" && (
        <PointsInput
          id="cpdf-margin"
          label={s.margin}
          value={margin}
          onChange={setMargin}
          max={2000}
        />
      )}

      {mode === "sides" && (
        <div className="grid grid-cols-2 gap-2">
          {(["top", "right", "bottom", "left"] as const).map((side) => (
            <PointsInput
              key={side}
              id={`cpdf-${side}`}
              label={s[side]}
              value={sides[side]}
              onChange={(value) => setSides((prev) => ({ ...prev, [side]: value }))}
              max={2000}
            />
          ))}
        </div>
      )}

      {mode === "region" && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {(["x", "y", "width", "height"] as const).map((field) => (
              <PointsInput
                key={field}
                id={`cpdf-${field}`}
                label={s[field]}
                value={region[field]}
                onChange={(value) => setRegion((prev) => ({ ...prev, [field]: value }))}
                min={field === "width" || field === "height" ? 1 : 0}
                max={14400}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{s.regionHint}</p>
        </div>
      )}

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
          data-testid="crop-pdf-submit"
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
