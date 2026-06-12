import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

type AudioFormat = "mp3" | "wav" | "flac" | "m4a";

export function MergeAudioSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["merge-audio"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("merge-audio");

  const [outFormat, setOutFormat] = useState<AudioFormat>("mp3");

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleProcess = () => {
    const settings = { format: outFormat };
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="ma-format" className="text-xs text-muted-foreground">
          {s.format}
        </label>
        <select
          id="ma-format"
          value={outFormat}
          onChange={(e) => setOutFormat(e.target.value as AudioFormat)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="mp3">{s.mp3}</option>
          <option value="wav">{s.wav}</option>
          <option value="flac">{s.flac}</option>
          <option value="m4a">{s.m4a}</option>
        </select>
      </div>

      <p className="text-[10px] text-muted-foreground">{s["order-hint"]}</p>

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
          data-testid="merge-audio-submit"
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
