import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";
import { CompressControls } from "./compress-settings";

export function CompressPdfSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["compress-pdf"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("compress-pdf");
  const [settings, setSettings] = useState<Record<string, unknown>>({});

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;
  // Quality mode is always runnable; target-size needs a positive target.
  const canProcess =
    settings.mode === "quality" ||
    (settings.mode === "targetSize" && Number(settings.targetSizeKb) > 0);

  const handleProcess = () => {
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      {/* Same quality / target-size controls as the image compress tool */}
      <CompressControls onChange={setSettings} />

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
          data-testid="compress-pdf-submit"
          onClick={handleProcess}
          disabled={!hasFile || !canProcess || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {hasMultiple ? format(s.submitBatch, { count: files.length }) : s.submit}
        </button>
      )}
    </div>
  );
}
