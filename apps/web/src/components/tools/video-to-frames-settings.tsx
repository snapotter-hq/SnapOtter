import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

type Mode = "all" | "nth" | "timestamps";
type ImgFormat = "png" | "jpg";

export function VideoToFramesSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["video-to-frames"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("video-to-frames");

  const [mode, setMode] = useState<Mode>("all");
  const [n, setN] = useState(10);
  const [timestamps, setTimestamps] = useState("");
  const [imgFormat, setImgFormat] = useState<ImgFormat>("png");

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleProcess = () => {
    const settings: Record<string, unknown> = { mode, format: imgFormat };
    if (mode === "nth") settings.n = n;
    if (mode === "timestamps") settings.timestamps = timestamps;
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="v2f-mode" className="text-xs text-muted-foreground">
          {s.mode}
        </label>
        <select
          id="v2f-mode"
          value={mode}
          onChange={(e) => setMode(e.target.value as Mode)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="all">{s.modeAll}</option>
          <option value="nth">{s.modeNth}</option>
          <option value="timestamps">{s.modeTimestamps}</option>
        </select>
      </div>

      {mode === "nth" && (
        <div>
          <label htmlFor="v2f-n" className="text-xs text-muted-foreground">
            {s.n}
          </label>
          <input
            id="v2f-n"
            type="number"
            min={2}
            max={1000}
            step={1}
            value={n}
            onChange={(e) => setN(Number(e.target.value))}
            className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
          />
        </div>
      )}

      {mode === "timestamps" && (
        <div>
          <label htmlFor="v2f-timestamps" className="text-xs text-muted-foreground">
            {s.timestamps}
          </label>
          <input
            id="v2f-timestamps"
            type="text"
            value={timestamps}
            onChange={(e) => setTimestamps(e.target.value)}
            className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
          />
          <p className="text-[10px] text-muted-foreground mt-0.5">{s.timestampsHint}</p>
        </div>
      )}

      <div>
        <label htmlFor="v2f-format" className="text-xs text-muted-foreground">
          {s.format}
        </label>
        <select
          id="v2f-format"
          value={imgFormat}
          onChange={(e) => setImgFormat(e.target.value as ImgFormat)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="png">PNG</option>
          <option value="jpg">JPG</option>
        </select>
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
          data-testid="video-to-frames-submit"
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
