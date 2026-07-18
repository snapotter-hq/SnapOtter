import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

type Resolution = "1080p" | "720p" | "square";

export function ImagesToVideoSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["images-to-video"];
  const { files } = useFileStore();
  const { processFiles, processing, error, progress } = useToolProcessor("images-to-video");

  const [secondsPerImage, setSecondsPerImage] = useState(2);
  const [resolution, setResolution] = useState<Resolution>("720p");
  const [fps, setFps] = useState(30);

  const hasEnough = files.length >= 2;

  const handleProcess = () => {
    processFiles(files, { secondsPerImage, resolution, fps });
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="i2v-spi" className="text-xs text-muted-foreground">
          {s.secondsPerImage}
        </label>
        <input
          id="i2v-spi"
          type="number"
          min={0.5}
          max={10}
          step={0.5}
          value={secondsPerImage}
          onChange={(e) => setSecondsPerImage(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      <div>
        <label htmlFor="i2v-resolution" className="text-xs text-muted-foreground">
          {s.resolution}
        </label>
        <select
          id="i2v-resolution"
          value={resolution}
          onChange={(e) => setResolution(e.target.value as Resolution)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="1080p">1080p (1920x1080)</option>
          <option value="720p">720p (1280x720)</option>
          <option value="square">Square (1080x1080)</option>
        </select>
      </div>

      <div>
        <label htmlFor="i2v-fps" className="text-xs text-muted-foreground">
          {s.fps}
        </label>
        <input
          id="i2v-fps"
          type="number"
          min={10}
          max={60}
          step={1}
          value={fps}
          onChange={(e) => setFps(Number(e.target.value))}
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
          data-testid="images-to-video-submit"
          onClick={handleProcess}
          disabled={!hasEnough || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {s.submit}
        </button>
      )}
    </div>
  );
}
