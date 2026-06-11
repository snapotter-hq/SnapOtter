import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

type Quality = "light" | "balanced" | "strong";
type Resolution = "original" | "1080p" | "720p" | "480p";

export function CompressVideoSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["compress-video"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("compress-video");

  const [quality, setQuality] = useState<Quality>("balanced");
  const [resolution, setResolution] = useState<Resolution>("original");

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleProcess = () => {
    const settings = { quality, resolution };
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="cpv-quality" className="text-xs text-muted-foreground">
          {s.quality}
        </label>
        <select
          id="cpv-quality"
          value={quality}
          onChange={(e) => setQuality(e.target.value as Quality)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="light">{s.light}</option>
          <option value="balanced">{s.balanced}</option>
          <option value="strong">{s.strong}</option>
        </select>
      </div>

      <div>
        <label htmlFor="cpv-resolution" className="text-xs text-muted-foreground">
          {s.resolution}
        </label>
        <select
          id="cpv-resolution"
          value={resolution}
          onChange={(e) => setResolution(e.target.value as Resolution)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="original">{s.original}</option>
          <option value="1080p">1080p</option>
          <option value="720p">720p</option>
          <option value="480p">480p</option>
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
          data-testid="compress-video-submit"
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
