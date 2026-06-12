import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

type SplitMode = "time" | "parts" | "silence";

export function SplitAudioSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["split-audio"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("split-audio");

  const [mode, setMode] = useState<SplitMode>("time");
  const [segmentS, setSegmentS] = useState(60);
  const [parts, setParts] = useState(2);
  const [thresholdDb, setThresholdDb] = useState(-40);
  const [minSilenceS, setMinSilenceS] = useState(0.3);

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleProcess = () => {
    const settings: Record<string, unknown> = { mode };
    if (mode === "time") settings.segmentS = segmentS;
    if (mode === "parts") settings.parts = parts;
    if (mode === "silence") {
      settings.thresholdDb = thresholdDb;
      settings.minSilenceS = minSilenceS;
    }
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="sa-mode" className="text-xs text-muted-foreground">
          {s.mode}
        </label>
        <select
          id="sa-mode"
          value={mode}
          onChange={(e) => setMode(e.target.value as SplitMode)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="time">{s.time}</option>
          <option value="parts">{s.parts}</option>
          <option value="silence">{s.silence}</option>
        </select>
      </div>

      {mode === "time" && (
        <div>
          <label htmlFor="sa-segment" className="text-xs text-muted-foreground">
            {s["segment-s"]}
          </label>
          <input
            id="sa-segment"
            type="number"
            min={1}
            max={3600}
            step={1}
            value={segmentS}
            onChange={(e) => setSegmentS(Number(e.target.value))}
            className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
          />
        </div>
      )}

      {mode === "parts" && (
        <div>
          <label htmlFor="sa-parts" className="text-xs text-muted-foreground">
            {s["num-parts"]}
          </label>
          <input
            id="sa-parts"
            type="number"
            min={2}
            max={20}
            step={1}
            value={parts}
            onChange={(e) => setParts(Number(e.target.value))}
            className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
          />
        </div>
      )}

      {mode === "silence" && (
        <>
          <div>
            <label htmlFor="sa-threshold" className="text-xs text-muted-foreground">
              {s["threshold-db"]}
            </label>
            <input
              id="sa-threshold"
              type="number"
              min={-80}
              max={-20}
              step={1}
              value={thresholdDb}
              onChange={(e) => setThresholdDb(Number(e.target.value))}
              className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
            />
          </div>

          <div>
            <label htmlFor="sa-minsilence" className="text-xs text-muted-foreground">
              {s["min-silence-s"]}
            </label>
            <input
              id="sa-minsilence"
              type="number"
              min={0.1}
              max={10}
              step={0.1}
              value={minSilenceS}
              onChange={(e) => setMinSilenceS(Number(e.target.value))}
              className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
            />
          </div>
        </>
      )}

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
          data-testid="split-audio-submit"
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
