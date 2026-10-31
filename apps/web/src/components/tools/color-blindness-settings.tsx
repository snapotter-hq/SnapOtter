import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { ResultDownloadLink } from "@/components/common/result-download-link";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

const SIMULATION_TYPES = [
  {
    group: "redGreen",
    types: ["protanopia", "protanomaly", "deuteranopia", "deuteranomaly"],
  },
  {
    group: "blueYellow",
    types: ["tritanopia", "tritanomaly"],
  },
  {
    group: "monochromatic",
    types: ["achromatopsia", "blueConeMonochromacy"],
  },
] as const;

type SimulationType = (typeof SIMULATION_TYPES)[number]["types"][number];

export function ColorBlindnessSettings() {
  const { t } = useTranslation();
  const { files } = useFileStore();
  const {
    processFiles,
    processAllFiles,
    processing,
    error,
    downloadUrl,
    originalSize,
    processedSize,
    progress,
  } = useToolProcessor("color-blindness");

  const [simulationType, setSimulationType] = useState<SimulationType>("deuteranomaly");
  const typeText = t.toolSettings["color-blindness"].types;
  const selectedInfo = typeText[simulationType];

  const handleProcess = () => {
    const settings = { simulationType };
    if (files.length > 1) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  const hasFile = files.length > 0;

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="cb-simulation-type" className="text-xs text-muted-foreground">
          {t.toolSettings["color-blindness"].simulationType}
        </label>
        <select
          id="cb-simulation-type"
          value={simulationType}
          onChange={(e) => setSimulationType(e.target.value as SimulationType)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          {SIMULATION_TYPES.map((group) => (
            <optgroup key={group.group} label={t.toolSettings["color-blindness"][group.group]}>
              {group.types.map((type) => (
                <option key={type} value={type}>
                  {typeText[type].label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted-foreground">{selectedInfo.description}</p>
      </div>

      {error && <p className="text-xs text-destructive-ink">{error}</p>}

      {originalSize != null && processedSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>
            {format(t.toolSettings["color-blindness"].originalKb, {
              size: (originalSize / 1024).toFixed(1),
            })}
          </p>
          <p>
            {format(t.toolSettings["color-blindness"].processedKb, {
              size: (processedSize / 1024).toFixed(1),
            })}
          </p>
        </div>
      )}

      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={t.toolSettings["color-blindness"].progressLabel}
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="button"
          data-testid="color-blindness-submit"
          onClick={handleProcess}
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1
            ? format(t.toolSettings["color-blindness"].submitBatch, { count: files.length })
            : t.toolSettings["color-blindness"].submit}
        </button>
      )}

      {downloadUrl && <ResultDownloadLink href={downloadUrl} testId="color-blindness-download" />}
    </div>
  );
}
