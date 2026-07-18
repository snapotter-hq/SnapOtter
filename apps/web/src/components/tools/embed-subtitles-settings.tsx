import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

export function EmbedSubtitlesSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["embed-subtitles"];
  const { files } = useFileStore();
  const { processFiles, processing, error, progress } = useToolProcessor("embed-subtitles");

  const [language, setLanguage] = useState("eng");

  const hasEnough = files.length >= 2;

  const handleProcess = () => {
    processFiles(files, { language });
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="es-language" className="text-xs text-muted-foreground">
          {s.language}
        </label>
        <input
          id="es-language"
          type="text"
          maxLength={3}
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
        <p className="text-[10px] text-muted-foreground mt-0.5">{s.languageHint}</p>
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
          data-testid="embed-subtitles-submit"
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
