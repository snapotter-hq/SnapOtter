import { Download } from "lucide-react";
import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

const SIMULATION_TYPES = [
  {
    group: "Red-Green",
    types: [
      {
        value: "protanopia",
        label: "Protanopia",
        description: "No red cones. Reds appear dark. ~1% of males.",
      },
      {
        value: "protanomaly",
        label: "Protanomaly",
        description: "Reduced red sensitivity. ~1% of males.",
      },
      {
        value: "deuteranopia",
        label: "Deuteranopia",
        description: "No green cones. Reds and greens look similar. ~1% of males.",
      },
      {
        value: "deuteranomaly",
        label: "Deuteranomaly",
        description: "Reduced green sensitivity. Most common type. ~5% of males.",
      },
    ],
  },
  {
    group: "Blue-Yellow",
    types: [
      {
        value: "tritanopia",
        label: "Tritanopia",
        description: "No blue cones. Blues and greens look similar. Very rare.",
      },
      {
        value: "tritanomaly",
        label: "Tritanomaly",
        description: "Reduced blue sensitivity. Very rare.",
      },
    ],
  },
  {
    group: "Monochromatic",
    types: [
      {
        value: "achromatopsia",
        label: "Achromatopsia",
        description: "Complete color blindness. Sees only luminance. Very rare.",
      },
      {
        value: "blueConeMonochromacy",
        label: "Blue Cone Monochromacy",
        description: "Only blue cones functional. Very limited color. Very rare.",
      },
    ],
  },
];

const TYPE_MAP = new Map(SIMULATION_TYPES.flatMap((g) => g.types.map((t) => [t.value, t])));

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

  const [simulationType, setSimulationType] = useState("deuteranomaly");
  const selectedInfo = TYPE_MAP.get(simulationType);

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
          onChange={(e) => setSimulationType(e.target.value)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          {SIMULATION_TYPES.map((group) => (
            <optgroup key={group.group} label={group.group}>
              {group.types.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {selectedInfo && (
          <p className="mt-1 text-xs text-muted-foreground">{selectedInfo.description}</p>
        )}
      </div>

      {error && <p className="text-xs text-destructive-ink">{error}</p>}

      {originalSize != null && processedSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>Original: {(originalSize / 1024).toFixed(1)} KB</p>
          <p>Processed: {(processedSize / 1024).toFixed(1)} KB</p>
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

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="color-blindness-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary-ink font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          {t.common.download}
        </a>
      )}
    </div>
  );
}
